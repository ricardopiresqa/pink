#!/usr/bin/env node
// Pink com várias sessões ao mesmo tempo (owner 2026-11-15, card 1dfwh7kffcu): uma lateral à esquerda lista as sessões e o
// resto da tela é a sessão ativa. O modo interativo do Pink segura uma sessão por vez, então cada sessão é um Pink filho num
// terminal virtual (node-pty + @xterm/headless) e este processo só desenha a lateral, a tela do filho ativo e repassa o teclado.
// Sem terminal interativo, com comando de uma vez (-p, --help, install...) ou sem node-pty, roda o Pink normal, sem lateral.
import { execFile } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// PINK_MUX_CLI só vale como caminho absoluto: um relativo seria resolvido na pasta do projeto aberto (arquivo plantado no repositório)
const CLI = process.env.PINK_MUX_CLI && path.isAbsolute(process.env.PINK_MUX_CLI) ? process.env.PINK_MUX_CLI : path.join(HERE, "..", "bundle", "cli.js");
export const SIDEBAR = 26; // largura mínima da lateral, com o separador fora
const MAX_SIDEBAR = 36;
const NARROW = 60; // abaixo disso a lateral fica só com número e estado
const MOUSE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/; // clique no modo SGR (ESC[?1006h)
const ACTIVE_BG = "48;2;73;36;61";
// cliques, roda e arrasto em SGR (a sessão rola e seleciona texto com eles); Shift+arrastar seleciona pelo terminal
const MOUSE_ON = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";
// no Windows o ConPTY consome o pedido de mouse do Pink e o terminal virtual nunca o vê: repassa sempre
const ALWAYS_FORWARD_MOUSE = process.platform === "win32";
const SUBCOMMANDS = new Set(["install", "uninstall", "remove", "update", "list", "auth", "mcp", "config"]);
const ONE_SHOT = new Set(["-p", "--print", "--mode", "-h", "--help", "-v", "--version", "--export", "--list-models"]);
const FIRST_ONLY = new Set(["-c", "--continue", "-r", "--resume"]); // continuar a mesma sessão em dois processos estragaria o arquivo
const FIRST_ONLY_VALUE = new Set(["--session", "--session-id", "--fork"]);
// opções do Pink que recebem valor (pink --help); qualquer outro texto solto é a mensagem inicial, que fica só na primeira sessão
const TAKES_VALUE = new Set(["--provider", "--model", "--api-key", "--system-prompt", "--append-system-prompt", "--mode", "--session-dir", "--models", "--thinking", "--skill", "--prompt-template", "--theme", "--use-theme", "--export", "--tui-mode", "--extension", "-e", "--tools"]);
const SPIN = ["◐", "◓", "◑", "◒"];
const PINK = "38;2;255;110;180";

// o lançador põe "--provider thoth --model thoth" antes de tudo; o Pink só reconhece subcomando como 1º argumento
export function subcommandFirst(argv) {
	let i = 0;
	while (i < argv.length && argv[i].startsWith("-")) {
		if (ONE_SHOT.has(argv[i].split("=")[0])) return argv; // "pink -p list": a mensagem é "list", não o subcomando
		i += TAKES_VALUE.has(argv[i]) ? 2 : 1;
	}
	return i > 0 && SUBCOMMANDS.has(argv[i]) ? argv.slice(i) : argv;
}

export function wantsMux(argv, env, tty) {
	if (!tty || env.PINK_MUX_CHILD === "1" || env.PINK_NO_MUX === "1" || argv.includes("--sem-sessoes")) return false;
	if (argv.some((arg) => ONE_SHOT.has(arg.split("=")[0]))) return false;
	return !(argv[0] && SUBCOMMANDS.has(argv[0]));
}

// argumentos das sessões abertas depois da primeira: sem continuar sessão nem a mensagem inicial
export function laterArgs(argv) {
	const out = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (FIRST_ONLY.has(arg)) continue;
		if (FIRST_ONLY_VALUE.has(arg)) { i++; continue; }
		if (FIRST_ONLY_VALUE.has(arg.split("=")[0])) continue;
		if (!arg.startsWith("-")) continue; // mensagem inicial
		out.push(arg);
		if (TAKES_VALUE.has(arg) && i + 1 < argv.length) out.push(argv[++i]);
	}
	return out;
}

// a lateral é toda por clique (owner 2026-11-15): os cliques saem da entrada e o resto vai para a sessão ativa. Texto colado
// (entre ESC[200~ e ESC[201~, mesmo chegando em vários pedaços: `state.pasting`) nunca vira clique
export function parseKeys(data, state = {}) {
	const out = [];
	let buffer = "";
	for (let i = 0; i < data.length; i++) {
		if (data.startsWith("\x1b[200~", i)) state.pasting = true;
		if (data.startsWith("\x1b[201~", i)) state.pasting = false;
		const mouse = !state.pasting && data[i] === "\x1b" ? MOUSE.exec(data.slice(i, i + 32)) : null;
		if (mouse) {
			if (buffer) out.push({ forward: buffer });
			buffer = "";
			out.push({ mouse: { button: Number(mouse[1]), x: Number(mouse[2]), y: Number(mouse[3]), press: mouse[4] === "M" } });
			i += mouse[0].length - 1;
			continue;
		}
		buffer += data[i];
	}
	if (buffer) out.push({ forward: buffer });
	return out;
}

// largura na tela: CJK e emoji ocupam 2 colunas, marcas de combinação 0
export function charWidth(ch) {
	const cp = ch.codePointAt(0) ?? 0;
	if (cp === 0 || (cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
	if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff)) return 2;
	return 1;
}

export function fit(text, width) {
	let out = "";
	let used = 0;
	for (const ch of text) {
		const w = charWidth(ch);
		if (used + w > width) break;
		out += ch;
		used += w;
	}
	return out + " ".repeat(Math.max(0, width - used));
}

export function shortTitle(title, index) {
	// o título vem do processo da sessão: sem caracteres de controle ele não consegue mexer no terminal ao ser desenhado
	const clean = (title ?? "").replace(/[\u0000-\u001f\u007f-\u009f]|\p{Cf}/gu, "").replace(/^\s*p(?:i|ink)\s*-\s*/i, "").trim();
	// só o nome do programa (antes da pasta ser confiável o Pink ainda não pôs a pasta no título) conta como vazio
	return clean && !/^p(?:i|ink)$/i.test(clean) ? clean : `Sessão ${index + 1}`;
}

