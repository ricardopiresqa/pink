// Gera pink/theme/extra-themes.json: os temas do OpenCode, do Claude Code e as paletas do Codex no formato de tema do Pink.
// Uso (uma vez, quando as ferramentas mudarem de tema): node make_themes.mjs <pasta-temas-opencode> <pasta-temas-claude>
// As pastas vêm da extração dos binários instalados (cores em JSON); o Codex só tem temas de realce de código (base16,
// catppuccin, one-half), então entram as paletas públicas deles. Só o modo escuro de cada tema do OpenCode (o Pink tem
// "light" próprio); do Claude Code entram dark, light e os daltônicos (os ANSI dependem da paleta do terminal).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const hex = (value) => {
	if (typeof value !== "string") return undefined;
	if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
	if (/^#[0-9a-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map((c) => c + c).join("")}`.toLowerCase();
	const rgb = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(value);
	return rgb ? `#${rgb.slice(1).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : undefined;
};
const mix = (a, b, t) => `#${[0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - t) + parseInt(b.slice(1 + i, 3 + i), 16) * t).toString(16).padStart(2, "0")).join("")}`;

// o mesmo conjunto de chaves do pink.json (o teste compara com o dark.json do upstream)
function pinkTheme(name, appearance, c) {
	const bg = c.background, accent = c.accent, muted = c.muted, dim = c.dim ?? mix(muted, bg, 0.4);
	return {
		name,
		appearance,
		vars: {},
		colors: {
			accent, border: c.border, borderAccent: accent, borderMuted: c.borderMuted ?? mix(c.border, bg, 0.5),
			success: c.success, error: c.error, warning: c.warning, muted, dim, text: c.text, thinkingText: muted,
			selectedBg: c.selectedBg, scrollbarTrack: c.borderMuted ?? c.border, scrollbarThumb: c.border,
			searchMatchBg: c.selectedBg, searchMatchText: accent,
			userMessageBg: c.panel, userMessageText: c.text, customMessageBg: c.panel, customMessageText: muted, customMessageLabel: accent,
			toolPendingBg: c.panel, toolSuccessBg: c.addedBg ?? mix(c.success, bg, 0.85), toolErrorBg: c.removedBg ?? mix(c.error, bg, 0.85),
			toolTitle: c.text, toolOutput: muted,
			mdHeading: c.heading ?? accent, mdLink: c.link ?? c.info ?? accent, mdLinkUrl: dim, mdCode: c.code ?? accent, mdCodeBlock: c.text,
			mdCodeBlockBorder: c.border, mdQuote: muted, mdQuoteBorder: c.border, mdHr: c.border, mdListBullet: accent,
			toolDiffAdded: c.diffAdded ?? c.success, toolDiffRemoved: c.diffRemoved ?? c.error, toolDiffContext: muted,
			syntaxComment: c.syntax?.comment ?? dim, syntaxKeyword: c.syntax?.keyword ?? accent, syntaxFunction: c.syntax?.function ?? c.info ?? accent,
			syntaxVariable: c.syntax?.variable ?? c.text, syntaxString: c.syntax?.string ?? c.success, syntaxNumber: c.syntax?.number ?? c.warning,
			syntaxType: c.syntax?.type ?? c.info ?? accent, syntaxOperator: c.syntax?.operator ?? muted, syntaxPunctuation: c.syntax?.punctuation ?? muted,
			thinkingOff: dim, thinkingMinimal: mix(dim, accent, 0.2), thinkingLow: mix(dim, accent, 0.4), thinkingMedium: mix(dim, accent, 0.65),
			thinkingHigh: accent, thinkingXhigh: mix(accent, c.text, 0.3), thinkingMax: mix(accent, c.text, 0.55), bashMode: c.success,
		},
		export: { pageBg: bg, cardBg: c.panel, infoBg: c.selectedBg },
	};
}

function fromOpenCode(name, theme) {
	const pick = (key, seen = new Set()) => {
		let value = theme.theme?.[key];
		if (value && typeof value === "object") value = value.dark;
		while (typeof value === "string" && !value.startsWith("#") && theme.defs?.[value] !== undefined && !seen.has(value)) {
			seen.add(value);
			value = theme.defs[value];
			if (value && typeof value === "object") value = value.dark;
		}
		return hex(value);
	};
	const c = {
		background: pick("background") ?? "#000000", panel: pick("backgroundPanel") ?? pick("background") ?? "#111111", selectedBg: pick("backgroundElement") ?? pick("backgroundPanel"),
		accent: pick("primary"), info: pick("info"), text: pick("text"), muted: pick("textMuted"), border: pick("border"), borderMuted: pick("borderSubtle"),
		success: pick("success"), error: pick("error"), warning: pick("warning"), addedBg: pick("diffAddedBg"), removedBg: pick("diffRemovedBg"),
		diffAdded: pick("diffAdded"), diffRemoved: pick("diffRemoved"), heading: pick("markdownHeading"), link: pick("markdownLink"), code: pick("markdownCode"),
		syntax: { comment: pick("syntaxComment"), keyword: pick("syntaxKeyword"), function: pick("syntaxFunction"), variable: pick("syntaxVariable"), string: pick("syntaxString"), number: pick("syntaxNumber"), type: pick("syntaxType"), operator: pick("syntaxOperator"), punctuation: pick("syntaxPunctuation") },
	};
	if (!c.accent || !c.text || !c.muted || !c.border || !c.success || !c.error || !c.warning) return undefined; // tema que depende do terminal
	c.selectedBg ??= mix(c.accent, c.background, 0.8);
	return pinkTheme(name, "dark", c);
}

function fromClaude(name, t, appearance) {
	const c = {
		background: appearance === "dark" ? "#000000" : "#ffffff", panel: hex(t.userMessageBackground), selectedBg: hex(t.selectionBg) ?? hex(t.userMessageBackgroundHover),
		accent: hex(t.claude), info: hex(t.permission), text: hex(t.text), muted: hex(t.inactive), dim: hex(t.subtle), border: hex(t.promptBorder),
		success: hex(t.success), error: hex(t.error), warning: hex(t.warning), diffAdded: hex(t.diffAddedWord), diffRemoved: hex(t.diffRemovedWord),
		addedBg: hex(t.diffAddedDimmed), removedBg: hex(t.diffRemovedDimmed), link: hex(t.permission), code: hex(t.claude),
	};
	return pinkTheme(name, appearance, c);
}

// paletas públicas dos temas de código do Codex (base16 / catppuccin / one-half)
const CODEX = {
	"codex-base16-ocean": { appearance: "dark", bg: "#2b303b", panel: "#343d46", sel: "#4f5b66", fg: "#c0c5ce", muted: "#a7adba", dim: "#65737e", red: "#bf616a", orange: "#d08770", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#96b5b4", blue: "#8fa1b3", magenta: "#b48ead" },
	"codex-base16-eighties": { appearance: "dark", bg: "#2d2d2d", panel: "#393939", sel: "#515151", fg: "#d3d0c8", muted: "#a09f93", dim: "#747369", red: "#f2777a", orange: "#f99157", yellow: "#ffcc66", green: "#99cc99", cyan: "#66cccc", blue: "#6699cc", magenta: "#cc99cc" },
	"codex-base16-mocha": { appearance: "dark", bg: "#3b3228", panel: "#534636", sel: "#645240", fg: "#d0c8c6", muted: "#b8afad", dim: "#7e705a", red: "#cb6077", orange: "#d28b71", yellow: "#f4bc87", green: "#beb55b", cyan: "#7bbda4", blue: "#8ab3b5", magenta: "#a89bb9" },
	"codex-catppuccin-mocha": { appearance: "dark", bg: "#1e1e2e", panel: "#313244", sel: "#45475a", fg: "#cdd6f4", muted: "#a6adc8", dim: "#6c7086", red: "#f38ba8", orange: "#fab387", yellow: "#f9e2af", green: "#a6e3a1", cyan: "#94e2d5", blue: "#89b4fa", magenta: "#cba6f7" },
	"codex-catppuccin-latte": { appearance: "light", bg: "#eff1f5", panel: "#e6e9ef", sel: "#ccd0da", fg: "#4c4f69", muted: "#6c6f85", dim: "#9ca0b0", red: "#d20f39", orange: "#fe640b", yellow: "#df8e1d", green: "#40a02b", cyan: "#179299", blue: "#1e66f5", magenta: "#8839ef" },
	"codex-one-half-dark": { appearance: "dark", bg: "#282c34", panel: "#313640", sel: "#474e5d", fg: "#dcdfe4", muted: "#a0a6b1", dim: "#5c6370", red: "#e06c75", orange: "#e5c07b", yellow: "#e5c07b", green: "#98c379", cyan: "#56b6c2", blue: "#61afef", magenta: "#c678dd" },
	"codex-one-half-light": { appearance: "light", bg: "#fafafa", panel: "#f0f0f0", sel: "#e5e5e6", fg: "#383a42", muted: "#696c77", dim: "#a0a1a7", red: "#e45649", orange: "#c18401", yellow: "#c18401", green: "#50a14f", cyan: "#0184bc", blue: "#0184bc", magenta: "#a626a4" },
};
function fromCodex(name, p) {
	return pinkTheme(name, p.appearance, {
		background: p.bg, panel: p.panel, selectedBg: p.sel, accent: p.magenta, info: p.blue, text: p.fg, muted: p.muted, dim: p.dim, border: p.sel, borderMuted: p.panel,
		success: p.green, error: p.red, warning: p.yellow, link: p.blue, code: p.cyan, heading: p.blue,
		syntax: { comment: p.dim, keyword: p.magenta, function: p.blue, variable: p.fg, string: p.green, number: p.orange, type: p.yellow, operator: p.cyan, punctuation: p.muted },
	});
}

const [openCodeDir, claudeDir] = process.argv.slice(2);
const out = {};
for (const file of readdirSync(openCodeDir).filter((f) => f.endsWith(".json")).sort()) {
	const name = `opencode-${file.slice(0, -5)}`;
	const theme = fromOpenCode(name, JSON.parse(readFileSync(path.join(openCodeDir, file), "utf8")));
	if (theme) out[name] = theme;
}
for (const [variant, appearance] of [["dark", "dark"], ["light", "light"], ["dark-daltonized", "dark"], ["light-daltonized", "light"]]) {
	out[`claude-${variant}`] = fromClaude(`claude-${variant}`, JSON.parse(readFileSync(path.join(claudeDir, `claude-${variant}.json`), "utf8")), appearance);
}
for (const [name, palette] of Object.entries(CODEX)) out[name] = fromCodex(name, palette);
writeFileSync(path.join(HERE, "extra-themes.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log(Object.keys(out).length, "temas:", Object.keys(out).join(" "));
