// Regras por tipo de arquivo (owner 2026-11-19, card 1dfwh7kfzxv), como as rules do Cursor e o steering do Kiro: arquivos .md
// com globs no frontmatter, em <pasta do agente>/rules (da pessoa) e em .pink/rules (do projeto, só em pasta confiável).
// A regra entra no contexto uma vez por sessão, no resultado do read/write/edit de um arquivo que casa com o glob; assim o
// AGENTS.md não cresce com instrução que só vale para um tipo de arquivo. /regras lista as regras e quais já entraram.
import { t } from "./pink-i18n.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MAX_RULE = 16 * 1024; // regra maior que isso não entra (avisa no /regras)
const TOOLS = new Set(["read", "write", "edit"]);

export const agentDir = (env = process.env) => env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent");

const MAX_GLOB = 200;
const MAX_STARS = 8; // limita o backtracking de padrões como *a*a*a*a no caminho quente

// glob simples: ** (qualquer profundidade), * e ? (sem /), {a,b}; sem / no padrão casa com o nome em qualquer pasta.
// Sem diferenciar maiúsculas, também no Linux e no macOS. Glob torto (chave aberta, longo, * demais) lança erro.
export function globToRegExp(raw: string): RegExp {
	const glob = raw.replace(/(?:\*\*\/)+/g, "**/");
	if (glob.length > MAX_GLOB || (glob.match(/\*/g) ?? []).length > MAX_STARS) throw new Error(t(`glob inválido: ${raw}`, `glob no válido: ${raw}`, `invalid glob: ${raw}`));
	let out = "";
	let depth = 0;
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*") {
			if (glob[i + 1] === "*") {
				const slash = glob[i + 2] === "/";
				out += slash ? "(?:.*/)?" : ".*";
				i += slash ? 2 : 1;
			} else out += "[^/]*";
		} else if (c === "?") out += "[^/]";
		else if (c === "{") {
			depth++;
			out += "(?:";
		} else if (c === "}" && depth > 0) {
			depth--;
			out += ")";
		} else if (c === "," && depth > 0) out += "|";
		else out += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
	}
	if (depth) throw new Error(t(`glob inválido: ${raw}`, `glob no válido: ${raw}`, `invalid glob: ${raw}`));
	return new RegExp(`^${out}$`, "i");
}

const cleanGlob = (glob: string) => glob.trim().replace(/^\.?\//, "");

export function validGlobs(globs: string[]): boolean {
	try {
		for (const glob of globs) globToRegExp(cleanGlob(glob));
		return true;
	} catch {
		return false;
	}
}

export function matches(globs: string[], relative: string): boolean {
	const file = relative.replace(/\\/g, "/").replace(/^\.\//, "");
	const base = file.slice(file.lastIndexOf("/") + 1);
	return globs.some((glob) => {
		const clean = cleanGlob(glob);
		if (!clean) return false;
		try {
			return globToRegExp(clean).test(clean.includes("/") ? file : base);
		} catch {
			return false; // um glob torto não derruba as outras regras
		}
	});
}

// frontmatter: globs (ou paths, como no Claude Code) em lista "a, b", [a, b] ou linhas "- a"; description opcional
export function parseRule(text: string): { globs: string[]; description: string; body: string } | undefined {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.replace(/^﻿/, ""));
	if (!match) return undefined;
	const lines = match[1].split(/\r?\n/);
	const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();
	let globs: string[] = [];
	let description = "";
	for (let i = 0; i < lines.length; i++) {
		const field = /^(\w+):\s*(.*)$/.exec(lines[i]);
		if (!field) continue;
		const [, key, raw] = field;
		if (key === "description") description = unquote(raw);
		if (key !== "globs" && key !== "paths") continue;
		const value = raw.trim();
		if (value) globs = value.replace(/^\[|\]$/g, "").split(/,(?![^{]*\})/).map(unquote);
		else while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) globs.push(unquote(lines[++i].replace(/^\s*-\s+/, "")));
	}
	globs = globs.filter(Boolean);
	if (!globs.length) return undefined;
	return { globs, description, body: match[2].trim() };
}

export type Rule = { id: string; file: string; origin: "pessoa" | "projeto"; globs: string[]; description: string; body: string; tooBig: boolean };

// regra grande demais: só o começo, para mostrar globs no /regras sem ler um arquivo enorme inteiro
function readHead(file: string, size = 4096): string {
	const fd = fs.openSync(file, "r");
	try {
		const buffer = Buffer.alloc(size);
		return buffer.subarray(0, fs.readSync(fd, buffer, 0, size, 0)).toString("utf8");
	} finally {
		fs.closeSync(fd);
	}
}

