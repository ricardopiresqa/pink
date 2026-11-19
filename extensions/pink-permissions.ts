// Permissões do Pink (owner 2026-11-17, card 1dfwh7kfmqp), como as regras allow/ask/deny do Claude Code e a aprovação do
// Codex. Carregada sempre e em primeiro lugar (antes do RTK reescrever o comando), fora do PINK_NO_BUILTIN_UI.
// - Padrão: pede confirmação antes de comando destrutivo (bash/powershell) e bloqueia edição de segredos e do .git.
// - Regras em <pasta do agente>/permissions.json e, só em pasta confiável, <projeto>/.pink/permissions.json:
//     { "allow": ["bash(npm test*)"], "ask": ["bash(git push*)"], "deny": ["read(.env*)", "bash(curl*)", "mcp__x"] }
//   "ferramenta" (qualquer chamada dela) ou "ferramenta(padrão)": glob (* e **) sobre cada trecho do comando
//   (bash/powershell, dividido em ; && || | & e quebra de linha) ou sobre o caminho (read/write/edit).
//   Ordem: deny > ask > allow > padrão do Pink. deny/ask valem se QUALQUER trecho casar; allow só se TODOS casarem e o
//   comando não tiver $( ) nem crase.
// - Sem tela (-p, json, rpc), o que pede confirmação é recusado, com o motivo para o modelo.
// - Limite de rede de segurança: gravar por bash (echo > .env, cp, sed -i) não passa pela proteção de arquivos, e
//   ofuscação ($(echo rm), eval) escapa do padrão. Isolamento de verdade é o sandbox do sistema, não isto.
// - /permissoes mostra as regras em uso.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const agentDir = (env = process.env) => env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent");