// estado de uma sessão a partir dos sinais do Pink filho: progresso (OSC 9;4) = trabalhando; fim do progresso ou sino numa
// sessão que não está na tela = espera a pessoa (!) até ela abrir a sessão
export function onSignal(session, signal, isActive) {
	if (signal === "work") session.working = true;
	if (signal === "idle") {
		if (session.working && !isActive) session.attention = true;
		session.working = false;
	}
	if (signal === "bell" && !isActive) session.attention = true;
	return session;
}

// o Pink filho avisa o arquivo da sessão dele (OSC 9;pink-session=<arquivo>) ao fim de cada execução: é o que reabre depois
export function sessionFileSignal(data) {
	const text = String(data);
	if (!text.startsWith("pink-session=")) return undefined;
	const file = text.slice("pink-session=".length);
	const inside = path.relative(sessionsDir(), file); // só arquivo da pasta de sessões: texto impresso por ferramenta não registra outro
	return path.isAbsolute(file) && file.endsWith(".jsonl") && inside && !inside.startsWith("..") && !path.isAbsolute(inside) ? file : undefined;
}

export const pidAlive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code !== "ESRCH";
	}
};

// sessões abertas ao sair (owner 2026-11-18, card 1dfwh7kfyty): fechar no × tira da lista, "sair do Pink" mantém; o Pink
// seguinte reabre só estas, cada uma na pasta dela
export const openListFile = (env = process.env, home = homedir()) => path.join(sessionsDir(env, home), "abertas.json");

// a lista tem dono (o pid do mux que a grava): com o dono vivo, outro Pink não reabre as mesmas sessões (o mesmo arquivo em
// dois processos estraga a sessão) nem sobrescreve a lista dele. shortcut: pid reaproveitado pelo sistema conta como vivo
export function readOpenList(file, exists = existsSync, alive = pidAlive) {
	let saved;
	try {
		saved = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return { sessions: [], busy: false };
	}
	if (Number.isInteger(saved?.pid) && saved.pid !== process.pid && alive(saved.pid)) return { sessions: [], busy: true };
	const seen = new Set();
	const sessions = (Array.isArray(saved?.sessions) ? saved.sessions : []).filter((item) => {
		if (typeof item?.file !== "string" || typeof item?.cwd !== "string" || !item.file.endsWith(".jsonl")) return false;
		const key = process.platform === "win32" ? path.resolve(item.file).toLowerCase() : path.resolve(item.file);
		if (seen.has(key) || !exists(item.file) || !exists(item.cwd)) return false; // apagada ou pasta removida: não reabre
		seen.add(key);
		return true;
	});
	return { sessions, busy: false };
}

export function progressSignal(data) {
	const [kind, state] = String(data).split(";");
	if (kind !== "4") return undefined;
	return state === "0" || state === undefined ? "idle" : "work";
}

// estado que o Pink filho informa ao terminal (OSC 7501, program-status do pi-tui): working, blocked (pergunta ou permissão
// aberta, kind=question|permission), done, error, idle; msg em base64 (card 1dfwh7kfyyg)
const PROGRAM_STATES = new Set(["idle", "working", "blocked", "done", "error"]);
export function parseProgramStatus(data) {
	const pairs = {};
	for (const part of String(data).split(":")) {
		const at = part.indexOf("=");
		if (at > 0) pairs[part.slice(0, at)] = part.slice(at + 1);
	}
	if (pairs.state === "clear") return { state: "clear" }; // o filho parou de informar (stop/suspensão): a lateral esquece o estado
	if (!PROGRAM_STATES.has(pairs.state)) return undefined; // inclui a pergunta "?" de suporte
	let message = "";
	try { message = pairs.msg ? oneLine(Buffer.from(pairs.msg, "base64").toString("utf8")) : ""; } catch { /* msg inválida: sem texto */ }
	return { state: pairs.state, kind: pairs.kind === "permission" ? "permission" : pairs.kind ? "question" : undefined, message };
}

// trabalhando pelo progresso (OSC 9;4) ou pelo estado do programa (OSC 7501): qualquer um dos dois basta
export const isWorking = (session) => Boolean(session.working || session.program?.state === "working");

export function icon(session, frame) {
	if (session.exited) return "×";
	if (session.program?.state === "blocked") return "?";
	if (session.attention || session.program?.state === "error") return "!";
	if (isWorking(session)) return SPIN[frame % SPIN.length];
	return "·";
}

// cerca de 20% da tela, como no print do owner
export function sidebarWidth(columns) {
	return columns < NARROW ? 5 : Math.min(MAX_SIDEBAR, Math.max(SIDEBAR, Math.round(columns * 0.2)));
}

// o Pink põe no título "pink - nome - pasta" ou "pink - pasta"; a pasta conhecida vem antes, porque pode ter " - " no nome
export function sessionLabel(title, index, folder = "") {
	const text = shortTitle(title, index);
	if (folder && text === folder) return { name: `Sessão ${index + 1}`, folder };
	if (folder && text.endsWith(` - ${folder}`)) return { name: text.slice(0, -folder.length - 3), folder };
	const parts = text.split(" - ");
	if (parts.length > 1) return { name: parts.slice(0, -1).join(" - "), folder: parts.at(-1) };
	return { name: `Sessão ${index + 1}`, folder: text === `Sessão ${index + 1}` ? folder : text };
}

function status(session, folder) {
	if (session.exited) return "encerrada";
	if (session.program?.state === "blocked") return session.program.kind === "permission" ? "pede permissão · espera você" : "pergunta · espera você";
	if (session.program?.state === "error") return "parou com erro";
	if (session.attention) return "terminou · espera você";
	if (isWorking(session)) return "trabalhando…";
	return folder || "pronta";
}

export function hitAt(hits, x, y) {
	return hits.find((hit) => hit.y === y && x >= hit.from && x < hit.to)?.action;
}

