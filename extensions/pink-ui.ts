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

// -- lateral no estilo do OpenCode (owner 2026-10-13): sessão, contexto, tokens por modelo, modelo, Thoth, pasta e versão.
// O Pink não tem MCP nem LSP próprios: a lateral mostra o que ele de fato sabe. Só aparece na sessão (não na tela inicial),
// com a janela larga (>= 120 colunas); /lateral esconde e mostra.
export const SIDEBAR_WIDTH = 36;
export const SIDEBAR_MIN_COLUMNS = 120;

export function formatTokens(value) {
	const n = Number(value) || 0;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
	return String(n);
}

export function sessionStats(entries) {
	const models = new Map();
	let cost = 0;
	let title = "";
	for (const entry of entries ?? []) {
		const message = entry?.type === "message" ? entry.message : undefined;
		if (!message) continue;
		if (!title && message.role === "user") {
			const content = Array.isArray(message.content) ? message.content.find((part) => part?.type === "text")?.text : message.content;
			title = String(content ?? "").replace(/\s+/g, " ").trim();
		}
		if (message.role !== "assistant" || !message.usage) continue;
		const key = message.model || "?";
		const item = models.get(key) ?? { input: 0, output: 0, cache: 0 };
		item.input += message.usage.input || 0;
		item.output += message.usage.output || 0;
		item.cache += (message.usage.cacheRead || 0) + (message.usage.cacheWrite || 0);
		models.set(key, item);
		cost += Number(message.usage.cost?.total) || 0;
	}
	return { title, cost, models: [...models.entries()].map(([model, usage]) => ({ model, ...usage })) };
}

export function thothProject(cwd, vault, readFile) {
	if (!vault || !cwd) return "";
	try {
		const mapping = JSON.parse(readFile(`${vault}/1_projetos/_project-mapping.json`));
		const here = String(cwd).replace(/\\/g, "/").toLowerCase();
		let best = "";
		let bestLength = 0;
		for (const project of mapping.projects ?? []) {
			for (const root of project.repository_roots ?? []) {
				const base = String(root).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
				if (base && (here === base || here.startsWith(`${base}/`)) && base.length > bestLength) {
					best = project.canonical_name || project.project_id || "";
					bestLength = base.length;
				}
			}
		}
		return best;
	} catch {
		return "";
	}
}

export function sidebarLines({ theme, width, data }) {
	const w = Math.max(10, width);
	const line = (text = "") => fit(text, w);
	const title = (text) => line(theme.bold ? theme.bold(theme.fg("text", text)) : theme.fg("text", text));
	const dim = (text) => line(theme.fg("muted", text));
	const out = [];
	if (data.title) {
		const words = data.title.length > w * 2 ? `${data.title.slice(0, w * 2 - 1)}…` : data.title;
		out.push(title(words.slice(0, w)), ...(words.length > w ? [title(words.slice(w, w * 2))] : []), "");
	}
	out.push(title("Contexto"));
	if (data.context?.tokens != null) {
		out.push(dim(`${formatTokens(data.context.tokens)} tokens`), dim(`${Math.round(data.context.percent ?? 0)}% usado de ${formatTokens(data.context.window)}`));
	} else {
		out.push(dim("ainda sem medida"));
	}
	out.push(dim(`$${(data.cost ?? 0).toFixed(2)} gasto`), "");
	if (data.models?.length) {
		out.push(title("Tokens da sessão"));
		for (const item of data.models) {
			out.push(line(`  ${theme.fg("text", item.model)}`), dim(`    ${formatTokens(item.input)} entrada  ${formatTokens(item.output)} saída`));
		}
		out.push("");
	}
	out.push(title("Modelo"), line(`  ${data.model || theme.fg("muted", "sem modelo")}`), "");
	if (data.project) out.push(title("Thoth"), dim(`  projeto ${data.project}`), "");
	if (data.tools?.length) out.push(title("Ferramentas"), dim(`  ${data.tools.length} ativas`), "");
	out.push(dim(data.folder || ""), ...(data.branch ? [line(theme.fg("text", data.branch))] : []), "", line(`${theme.fg("accent", "•")} ${theme.fg("text", "Pink")} ${theme.fg("muted", data.version || "")}`));
	return out;
}