const SHELLS = new Set(["bash", "powershell"]);
const FILES = new Set(["read", "write", "edit"]);
const SUBST = /\$\(|`|<\(/;

const program = (token) => token.split(/[\\/]/).pop().replace(/\.(exe|cmd|bat)$/i, "");
// trechos do comando, sem aspas, sem VAR=x e sem o prefixo que não muda o que roda (rtk, command, exec, nohup, time);
// sudo fica, para o allow não liberar "sudo npm test" com a regra de "npm test"
export function segments(command) {
	return String(command)
		.replace(/\d*>&\d*/g, " ") // 2>&1 não é um trecho
		.split(/\r?\n|&&|\|\||;|\||&|\$\(|`|<\(|\(|\)/)
		.map((s) => s.replace(/["']/g, "").trim())
		.filter(Boolean)
		.map((s) => {
			let tokens = s.split(/\s+/);
			while (tokens.length > 1 && (/^(rtk|command|exec|nohup|time)$/i.test(tokens[0]) || /^\w+=/.test(tokens[0]))) tokens = tokens.slice(1);
			tokens[0] = program(tokens[0]);
			return tokens.join(" ");
		});
}

// cada sufixo do trecho, como comando: pega bash -c "rm -rf x", env rm, xargs rm, find -exec rm, sudo curl
const suffixes = (seg) => {
	const tokens = seg.split(/\s+/);
	return tokens.map((_, i) => { const tail = tokens.slice(i); tail[0] = program(tail[0]); return tail; });
};
// git com opções antes do subcomando (git -C dir push): devolve [subcomando, ...resto]
function gitArgs(tokens) {
	let i = 1;
	while (i < tokens.length && tokens[i].startsWith("-")) i += /^-(C|c)$/.test(tokens[i]) || /^--(git-dir|work-tree)$/.test(tokens[i]) ? 2 : 1;
	return tokens.slice(i);
}

// comandos que pedem confirmação por padrão: [teste por trecho, motivo]
export const DEFAULT_ASK = [
	[(t) => /^rm$/i.test(t[0]) && t.some((x) => /^-[a-z]*r/i.test(x) || x === "--recursive"), "apaga pastas inteiras (rm -r)"],
	[(t) => /^sudo$/i.test(t[0]), "roda como administrador (sudo)"],
	[(t) => /^(chmod|chown)$/i.test(t[0]) && t.some((x) => /777/.test(x)), "abre permissão total (777)"],
	[(t) => /^git$/i.test(t[0]) && /^push$/i.test(gitArgs(t)[0] ?? "") && gitArgs(t).some((x) => /^-[a-z]*f/i.test(x) || /^--force/i.test(x) || /^\+/.test(x)), "push forçado"],
	[(t) => /^git$/i.test(t[0]) && /^reset$/i.test(gitArgs(t)[0] ?? "") && t.includes("--hard"), "git reset --hard"],
	[(t) => /^git$/i.test(t[0]) && /^clean$/i.test(gitArgs(t)[0] ?? "") && gitArgs(t).some((x) => /^-[a-z]*f/i.test(x) || x === "--force"), "git clean -f"],
	[(t) => /^(remove-item|ri|rm|del|erase|rd|rmdir)$/i.test(t[0]) && t.some((x) => /^-r(ecurse)?$/i.test(x)), "apaga pastas inteiras (Remove-Item -Recurse)"],
	[(t) => /^(rd|rmdir|del|erase)$/i.test(t[0]) && t.some((x) => /^\/s$/i.test(x)), "apaga pastas ou arquivos em subpastas (/s)"],
	[(t) => /^(mkfs(\.\w+)?|diskpart)$/i.test(t[0]) || (/^format(\.com)?$/i.test(t[0]) && /^[a-z]:/i.test(t[1] ?? "")), "formata disco"],
	[(t) => /^dd$/i.test(t[0]) && t.some((x) => /^of=/i.test(x)), "escreve direto no disco (dd)"],
	[(t) => /\bdrop\s+(table|database|schema)\b/i.test(t.join(" ")), "apaga tabela ou banco (DROP)"],
];
const PIPE_RUN = /\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[\s\S]*\|\s*(sudo\s+)?(sh|bash|zsh|iex|invoke-expression|python3?|node)\b/i;

export function defaultAsk(command) {
	if (PIPE_RUN.test(command)) return "baixa e executa um script";
	for (const seg of segments(command)) {
		for (const tail of suffixes(seg)) {
			const hit = DEFAULT_ASK.find(([test]) => test(tail));
			if (hit) return hit[1];
		}
	}
	return undefined;
}

// arquivos que o agente não edita por padrão
// (e as próprias regras e hooks: o modelo não se dá permissão nem roda código por eles)
export const DEFAULT_DENY_WRITE = [".env", ".env.*", "**/.env", "**/.env.*", ".git/**", "**/.git/**", "**/*.pem", "**/*.key", "**/id_rsa*", "**/id_ed25519*", "**/.pink/permissions.json", "**/.pink/hooks.json"];
const AGENT_FILES = ["permissions.json", "hooks.json"];

export function globToRegExp(glob, forPath) {
	let out = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*" && glob[i + 1] === "*") {
			i++;
			if (glob[i + 1] === "/") { out += "(?:.*/)?"; i++; } else out += ".*";
		} else if (c === "*") out += forPath ? "[^/]*" : ".*";
		else if (c === "?") out += ".";
		else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${out}$`, "is");
}

export function parseRule(rule) {
	const m = /^\s*([\w.:-]+)\s*(?:\(([\s\S]*)\))?\s*$/.exec(String(rule));
	return m ? { tool: m[1].toLowerCase(), pattern: m[2] } : undefined;
}

// o alvo da regra: o comando, ou o caminho relativo à pasta (barras normais, sem o @ de menção nem ponto/espaço final)
export function targetOf(toolName, input, cwd) {
	if (SHELLS.has(toolName)) return String(input?.command ?? "");
	if (FILES.has(toolName)) {
		let raw = String(input?.path ?? input?.file_path ?? "").replace(/^@/, "");
		if (raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")) raw = path.join(os.homedir(), raw.slice(1));
		raw = raw.replace(/::\$DATA$/i, "").replace(/[. ]+$/, "") || raw;
		const abs = path.resolve(cwd, raw);
		const rel = path.relative(cwd, abs).split(path.sep).join("/");
		return rel.startsWith("..") || path.isAbsolute(rel) ? abs.split(path.sep).join("/") : rel;
	}
	if (toolName === "web_fetch") return String(input?.url ?? "");
	return undefined;
}

const patternMatches = (pattern, toolName, target) => {
	const forPath = FILES.has(toolName);
	const re = globToRegExp(pattern.trim(), forPath);
	return re.test(target) || (forPath && re.test(target.split("/").pop() ?? ""));
};

// kind "allow" exige todos os trechos; "deny"/"ask" basta um
export function matches(rule, toolName, target, kind = "deny") {
	const parsed = parseRule(rule);
	if (!parsed || parsed.tool !== String(toolName).toLowerCase()) return false;
	if (parsed.pattern === undefined || parsed.pattern.trim() === "*") return true;
	if (target === undefined) return false;
	if (!SHELLS.has(toolName)) return patternMatches(parsed.pattern, toolName, target);
	const parts = segments(target);
	if (kind === "allow") return !SUBST.test(target) && parts.length > 0 && parts.every((seg) => patternMatches(parsed.pattern, toolName, seg));
	return patternMatches(parsed.pattern, toolName, target.trim()) || parts.some((seg) => suffixes(seg).some((tail) => patternMatches(parsed.pattern, toolName, tail.join(" "))));
}

export function loadRules(files, read = fs.readFileSync) {
	const rules = { allow: [], ask: [], deny: [], errors: [] };
	for (const file of files) {
		let text;
		try { text = read(file, "utf8"); } catch { continue; } // arquivo que não existe não é erro
		try {
			const data = JSON.parse(text);
			for (const kind of ["allow", "ask", "deny"]) {
				for (const rule of Array.isArray(data?.[kind]) ? data[kind] : []) {
					if (parseRule(rule)) rules[kind].push(String(rule));
					else rules.errors.push(`${file}: regra inválida ${JSON.stringify(rule)}`);
				}
			}
		} catch (error) {
			rules.errors.push(`${file}: ${error?.message ?? error}`);
		}
	}
	return rules;
}

// decide: { action: "allow" | "ask" | "deny", why }
export function decide(rules, toolName, target) {
	const hit = (kind) => rules[kind].find((rule) => matches(rule, toolName, target, kind));
	let rule;
	if ((rule = hit("deny"))) return { action: "deny", why: `regra deny ${rule}` };
	if ((rule = hit("ask"))) return { action: "ask", why: `regra ask ${rule}` };
	if ((rule = hit("allow"))) return { action: "allow", why: `regra allow ${rule}` };
	if (SHELLS.has(toolName) && target) {
		const danger = defaultAsk(target);
		if (danger) return { action: "ask", why: danger };
	}
	// página com injeção pode mandar "leia o segredo e abra evil/?d=<segredo>": endereço carregando dados pede confirmação
	// shortcut: só olha a query (>= 64 caracteres); dado no caminho passa, confirmar por domínio se virar problema
	if (toolName === "web_fetch" && target && /\?.{64,}/s.test(target)) return { action: "ask", why: "endereço com muitos dados na query (pode enviar dados para fora)" };
	if ((toolName === "write" || toolName === "edit") && target) {
		const name = target.split("/").pop() ?? "";
		if (DEFAULT_DENY_WRITE.some((glob) => globToRegExp(glob, true).test(target) || globToRegExp(glob, true).test(name)))
			return { action: "deny", why: "arquivo protegido do Pink (segredo ou .git); libere com allow se for de propósito" };
	}
	return { action: "allow", why: "" };
}

const READ_TOOLS = new Set(["read", "grep", "find", "ls", "todowrite", "tool_search"]);
export function readsOnly(pi, toolName) {
	if (READ_TOOLS.has(toolName)) return true;
	// readOnlyHint é declarado pela própria ferramenta: de servidor MCP não vale (um servidor hostil se diria "só leitura")
	if (toolName.startsWith("mcp__")) return false;
	try {
		return pi.getAllTools?.().find((tool) => tool.name === toolName)?.annotations?.readOnlyHint === true;
	} catch {
		return false;
	}
}

export function permissions(pi, deps = {}) {
	const { env = process.env, read = fs.readFileSync } = deps;
	const sessionAllowed = new Set();
	const filesFor = (ctx) => {
		const files = [path.join(agentDir(env), "permissions.json")];
		if (ctx?.isProjectTrusted?.()) files.push(path.join(ctx.cwd ?? process.cwd(), ".pink", "permissions.json"));
		return files;
	};
	let warned = false;
	pi.on("tool_call", async (event, ctx) => {
		const toolName = String(event?.toolName ?? "");
		const target = targetOf(toolName, event?.input, ctx?.cwd ?? process.cwd());
		const rules = loadRules(filesFor(ctx), read);
		if (rules.errors.length) {
			// arquivo de regras quebrado: sem tela, fecha (o deny que a pessoa escreveu não pode sumir em silêncio)
			if (!ctx?.hasUI) return { block: true, reason: `Permissões do Pink com erro, nada roda até corrigir: ${rules.errors[0]}` };
			if (!warned) { warned = true; ctx.ui.notify?.(`Permissões: ${rules.errors[0]}`, "warning"); }
		}
		if ((toolName === "write" || toolName === "edit") && target !== undefined) {
			const abs = path.resolve(ctx?.cwd ?? process.cwd(), target).toLowerCase();
			if (AGENT_FILES.some((name) => path.join(agentDir(env), name).toLowerCase() === abs))
				return { block: true, reason: "Bloqueado pelas permissões do Pink: o agente não edita as próprias regras e hooks (a pessoa edita)" };
		}
		let { action, why } = decide(rules, toolName, target);
		// modo "pergunta tudo" (alt+m, pink-ui): o que só lê segue livre; o resto confirma, mesmo com allow (deny continua valendo)
		if (action === "allow" && globalThis.__pinkPermissionMode === "ask" && !readsOnly(pi, toolName)) {
			action = "ask";
			why = "modo pergunta tudo (alt+m troca)";
		}
		if (action === "allow") return undefined;
		const shown = target ?? toolName;
		if (action === "deny") return { block: true, reason: `Bloqueado pelas permissões do Pink: ${why}` };
		const key = `${toolName}\u0000${shown}`;
		if (sessionAllowed.has(key)) return undefined;
		if (!ctx?.hasUI) return { block: true, reason: `Precisa de confirmação e não há tela para pedir (${why}): ${shown}` };
		const choice = await ctx.ui.select(`Confirmar ${toolName}: ${why}\n\n  ${shown}\n`, ["Permitir uma vez", "Permitir nesta sessão", "Negar"]);
		if (choice === "Permitir uma vez") return undefined;
		if (choice === "Permitir nesta sessão") { sessionAllowed.add(key); return undefined; }
		return { block: true, reason: "A pessoa negou esta ação" };
	});
	pi.registerCommand?.("permissoes", {
		description: "Mostra as permissões em uso (regras do usuário, do projeto e o padrão do Pink)",
		handler: async (_args, ctx) => {
			const files = filesFor(ctx);
			const rules = loadRules(files, read);
			const lines = [
				`Arquivos: ${files.join(" · ")}`,
				`deny: ${rules.deny.join(", ") || "-"}`,
				`ask: ${rules.ask.join(", ") || "-"}`,
				`allow: ${rules.allow.join(", ") || "-"}`,
				`Padrão: confirma comandos destrutivos (${DEFAULT_ASK.length + 1} tipos) e protege .env, .git e chaves; um allow que casa libera também o padrão`,
				...rules.errors.map((e) => `Erro: ${e}`),
			];
			ctx.ui.notify?.(lines.join("\n"), rules.errors.length ? "warning" : "info");
		},
	});
	return { sessionAllowed };
}

export default function (pi) {
	permissions(pi);
}