// a lateral linha a linha (texto com cor, sempre `width` colunas visíveis) e onde cada clique cai (`hits`, base 0):
// select:N, close:N (o ×), new, quit, yes, no
export function sidebar({ sessions, active, width, rows, frame = 0, confirm, folder = "" }) {
	const plain = (text) => fit(text, width);
	const paint = (code, text) => `\x1b[${code}m${plain(text)}\x1b[0m`;
	const compact = width < SIDEBAR;
	const lines = [paint(`1;${PINK}`, compact ? " Pk" : " SESSÕES"), plain("")];
	const hits = [];
	const hit = (action, from = 0, to = width) => hits.push({ y: lines.length, from, to, action });
	const asking = confirm && !compact ? wrap(confirm, width - 1) : [];
	const bottomRows = compact ? 0 : asking.length ? asking.length + 1 : 1;
	// cada sessão em 2 linhas e um espaço, como no print; sem altura para todas, 1 linha cada
	const tall = !compact && sessions.length * 3 <= rows - lines.length - 2 - bottomRows;
	sessions.forEach((session, index) => {
		const on = index === active;
		const bar = on ? `\x1b[${ACTIVE_BG};${PINK}m▌\x1b[0m` : " ";
		const bg = on ? `${ACTIVE_BG};` : "";
		const mark = icon(session, frame);
		hit(`select:${index}`, 0, compact ? width : width - 3);
		if (compact) return lines.push(`${bar}\x1b[${bg}1m${fit(`${index < 9 ? index + 1 : " "} ${mark}`, width - 1)}\x1b[0m`);
		hit(`close:${index}`, width - 3);
		const { name, folder: where } = sessionLabel(session.title, index, session.cwd ? path.basename(session.cwd) : folder);
		const tone = (session.attention || session.program?.state === "blocked") && !on ? "38;2;240;196;135;" : "";
		lines.push(`${bar}\x1b[${bg}${tone}1m${fit(` ${mark} ${name}`, width - 4)}\x1b[0m\x1b[${bg}2m × \x1b[0m`);
		if (!tall) return;
		hit(`select:${index}`);
		lines.push(`${bar}\x1b[${bg}2m${fit(`   ${status(session, where)}`, width - 1)}\x1b[0m`);
		lines.push(plain(""));
	});
	if (!tall) lines.push(plain(""));
	const top = Math.max(0, rows - bottomRows);
	// shortcut: sem rolagem da lista; com mais sessões que linhas as de baixo somem, mas o "+" fica sempre visível
	if (lines.length > top - 1) {
		lines.length = Math.max(0, top - 1);
		hits.splice(0, hits.length, ...hits.filter((item) => item.y < lines.length));
	}
	hit("new");
	lines.push(paint(`1;${PINK}`, compact ? " +" : "  + nova sessão"));
	while (lines.length < top) lines.push(plain(""));
	const out = lines.slice(0, top);
	const kept = hits.filter((item) => item.y < top);
	if (asking.length) {
		for (const line of asking) out.push(paint(`1;${PINK}`, ` ${line}`));
		kept.push({ y: out.length, from: 2, to: 9, action: "yes" }, { y: out.length, from: 11, to: 18, action: "no" });
		out.push(paint("1", "  [ sim ]  [ não ]"));
	} else if (!compact) {
		kept.push({ y: out.length, from: 0, to: width, action: "quit" });
		out.push(paint("2", "  sair do Pink"));
	}
	return { lines: out.slice(0, rows), hits: kept.filter((item) => item.y < rows) };
}

// ---- seletor da nova sessão (owner 2026-11-15, card 1dfwh7kffh8): pasta do projeto, sessões salvas de todas as pastas, excluir

const samePath = (a, b) => {
	const [x, y] = [path.resolve(a ?? ""), path.resolve(b ?? "")];
	return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};
const oneLine = (text) => String(text ?? "").replace(/[\u0000-\u001f\u007f-\u009f]|\p{Cf}/gu, " ").replace(/\s+/g, " ").trim();
const textOf = (content) => (typeof content === "string" ? content : Array.isArray(content) ? content.filter((part) => part?.type === "text").map((part) => part.text).join(" ") : "");

// onde o Pink grava as sessões (sessions.md): variável da pasta de sessões, senão <pasta do agente>/sessions
// shortcut: ignora o sessionDir do settings.json; quem usa precisa da variável PINK_CODING_AGENT_SESSION_DIR
export function sessionsDir(env = process.env, home = homedir()) {
	if (env.PINK_CODING_AGENT_SESSION_DIR) return env.PINK_CODING_AGENT_SESSION_DIR;
	return path.join(env.PINK_CODING_AGENT_DIR || path.join(home, ".pink", "agent"), "sessions");
}

// cabeçalho (cwd), nome (/name) e primeira mensagem de uma sessão
// shortcut: lê só os primeiros 32 KB (o cabeçalho é a 1ª linha); um /name gravado depois disso não aparece, fica a 1ª mensagem
const HEAD = Buffer.alloc(32768);
function readHead(file) {
	let text = "";
	try {
		const fd = openSync(file, "r");
		try {
			text = HEAD.toString("utf8", 0, readSync(fd, HEAD, 0, HEAD.length, 0));
		} finally {
			closeSync(fd);
		}
	} catch {
		return {};
	}
	let cwd;
	let name = "";
	let first = "";
	for (const line of text.split("\n")) {
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			continue; // a última linha lida pode vir cortada
		}
		if (entry?.type === "session" && !cwd && typeof entry.cwd === "string" && entry.cwd) cwd = entry.cwd;
		else if (entry?.type === "session_info" && entry.name) name = oneLine(entry.name);
		else if (!first && entry?.type === "message" && entry.message?.role === "user") first = oneLine(textOf(entry.message.content));
	}
	return { cwd, name: name || first };
}

// "pink --session <id>" (o comando que aparece ao sair) acha a sessão em qualquer pasta: o Pink só procura na pasta atual.
// Id parcial que casa com mais de uma sessão não é resolvido aqui (fica com o Pink, que pergunta na pasta atual).
export function findSession(dir, id) {
	if (!/^[0-9a-f-]{4,}$/i.test(id ?? "")) return undefined;
	let folders = [];
	try {
		folders = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
	} catch {
		return undefined;
	}
	const found = [];
	for (const folder of folders) {
		let names = [];
		try {
			names = readdirSync(path.join(dir, folder.name));
		} catch {
			continue;
		}
		for (const n of names) if (n.endsWith(".jsonl") && n.toLowerCase().includes(`_${id.toLowerCase()}`)) found.push(path.join(dir, folder.name, n));
		if (found.length > 1) return undefined;
	}
	return found.length === 1 ? { file: found[0], cwd: readHead(found[0]).cwd } : undefined;
}