// -- ao sair (owner 2026-10-13: "quando eu saio do pink tem que aparecer a logo do pink, assim como funciona o opencode"):
// o terminal volta limpo e fica o logo, o título da sessão, tokens e custo, e o comando para continuar
export function exitBanner({ theme, title, stats, resume }) {
	const lines = ["", ...LOGO.map((row) => {
		let out = "  ";
		for (const ch of row) out += ch === "█" ? theme.fg("accent", ch) : ch === " " ? ch : theme.fg("dim", ch);
		return out;
	}), ""];
	const field = (label, value) => `  ${theme.fg("muted", label.padEnd(10))}${value}`;
	if (title) lines.push(field("Sessão", title.length > 70 ? `${title.slice(0, 69)}…` : title));
	const totals = (stats?.models ?? []).reduce((sum, item) => ({ input: sum.input + item.input, output: sum.output + item.output }), { input: 0, output: 0 });
	if (totals.input || totals.output) lines.push(field("Tokens", `${formatTokens(totals.input)} entrada  ${formatTokens(totals.output)} saída  $${(stats.cost ?? 0).toFixed(2)}`));
	if (resume) lines.push(field("Continuar", theme.fg("accent", resume)));
	return `${lines.join("\n")}\n\n`;
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
	const project = (() => {
		try {
			const fs = process.getBuiltinModule?.("node:fs");
			return fs ? thothProject(ctx.cwd, process.env.THOTH_VAULT_PATH || "", (path) => fs.readFileSync(path, "utf8")) : "";
		} catch {
			return "";
		}
	})();
	Object.defineProperty(globalThis, "__pinkHome", { get: () => state.home, configurable: true });
	globalThis.__pinkSidebar = {
		visible: (viewport) => (globalThis.__pinkSidebarOn ?? true) && !state.home && viewport.width >= SIDEBAR_MIN_COLUMNS,
		render(width) {
			const stats = sessionStats(ctx.sessionManager?.getEntries?.());
			const usage = ctx.getContextUsage?.();
			const theme = ctx.ui.theme;
			return sidebarLines({ theme, width, data: {
				...stats,
				context: usage ? { tokens: usage.tokens, percent: usage.percent, window: usage.contextWindow } : undefined,
				model: modelLabel({ theme, model: ctx.model, thinking: pi.getThinkingLevel?.() }),
				project,
				tools: pi.getActiveTools?.() ?? [],
				folder: tilde(ctx.cwd),
				branch: state.branch,
				version,
			} });
		},
		invalidate() {},
	};
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
	// ao sair, o contexto da extensão já foi desligado quando o Pi imprime a linha de retomar: o fechamento é montado no
	// session_shutdown (contexto ainda ativo) e só recebe o comando de continuar depois
	pi.on("session_shutdown", async (event, ctx) => {
		if (event?.reason !== "quit" || ctx?.mode !== "tui") return;
		try {
			const stats = sessionStats(ctx.sessionManager?.getEntries?.());
			const banner = exitBanner({ theme: ctx.ui.theme, title: stats.title, stats, resume: "\u0000" });
			globalThis.__pinkExitBanner = (resume) => banner.replace("\u0000", resume);
		} catch {
			globalThis.__pinkExitBanner = undefined;  // sem fechamento, o Pi imprime a linha dele
		}
	});
	pi.registerCommand?.("lateral", {
		description: "Mostra ou esconde a lateral (sessão, contexto, tokens)",
		handler: async (_args, ctx) => {
			globalThis.__pinkSidebarOn = !(globalThis.__pinkSidebarOn ?? true);
			ctx.ui.notify?.(globalThis.__pinkSidebarOn ? "Lateral visível" : "Lateral escondida", "info");
		},
	});
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const { CustomEditor, VERSION } = await import("@earendil-works/pi-coding-agent");
		install(pi, ctx, { CustomEditor, version: VERSION ?? "" });
	});
}