// shortcut: lê as pastas de regras a cada leitura/edição; cachear por mtime se virar centenas de regras
export function loadRules(cwd: string, trusted: boolean, env = process.env): { rules: Rule[]; invalid: string[] } {
	const rules: Rule[] = [];
	const invalid: string[] = [];
	const dirs: [string, Rule["origin"]][] = [[path.join(agentDir(env), "rules"), "pessoa"]];
	if (trusted) dirs.push([path.join(cwd, ".pink", "rules"), "projeto"]);
	let realRoot = cwd;
	try {
		realRoot = fs.realpathSync(cwd);
	} catch {}
	for (const [dir, origin] of dirs) {
		let names: string[];
		try {
			names = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".md")).sort();
		} catch {
			continue;
		}
		for (const name of names) {
			const file = path.join(dir, name);
			try {
				const stat = fs.statSync(file);
				if (!stat.isFile()) continue;
				// regra do projeto que aponta (link simbólico, pasta ligada) para fora do projeto não entra
				if (origin === "projeto") {
					const inside = path.relative(realRoot, fs.realpathSync(file));
					if (!inside || inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
						invalid.push(file);
						continue;
					}
				}
				const tooBig = stat.size > MAX_RULE;
				const parsed = parseRule(tooBig ? readHead(file) : fs.readFileSync(file, "utf8"));
				if (!parsed || !validGlobs(parsed.globs)) {
					invalid.push(file);
					continue;
				}
				rules.push({ id: `${origin}:${file.toLowerCase()}`, file, origin, ...parsed, body: tooBig ? "" : parsed.body, tooBig });
			} catch {
				invalid.push(file);
			}
		}
	}
	return { rules, invalid };
}

export function createRules({ load = loadRules } = {}) {
	const shown = new Set<string>();
	function onResult(event: any, ctx: any) {
		if (event?.isError || !TOOLS.has(event?.toolName)) return undefined;
		const target = event.input?.path ?? event.input?.file_path;
		if (typeof target !== "string" || !target) return undefined;
		const root = path.resolve(ctx?.cwd ?? process.cwd());
		const relative = path.relative(root, path.resolve(root, target));
		if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined; // fora do projeto
		const { rules } = load(root, ctx?.isProjectTrusted?.() === true);
		const fresh = rules.filter((rule) => !rule.tooBig && rule.body && !shown.has(rule.id) && matches(rule.globs, relative));
		if (!fresh.length) return undefined;
		const notes = fresh.map((rule) => {
			shown.add(rule.id);
			const where = rule.origin === "projeto" ? path.relative(root, rule.file) : rule.file;
			return `Regra (${rule.origin}, ${where}) para ${rule.globs.join(", ")}; vale para os arquivos que casam com isso:\n${rule.body}`;
		});
		// devolver content sem structuredContent apagaria o dele
		return { content: [...(event.content ?? []), { type: "text", text: notes.join("\n\n") }], structuredContent: event.structuredContent };
	}
	function list(ctx: any): string {
		const root = path.resolve(ctx?.cwd ?? process.cwd());
		const trusted = ctx?.isProjectTrusted?.() === true;
		const { rules, invalid } = load(root, trusted);
		const lines = rules.length ? [t("Regras por tipo de arquivo:", "Reglas por tipo de archivo:", "Rules by file type:")] : [t("Nenhuma regra. Crie .md com globs no frontmatter em:", "Ninguna regla. Crea .md con globs en el frontmatter en:", "No rules. Create .md files with globs in the frontmatter in:"), `  ${path.join(agentDir(), "rules")} ${t("(suas)", "(las tuyas)", "(yours)")}`, t("  .pink/rules (do projeto)", "  .pink/rules (del proyecto)", "  .pink/rules (project)")];
		for (const rule of rules) {
			const state = rule.tooBig ? t(`grande demais (máx. ${MAX_RULE / 1024} KB), não entra`, `demasiado grande (máx. ${MAX_RULE / 1024} KB), no entra`, `too large (max ${MAX_RULE / 1024} KB), not included`) : shown.has(rule.id) ? t("já no contexto", "ya en el contexto", "already in context") : t("espera um arquivo que case", "espera un archivo que coincida", "waiting for a matching file");
			lines.push(`  ${rule.globs.join(", ")} · ${rule.origin} · ${state}${rule.description ? ` · ${rule.description}` : ""}`, `    ${rule.file}`);
		}
		for (const file of invalid) lines.push(`  ${t("sem globs/paths, glob inválido ou fora do projeto, ignorada:", "sin globs/paths, glob no válido o fuera del proyecto, ignorada:", "no globs/paths, invalid glob or outside the project, skipped:")} ${file}`);
		if (!trusted) lines.push(t("Pasta não confiável: as regras do projeto (.pink/rules) ficam de fora.", "Carpeta no confiable: las reglas del proyecto (.pink/rules) quedan fuera.", "Untrusted folder: project rules (.pink/rules) are left out."));
		return lines.join("\n");
	}
	return { onResult, list, reset: () => shown.clear(), shown };
}

// também no subagente: ele edita arquivos e precisa das mesmas regras
export default function (pi: any) {
	const rules = createRules();
	pi.on("tool_result", async (event: any, ctx: any) => rules.onResult(event, ctx));
	// contexto novo (sessão, compactação, outro ramo): a regra precisa entrar de novo
	for (const name of ["session_start", "session_compact", "session_tree"]) pi.on(name, async () => rules.reset());
	pi.registerCommand("regras", {
		description: t("Lista as regras por tipo de arquivo (globs) e quais já entraram no contexto", "Lista las reglas por tipo de archivo (globs) y cuáles ya entraron en el contexto", "Lists the rules by file type (globs) and which ones are already in context"),
		handler: async (_args: string, ctx: any) => ctx.ui.notify(rules.list(ctx), "info"),
	});
}