// troca o id pelo arquivo e entra na pasta da sessão, para retomar de qualquer lugar
export function resolveSessionArg(argv, dir, exists = existsSync) {
	const at = argv.findIndex((arg) => arg === "--session" || arg.startsWith("--session="));
	if (at < 0 || argv.includes("--session-dir")) return { argv };
	const inline = argv[at].startsWith("--session=");
	const id = inline ? argv[at].slice("--session=".length) : argv[at + 1];
	if (id === undefined || exists(id)) return { argv };
	const found = findSession(dir, id);
	if (!found) return { argv };
	const out = [...argv];
	if (inline) out[at] = `--session=${found.file}`;
	else out[at + 1] = found.file;
	return { argv: out, cwd: found.cwd && exists(found.cwd) ? found.cwd : undefined };
}

// as sessões salvas de todas as pastas, da mais recente para a mais antiga (no máximo `limit`)
export function listSessions(dir, limit = 300) {
	const files = [];
	let folders = [];
	try {
		folders = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
	} catch {
		return [];
	}
	for (const folder of folders) {
		let names = [];
		try {
			names = readdirSync(path.join(dir, folder.name));
		} catch {
			continue;
		}
		for (const name of names) {
			if (!name.endsWith(".jsonl")) continue;
			const file = path.join(dir, folder.name, name);
			try {
				files.push({ file, mtime: statSync(file).mtimeMs });
			} catch { /* sumiu entre a listagem e o stat */ }
		}
	}
	files.sort((a, b) => b.mtime - a.mtime);
	return files.slice(0, limit).map((item) => ({ ...item, ...readHead(item.file) })).filter((item) => item.cwd);
}

// a pasta atual e as pastas das sessões salvas que ainda existem, sem repetir
export function recentFolders(saved, current, exists = existsSync, limit = 8) {
	const out = [current];
	for (const item of saved) {
		if (out.length >= limit) break;
		if (!out.some((folder) => samePath(folder, item.cwd)) && exists(item.cwd)) out.push(item.cwd);
	}
	return out;
}

const when = (ms) => {
	const date = new Date(ms);
	const two = (n) => String(n).padStart(2, "0");
	return `${two(date.getDate())}/${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}`;
};

// o seletor na área da sessão: linhas com `width` colunas e onde cada clique cai (base 0): cancel, folder:N, input,
// resume:N, delete:N. `saved[i].open` = a sessão está aberta agora (não exclui; clicar mostra ela)
export function pickerView({ folders, saved, input = "", width, rows, scroll = 0, error = "", current = "" }) {
	const plain = (text) => fit(text, width);
	const paint = (code, text) => `\x1b[${code}m${plain(text)}\x1b[0m`;
	const lines = [];
	const hits = [];
	const hit = (action, from = 0, to = width) => hits.push({ y: lines.length, from, to, action });
	const cancel = "[ cancelar ]";
	hit("cancel", Math.max(0, width - cancel.length - 1), width);
	lines.push(`\x1b[1;${PINK}m${fit(" Nova sessão", width - cancel.length - 1)}\x1b[0m\x1b[2m${cancel} \x1b[0m`);
	lines.push(plain(""), paint("1", " Abrir numa pasta"));
	folders.forEach((folder, index) => {
		hit(`folder:${index}`);
		const tag = samePath(folder, current) ? "(atual)" : "";
		// o cwd vem do arquivo da sessão: sem códigos de controle na tela
		lines.push(plain(`   ▸ ${fit(oneLine(path.basename(folder) || folder), 20)} ${fit(tag, 8)}${oneLine(folder)}`));
	});
	const label = "   Outra pasta: ";
	hit("input");
	const caret = { y: lines.length, x: Math.min(width - 1, charsWidth(label) + charsWidth(input)) };
	const field = Math.max(1, width - charsWidth(label) - 1);
	lines.push(`${label}\x1b[48;2;60;60;70m${fit(input.length > field ? input.slice(-field) : input, field)}\x1b[0m `);
	lines.push(error ? paint("38;2;255;120;120", `   ${error}`) : paint("2", "   digite o caminho e Enter · Esc fecha"));
	lines.push(plain(""), paint("1", ` Sessões anteriores, de todas as pastas (${saved.length})`));
	const top = lines.length;
	const room = Math.max(0, rows - top - 1);
	const start = Math.max(0, Math.min(scroll, saved.length - Math.max(1, room)));
	const del = " excluir ";
	saved.slice(start, start + room).forEach((item, offset) => {
		const index = start + offset;
		const tail = item.open ? "  aberta " : del;
		hit(`resume:${index}`, 0, width - del.length);
		if (!item.open) hit(`delete:${index}`, width - del.length);
		const text = `   ${when(item.mtime)}  ${fit(oneLine(path.basename(item.cwd) || item.cwd), 18)} ${item.name || "(sem mensagens)"}`;
		lines.push(`${fit(text, width - del.length)}\x1b[${item.open ? "2" : "38;2;255;140;140"}m${tail}\x1b[0m`);
	});
	if (!saved.length) lines.push(paint("2", "   nenhuma sessão salva ainda"));
	while (lines.length < rows - 1) lines.push(plain(""));
	const more = room && saved.length > room ? `   ${start + 1}-${Math.min(saved.length, start + room)} de ${saved.length} · role com a roda do mouse` : "";
	lines.push(paint("2", more));
	return { lines: lines.slice(0, rows), hits: hits.filter((item) => item.y < rows), caret, scroll: start, room };
}

const charsWidth = (text) => [...text].reduce((sum, ch) => sum + charWidth(ch), 0);

