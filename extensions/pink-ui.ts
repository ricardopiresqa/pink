// Pink UI (F50b): the OpenCode look on top of the Pi engine.
//
//   home (empty session)   a big PINK in the middle, the input box right under it, a line of hints
//   session                the logo goes away; the input box stays at the bottom with a pink bar and the model label; one-line footer
//
// Loaded by default by the Pink build (pink/rebrand.json patches the extension list). It only uses the public extension API
// (setHeader, setEditorComponent, setFooter), so it survives Pi upgrades. The layout functions are pure and exported for tests.

export const LOGO = [
	"██████╗ ██╗███╗   ██╗██╗  ██╗",
	"██╔══██╗██║████╗  ██║██║ ██╔╝",
	"██████╔╝██║██╔██╗ ██║█████╔╝ ",
	"██╔═══╝ ██║██║╚██╗██║██╔═██╗ ",
	"██║     ██║██║ ╚████║██║  ██╗",
	"╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝",
];
export const HOME_WIDTH = 78; // the input box on the home screen, like OpenCode's centered prompt
export const BAR = "┃";
// códigos que não ocupam coluna: CSI (cor, cursor), OSC (links) e APC/DCS/PM/SOS (o Pi marca o cursor com
// \x1b_pi:c\x07). Contar o marcador como texto deixava a faixa da caixa de digitar 7 colunas mais curta.
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b[\]_P^X][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const ANSI_SPLIT = /(\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b[\]_P^X][^\u0007\u001b]*(?:\u0007|\u001b\\))/;

export function visible(text) {
	return [...String(text).replace(ANSI, "")].length;
}

export function fit(text, width) {
	// keep the styled text, cut by visible width (the input box and the footer never exceed their width)
	if (visible(text) <= width) return text;
	let out = "";
	let seen = 0;
	for (const part of String(text).split(ANSI_SPLIT)) {
		if (/^\u001b/.test(part)) {
			out += part;
			continue;
		}
		for (const ch of part) {
			if (seen >= width) return out;
			out += ch;
			seen += 1;
		}
	}
	return out;
}

export function pad(text, width) {
	return text + " ".repeat(Math.max(0, width - visible(text)));
}

export function center(text, width) {
	return " ".repeat(Math.max(0, Math.floor((width - visible(text)) / 2))) + text;
}

export function logoLines(theme, width) {
	if (width < LOGO[0].length + 2) return [theme.fg("accent", "PINK")].map((line) => center(line, width));
	return LOGO.map((row) => {
		let out = "";
		for (const ch of row) out += ch === "█" ? theme.fg("accent", ch) : ch === " " ? ch : theme.fg("dim", ch);
		return center(out, width);
	});
}

export const HEADER_BODY = LOGO.length + 3; // logo, blank, subtitle, trailing blank
export const EDITOR_BODY = 7; // the box (5 rows) + a blank row + the hints

export function homeTop(rows, bodyHeight = HEADER_BODY, editorHeight = EDITOR_BODY) {
	// the logo and the input are one group: centered together, with the footer's row left out
	return Math.max(1, Math.floor((rows - 1 - bodyHeight - editorHeight) / 2));
}

export function homeHeader({ theme, width, rows, subtitle }) {
	const body = [...logoLines(theme, width), "", center(theme.fg("muted", subtitle), width), ""];
	return [...Array(homeTop(rows, body.length)).fill(""), ...body];
}

export function homeBottomPad(rows, headerHeight, editorHeight) {
	// blank rows under the hints so that, with the editor fixed at the bottom (fullscreen), the box sits right under the logo
	return Math.max(0, rows - 1 - headerHeight - editorHeight);
}

