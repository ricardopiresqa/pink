// /review (owner 2026-11-19, card 1dfwh7kfzxw), como o /review do Claude Code e do Codex: revisão independente do diff.
// /review revisa o que não foi commitado (com os arquivos novos); /review <branch> [foco] revisa tudo desde a base com o
// branch (commits e o que não foi commitado). O primeiro termo é sempre o branch. O diff vai para um arquivo temporário e o
// agente principal chama o subagente "revisor", que só lê (read, grep, find, ls, sem MCP) e não vê a conversa.
// Só em pasta confiável: o git lê a configuração do repositório e ela pode rodar programas (textconv, fsmonitor).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MAX_DIFF = 2 * 1024 * 1024; // diff maior que isso vai cortado (o revisor lê os arquivos para o resto)
const MAX_UNTRACKED = 200;
const MAX_NAME = 200;
const STALE_MS = 24 * 60 * 60 * 1000;
const PREFIX = "pink-review-";
// shortcut: árvore vazia do SHA-1, para repositório ainda sem commit; repositório SHA-256 sem commit cai no erro do git diff
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

type Git = (args: string[], cwd: string) => { ok: boolean; out: string; err: string };
// configuração do repositório que roda programa fica desligada; no Windows o git não é procurado na pasta do projeto
export const SAFE_CONFIG = ["-c", "core.fsmonitor=", "-c", "core.pager=cat", "-c", "core.quotePath=false"];
export const git: Git = (args, cwd) => {
	const run = spawnSync("git", [...SAFE_CONFIG, ...args], {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		windowsHide: true,
		env: { ...process.env, NoDefaultCurrentDirectoryInExePath: "1", GIT_OPTIONAL_LOCKS: "0" },
	});
	return { ok: run.status === 0, out: run.stdout ?? "", err: (run.stderr || run.error?.message || "").trim() };
};

// branch, tag ou commit: sem "-" no começo (viraria opção do git), sem espaço, controle ou intervalo (..); o git valida o resto
export const validRef = (ref: string) => /^[^-\s\x00-\x1f][^\s\x00-\x1f]*$/u.test(ref) && !ref.includes("..");

// nome de arquivo vem de quem fez o commit e entra numa mensagem com voz de usuário: sem controle e curto
export const cleanName = (name: string) => {
	const clean = name.replace(/[\x00-\x1f\x7f]/g, "?");
	return clean.length > MAX_NAME ? `${clean.slice(0, MAX_NAME)}…` : clean;
};

type Found = { error?: string; diff?: string; files?: string[]; extra?: number; label?: string; root?: string };

export function collect(cwd: string, base: string | undefined, run: Git = git): Found {
	const top = run(["rev-parse", "--show-toplevel"], cwd);
	if (!top.ok) return { error: "Esta pasta não é um repositório git." };
	const root = path.resolve(top.out.trim()); // caminhos do diff e do ls-files ficam relativos à raiz
	let from = "HEAD";
	let label = "mudanças não commitadas";
	if (base) {
		if (!validRef(base)) return { error: `Referência inválida: ${base}` };
		const mergeBase = run(["merge-base", base, "HEAD"], root);
		if (!mergeBase.ok) return { error: `Não achei a base com ${base}: ${mergeBase.err || "referência desconhecida"}` };
		from = mergeBase.out.trim();
		label = `mudanças desde ${base}`;
	} else if (!run(["rev-parse", "--verify", "--quiet", "HEAD"], root).ok) from = EMPTY_TREE;
	const diff = run(["diff", "--no-color", "--no-ext-diff", "--no-textconv", from, "--"], root);
	if (!diff.ok) return { error: `git diff falhou: ${diff.err}` };
	const names = run(["diff", "--name-only", "--no-textconv", from, "--"], root).out.split(/\r?\n/).filter(Boolean);
	const untracked = run(["ls-files", "--others", "--exclude-standard"], root).out.split(/\r?\n/).filter(Boolean);
	if (!diff.out.trim() && !untracked.length) return { error: `Nada para revisar (${label}).` };
	const files = [...names.map(cleanName), ...untracked.slice(0, MAX_UNTRACKED).map((file) => `${cleanName(file)} [novo, fora do git]`)];
	let text = diff.out;
	if (text.length > MAX_DIFF) text = `${text.slice(0, MAX_DIFF)}\n[diff cortado em ${MAX_DIFF / 1024 / 1024} MB: leia os arquivos da lista para o resto]\n`;
	return { diff: text, files, extra: Math.max(0, untracked.length - MAX_UNTRACKED), label, root };
}