// manda a sessão para a lixeira do sistema (recuperável); nunca apaga direto. Só arquivo .jsonl dentro da pasta de sessões.
// Assíncrona: a tela e as sessões abertas seguem enquanto o sistema move o arquivo
export async function trashFile(file, root) {
	const target = path.resolve(file);
	const base = path.resolve(root) + path.sep;
	const inside = process.platform === "win32" ? target.toLowerCase().startsWith(base.toLowerCase()) : target.startsWith(base);
	if (!inside || !target.endsWith(".jsonl") || !existsSync(target)) return false;
	const run = (command, args, env = {}) => new Promise((done) => {
		try {
			execFile(command, args, { timeout: 10000, windowsHide: true, env: { ...process.env, ...env } }, () => done());
		} catch {
			done(); // comando ausente: tenta o próximo
		}
	});
	if (process.platform === "win32") {
		// o caminho vai por variável de ambiente, nunca dentro do comando (sem injeção)
		// shortcut: se o arquivo estiver em uso, o Windows pode mostrar uma caixa de erro; o timeout de 10 s libera o Pink
		await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:PINK_TRASH_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin')"], { PINK_TRASH_FILE: target });
	} else {
		await run("trash", ["--", target]);
		if (existsSync(target)) await run("gio", ["trash", "--", target]);
	}
	return !existsSync(target);
}

function wrap(text, width) {
	const out = [];
	let line = "";
	for (const word of text.split(" ")) {
		if (line && (line + " " + word).length > width) {
			out.push(line);
			line = word;
		} else line = line ? `${line} ${word}` : word;
	}
	if (line) out.push(line);
	return out;
}

// uma linha do terminal virtual em texto com SGR, exatamente `columns` células
function sgrOf(cell) {
	const parts = ["0"];
	if (cell.isBold()) parts.push("1");
	if (cell.isDim()) parts.push("2");
	if (cell.isItalic()) parts.push("3");
	if (cell.isUnderline()) parts.push("4");
	if (cell.isBlink()) parts.push("5");
	if (cell.isInverse()) parts.push("7");
	if (cell.isInvisible()) parts.push("8");
	if (cell.isStrikethrough()) parts.push("9");
	const color = (rgb, palette, value, base, bright, ext) => {
		if (rgb) parts.push(`${ext};2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}`);
		else if (palette) parts.push(value < 8 ? String(base + value) : value < 16 ? String(bright + value - 8) : `${ext};5;${value}`);
	};
	color(cell.isFgRGB(), cell.isFgPalette(), cell.getFgColor(), 30, 90, 38);
	color(cell.isBgRGB(), cell.isBgPalette(), cell.getBgColor(), 40, 100, 48);
	return parts.join(";");
}

export function serializeLine(line, columns, scratch) {
	if (!line) return " ".repeat(columns);
	let out = "";
	let last = "0";
	for (let x = 0; x < columns; x++) {
		const cell = line.getCell(x, scratch);
		if (!cell) {
			out += " ";
			continue;
		}
		if (cell.getWidth() === 0) continue; // a segunda metade de um caractere largo
		const sgr = sgrOf(cell);
		if (sgr !== last) {
			out += `\x1b[${sgr}m`;
			last = sgr;
		}
		out += (cell.getChars() || " ").replace(/[\u0000-\u001f\u007f-\u009f]/g, " "); // defesa: célula nunca leva código de controle ao terminal
	}
	return `${out}\x1b[0m`;
}

async function runPlain() {
	process.argv = process.argv.filter((arg) => arg !== "--sem-sessoes"); // o cli.js do Pink relê process.argv e recusa a opção
	await import(pathToFileURL(CLI).href);
}