export function inputBox({ theme, content, width, label }) {
	// `content` are the lines of the built-in editor without its top and bottom borders; the box is exactly `width` wide
	const text = Math.max(1, width - 2); // the bar and one space take two columns
	const bar = theme.fg("accent", BAR);
	const panel = (value) => (theme.bg ? theme.bg("userMessageBg", value) : value);
	// o editor do Pi devolve a linha com "resetar cor" no meio (cursor, texto): sem reaplicar o fundo depois de cada reset,
	// a faixa do texto ficava preta e só o rodapé da caixa ficava rosado
	const open = theme.bg ? theme.bg("userMessageBg", "\u0000").split("\u0000")[0] : "";
	const keep = (value) => (open ? value.replace(/\x1b\[(?:0|49)?m/g, (reset) => reset + open) : value);
	const row = (value) => `${bar}${panel(keep(` ${pad(fit(value, text), text)}`))}`;
	return [row(""), ...content.map(row), row(""), row(theme.fg("muted", label))];
}

export function thinkingLink(text) {
	return `\x1b]8;;pink:thinking\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function footerLine({ theme, width, left, right }) {
	const gap = Math.max(1, width - visible(left) - visible(right));
	return fit(`${left}${" ".repeat(gap)}${right}`, width);
}

const THINKING_PT = { minimal: "mínimo", low: "baixo", medium: "médio", high: "alto", xhigh: "muito alto", max: "máximo" };

// "thoth  thoth  off" dizia modelo, provedor e nível sem explicar nada: agora o nome do modelo, o provedor só quando é
// outro, e o pensamento só quando está ligado ("pensamento alto")
export function modelLabel({ theme, model, thinking }) {
	if (!model) return theme.fg("muted", "sem modelo");
	const name = model.name || model.id;
	const provider = model.provider && model.provider !== model.id && model.provider !== name ? theme.fg("muted", ` · ${model.provider}`) : "";
	const level = THINKING_PT[thinking] ? theme.fg("muted", ` · pensamento ${THINKING_PT[thinking]}`) : "";
	return `${name}${provider}${level}`;
}

export function hintsLine({ theme, width }) {
	return center(theme.fg("dim", "/ comandos   ! bash   ctrl+t pensamento   ctrl+o ajuda   ctrl+c limpar/sair"), width);
}

function tilde(cwd) {
	const home = process.env.USERPROFILE || process.env.HOME || "";
	return home && cwd.toLowerCase().startsWith(home.toLowerCase()) ? `~${cwd.slice(home.length)}` : cwd;
}

export function hasMessages(ctx) {
	try {
		return ctx.sessionManager.getEntries().some((entry) => entry.type === "message");
	} catch {
		return false;
	}
}

export function install(pi, ctx, { CustomEditor, version = "" }) {
	const state = { home: !hasMessages(ctx), tui: undefined, branch: "" };
	const redraw = () => state.tui?.requestRender();
	const leaveHome = () => {
		if (state.home) {
			state.home = false;
			redraw();
		}
	};
	pi.on("agent_start", leaveHome);
	pi.on("input", leaveHome);
	void pi.exec?.("git", ["branch", "--show-current"], { cwd: ctx.cwd }).then((result) => {
		state.branch = (result?.stdout ?? "").trim();
		redraw();
	}).catch(() => undefined);

	ctx.ui.setHeader((tui, theme) => {
		state.tui = tui;
		return {
			render: (width) => (state.home ? homeHeader({ theme, width, rows: tui.terminal.rows, subtitle: `coding agent · modelo ${ctx.model?.id ?? "thoth"}` }) : []),
			invalidate() {},
		};
	});

	class PinkEditor extends CustomEditor {
		constructor(tui, theme, keybindings) {
			super(tui, theme, keybindings, { paddingX: 0 });
			state.tui = tui;
		}

		render(width) {
			const outer = state.home ? Math.min(width, HOME_WIDTH) : width;
			const margin = state.home ? Math.floor((width - outer) / 2) : 0;
			const raw = super.render(Math.max(1, outer - 2));
			const content = raw.length >= 3 ? raw.slice(1, -1) : raw; // the built-in editor draws its own top and bottom borders
			const theme = ctx.ui.theme;
			const label = modelLabel({ theme, model: ctx.model, thinking: pi.getThinkingLevel?.() });
			const lines = inputBox({ theme, content, width: outer, label }).map((line) => " ".repeat(margin) + line);
			if (!state.home) return lines;
			const rows = state.tui?.terminal?.rows ?? 24;
			const body = [...lines, "", hintsLine({ theme, width })];
			return [...body, ...Array(homeBottomPad(rows, homeTop(rows) + HEADER_BODY, body.length)).fill("")];
		}
	}

	// pensamento recolhível como no OpenCode: o atalho do Pi (ctrl+t) aparece no rodapé e o bloco recolhido diz como abrir
	// pensamento atrás de um título, como no OpenCode: recolhido por padrão; clique no título (link interno pink:thinking,
	// tratado pelo Pink no lugar do navegador) ou ctrl+t abre e recolhe
	ctx.ui.setHiddenThinkingLabel?.(thinkingLink("▸ Pensamento · clique ou ctrl+t para ver"));
	globalThis.__pinkThinkingHeader = thinkingLink("▾ Pensamento · clique ou ctrl+t para recolher");
	ctx.ui.setEditorComponent((tui, theme, keybindings) => new PinkEditor(tui, theme, keybindings));
	ctx.ui.setFooter((tui, theme) => {
		state.tui = tui;
		return {
			render(width) {
				const usage = ctx.getContextUsage?.();
				const window = usage?.contextWindow ?? ctx.model?.contextWindow;
				const used = usage && usage.percent !== null && window ? `${Math.round(usage.percent)}%/${Math.round(window / 1000)}k` : "";
				const left = theme.fg("muted", ` ${tilde(ctx.cwd)}${state.branch ? ` (${state.branch})` : ""}`);
				const right = `${theme.fg("muted", "ctrl+t pensamento")}${theme.fg("dim", `   ${used ? `ctx ${used}   ` : ""}pink ${version} `)}`;
				return [footerLine({ theme, width, left, right })];
			},
			invalidate() {},
		};
	});
	return state;
}

export default function (pi) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const { CustomEditor, VERSION } = await import("@earendil-works/pi-coding-agent");
		install(pi, ctx, { CustomEditor, version: VERSION ?? "" });
	});
}
