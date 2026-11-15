#!/usr/bin/env node
// Pink com várias sessões ao mesmo tempo (owner 2026-11-15, card 1dfwh7kffcu): uma lateral à esquerda lista as sessões e o
// resto da tela é a sessão ativa. O modo interativo do Pi segura uma sessão por vez, então cada sessão é um Pink filho num
// terminal virtual (node-pty + @xterm/headless) e este processo só desenha a lateral, a tela do filho ativo e repassa o teclado.
// Sem terminal interativo, com comando de uma vez (-p, --help, install...) ou sem node-pty, roda o Pink normal, sem lateral.
import { realpathSync } from "node:fs";
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
// no Windows o ConPTY consome o pedido de mouse do Pi e o terminal virtual nunca o vê: repassa sempre
const ALWAYS_FORWARD_MOUSE = process.platform === "win32";
const SUBCOMMANDS = new Set(["install", "uninstall", "remove", "update", "list", "auth", "mcp", "config"]);
const ONE_SHOT = new Set(["-p", "--print", "--mode", "-h", "--help", "-v", "--version", "--export", "--list-models"]);
const FIRST_ONLY = new Set(["-c", "--continue", "-r", "--resume"]); // continuar a mesma sessão em dois processos estragaria o arquivo
const FIRST_ONLY_VALUE = new Set(["--session", "--session-id", "--fork"]);
// opções do Pi que recebem valor (pink --help); qualquer outro texto solto é a mensagem inicial, que fica só na primeira sessão
const TAKES_VALUE = new Set(["--provider", "--model", "--api-key", "--system-prompt", "--append-system-prompt", "--mode", "--session-dir", "--models", "--thinking", "--skill", "--prompt-template", "--theme", "--use-theme", "--export", "--tui-mode", "--extension", "-e", "--tools"]);
const SPIN = ["◐", "◓", "◑", "◒"];
const PINK = "38;2;255;110;180";

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
	return clean || `Sessão ${index + 1}`;
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

export function progressSignal(data) {
	const [kind, state] = String(data).split(";");
	if (kind !== "4") return undefined;
	return state === "0" || state === undefined ? "idle" : "work";
}

export function icon(session, frame) {
	if (session.exited) return "×";
	if (session.attention) return "!";
	if (session.working) return SPIN[frame % SPIN.length];
	return "·";
}

// cerca de 20% da tela, como no print do owner
export function sidebarWidth(columns) {
	return columns < NARROW ? 5 : Math.min(MAX_SIDEBAR, Math.max(SIDEBAR, Math.round(columns * 0.2)));
}

// o Pi põe no título "pink - nome - pasta" ou "pink - pasta"; a pasta conhecida vem antes, porque pode ter " - " no nome
export function sessionLabel(title, index, folder = "") {
	const text = shortTitle(title, index);
	if (folder && text === folder) return { name: `Sessão ${index + 1}`, folder };
	if (folder && text.endsWith(` - ${folder}`)) return { name: text.slice(0, -folder.length - 3), folder };
	const parts = text.split(" - ");
	if (parts.length > 1) return { name: parts.slice(0, -1).join(" - "), folder: parts.at(-1) };
	return { name: `Sessão ${index + 1}`, folder: text === `Sessão ${index + 1}` ? "" : text };
}

function status(session, folder) {
	if (session.exited) return "encerrada";
	if (session.attention) return "terminou · espera você";
	if (session.working) return "trabalhando…";
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
		const { name, folder: where } = sessionLabel(session.title, index, folder);
		const tone = session.attention && !on ? "38;2;240;196;135;" : "";
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
	process.argv = process.argv.filter((arg) => arg !== "--sem-sessoes"); // o cli.js do Pi relê process.argv e recusa a opção
	await import(pathToFileURL(CLI).href);
}