export function reviewPrompt(diffFile: string, found: Found, focus = "") {
	const files = found.files ?? [];
	const more = files.length - 50 + (found.extra ?? 0);
	const list = files.slice(0, 50).map((file) => `- ${file}`).join("\n") + (more > 0 ? `\n- … e mais ${more} arquivo(s) não listados` : "");
	const task = `Revise as ${found.label} do repositório em ${found.root}; os caminhos abaixo são relativos a essa pasta. O diff está em ${diffFile}; os arquivos marcados como novos não estão no diff, leia direto. Arquivos:\n${list}${focus ? `\nFoco pedido: ${focus}` : ""}`;
	return [
		`Faça uma revisão independente das ${found.label}: chame a ferramenta subagent com agent "revisor" (só leitura) e exatamente esta tarefa, sem acrescentar sua opinião sobre o código:`,
		"",
		task,
		"",
		"Depois mostre os achados como o revisor devolveu (gravidade, arquivo:linha, problema, correção). Não corrija nada: pergunte quais eu quero corrigir.",
	].join("\n");
}

// diff de sessão que caiu sem session_shutdown não fica para sempre no temporário
export function sweepStale(tmp = os.tmpdir(), now = Date.now()) {
	let names: string[] = [];
	try {
		names = fs.readdirSync(tmp).filter((name) => name.startsWith(PREFIX));
	} catch {
		return;
	}
	for (const name of names) {
		const dir = path.join(tmp, name);
		try {
			if (now - fs.statSync(dir).mtimeMs > STALE_MS) fs.rmSync(dir, { recursive: true, force: true });
		} catch {}
	}
}

export default function (pi: any) {
	if (process.env.PINK_SUBAGENT) return; // subagente não abre outro subagente
	const dirs: string[] = [];
	pi.on("session_start", async () => sweepStale());
	pi.registerCommand("review", {
		description: "Revisão independente (subagente só leitura) do que não foi commitado, ou de tudo desde um branch: /review [branch] [foco]",
		handler: async (args: string, ctx: any) => {
			if (ctx?.isProjectTrusted?.() !== true) return ctx.ui.notify("Pasta não confiável: o /review fica desligado (o git do projeto poderia rodar programas dele). Confie na pasta para usar.", "error");
			const [base, ...rest] = String(args ?? "").trim().split(/\s+/).filter(Boolean);
			const found = collect(ctx?.cwd ?? process.cwd(), base);
			if (found.error) return ctx.ui.notify(found.error, found.error.startsWith("Nada") ? "info" : "error");
			let file: string;
			try {
				const dir = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX));
				dirs.push(dir);
				file = path.join(dir, "diff.patch");
				fs.writeFileSync(file, found.diff ?? "");
			} catch (error) {
				return ctx.ui.notify(`Não consegui gravar o diff no temporário: ${(error as Error)?.message ?? error}`, "error");
			}
			ctx.ui.notify(`Revisando ${found.label}: ${(found.files?.length ?? 0) + (found.extra ?? 0)} arquivo(s).`, "info");
			const prompt = reviewPrompt(file, found, rest.join(" "));
			// agente trabalhando: entra na fila em vez de ser recusado
			if (ctx?.isIdle?.() === false) pi.sendUserMessage?.(prompt, { deliverAs: "followUp" });
			else pi.sendUserMessage?.(prompt);
		},
	});
	pi.on("session_shutdown", async () => {
		for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
	});
}