async function main() {
	const resumed = resolveSessionArg(subcommandFirst(process.argv.slice(2)), sessionsDir());
	process.argv = [...process.argv.slice(0, 2), ...resumed.argv];
	if (resumed.cwd) process.chdir(resumed.cwd);
	const argv = process.argv.slice(2).filter((arg) => arg !== "--sem-sessoes");
	const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
	if (!wantsMux(process.argv.slice(2), process.env, tty)) return runPlain();
	let pty;
	let Terminal;
	try {
		pty = (await import("node-pty")).default;
		Terminal = (await import("@xterm/headless")).default.Terminal;
	} catch {
		return runPlain(); // sem o terminal virtual nesta máquina: o Pink de sempre, sem lateral
	}
	const out = process.stdout;
	const sessions = [];
	let active = 0;
	let opened = 0; // nome único do arquivo de fechamento de cada sessão
	// fechamentos de um mux que morreu sem passar pelo finish (janela fechada, processo morto)
	try {
		for (const name of readdirSync(tmpdir())) {
			const pid = Number(/^pink-exit-(\d+)-\d+\.txt$/.exec(name)?.[1]);
			if (!pid) continue;
			try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") try { unlinkSync(path.join(tmpdir(), name)); } catch { /* outro mux limpou */ } }
		}
	} catch { /* sem acesso ao temporário: só sobra lixo */ }
	let frame = 0;
	let confirm; // { text, yes }
	let cache = [];
	let layout = []; // onde cada clique na lateral cai, do último desenho
	const folder = path.basename(process.cwd());
	let picker; // seletor da nova sessão aberto: { folders, saved, input, scroll, error, hits, room }
	// sessão salva que está aberta agora: retomada por aqui (mesmo arquivo), aberta com -c/-r/--session (qualquer uma da pasta)
	// ou gravada por uma sessão aberta desta pasta depois que ela começou. Na dúvida conta como aberta (só impede excluir)
	// shortcut: o /resume feito dentro do Pink não chega até aqui; uma conversa antiga reaberta assim e ainda sem mensagem nova aparece com "excluir"
	const isOpen = (item) => sessions.some((session) => (session.file && samePath(session.file, item.file)) || (samePath(session.cwd, item.cwd) && (session.resumed || item.mtime >= session.started - 2000)));
	let modes = {};
	let pending;
	let spinner;
	let quittingAll = false; // "sair do Pink": as sessões saem, mas a lista de abertas fica para a próxima vez
	const restore = readOpenList(openListFile());
	// "pink" sem sessão nem mensagem reabre e mantém a lista; pink -c / --session / "mensagem" não mexe nela (não apaga as salvas)
	const plainStart = laterArgs(argv).length === argv.length;
	const saveOpen = () => {
		if (quittingAll || restore.busy || !plainStart) return; // outro Pink aberto é o dono da lista
		const list = sessions.filter((session) => session.file).map(({ file, cwd }) => ({ file, cwd }));
		const target = openListFile();
		try {
			writeFileSync(`${target}.tmp`, JSON.stringify({ pid: process.pid, sessions: list }));
			renameSync(`${target}.tmp`, target); // morrer no meio da escrita não deixa a lista cortada
		} catch { /* sem a lista, o próximo Pink abre só uma sessão */ }
	};

	const size = () => {
		const columns = out.columns || 100;
		const rows = out.rows || 30;
		const side = sidebarWidth(columns);
		return { columns, rows, side, inner: Math.max(10, columns - side - 1) };
	};

	const render = () => {
		pending = undefined;
		const { rows, side, inner } = size();
		// lateral estreita: a pergunta vai para a última linha da tela (abaixo), não para a coluna de 5
		const { lines, hits } = sidebar({ sessions, active, width: side, rows, frame, folder, confirm: side < SIDEBAR ? undefined : confirm?.text });
		layout = hits;
		const current = sessions[active];
		const buffer = current?.term.buffer.active;
		const view = picker ? pickerView({ ...picker, saved: picker.saved.map((item) => ({ ...item, open: isOpen(item) })), width: inner, rows, current: process.cwd() }) : undefined;
		if (view) {
			picker.scroll = view.scroll;
			picker.hits = view.hits;
			picker.room = view.room;
		}
		let text = "\x1b[?2026h";
		for (let y = 0; y < rows; y++) {
			const right = view ? view.lines[y] ?? " ".repeat(inner) : buffer ? serializeLine(buffer.getLine(buffer.viewportY + y), inner, current.scratch) : " ".repeat(inner);
			const full = `${lines[y] ?? " ".repeat(side)}\x1b[2;${PINK}m│\x1b[0m${right}`;
			// lateral estreita não cabe a pergunta: ela ocupa a última linha da tela inteira
			const shown = confirm && side < SIDEBAR && y === rows - 1 ? `\x1b[1;${PINK}m${fit(` ${confirm.text}  s = sim · n = não`, side + 1 + inner)}\x1b[0m` : full;
			if (cache[y] !== shown) text += `\x1b[${y + 1};1H${shown}`;
			cache[y] = shown;
		}
		// os modos do teclado seguem a sessão ativa (setas no modo aplicação, texto colado entre marcadores)
		const want = { cursorKeys: Boolean(current?.term.modes.applicationCursorKeysMode), paste: Boolean(current?.term.modes.bracketedPasteMode) };
		if (want.cursorKeys !== modes.cursorKeys) text += want.cursorKeys ? "\x1b[?1h" : "\x1b[?1l";
		if (want.paste !== modes.paste) text += want.paste ? "\x1b[?2004h" : "\x1b[?2004l";
		modes = want;
		const hidden = current?.term._core?.coreService?.isCursorHidden ?? false;
		if (view && !confirm) text += `\x1b[${view.caret.y + 1};${side + 2 + view.caret.x}H\x1b[?25h`;
		else if (current && !view && !hidden && !confirm) text += `\x1b[${buffer.cursorY + 1};${side + 2 + buffer.cursorX}H\x1b[?25h`;
		else text += "\x1b[?25l";
		out.write(`${text}\x1b[?2026l`);
	};
	const schedule = () => {
		pending ??= setTimeout(render, 16);
	};
	const tick = () => {
		const busy = sessions.some(isWorking);
		if (busy && !spinner) spinner = setInterval(() => { frame++; schedule(); }, 150);
		if (!busy && spinner) { clearInterval(spinner); spinner = undefined; }
	};

	const keys = {}; // estado da colagem entre pedaços (parseKeys)
	const select = (index) => {
		if (!sessions.length) return;
		keys.pasting = false; // um fim de colagem perdido não pode desligar os cliques para sempre
		active = (index + sessions.length) % sessions.length;
		sessions[active].attention = false;
		cache = [];
		schedule();
	};

	const open = (args, cwd = process.cwd(), file = undefined) => {
		const { rows, inner } = size();
		const term = new Terminal({ cols: inner, rows, allowProposedApi: true, scrollback: 0 });
		const banner = path.join(tmpdir(), `pink-exit-${process.pid}-${++opened}.txt`); // o fechamento (logo e resumo) que a sessão escreve ao sair
		const child = pty.spawn(process.execPath, [CLI, ...args], { name: "xterm-256color", cols: inner, rows, cwd, env: { ...process.env, PINK_MUX_CHILD: "1", PINK_MUX_BANNER: banner, PINK_PROGRAM_STATUS: "1", PI_PROGRAM_STATUS: "1" } }); // PINK_ no pacote do Pink (rebrand), PI_ no pi-tui original: o filho informa o estado sem perguntar se o terminal suporta
		// com o arquivo conhecido, a identidade é o arquivo, não a pasta inteira
		const resumed = !file && args.some((arg) => FIRST_ONLY.has(arg) || FIRST_ONLY_VALUE.has(arg.split("=")[0]));
		const session = { term, child, cwd, file, resumed, banner, started: Date.now(), title: "", working: false, attention: false, exited: false, scratch: undefined };
		session.scratch = term.buffer.active.getNullCell?.();
		const isActive = () => sessions[active] === session;
		term.onTitleChange((title) => { session.title = title; schedule(); });
		term.onBell(() => { onSignal(session, "bell", isActive()); schedule(); });
		term.parser.registerOscHandler(7501, (data) => {
			const program = parseProgramStatus(data);
			if (program) {
				session.program = program.state === "clear" ? undefined : program;
				tick(); // liga ou desliga o giro
				schedule();
			}
			return true;
		});
		term.parser.registerOscHandler(9, (data) => {
			const file = sessionFileSignal(data);
			if (file) {
				session.file = file;
				saveOpen();
				return true;
			}
			const signal = progressSignal(data);
			if (signal) onSignal(session, signal, isActive());
			tick();
			schedule();
			return true;
		});
		term.onData((data) => child.write(data)); // respostas às perguntas do Pink ao terminal (posição do cursor, cores)
		child.onData((data) => term.write(data, () => { if (isActive()) schedule(); }));
		child.onExit(({ exitCode }) => {
			session.exited = true;
			const index = sessions.indexOf(session);
			if (index < 0) return;
			sessions.splice(index, 1);
			// só fechar de propósito (×, /quit: código 0) tira da lista; erro ou morte (rede, janela fechada) mantém
			if (session.closing || exitCode === 0) saveOpen();
			// fechada no × ou em "sair do Pink": sai sem erro; saiu sozinha: espera o terminal virtual ler o resto da saída (a mensagem de erro)
			if (!sessions.length) return session.closing ? finish(0) : term.write("", () => finish(exitCode ?? 0, session));
			try { unlinkSync(session.banner); } catch { /* não saiu pelo /quit */ }
			term.dispose();
			if (active >= index && active > 0) active--;
			select(active);
			tick();
		});
		sessions.push(session);
		select(sessions.length - 1);
		if (file) saveOpen();
	};

	let finished = false;
	const finish = (code, last) => {
		if (finished) return;
		finished = true;
		for (const session of sessions) {
			try { session.child.kill(); } catch { /* já saiu */ }
		}
		out.write(`${MOUSE_OFF}\x1b[?2004l\x1b[?1l\x1b[0m\x1b[?25h\x1b[?1049l`);
		// a última sessão saiu com erro (provedor errado, configuração): a mensagem dela fica no terminal, como no Pink sem lateral
		// shortcut: só a tela visível (scrollback 0); erro maior que a tela perde o começo
		if (code && last) {
			const buffer = last.term.buffer.active;
			const lines = [];
			for (let y = 0; y < last.term.rows; y++) lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
			out.write(`${lines.join("\n").trim()}\n`);
		}
		// saiu sem erro: o logo do Pink e o resumo da sessão ficam no terminal, como no Pink sem lateral
		if (!code && last) try { out.write(readFileSync(last.banner, "utf8")); } catch { /* fechou sem passar pelo /quit */ }
		for (const session of [...sessions, last]) try { if (session) unlinkSync(session.banner); } catch { /* não existe */ }
		process.exit(code);
	};

	const ask = (text, yes) => {
		confirm = { text, yes };
		cache = [];
		schedule();
	};
	// sair pela lateral pede /quit à sessão (o Pink grava o fechamento e a última sessão o mostra ao sair); se ela não sair
	// em 4 s, encerra à força como antes, sem o fechamento
	const quitGently = (target) => {
		try {
			target.child.write("\x03"); // limpa o que estiver digitado (e interrompe se estiver trabalhando)
			setTimeout(() => { try { target.child.write("/quit\r"); } catch { /* já saiu */ } }, 150);
		} catch { /* já saiu */ }
		setTimeout(() => {
			if (target.exited) return;
			target.closing = true;
			try { target.child.kill(); } catch { /* já saiu */ }
		}, 4000);
	};
	const act = (action) => {
		const current = sessions[active];
		const index = Number(action.split(":")[1]);
		if (action === "new") return openPicker();
		if (action.startsWith("select:")) {
			picker = undefined;
			return select(index);
		}
		if (action.startsWith("close:") && sessions[index]) {
			const target = sessions[index];
			const close = () => quitGently(target);
			return target.working ? ask(`Encerrar "${sessionLabel(target.title, index, folder).name}"? Ela está trabalhando.`, close) : close();
		}
		if (action === "quit") {
			const all = () => {
				quittingAll = true;
				[...sessions].forEach(quitGently);
			};
			if (sessions.length > 1) return ask(`Sair do Pink com ${sessions.length} sessões abertas?`, all);
			return current?.working ? ask("Sair do Pink? A sessão está trabalhando.", all) : all();
		}
	};

	const openPicker = () => {
		const saved = listSessions(sessionsDir());
		picker = { folders: recentFolders(saved, process.cwd()), saved, input: "", scroll: 0, error: "" };
		cache = [];
		schedule();
	};
	const closePicker = () => {
		picker = undefined;
		cache = [];
		schedule();
	};
	const startIn = (cwd, extra = [], file = undefined) => {
		const back = picker;
		picker = undefined;
		cache = [];
		try {
			open([...laterArgs(argv), ...extra], cwd, file);
		} catch {
			picker = { ...back, error: "A sessão não abriu nesta pasta." }; // as abertas seguem
		}
		schedule();
	};
	const pickerAct = (action) => {
		const index = Number(action.split(":")[1]);
		const item = picker.saved[index];
		if (action === "cancel") return closePicker();
		if (action.startsWith("folder:")) return startIn(picker.folders[index]);
		if (action.startsWith("resume:") && item) {
			if (isOpen(item)) {
				// shortcut: com duas sessões abertas na mesma pasta, mostra a primeira delas
				const shown = sessions.findIndex((session) => (session.file && samePath(session.file, item.file)) || samePath(session.cwd, item.cwd));
				picker = undefined;
				return select(shown);
			}
			if (!existsSync(item.cwd)) {
				picker.error = `A pasta desta sessão não existe mais: ${oneLine(item.cwd)}`;
				return schedule();
			}
			return startIn(item.cwd, ["--session", item.file], item.file);
		}
		if (action.startsWith("delete:") && item && !isOpen(item)) {
			const name = item.name.length > 40 ? `${item.name.slice(0, 39)}…` : item.name || "sem mensagens";
			return ask(`Excluir a sessão "${name}"? Ela vai para a lixeira.`, () => {
				if (!picker) return;
				const shown = picker;
				shown.saved = shown.saved.filter((other) => other !== item); // some da lista já; volta se a lixeira falhar
				shown.hits = []; // os cliques antigos apontariam para o item seguinte até o próximo desenho
				trashFile(item.file, sessionsDir()).then((ok) => {
					if (ok) return;
					shown.saved = [item, ...shown.saved].sort((a, b) => b.mtime - a.mtime);
					shown.error = "Não deu para mandar a sessão para a lixeira.";
					cache = [];
					schedule();
				});
			});
		}
	};
	const submitPicker = () => {
		// pasta arrastada para o terminal: aspas duplas (Windows), simples (Linux) ou espaços com \ (Mac)
		let raw = picker.input.trim().replace(/^(["'])(.*)\1$/, "$2");
		if (process.platform !== "win32") raw = raw.replace(/\\ /g, " ");
		if (!raw) return schedule();
		const target = path.resolve(process.cwd(), raw.replace(/^~(?=$|[\\/])/, homedir()));
		let folderOk = false;
		try {
			folderOk = statSync(target).isDirectory();
		} catch { /* não existe */ }
		if (!folderOk) {
			picker.error = `Pasta não encontrada: ${oneLine(target)}`;
			return schedule();
		}
		return startIn(target);
	};
	const typeIntoPicker = (text) => {
		if (text === "\x1b") return closePicker();
		const clean = text.replace(/\x1b\[20[01]~/g, "").replace(/\x1b(?:\[[0-9;?]*[A-Za-z~]|O.)/g, "");
		picker.error = "";
		for (const ch of clean) {
			if (ch === "\r" || ch === "\n") return submitPicker();
			if (ch === "\x7f" || ch === "\b") picker.input = [...picker.input].slice(0, -1).join("");
			else if (!/[\u0000-\u001f\u007f-\u009f]|\p{Cf}/u.test(ch)) picker.input += ch; // sem códigos de controle (C1 incluso) no campo
		}
		schedule();
	};

	// a primeira sessão abre antes da tela alternativa: se o terminal virtual falhar aqui (binário sem permissão, sistema sem
	// suporte), a pessoa recebe o Pink de sempre em vez de uma tela que fecha muda
	// "pink" sem sessão nem mensagem: reabre as sessões que ficaram abertas da última vez, cada uma na pasta dela
	for (const item of plainStart ? restore.sessions : []) {
		try { open([...argv, "--session", item.file], item.cwd, item.file); } catch { /* esta não abriu: segue com as outras */ }
	}
	// a pasta atual sempre tem uma sessão (pink numa pasta nova começa ali); se uma reaberta já é dela, fica nessa
	const here = sessions.findIndex((session) => samePath(session.cwd, process.cwd()));
	if (here >= 0) select(here);
	else {
		try {
			open(argv);
		} catch {
			if (!sessions.length) return runPlain();
		}
	}
	out.write(`\x1b[?1049h\x1b[2J\x1b[?25l${MOUSE_ON}`);
	process.on("exit", () => finished || out.write(`${MOUSE_OFF}\x1b[?2004l\x1b[?1l\x1b[?25h\x1b[?1049l`)); // finish já restaurou e pode ter escrito o erro
	process.on("SIGTERM", () => { quittingAll = true; finish(143); });
	process.on("SIGHUP", () => { quittingAll = true; finish(129); }); // janela do terminal fechada: guarda as abertas como "sair do Pink"
	process.stdin.setRawMode(true);
	process.stdin.setEncoding("utf8");
	const leftPress = (mouse) => mouse.press && mouse.button === 0;
	// um clique ou um marcador de colagem partido entre duas leituras espera o resto (até 30 ms) em vez de virar texto
	let carry = "";
	let carryTimer;
	const onInput = (chunk) => {
		clearTimeout(carryTimer);
		let data = carry + chunk;
		carry = "";
		const partial = /\x1b\[[<0-9;]*$/.exec(data);
		if (partial) {
			carry = partial[0];
			data = data.slice(0, partial.index);
			carryTimer = setTimeout(() => { const rest = carry; carry = ""; if (!picker) sessions[active]?.child.write(rest); }, 30);
			if (!data) return;
		}
		handle(data);
	};
	const handle = (data) => {
		const parts = parseKeys(data, keys);
		if (confirm) {
			const mice = parts.filter((part) => part.mouse);
			const mouse = mice.find((part) => leftPress(part.mouse))?.mouse;
			if (mice.length && !mouse && mice.length === parts.length) return; // só soltar o botão, roda ou movimento
			// clique: sim/não da lateral (fora da lateral desiste); tecla: só s/y isolado confirma (Enter por hábito não fecha tudo)
			const choice = mouse ? (mouse.x <= size().side ? hitAt(layout, mouse.x - 1, mouse.y - 1) : "no") : /^[sSyY]$/.test(data) ? "yes" : "no";
			if (choice !== "yes" && choice !== "no") return; // clique na lateral fora dos botões
			const { yes } = confirm;
			confirm = undefined;
			cache = [];
			if (choice === "yes") yes();
			return schedule();
		}
		const { side } = size();
		for (const part of parts) {
			const current = sessions[active];
			if (picker && part.forward) typeIntoPicker(part.forward);
			else if (part.forward) current?.child.write(part.forward);
			else if (picker && part.mouse.x > side + 1) {
				// seletor aberto: clique escolhe, roda rola a lista; nada vai para a sessão
				if (part.mouse.button === 64 || part.mouse.button === 65) {
					picker.scroll += part.mouse.button === 64 ? -3 : 3;
					schedule();
				} else if (leftPress(part.mouse)) {
					const action = hitAt(picker.hits ?? [], part.mouse.x - side - 2, part.mouse.y - 1);
					if (action) pickerAct(action);
				}
			} else if (part.mouse.x <= side) {
				const action = leftPress(part.mouse) && hitAt(layout, part.mouse.x - 1, part.mouse.y - 1);
				if (action) act(action);
			} else if (part.mouse.x > side + 1 && current && (ALWAYS_FORWARD_MOUSE || current.term.modes.mouseTrackingMode !== "none")) {
				// shortcut: repassa sempre em SGR; um filho que pedir outro formato de mouse não entende (o Pink não usa mouse)
				current.child.write(`\x1b[<${part.mouse.button};${part.mouse.x - side - 1};${part.mouse.y}${part.mouse.press ? "M" : "m"}`);
			}
		}
	};
	process.stdin.on("data", onInput);
	out.on("resize", () => {
		const { rows, inner } = size();
		for (const session of sessions) {
			session.term.resize(inner, rows);
			try { session.child.resize(inner, rows); } catch { /* o processo saiu e o aviso de saída ainda não chegou */ }
		}
		cache = [];
		out.write("\x1b[2J");
		schedule();
	});
}

// só roda quando é o programa chamado (o teste importa as funções sem abrir nada)
const invoked = (() => {
	try {
		return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); // no Linux/Mac o bin do npm é um link
	} catch {
		return false;
	}
})();
if (invoked) await main();