async function main() {
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
	let frame = 0;
	let confirm; // { text, yes }
	let cache = [];
	let layout = []; // onde cada clique na lateral cai, do último desenho
	const folder = path.basename(process.cwd());
	let modes = {};
	let pending;
	let spinner;

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
		let text = "\x1b[?2026h";
		for (let y = 0; y < rows; y++) {
			const right = buffer ? serializeLine(buffer.getLine(buffer.viewportY + y), inner, current.scratch) : " ".repeat(inner);
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
		if (current && !hidden && !confirm) text += `\x1b[${buffer.cursorY + 1};${side + 2 + buffer.cursorX}H\x1b[?25h`;
		else text += "\x1b[?25l";
		out.write(`${text}\x1b[?2026l`);
	};
	const schedule = () => {
		pending ??= setTimeout(render, 16);
	};
	const tick = () => {
		const busy = sessions.some((session) => session.working);
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

	const open = (args) => {
		const { rows, inner } = size();
		const term = new Terminal({ cols: inner, rows, allowProposedApi: true, scrollback: 0 });
		const child = pty.spawn(process.execPath, [CLI, ...args], { name: "xterm-256color", cols: inner, rows, cwd: process.cwd(), env: { ...process.env, PINK_MUX_CHILD: "1" } });
		const session = { term, child, title: "", working: false, attention: false, exited: false, scratch: undefined };
		session.scratch = term.buffer.active.getNullCell?.();
		const isActive = () => sessions[active] === session;
		term.onTitleChange((title) => { session.title = title; schedule(); });
		term.onBell(() => { onSignal(session, "bell", isActive()); schedule(); });
		term.parser.registerOscHandler(9, (data) => {
			const signal = progressSignal(data);
			if (signal) onSignal(session, signal, isActive());
			tick();
			schedule();
			return true;
		});
		term.onData((data) => child.write(data)); // respostas às perguntas do Pi ao terminal (posição do cursor, cores)
		child.onData((data) => term.write(data, () => { if (isActive()) schedule(); }));
		child.onExit(({ exitCode }) => {
			session.exited = true;
			const index = sessions.indexOf(session);
			if (index < 0) return;
			sessions.splice(index, 1);
			// fechada no × ou em "sair do Pink": sai sem erro; saiu sozinha: espera o terminal virtual ler o resto da saída (a mensagem de erro)
			if (!sessions.length) return session.closing ? finish(0) : term.write("", () => finish(exitCode ?? 0, session));
			term.dispose();
			if (active >= index && active > 0) active--;
			select(active);
			tick();
		});
		sessions.push(session);
		select(sessions.length - 1);
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
		process.exit(code);
	};

	const ask = (text, yes) => {
		confirm = { text, yes };
		cache = [];
		schedule();
	};
	const act = (action) => {
		const current = sessions[active];
		const index = Number(action.split(":")[1]);
		if (action === "new") {
			try {
				return open(laterArgs(argv));
			} catch {
				return undefined; // a sessão nova não abriu: as abertas seguem
			}
		}
		if (action.startsWith("select:")) return select(index);
		if (action.startsWith("close:") && sessions[index]) {
			const target = sessions[index];
			const close = () => {
				target.closing = true;
				try { target.child.kill(); } catch { /* já saiu */ }
			};
			return target.working ? ask(`Encerrar "${sessionLabel(target.title, index, folder).name}"? Ela está trabalhando.`, close) : close();
		}
		if (action === "quit") {
			if (sessions.length > 1) return ask(`Sair do Pink com ${sessions.length} sessões abertas?`, () => finish(0));
			return current?.working ? ask("Sair do Pink? A sessão está trabalhando.", () => finish(0)) : finish(0);
		}
	};

	// a primeira sessão abre antes da tela alternativa: se o terminal virtual falhar aqui (binário sem permissão, sistema sem
	// suporte), a pessoa recebe o Pink de sempre em vez de uma tela que fecha muda
	try {
		open(argv);
	} catch {
		return runPlain();
	}
	out.write(`\x1b[?1049h\x1b[2J\x1b[?25l${MOUSE_ON}`);
	process.on("exit", () => finished || out.write(`${MOUSE_OFF}\x1b[?2004l\x1b[?1l\x1b[?25h\x1b[?1049l`)); // finish já restaurou e pode ter escrito o erro
	process.on("SIGTERM", () => finish(143));
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
			carryTimer = setTimeout(() => { const rest = carry; carry = ""; sessions[active]?.child.write(rest); }, 30);
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
			if (part.forward) current?.child.write(part.forward);
			else if (part.mouse.x <= side) {
				const action = leftPress(part.mouse) && hitAt(layout, part.mouse.x - 1, part.mouse.y - 1);
				if (action) act(action);
			} else if (part.mouse.x > side + 1 && current && (ALWAYS_FORWARD_MOUSE || current.term.modes.mouseTrackingMode !== "none")) {
				// shortcut: repassa sempre em SGR; um filho que pedir outro formato de mouse não entende (o Pi não usa mouse)
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
