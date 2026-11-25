// F50b - drives extensions/pink-ui.ts without the Pi runtime: pure layout functions and the install() state machine with fakes.
// Prints one JSON document with the measured facts; tests/test_f50.py asserts on it.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const file = process.argv[2];
// the extension is TypeScript-named plain JavaScript: load it as a module through a temporary .mjs copy
const copy = file.replace(/\.ts$/, ".driver.mjs");
fs.copyFileSync(file, copy);
const ui = await import(pathToFileURL(copy).href);
fs.unlinkSync(copy);

const theme = { fg: (name, text) => `<${name}>${text}</>`, bg: (name, text) => `[${name}]${text}[/]` };
const plain = { fg: (_n, t) => t, bg: (_n, t) => t };
const out = {};

// -- the logo and the home header at many widths
out.logoWidths = {};
for (const width of [20, 31, 32, 40, 60, 80, 100, 120, 200]) {
	const lines = ui.logoLines(plain, width);
	out.logoWidths[width] = { rows: lines.length, max: Math.max(...lines.map(ui.visible)), first: lines[0].trim().slice(0, 12) };
}
const header = (rows) => ui.homeHeader({ theme: plain, width: 100, rows, subtitle: "coding agent" });
out.header = { rows24: header(24).length, rows50: header(50).length, topBlank24: header(24).findIndex((l) => l.trim() !== ""), topBlank50: header(50).findIndex((l) => l.trim() !== "") };

// -- the input box
const box = ui.inputBox({ theme: plain, content: ["abc", "def"], width: 40, label: "thoth  provider" });
out.box = { lines: box.length, widths: box.map(ui.visible), starts: box.map((l) => l[0]), hasContent: box.some((l) => l.includes("abc")), label: box.at(-3).slice(1).trim(), last: box.at(-2).trim(), bottom: box.at(-1).slice(1).trim() };
const wideBox = ui.inputBox({ theme: plain, content: ["abc"], width: 100, label: "Build · thoth (automatico, gratuito)" });
out.boxWide = { lines: wideBox.length, last: wideBox.at(-2).slice(1).trim(), bottom: wideBox.at(-1).slice(1).trim() };  // cabe: rótulo e dicas na mesma linha
const styled = ui.inputBox({ theme, content: ["x"], width: 30, label: "m" });
out.boxStyled = { bar: styled.every((line) => line.startsWith("<accent>▌</>")), panel: styled[1].includes("[userMessageBg]") };
const inlineBox = ui.inputBox({ theme: plain, content: ["abc"], width: 60, label: "Build · thoth", inline: true });
out.boxInline = { first: inlineBox[1], last: inlineBox[3], widths: inlineBox.map(ui.visible) };
const resetBox = ui.inputBox({ theme, content: ["ab[0mcd"], width: 30, label: "m" });
out.boxKeepsBackground = resetBox[1].includes("[0m[userMessageBg]");  // o reset do editor não apaga o fundo da faixa do texto
const entries = [
	{ type: "message", message: { role: "user", content: [{ type: "text", text: "Revisão   independente final F-006 R1" }] } },
	{ type: "message", message: { role: "assistant", model: "gpt-x", usage: { input: 8200000, output: 165000, cacheRead: 0, cacheWrite: 0, cost: { total: 0.25 } } } },
	{ type: "message", message: { role: "assistant", model: "gpt-x", usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: { total: 0.5 } } } },
	{ type: "model_change" },
];
out.stats = ui.sessionStats(entries);
out.tokens = [ui.formatTokens(811121), ui.formatTokens(8200000), ui.formatTokens(999)];
const mapping = JSON.stringify({ projects: [
	{ canonical_name: "thoth", repository_roots: ["C:/Projetos/thoth-dev"] },
	{ canonical_name: "sub", repository_roots: ["C:\\Projetos\\thoth-dev\\pink"] },
] });
out.project = {
	root: ui.thothProject("C:\\Projetos\\thoth-dev", "V", () => mapping),
	nested: ui.thothProject("C:\\Projetos\\thoth-dev\\pink\\theme", "V", () => mapping),
	outside: ui.thothProject("C:\\Outro", "V", () => mapping),
	prefixOnly: ui.thothProject("C:\\Projetos\\thoth-devX", "V", () => mapping),
	broken: ui.thothProject("C:\\Projetos\\thoth-dev", "V", () => "{x"),
};
const banner = ui.exitBanner({ theme: plain, title: "Revisão independente final", stats: out.stats, resume: "pink --session 01a1" });
out.exitBanner = { logo: banner.includes("██"), session: banner.includes("Revisão independente final"), tokens: banner.includes("8.2M entrada  165.1K saída  $0.75"), resume: banner.includes("Continuar") && banner.includes("pink --session 01a1"), english: banner.includes("To resume") };
const bareBanner = ui.exitBanner({ theme: plain, title: "", stats: { models: [], cost: 0 }, resume: "pink --session x" });
out.exitBannerBare = { tokens: bareBanner.includes("Tokens"), session: bareBanner.includes("Sessão"), resume: bareBanner.includes("pink --session x") };
// -- a moldura de tela cheia (card 86e3x0ckk): colunas pela largura, barras pela altura, só dado real
out.frame = {
	columns: Object.fromEntries([170, 150, 149, 130, 115, 114, 90].map((w) => [w, ui.frameColumns(w)])),
	home: ui.frameColumns(200, { home: true }), off: ui.frameColumns(200, { on: false }),
	barRows: [16, 19, 20, 50].map(ui.barRows),
};
const barData = { version: "9.9", folder: "~/studio", branch: "feature/x", agent: "plan", context: { tokens: 46000, percent: 36, window: 128000 } };
const tops = Object.fromEntries([180, 110, 70].map((w) => [w, ui.topBar({ theme: plain, width: w, rows: 40, data: barData })]));
out.topBar = Object.fromEntries(Object.entries(tops).map(([w, lines]) => [w, { rows: lines.length, width: ui.visible(lines[0]), text: lines[0] }]));
out.topBarNoContext = ui.topBar({ theme: plain, width: 180, rows: 40, data: { ...barData, context: { tokens: null, percent: null, window: 128000 } } })[0];
out.topBarLow = ui.topBar({ theme: plain, width: 180, rows: 16, data: barData }).length;
out.bottomBar = Object.fromEntries([180, 60].map((w) => { const lines = ui.bottomBar({ theme: plain, width: w, rows: 40, data: barData }); return [w, { rows: lines.length, width: ui.visible(lines[1]), text: lines[1] }]; }));
const left = ui.leftColumn({ theme: plain, width: 32, height: 20, data: { sessions: [{ title: "Revisar autenticação", current: true }, { title: "Mapear API" }], tools: 5 } });
out.leftColumn = { rows: left.length, widths: [...new Set(left.map(ui.visible))], text: left.join("\n"), last: left.at(-1), short: ui.leftColumn({ theme: plain, width: 32, height: 6, data: { sessions: [{ title: "a", current: true }], tools: 5 } }).join("\n") };
const rightData = { input: 734800, output: 36700, cost: 0, project: "thoth", context: { tokens: 46000, percent: 36, window: 128000 },
	todos: [{ content: "Revisar middleware", status: "completed" }, { content: "Escrever teste", status: "in_progress" }, { content: "Validar regressão", status: "pending" }],
	changes: [{ path: "src/auth/session.ts", status: "editado" }, { path: "tests/auth.test.ts", status: "novo" }] };
const right = ui.rightColumn({ theme: plain, width: 36, height: 30, data: rightData });
out.rightColumn = { rows: right.length, widths: [...new Set(right.map(ui.visible))], text: right.join("\n"),
	empty: ui.rightColumn({ theme: plain, width: 36, height: 30, data: { input: 0, output: 0, cost: 0.12 } }).join("\n"), cut: ui.rightColumn({ theme: plain, width: 36, height: 5, data: rightData }).length };
out.changes = ui.changesFromBranch([
	{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "write", arguments: { path: "tests\\auth.test.ts" } }, { type: "toolCall", name: "read", arguments: { path: "x.ts" } }] } },
	{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "edit", arguments: { path: "src/a.ts" } }, { type: "toolCall", name: "edit", arguments: { path: "src/a.ts" } }] } },
	{ type: "message", message: { role: "user", content: [{ type: "toolCall", name: "edit", arguments: { path: "no.ts" } }] } },
], new Set(["tests\\auth.test.ts"]));
out.footers = {
	full: ui.assistantFooter({ theme: plain, model: "anthropic/claude-sonnet-4-5-20250929", agent: "build", ms: 20500, output: 935 }),
	plan: ui.assistantFooter({ theme: plain, model: "thoth", agent: "plan", ms: 4100, output: 0 }),
	fast: ui.assistantFooter({ theme: plain, model: "thoth", ms: 3, output: 3600 }),
	history: ui.assistantFooter({ theme: plain, model: "thoth" }),
};
const day = (d, h, m) => new Date(2026, 9, d, h, m);
out.relative = [day(29, 14, 32), day(28, 23, 0), day(26, 9, 0), day(20, 9, 0), "nope"].map((when) => ui.relativeTime(when, day(29, 18, 0)));
const msg = (text) => ({ type: "message", message: { role: "user", content: [{ type: "text", text }] } });
out.autoTitle = [ui.autoTitle([msg("oi"), msg("/model x y z w"), msg("revise   a autenticação antes de implementar")]), ui.autoTitle([msg("oi pink")]), ui.autoTitle([msg("a b c d ".repeat(20))]).length];
const leftTimes = ui.leftColumn({ theme: plain, width: 32, height: 10, data: { sessions: [{ title: "oi", current: true, when: "14:32" }, { title: "oi", when: "ontem" }], tools: 1 } });
out.leftTimes = { widths: [...new Set(leftTimes.map(ui.visible))], rows: leftTimes.slice(2, 4) };
out.trash = (() => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pink-trash-test-"));
	const a = path.join(dir, "a.jsonl");
	const b = path.join(dir, "b.jsonl");
	fs.writeFileSync(a, "{}\n");
	fs.writeFileSync(b, "{}\n");
	const current = ui.trashSession(b, b.toUpperCase(), { fs, path });
	const moved = ui.trashSession(a, b, { fs, path });
	fs.writeFileSync(a, "{}\n");
	const again = ui.trashSession(a, b, { fs, path, now: 7 });
	const result = { current: current.ok, reason: current.reason, moved: moved.ok, aGone: !fs.existsSync(a) || again.ok, bKept: fs.existsSync(b), trash: fs.readdirSync(path.join(dir, ".trash")).sort() };
	fs.rmSync(dir, { recursive: true, force: true });
	return result;
})();
out.userLines = ui.userLines(["\x1b[48;2;1;2;3m   \x1b[49m", "\x1b[48;5;236moi\x1b[49m", "tudo"]);
out.bullet = ui.bulleted({ render: (width) => ["", ` pong ${width}`, " fim"] }).render(40);
out.skipThinking = [
	ui.skipThinking({ content: [{ type: "thinking", thinking: "x" }, { type: "toolCall", name: "bash" }] }),
	ui.skipThinking({ content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "pronto" }, { type: "toolCall", name: "bash" }] }),
	ui.skipThinking({ content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "só texto" }] }),
];
out.groups = (() => {
	const call = (id, name) => ({ type: "toolCall", id, name, arguments: { command: "ls", path: "a" } });
	const msg = (role, content, extra = {}) => ({ type: "message", message: { role, content, ...extra } });
	const done = (id, isError = false) => msg("toolResult", [], { toolCallId: id, isError });
	const entries = [
		msg("user", "oi"),
		msg("assistant", [{ type: "thinking", thinking: "x" }, call("a", "bash"), call("b", "powershell")]), done("a"), done("b", true),
		msg("assistant", [call("c", "read"), call("d", "grep")]), done("c"),
		msg("assistant", [{ type: "text", text: "achei" }, call("e", "bash")]), done("e"),
		msg("assistant", [call("f", "edit"), call("g", "read")]), done("f"), done("g"),
	];
	const groups = ui.toolGroups(entries);
	const first = groups.get("a");
	const session = { getBranch: () => entries, getLeafId: () => "z", getEntryCount: () => entries.length };
	ui.PINK.session = session;
	const renderer = ui.compactToolRenderer("bash", () => undefined);
	const ctx = (id, extra) => ({ outputPad: 1, toolCallId: id, args: { command: "ls" }, durationMs: 5, isError: false, isPartial: false, expanded: false, ...extra });
	const row = (id) => renderer.renderResult({}, { expanded: false, isPartial: false }, plain, ctx(id)).render(80);
	const rows = { a: row("a"), b: row("b"), e: row("e"), g: row("g"), running: renderer.renderCall({ command: "ls" }, plain, ctx("a", { isPartial: true })).render(80) };
	ui.PINK.session = undefined;
	return { sameGroup: ["b", "c", "d"].map((id) => groups.get(id) === first), eAlone: groups.get("e") !== first && groups.get("e").calls.length, fSkipped: groups.has("f"), gAlone: groups.get("g").calls.length, summary: ui.groupSummary(first.calls), screen: ui.groupSummary([{ name: "tela", done: true }, { name: "tela", done: true }, { name: "read", done: true }]).text, rows };
})();
const cursorBox = ui.inputBox({ theme: plain, content: ["ab\x1b_pi:c\x07\x1b[7m \x1b[0mcd"], width: 30, label: "m" });
out.cursorBoxWidths = cursorBox.map(ui.visible);  // o marcador de cursor do Pi não ocupa coluna
out.fitKeepsMarker = ui.fit("ab\x1b_pi:c\x07cdef", 4).includes("\x1b_pi:c\x07");
const tight = ui.inputBox({ theme: plain, content: ["x".repeat(80)], width: 20, label: "m" });
out.boxTight = { widths: tight.map(ui.visible) };

// -- fit / pad / center / footer with ANSI
const ansi = "\u001b[38;2;224;92;138mabcdef\u001b[0m";
out.fit = { visible: ui.visible(ansi), cut: ui.visible(ui.fit(ansi, 3)), keepsSgr: ui.fit(ansi, 3).startsWith("\u001b[38;2;224;92;138m"), short: ui.fit("ab", 10) };
out.footer = ui.footerLine({ theme: plain, width: 50, left: " ~/p (main)", right: "ctx 1%/128k   pink 1.0 " });
out.footerWidth = ui.visible(out.footer);
out.footerLong = ui.visible(ui.footerLine({ theme: plain, width: 20, left: "x".repeat(30), right: "y".repeat(30) }));

// -- install(): state machine with fakes
class FakeEditor {
	constructor(tui, theme, kb, opts) { this.opts = opts; }
	render(width) { return ["─".repeat(width), "typed text", "─".repeat(width)]; }
}
function session({ entries = [], mode = "tui", rows = 40, tuiMode } = {}) {
	const handlers = {};
	const pi = { on: (name, fn) => (handlers[name] = fn), getThinkingLevel: () => "off", exec: async () => ({ stdout: "main\n" }) };
	const captured = {};
	const tui = { mode: tuiMode, terminal: { rows }, requestRender() { captured.renders = (captured.renders ?? 0) + 1; } };
	const ctx = {
		mode, cwd: "C:\\proj\\demo", model: { id: "thoth", provider: "thoth", contextWindow: 128000 }, getContextUsage: () => ({ percent: 12.4, contextWindow: 128000 }),
		sessionManager: { getEntries: () => entries }, ui: { theme: plain, setHeader: (f) => (captured.header = f(tui, plain)), setFooter: (f) => (captured.footer = f(tui, plain)), setEditorComponent: (f) => (captured.editor = f(tui, plain, {})) },
	};
	const state = ui.install(pi, ctx, { CustomEditor: FakeEditor, version: "9.9" });
	return { state, handlers, captured, tui };
}
const fresh = session();
const h1 = fresh.captured.header.render(100);
fresh.handlers.agent_start();
const h2 = fresh.captured.header.render(100);
out.state = { homeHeaderLines: h1.length, hasLogo: h1.some((l) => l.includes("██")), afterAgentStart: h2.length, homeFlag: fresh.state.home, redrawn: fresh.captured.renders ?? 0 };
const home = session();
const homeBox = home.captured.editor.render(120);
out.editorHome = { lines: homeBox.length, margin: homeBox[0].length - homeBox[0].trimStart().length, boxWidth: ui.visible(homeBox[0].trimStart()), hints: homeBox.some((l) => l.includes("comandos")), paddedToTheBottom: homeBox.length > 10, cursorKept: homeBox.some((l) => l.includes("typed text")), borderGone: !homeBox.some((l) => l.includes("──")) };
const talking = session({ entries: [{ type: "message" }] });
const sessBox = talking.captured.editor.render(120);
out.editorSession = { startsHome: talking.state.home, headerLines: talking.captured.header.render(100).length, margin: sessBox[0].length - sessBox[0].trimStart().length, boxWidth: ui.visible(sessBox[0]), hints: sessBox.some((l) => l.includes("comandos")) };
const footer = session({ tuiMode: "regular" }).captured.footer.render(100)[0];
out.footerFramed = home.captured.footer.render(100);
out.frameInstalled = { left160: globalThis.__pinkFrame.visible("left", { width: 160 }), top: globalThis.__pinkFrame.visible("top", { width: 60 }), topLines: globalThis.__pinkFrame.render("top", 160).map(ui.visible) };
out.footerInstalled = { text: footer.trim(), width: ui.visible(footer) };
const inputFirst = session();
inputFirst.handlers.input();
out.leavesOnInput = inputFirst.state.home === false;
out.label = homeBox.filter((l) => l.includes("thoth")).at(-1)?.replace(/^\s*│|│\s*$/g, "").trim() ?? "";
out.frameAfterTalk = { left160: (() => { const s = session({ entries: [{ type: "message" }] }); return globalThis.__pinkFrame.visible("left", { width: 160 }) && !globalThis.__pinkFrame.visible("left", { width: 140 }) && globalThis.__pinkFrame.visible("right", { width: 140 }) && !globalThis.__pinkFrame.visible("right", { width: 100 }) && s.state.home === false; })() };
out.placeholder = (() => {
	class TextEditor extends FakeEditor { getText() { return this.text; } }
	let editor;
	const ctx = { mode: "tui", cwd: "C:\\p", model: { id: "m" }, getContextUsage: () => undefined, sessionManager: { getEntries: () => [{ type: "message" }] },
		ui: { theme: plain, setHeader() {}, setFooter() {}, setEditorComponent: (f) => (editor = f({ terminal: { rows: 30 }, requestRender() {} }, plain, {})) } };
	ui.install({ on() {}, getThinkingLevel: () => "off" }, ctx, { CustomEditor: TextEditor });
	editor.text = "";
	const empty = editor.render(100).join("\n").includes(ui.PLACEHOLDER);
	editor.text = "abc";
	return { empty, typing: editor.render(100).join("\n").includes(ui.PLACEHOLDER) };
})();
out.labels = {
	same: ui.modelLabel({ theme: plain, model: { id: "thoth", provider: "thoth" }, thinking: "off" }),
	other: ui.modelLabel({ theme: plain, model: { id: "claude-x", name: "Claude X", provider: "anthropic" }, thinking: "high" }),
	none: ui.modelLabel({ theme: plain, model: undefined, thinking: "high" }),
};
out.printMode = (() => {
	let called = false;
	const pi = { on: (name, fn) => (called = { name, fn }) };
	ui.default(pi);
	return { subscribed: called && called.name };
})();

// -- funções do OpenCode (owner 2026-10-28)
out.opencode = (() => {
	const commands = [];
	const events = [];
	ui.default({ on: (name) => events.push(name), registerCommand: (name) => commands.push(name) });
	const palette = ui.paletteItems([{ name: "lateral", description: "x" }, { name: "minha", description: "Do usuário" }, { name: "undo", description: "dup" }]);
	return {
		commands: commands.sort(),
		events,
		palette: { first: palette[0], hasUndo: palette.includes("/undo  Desfazer a última mensagem e as mudanças nos arquivos"), extra: palette.at(-1), undoOnce: palette.filter((item) => item.startsWith("/undo")).length },
		plan: ["read", "grep", "todowrite", "bash", "edit", "write", "mcp__x"].map((name) => ui.planDecision(name)).concat(ui.planDecision("mcp__docs", { readOnlyHint: true })),
		agentLabel: ui.modelLabel({ theme: plain, model: { id: "thoth", provider: "thoth" }, thinking: "off", agent: "plan" }),
		todos: ui.normalizeTodos([{ content: " a ", status: "completed" }, { content: "b", status: "weird" }, { content: "" }, null]),
		todoLines: ui.todoLines({ theme: plain, todos: [{ content: "a", status: "completed" }, { content: "b", status: "in_progress" }], width: 40 }),
		fromBranch: ui.todosFromBranch([
			{ type: "message", message: { role: "toolResult", toolName: "todowrite", details: { todos: [{ content: "old", status: "pending" }] } } },
			{ type: "message", message: { role: "toolResult", toolName: "todowrite", details: { todos: [{ content: "new", status: "completed" }] } } },
			{ type: "message", message: { role: "toolResult", toolName: "read", details: { todos: [{ content: "no" }] } } },
		]),
		lastUser: ui.lastUserEntry([{ id: "1", type: "message", message: { role: "user" } }, { id: "2", type: "message", message: { role: "assistant" } }, { id: "3", type: "message", message: { role: "user" } }, { id: "4", type: "custom" }])?.id,
		nameStatus: ui.parseNameStatus("M\0a.txt\0A\0dir/c d.txt\0D\0b.txt\0"),
	};
})();

// -- as teclas do OpenCode na caixa de digitar: ctrl+p abre a paleta, tab com a caixa vazia troca o agente
out.keys = (() => {
	const calls = [];
	class KeyEditor extends FakeEditor {
		getText() { return this.text ?? ""; }
		handleInput(data) { calls.push(`editor:${data}`); }
		setText(text) { calls.push(`set:${text}`); }
	}
	const pi = { on() {}, getThinkingLevel: () => "off", exec: async () => ({ stdout: "" }) };
	let editor;
	const ctx = { mode: "tui", cwd: "C:\\p", model: { id: "m" }, getContextUsage: () => undefined, sessionManager: { getEntries: () => [] },
		ui: { theme: plain, setHeader() {}, setFooter() {}, setEditorComponent: (f) => (editor = f({ terminal: { rows: 30 }, requestRender() {} }, plain, {})) } };
	ui.install(pi, ctx, { CustomEditor: KeyEditor, matchesKey: (data, key) => data === key, onPalette: () => calls.push("palette"), onAgent: () => calls.push("agent") });
	editor.handleInput("ctrl+p");
	editor.handleInput("tab");
	editor.text = "abc";
	editor.handleInput("tab");
	editor.handleInput("x");
	editor.handleInput("ctrl+n");  // nova sessão: o comando vai pela caixa (só comandos trocam de sessão)
	editor.handleInput("alt+up");  // sem lista de sessões ainda: nada acontece
	return calls;
})();

// -- /undo e /redo de arquivos num repositório Git de verdade (temporário)
import { execFileSync } from "node:child_process";
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pink-undo-test-"));
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
git("init", "-q");
git("config", "user.email", "t@t");
git("config", "user.name", "t");
fs.writeFileSync(path.join(repo, ".gitignore"), "ignored.txt\n");
fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
fs.writeFileSync(path.join(repo, "b.txt"), "keep\n");
git("add", "-A");
git("commit", "-qm", "base");
fs.writeFileSync(path.join(repo, "u.txt"), "untracked before\n");
const objectsBefore = git("count-objects");
const before = await ui.gitSnapshot(repo);
fs.writeFileSync(path.join(repo, "a.txt"), "two\n");
fs.rmSync(path.join(repo, "b.txt"));
fs.writeFileSync(path.join(repo, "c.txt"), "created by the agent\n");
fs.writeFileSync(path.join(repo, "ignored.txt"), "ignored\n");
const undone = await ui.gitRestore(before);
const read = (name) => (fs.existsSync(path.join(repo, name)) ? fs.readFileSync(path.join(repo, name), "utf8") : null);
out.undo = {
	snapshot: Boolean(before?.tree), changed: undone?.changed,
	a: read("a.txt"), b: read("b.txt"), c: read("c.txt"), u: read("u.txt"), ignored: read("ignored.txt"),
	userIndexUntouched: git("diff", "--cached", "--name-only") === "" && git("stash", "list") === "" && git("log", "--oneline").split("\n").length === 1,
	objectsUntouched: git("count-objects") === objectsBefore,
};
await ui.gitRestore(undone.now);
out.redo = { a: read("a.txt"), b: read("b.txt"), c: read("c.txt") };
out.outsideGit = (await ui.gitSnapshot(os.tmpdir())) === undefined;
// card 1dfwh7kfmqr: o ponto salvo na sessão vale depois de reabrir; árvore que sumiu dos objetos não vale
const undoEntries = [{ type: "message", id: "u1" }, { type: "custom", customType: ui.UNDO_ENTRY, data: { entryId: "u1", top: before.top, tree: before.tree, store: { PATH: "forjado" } } }];
out.saved = {
	found: (await ui.savedSnapshot(undoEntries, "u1", repo))?.tree === before.tree,
	storeFromHere: (await ui.savedSnapshot(undoEntries, "u1", repo))?.store?.PATH === undefined,
	otherId: (await ui.savedSnapshot(undoEntries, "u2", repo)) === undefined,
	gone: (await ui.savedSnapshot([{ type: "custom", customType: ui.UNDO_ENTRY, data: { entryId: "u1", top: before.top, tree: "0".repeat(40) } }], "u1", repo)) === undefined,
	otherRepo: (await ui.savedSnapshot([{ type: "custom", customType: ui.UNDO_ENTRY, data: { entryId: "u1", top: "C:/outro/repo", tree: before.tree } }], "u1", repo)) === undefined,
	badTree: (await ui.savedSnapshot([{ type: "custom", customType: ui.UNDO_ENTRY, data: { entryId: "u1", top: before.top, tree: "HEAD; rm" } }], "u1", repo)) === undefined,
};
fs.rmSync(repo, { recursive: true, force: true });
console.log(JSON.stringify(out));

// -- pink.3: ferramentas e pensamento compactos, idioma, ctx antigo depois da troca de sessão, modelo no painel
out.compact = (() => {
	const renderer = ui.compactToolRenderer("edit", () => ({ renderShell: "self", renderCall: () => ({ render: () => ["BASE CALL"] }), renderResult: () => ({ render: () => ["BASE DIFF"] }) }));
	const ctx = (extra) => ({ outputPad: 1, args: { path: "src\\x.ts" }, durationMs: 1234, isError: false, isPartial: false, expanded: false, ...extra });
	const result = { details: { patch: "--- a\n+++ b\n@@\n-old\n+new\n+more\n context" } };
	const plainRun = ui.compactToolRenderer("bash", () => undefined);
	return {
		shell: renderer.renderShell,
		running: renderer.renderCall({ path: "src/x.ts" }, plain, ctx({ isPartial: true })).render(80)[0],
		callAfter: renderer.renderCall({ path: "src/x.ts" }, plain, ctx()).render(80),
		done: renderer.renderResult(result, { expanded: false, isPartial: false }, plain, ctx()).render(80)[0],
		error: renderer.renderResult(result, { expanded: false, isPartial: false }, plain, ctx({ isError: true, durationMs: 5 })).render(80)[0],
		expanded: [renderer.renderCall({}, plain, ctx({ expanded: true })).render(80)[0], renderer.renderResult(result, { expanded: true, isPartial: false }, plain, ctx({ expanded: true })).render(80)[0]],
		noBase: plainRun.renderResult({ content: [{ type: "text", text: "a\nb" }] }, { expanded: true, isPartial: false }, plain, ctx({ expanded: true, args: { command: "ls" } })).render(80),
		summaries: [["read", { path: "a.ts" }], ["write", { path: "b.ts", content: "1\n2\n3" }], ["bash", { command: "npm   test -- --watch=false " + "x".repeat(80) }], ["grep", { pattern: "TODO" }], ["ls", {}], ["todowrite", { todos: [{ content: "a", status: "completed" }, { content: "b" }] }], ["mcp_x", {}], ["powershell", { command: "dir" }]].map(([name, args]) => ui.toolSummary(name, args)),
	};
})();
out.thinking = [ui.thinkingLabel(6300), ui.thinkingLabel(undefined)];
out.stale = { empty: ui.live(() => { throw new Error("stale"); }, [])(), passThrough: ui.live(() => { throw new Error("stale"); }, (line) => line)("x"), ok: ui.live((a) => a * 2, 0)(21) };
out.language = await (async () => {
	const handlers = {};
	ui.default({ on: (name, fn) => (handlers[name] = fn), registerCommand() {} });
	const build = await handlers.before_agent_start({ systemPrompt: "BASE" });
	ui.PINK.agent = "plan";
	const plan = await handlers.before_agent_start({ systemPrompt: "BASE" });
	ui.PINK.agent = "build";
	return { build: build.systemPrompt, plan: plan.systemPrompt.endsWith(ui.PLAN_PROMPT) && plan.systemPrompt.includes(ui.LANGUAGE_PROMPT) };
})();
// card 1dfwh7kg7r1: SUBAGENTES rodando na lateral; ALTERAÇÕES só com os 5 mais recentes
out.sideAgents = (() => {
	const waiting = new Map();
	ui.trackSubagent(waiting, { type: "tool_call", toolName: "subagent", toolCallId: "t1", input: { tasks: [{ agent: "tifa", task: "testa  o login" }, { agent: "argus", task: "revisa" }] } });
	ui.trackSubagent(waiting, { type: "tool_call", toolName: "subagent", toolCallId: "t2", input: { agent: "x", task: "y", background: true } });
	ui.trackSubagent(waiting, { type: "tool_call", toolName: "bash", toolCallId: "t3", input: {} });
	const tracked = waiting.size;
	const background = new Map([[1, { agent: "cloud", task: "implementa", started: 0 }]]);
	const agents = ui.runningSubagents(waiting, background).map((item, i) => ({ ...item, started: i === 0 ? 0 : 60000 }));
	const changes = Array.from({ length: 8 }, (_, i) => ({ path: `f${i}.py`, status: "editado" }));
	const text = ui.rightColumn({ theme: plain, width: 36, height: 60, data: { input: 0, output: 0, cost: 0, agents, now: 125000, changes } }).join("\n");
	ui.trackSubagent(waiting, { type: "tool_result", toolName: "subagent", toolCallId: "t1", content: [] });
	return { tracked, cleared: waiting.size, text, none: ui.rightColumn({ theme: plain, width: 36, height: 60, data: { input: 0, output: 0, cost: 0 } }).join("\n").includes("SUBAGENTES") };
})();
// owner 2026-11-25: as personas do DAG do Thoth (.thoth/dag/live.json) aparecem em SUBAGENTES enquanto ele roda
out.dagAgents = (() => {
	const live = { pid: 7, finished: null, nodes: [{ id: "a", persona: "argus", state: "running", started: 100 }, { id: "b", persona: "vincent", state: "ok", seconds: 12.5 }, { id: "c", persona: "", state: "waiting" }] };
	const read = (body) => (file) => (file.replace(/\\/g, "/").endsWith("/proj/.thoth/dag/live.json") ? JSON.stringify(body) : (() => { throw new Error("nao achei"); })());
	const items = ui.dagAgents("/proj", 130000, read(live), () => true);
	const text = ui.rightColumn({ theme: plain, width: 36, height: 60, data: { input: 0, output: 0, cost: 0, agents: items, now: 130000 } }).join("\n");
	return {
		text,
		dead: ui.dagAgents("/proj", 130000, read(live), () => false).length, // o DAG morreu sem terminar: some
		afterEnd: [ui.dagAgents("/proj", 110000, read({ ...live, finished: 100 }), () => false).length, ui.dagAgents("/proj", 116000, read({ ...live, finished: 100 }), () => false).length],
		missing: ui.dagAgents("/outro", 130000, read(live), () => true).length,
	};
})();
out.rightModels =ui.rightColumn({ theme: plain, width: 36, height: 30, data: { input: 1, output: 1, cost: 0, models: ["anthropic/claude-sonnet-4-5-20250929", "thoth"] } }).join("\n");
// card 1dfwh7kg7r1: o Thoth é outro produto; a lateral só mostra THOTH/COTA com ele na máquina
out.thothInstalled = [
	ui.thothInstalled({ PATH: "C:\\bin" }, () => false, "win32"),
	ui.thothInstalled({ THOTH_VAULT_PATH: "C:\\v" }, () => false, "win32"),
	ui.thothInstalled({ PATH: "C:\\x;C:\\py\\Scripts\\" }, (file) => file === "C:\\py\\Scripts/thoth-client.exe", "win32"),
	ui.thothInstalled({ PATH: "bin;." }, () => true, "win32") === true,
];
// -- pink.4 (card 86e3px66t): a seção THOTH, com fontes falsas (nenhuma rede, nenhum processo)
out.thoth = await (async () => {
	const now = Date.parse("2026-10-29T12:00:00Z");
	const secret = "sk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
	const raw = {
		approvals: [
			{ state: "WAITING", request: { action: "execute", resource: "task", project_id: "thoth", expires_at: "2026-10-29T13:00:00Z" } },
			{ state: "WAITING", request: { action: "execute", resource: "evidence", project_id: "old", expires_at: "2026-10-13T05:47:12Z" } },
			{ state: "APPROVED", request: { action: "x", resource: "y", project_id: "z", expires_at: "2026-10-30T00:00:00Z" } },
		],
		cards: { cards: [{ task_id: "F1", state: "READY" }, { task_id: "86e3px66t", state: "RUNNING", mission: { goal: `lateral \u001b[31mcom ${secret} dados` } }] },
		calls: { data: [{ provider: "kilo", model: "a" }, { provider: "zen", model: "big-pickle" }, { provider: null, model: null }] },
	};
	const full = ui.thothSnapshot(raw, now);
	const fail = () => Promise.reject(new Error("down"));
	const down = await ui.pollThoth({ approvals: fail, cards: () => { throw new Error("sync"); }, calls: fail }, now);
	const partial = await ui.pollThoth({ approvals: fail, cards: async () => ({ cards: [] }), calls: fail }, now);
	const column = (thoth) => ui.rightColumn({ theme: plain, width: 36, height: 40, data: { input: 0, output: 0, cost: 0, thoth } });
	const shown = column(full);
	return { full, down, partial, text: shown.join("\n"), widths: [...new Set(shown.map(ui.visible))], downText: column(down).join("\n"), partialText: column(partial).join("\n"),
		loading: column({ ok: false, loading: true }).join("\n"), leaks: shown.join("\n").includes(secret.slice(0, 6)) || shown.join("\n").includes("\u001b[31m"), absent: column(undefined).join("\n").includes("THOTH"),
		ad: column({ ad: true }), adText: column({ ad: true }).join("\n") };
})();
// -- COTA: uso do plano (thoth-client uso estado --json), sem processo
out.plan = await (async () => {
	const now = Date.parse("2026-11-15T12:00:00Z") / 1000;
	const raw = {
		claude: { installed: true, usage: { h5: { pct: 43, resets_at: now + 3600 }, week: { pct: 95, resets_at: now + 3 * 86400 } } },
		codex: { installed: true, usage: { h5: { pct: 80, resets_at: now - 60 }, week: { pct: 250, resets_at: now + 86400 } } },
	};
	const snap = ui.planSnapshot(raw, now);
	const column = (plan) => ui.rightColumn({ theme: plain, width: 36, height: 60, data: { input: 0, output: 0, cost: 0, plan } });
	const shown = column(snap);
	const fake = (stdout, error = null) => (_cmd, _args, _opts, cb) => cb(error, stdout);
	return {
		snap,
		text: shown.join("\n"),
		widths: [...new Set(shown.map(ui.visible))],
		noClaude: ui.planSnapshot({ claude: { installed: true, usage: null }, codex: { installed: false } }, now),
		noClaudeText: column(ui.planSnapshot({ claude: { installed: true, usage: null }, codex: { installed: false } }, now)).join("\n"),
		none: ui.planSnapshot({}, now),
		absent: column(undefined).join("\n").includes("COTA"),
		loading: column({ ok: false, loading: true }).join("\n").includes("consultando"),
		read: await ui.readPlan(fake(JSON.stringify(raw))).then((v) => v.ok),
		broken: await ui.readPlan(fake("não é json")).then(() => "ok", () => "rejeitou"),
		brokenReason: await ui.readPlan(fake("não é json")).then(() => "ok", (e) => e.reason),
		noisy: await ui.readPlan(fake(`Nova versão disponível\n${JSON.stringify(raw)}`)).then((v) => v.ok),
		missing: await ui.readPlan(fake("", Object.assign(new Error("spawn"), { code: "ENOENT" }))).then(() => "ok", (e) => e.reason),
		old: ui.planFailure({ code: 2 }, "thoth-client: error: argument command: invalid choice: 'uso'"),
		slow: ui.planFailure({ killed: true }),
		missingText: column({ ok: false, reason: "missing" }).join("\n"),
		unknownText: column({ ok: false }).join("\n"),
	};
})();
// -- cota do Claude pelo login do Pink e a lista de MCP recolhível
out.own = await (async () => {
	const now = Date.parse("2026-11-15T12:00:00Z") / 1000;
	const body = { five_hour: { utilization: 37, resets_at: "2026-11-15T14:00:00Z" }, seven_day: { utilization: 61, resets_at: "2026-11-18T09:00:00.283351+00:00" } }; // a API devolve microssegundos
	const calls = [];
	const fetcher = async (url, init) => { calls.push({ url, auth: init.headers.Authorization.slice(0, 17), beta: init.headers["anthropic-beta"] }); return { ok: true, json: async () => body }; };
	return {
		windows: ui.claudeUsageWindows(body, now),
		expired: ui.claudeUsageWindows({ five_hour: { utilization: 90, resets_at: "2026-11-15T11:00:00Z" } }, now),
		bad: ui.claudeUsageWindows({ five_hour: { utilization: "x" } }, now) ?? null,
		oauth: (await ui.readClaudeFromPink(async () => "sk-ant-oat01-abc", fetcher)) ? "leu" : "nada",
		apiKey: (await ui.readClaudeFromPink(async () => "sk-ant-api03-abc", fetcher)) ?? "nada",
		none: (await ui.readClaudeFromPink(async () => undefined, fetcher)) ?? "nada",
		failed: (await ui.readClaudeFromPink(async () => "sk-ant-oat01-abc", async () => ({ ok: false }))) ?? "nada",
		calls,
	};
})();
out.mcp = (() => {
	const servers = [{ name: "rag-thoth", state: "connected · 6 tools" }, { name: "playwright", state: "connected · 24 tools · resources" }, { name: "board", state: "failed" }, { name: "off", state: "disabled" }, { name: "evil\u001b[2J", state: "needs sign-in" }];
	const hits = {};
	const closed = ui.rightColumn({ theme: plain, width: 36, height: 60, data: { input: 0, output: 0, cost: 0, mcp: servers, mcpOpen: false, hits } });
	const open = ui.rightColumn({ theme: plain, width: 36, height: 60, data: { input: 0, output: 0, cost: 0, mcp: servers, mcpOpen: true } });
	return { closed: closed.join("\n"), open: open.join("\n"), titleRow: closed[hits.mcp], widths: [...new Set(open.map(ui.visible))], empty: ui.mcpLines({ theme: plain, mcp: [], open: true, width: 30 }).join("\n"), absent: ui.rightColumn({ theme: plain, width: 36, height: 60, data: { input: 0, output: 0, cost: 0 } }).join("\n").includes("MCP") };
})();
out.run = (() => {
	let clock = 1000;
	const run = ui.createRun(() => clock);
	run.add({ role: "user", usage: { output: 999 } });  // só resposta do agente conta
	run.add({ role: "assistant", timestamp: 1, usage: { output: 2000 } });
	clock += 30000;
	run.live({ role: "assistant", usage: { output: 400 } });
	const live = run.summary();
	run.add({ role: "assistant", timestamp: 2, usage: { output: 4400 } });  // a resposta em andamento terminou: não conta duas vezes
	clock += 374000;
	return {
		live, end: run.summary(), last: run.last,
		labels: [0, 999, 1000, 6400, 6449, 999949, 999950, 1234567].map(ui.tokenLabel),
		times: [0, 999, 59000, 404000, 3725000].map(ui.elapsedLabel),
		footer: ui.assistantFooter({ theme: plain, model: "thoth", ms: 900, output: 5, run: { ms: 404000, output: 6400 } }),
		planFooter: ui.assistantFooter({ theme: plain, model: "thoth", agent: "plan", run: { ms: 5000, output: 10 } }),
		estimate: ui.streamedTokens({ content: [{ type: "text", text: "x".repeat(400) }, { type: "thinking", thinking: "y".repeat(200) }, { type: "toolCall", arguments: { path: "a" } }] }),
		retry: {
			kept: ui.continueRun({ failed: true }, 1000, 5000) !== undefined,
			late: ui.continueRun({ failed: true }, 1000, 1000 + ui.RETRY_WINDOW_MS) === undefined,
			ok: ui.continueRun({ failed: false }, 1000, 2000) === undefined,
		},
	};
})();
// os ganchos de verdade, num pi falso (Argus: testar a ligação, não só a função)
out.wiring = await (async () => {
	const handlers = {};
	const fake = { on: (name, fn) => (handlers[name] ??= []).push(fn) };
	ui.default(fake);
	const emit = async (name, event, ctx) => { for (const fn of handlers[name] ?? []) await fn(event, ctx); };
	const working = [];
	const ctx = { mode: "print", cwd: os.tmpdir(), ui: { setWorkingMessage: (text) => working.push(text ?? null) }, sessionManager: { getLeafEntry: () => undefined } };
	const answer = (timestamp, output, stopReason = "stop", content = []) => ({ role: "assistant", timestamp, usage: { output }, stopReason, content });
	await emit("agent_start", {}, ctx);
	await emit("message_update", { message: { role: "assistant", content: [{ type: "text", text: "z".repeat(4000) }], usage: { output: 1 } } }, ctx);
	const live = working.at(-1);
	await emit("message_end", { message: answer(11, 1200) }, ctx);
	await emit("message_end", { message: { role: "toolResult", usage: { output: 9999 } } }, ctx);
	await emit("message_end", { message: answer(12, 300, "error") }, ctx);
	await emit("agent_end", { messages: [] }, ctx);
	const cleared = working.at(-1);
	await emit("agent_start", {}, ctx);  // nova tentativa automática do Pi logo depois do erro
	await emit("message_end", { message: answer(13, 500) }, ctx);
	await emit("agent_end", { messages: [] }, ctx);
	const final = ui.PINK.runOf.get(13);
	await emit("agent_start", {}, ctx);  // pedido novo depois de um final sem erro: contagem nova
	await emit("message_end", { message: answer(14, 7) }, ctx);
	await emit("agent_end", { messages: [] }, ctx);
	await emit("session_shutdown", { reason: "new" }, ctx);
	return { live, cleared, final: final?.output, fresh: ui.PINK.runOf.get(14)?.output, timerStopped: ui.PINK.run === undefined, events: Object.keys(handlers).length };
})();
// pink-natives.ts (card 1dfwh7kffk2): ferramentas opcionais com um pi falso, sem rede nem binários
out.natives = await (async () => {
	const nativesFile = path.join(path.dirname(file), "pink-natives.ts");
	const nativesCopy = nativesFile.replace(/\.ts$/, ".driver.mjs");
	fs.copyFileSync(nativesFile, nativesCopy);
	const natives = await import(pathToFileURL(nativesCopy).href);
	fs.unlinkSync(nativesCopy);
	const bin = path.join(os.tmpdir(), "pink-fake-bin");
	const cwd = path.join(os.tmpdir(), "pink-fake-project");
	const here = path.join(os.tmpdir(), "pink-fake-pkg", "node_modules", "@thothdev", "pink", "extensions");
	const fakePi = (execResult) => {
		const handlers = {}, servers = {}, commands = {};
		const pi = {
			on: (name, fn) => (handlers[name] ??= []).push(fn),
			registerMcpServer: (name, config) => { servers[name] = config; },
			unregisterMcpServer: (name) => { delete servers[name]; },
			registerCommand: (name, spec) => { commands[name] = spec; },
			exec: async (cmd, args) => { if (execResult instanceof Error) throw execResult; return execResult(cmd, args); },
		};
		return { pi, handlers, servers, commands };
	};
	const every = (p) => /pink-fake-pkg[\\/]node_modules[\\/]@dietrichgebert[\\/]ponytail[\\/]package\.json$|rtk\.exe$|graphify-mcp\.exe$|graph\.json$/i.test(p);
	const env = (extra = {}) => ({ PATH: bin, PINK_CODING_AGENT_DIR: path.join(os.tmpdir(), "pink-fake-agent"), ...extra });
	const allOn = JSON.stringify({ ponytail: true, rtk: true, headroom: true, graphify: true });
	const readAll = () => allOn;
	const readNone = () => { throw new Error("ENOENT"); };
	const headroomServer = async () => ({ text: async () => 'event: message\ndata: {"result":{"serverInfo":{"name":"headroom-mcp","version":"1"}}}' });
	const otherServer = async () => ({ text: async () => '{"result":{"serverInfo":{"name":"something-else"}}}' });
	const loaded = [];
	const load = async (f) => { loaded.push(f); return { default: (pi) => pi.registerCommand("ponytail", {}) }; };
	const rewrite = async (_cmd, args) => ({ "git status": { code: 0, stdout: "rtk git status\n" }, "pytest -q": { code: 3, stdout: "rtk pytest -q" }, "rm -rf /": { code: 2, stdout: "", stderr: "denied by rule" } })[args[1]] ?? { code: 1, stdout: "" };
	const deps = (extra) => ({ env: env(), exists: every, fetcher: headroomServer, here, load, read: readAll, platform: "win32", write: () => {}, mkdir: () => {}, ...extra });
	const tool = async (handlers, command, toolName = "bash") => { const event = { toolName, input: { command } }; let out; for (const fn of handlers.tool_call ?? []) out = (await fn(event, {})) ?? out; return out?.block ? { blocked: out.reason } : event.input.command; };
	const session = async (handlers, ctx) => { for (const fn of handlers.session_start ?? []) await fn({}, ctx); };

	// tudo ligado
	const all = fakePi(rewrite);
	const allEnv = env();
	const started = await natives.natives(all.pi, deps({ env: allEnv }));
	await started.headroomDone;
	const beforeTrust = Object.keys(all.servers).sort();
	await session(all.handlers, { cwd, isProjectTrusted: () => true, mode: "print" });
	const trusted = JSON.parse(JSON.stringify({ servers: all.servers, report: started.report }));
	const skills = await all.handlers.resources_discover?.[0]?.({});
	const rtk = { git: await tool(all.handlers, "git status"), advisory: await tool(all.handlers, "pytest -q"), plain: await tool(all.handlers, "echo hi"), already: await tool(all.handlers, "rtk ls"), denied: await tool(all.handlers, "rm -rf /"), powershell: await tool(all.handlers, "git status", "powershell") };
	// pasta não confiável: o graphify não entra (e sai, se tinha entrado)
	await session(all.handlers, { cwd, isProjectTrusted: () => false, mode: "print" });
	const untrusted = Object.keys(all.servers).sort();

	// padrão de quem instala: tudo desligado, um aviso na TUI
	const fresh = fakePi(rewrite);
	const freshStart = await natives.natives(fresh.pi, deps({ read: readNone }));
	await freshStart.headroomDone;
	const freshNow = { report: { ...freshStart.report }, servers: Object.keys(fresh.servers), loads: loaded.length };
	const notes = [];
	await session(fresh.handlers, { cwd, isProjectTrusted: () => true, mode: "tui", ui: { notify: (text) => notes.push(text) } });
	const freshTool = await tool(fresh.handlers, "git status");

	// /ferramentas liga o RTK e o graphify e grava a escolha
	const written = [];
	const pickSeq = [1, 3, "Pronto"];
	await fresh.commands.ferramentas.handler("", { cwd, isProjectTrusted: () => true, ui: { notify: () => {}, select: async (_title, rows) => { const next = pickSeq.shift(); return typeof next === "number" ? rows[next] : next; } } });
	const afterMenuTool = await tool(fresh.handlers, "git status");

	// outro programa na 8789, rtk quebrado, PINK_RTK=0, .cmd no Windows
	const other = fakePi(rewrite);
	const otherStart = await natives.natives(other.pi, deps({ fetcher: otherServer }));
	await otherStart.headroomDone;
	const broken = fakePi(new Error("rtk sumiu"));
	await natives.natives(broken.pi, deps({}));
	const off = fakePi(rewrite);
	await natives.natives(off.pi, deps({ env: env({ PINK_RTK: "0" }) }));
	const menuWrites = fakePi(rewrite);
	await natives.natives(menuWrites.pi, deps({ read: readNone, write: (f, text) => written.push([f, JSON.parse(text)]) }));
	await menuWrites.commands.ferramentas.handler("", { cwd, ui: { notify: () => {}, select: async (_t, rows) => (written.length ? "Pronto" : rows[0]) } });

	// revisão 2 do Argus: o rtk roda pelo caminho absoluto (nunca o nome solto, que no Windows acharia um rtk.exe da pasta do projeto)
	const execs = [];
	const abs = fakePi(async (cmd, args) => { execs.push(cmd); return rewrite(cmd, args); });
	await natives.natives(abs.pi, deps({}));
	await tool(abs.handlers, "git status");
	const relativePath = natives.onPath("rtk", { PATH: `.;bin;${bin}` }, (p) => p.toLowerCase().endsWith("rtk.exe"), "win32") ?? null;
	const onlyRelative = natives.onPath("rtk", { PATH: ".;bin" }, () => true, "win32") ?? null;
	// menu: um jeito de responder a select em sequência
	const menu = (picks, notes = []) => ({ cwd, isProjectTrusted: () => true, ui: { notify: (text, level) => notes.push([level, text]), select: async (_t, rows) => { const next = picks.shift(); return typeof next === "number" ? rows[next] : next; } } });
	// Headroom desligado antes de a sonda do início voltar: a resposta atrasada não registra
	let releaseProbe;
	let probes = 0;
	const slowFetch = (...args) => (probes++ === 0 ? new Promise((resolve) => { releaseProbe = () => resolve(headroomServer(...args)); }) : headroomServer(...args));
	const race = fakePi(rewrite);
	const raceStart = await natives.natives(race.pi, deps({ fetcher: slowFetch }));
	await race.commands.ferramentas.handler("", menu([2, "Pronto"]));
	releaseProbe();
	await raceStart.headroomDone;
	// Headroom desliga e liga pelo menu; ligado com ele fora do ar avisa; graphify sai pelo menu; Esc sai; erro ao salvar aparece
	const toggle = fakePi(rewrite);
	const toggleStart = await natives.natives(toggle.pi, deps({}));
	await toggleStart.headroomDone;
	await session(toggle.handlers, { cwd, isProjectTrusted: () => true, mode: "print" });
	await toggle.commands.ferramentas.handler("", menu([2, 3, "Pronto"]));
	const toggledOff = Object.keys(toggle.servers).sort();
	await toggle.commands.ferramentas.handler("", menu([2, "Pronto"]));
	const toggledOn = Object.keys(toggle.servers).sort();
	const downNotes = [];
	const down = fakePi(rewrite);
	await natives.natives(down.pi, deps({ read: readNone, fetcher: otherServer }));
	await down.commands.ferramentas.handler("", menu([2, "Pronto"], downNotes));
	const escRows = [];
	await toggle.commands.ferramentas.handler("", { cwd, ui: { notify: () => {}, select: async (_t, rows) => { escRows.push(rows.length); return undefined; } } });
	const failNotes = [];
	const failing = fakePi(rewrite);
	await natives.natives(failing.pi, deps({ read: readNone, write: () => { throw new Error("disco cheio"); } }));
	await failing.commands.ferramentas.handler("", menu([1, "Pronto"], failNotes));
	const failTool = await tool(failing.handlers, "git status");
	const argus2 = {
		execs, relativePath, onlyRelative, raceServers: Object.keys(race.servers), raceReport: raceStart.report.headroom,
		toggledOff, toggledOn, downNotes, downServers: Object.keys(down.servers), escRows, failNotes, failTool,
	};
	return {
		argus2,
		trusted, beforeTrust, untrusted, untrustedReport: started.report.graphify, commands: Object.keys(all.commands).sort(), loaded: loaded[0], skills, quiet: allEnv.PONYTAIL_QUIET_STARTUP, rtk,
		fresh: freshNow, notes, freshTool, afterMenuTool, freshAfter: Object.keys(fresh.servers).sort(),
		otherHeadroom: Object.keys(other.servers).includes("headroom"), failOpen: await tool(broken.handlers, "git status"), rtkOff: await tool(off.handlers, "git status"),
		saved: written[0] ? { file: written[0][0], choices: written[0][1] } : null,
		cmdShim: natives.onPath("rtk", { PATH: bin }, (p) => p.toLowerCase().endsWith("rtk.cmd"), "win32") ?? null,
		posix: natives.onPath("rtk", { PATH: "/usr/bin:/opt/bin" }, (p) => p === path.join("/opt/bin", "rtk"), "linux") ?? null,
		quoted: natives.onPath("rtk", { PATH: `"${bin}"` }, (p) => p.toLowerCase().endsWith("rtk.exe"), "win32") !== undefined,
		found: natives.findPackage(here, "@dietrichgebert/ponytail", every), lost: natives.findPackage(here, "@dietrichgebert/ponytail", () => false) ?? null,
	};
})();
// a pink-ui e o Ponytail no mesmo before_agent_start: nenhum força o prompt, as duas seções chegam (achado 1 do Argus)
out.prompt = await (async () => {
	const handlers = [];
	ui.default({ on: (name, fn) => name === "before_agent_start" && handlers.push(fn) });
	handlers.push(async (event) => { event.systemPromptOptions.sections.ponytail = "LAZY"; });
	const event = { systemPrompt: "BASE", systemPromptOptions: { sections: {} } };
	const results = [];
	for (const fn of handlers) results.push(await fn(event));
	return { forced: results.some((r) => r?.systemPrompt !== undefined), sections: Object.keys(event.systemPromptOptions.sections).sort(), language: event.systemPromptOptions.sections.pink_language === ui.LANGUAGE_PROMPT.trim() };
})();
// pink-permissions.ts (card 1dfwh7kfmqp): regras allow/ask/deny e o padrão do Pink, com um pi falso
out.permissions = await (async () => {
	const permFile = path.join(path.dirname(file), "pink-permissions.ts");
	const permCopy = permFile.replace(/\.ts$/, ".driver.mjs");
	fs.copyFileSync(permFile, permCopy);
	const perm = await import(pathToFileURL(permCopy).href);
	fs.unlinkSync(permCopy);
	const cwd = path.join(os.tmpdir(), "pink-fake-project");
	const agent = path.join(os.tmpdir(), "pink-fake-agent-perm");
	const make = (files, { hasUI = false, trusted = true, pick = "Negar" } = {}) => {
		const handlers = {}, commands = {}, asked = [];
		const pi = { on: (name, fn) => (handlers[name] ??= []).push(fn), registerCommand: (name, spec) => { commands[name] = spec; } };
		const read = (f) => { if (f in files) return files[f]; throw new Error("ENOENT"); };
		perm.permissions(pi, { env: { PINK_CODING_AGENT_DIR: agent }, read });
		const ctx = { cwd, hasUI, isProjectTrusted: () => trusted, ui: { select: async (q, opts) => { asked.push(opts); return pick; }, notify: () => {} } };
		const call = async (toolName, input) => (await handlers.tool_call[0]({ toolName, input }, ctx)) ?? "ok";
		return { call, asked, commands };
	};
	const user = path.join(agent, "permissions.json"), project = path.join(cwd, ".pink", "permissions.json");
	const bare = make({});
	const rules = make({ [user]: JSON.stringify({ allow: ["bash(rm -rf node_modules)"], deny: ["bash(curl*)", "read(.env*)"] }), [project]: JSON.stringify({ ask: ["bash(git push*)"] }) });
	const untrusted = make({ [project]: JSON.stringify({ allow: ["write(.env)"] }) }, { trusted: false });
	const ui = make({}, { hasUI: true, pick: "Permitir nesta sessão" });
	const firstUi = await ui.call("bash", { command: "rm -rf build" });
	const secondUi = await ui.call("bash", { command: "rm -rf build" });
	return {
		headless: {
			rm: await bare.call("bash", { command: "rm -rf build" }), ls: await bare.call("bash", { command: "ls -la" }),
			ps: await bare.call("powershell", { command: "Remove-Item -Recurse -Force dist" }), env: await bare.call("write", { path: ".env" }),
			git: await bare.call("edit", { path: path.join(cwd, ".git", "config") }), src: await bare.call("write", { path: "src/a.ts" }), readEnv: await bare.call("read", { path: ".env" }),
		},
		rules: {
			allowed: await rules.call("bash", { command: "rm -rf node_modules" }), curl: await rules.call("bash", { command: "curl https://x" }),
			readEnv: await rules.call("read", { path: ".env.local" }), push: await rules.call("bash", { command: "git push gitea master" }),
		},
		untrustedEnv: await untrusted.call("write", { path: ".env" }),
		ui: { firstUi, secondUi, asked: ui.asked.length, options: ui.asked[0] },
		edges: await (async () => {
			const r = make({ [user]: JSON.stringify({ allow: ["bash(npm test*)"], deny: ["bash(curl*)", "grep", "mcp__thoth-x", "bash(git push*)"] }) });
			const broken = make({ [user]: "{nope" });
			// o RTK do pink-natives carregado depois reescreve o comando: as permissões, em primeiro, já decidiram sobre o original
			const rtkFirst = make({ [user]: JSON.stringify({ deny: ["bash(git push*)"] }) });
			return {
				allowCompound: await r.call("bash", { command: "npm test; rm -rf /" }), denyCompound: await r.call("bash", { command: "cd x && curl evil" }),
				denyNewline: await r.call("bash", { command: "ls\ncurl http://x" }), denySudoPath: await r.call("bash", { command: "sudo /usr/bin/curl x" }),
				otherTool: await r.call("grep", { pattern: "x" }), mcpName: await r.call("mcp__thoth-x", {}),
				rmFR: await bare.call("bash", { command: "rm -f -R dir" }), gitC: await bare.call("bash", { command: "git -C repo push -f" }),
				gitFu: await bare.call("bash", { command: "git push -fu origin main" }), plusRef: await bare.call("bash", { command: "git push origin +main" }),
				rdQS: await bare.call("powershell", { command: "rd /q /s build" }), ruffFormat: await bare.call("bash", { command: "ruff format . && npm run format" }),
				fooEnv: await bare.call("write", { path: "config/foo.env" }), atEnv: await bare.call("write", { path: "@.env" }),
				brokenHeadless: await broken.call("read", { path: "a.txt" }),
				afterRtk: await rtkFirst.call("bash", { command: "git push gitea master" }),
				sudoLs: await bare.call("bash", { command: "sudo ls" }), bashC: await bare.call("bash", { command: 'bash -c "rm -rf x"' }),
				envRm: await bare.call("bash", { command: "env X=1 rm -rf y" }), quotedRm: await bare.call("bash", { command: '"rm" -rf x' }),
				varRm: await bare.call("bash", { command: "X=1 rm -rf y" }), xargsRm: await bare.call("bash", { command: "ls | xargs rm -r" }),
				cmdRd: await bare.call("powershell", { command: "cmd /c rd /s build" }), wrappedCurl: await r.call("bash", { command: "sh -c 'curl x'" }),
				allowRedirect: await make({ [user]: JSON.stringify({ allow: ["bash(npm test*)"] }) }).call("bash", { command: "npm test 2>&1" }),
				sudoAllowed: await r.call("bash", { command: "sudo npm test" }),
				ownHooks: await bare.call("write", { path: ".pink/hooks.json" }), ownRules: await bare.call("edit", { path: ".pink/permissions.json" }),
				agentHooks: await bare.call("write", { path: path.join(agent, "hooks.json") }),
			};
		})(),
		bad: perm.loadRules(["x.json"], () => "{nope").errors.length,
		command: Object.keys(bare.commands),
	};
})();
// pink-hooks.ts (card 1dfwh7kfmqq): hooks.json com comandos de verdade (node -e)
out.hooks = await (async () => {
	const hooksFile = path.join(path.dirname(file), "pink-hooks.ts");
	const hooksCopy = hooksFile.replace(/\.ts$/, ".driver.mjs");
	fs.copyFileSync(hooksFile, hooksCopy);
	const h = await import(pathToFileURL(hooksCopy).href);
	fs.unlinkSync(hooksCopy);
	// card 1dfwh7kg7r1: a queda deixa a causa em crash.log; saída normal (código 0) não escreve nada
	const crashDir = path.join(os.tmpdir(), "pink-crash-agent");
	fs.rmSync(crashDir, { recursive: true, force: true });
	const on = {}, proc = { pid: 7, platform: "win32", report: {}, on: (name, fn) => { on[name] = fn; } };
	const crashFile = h.installCrashLog({ PINK_CODING_AGENT_DIR: crashDir }, proc);
	on.exit(0);
	on.SIGINT();  // Ctrl+C do console no Windows: registrado, não derruba
	on.uncaughtExceptionMonitor(new Error("boom"), "uncaughtException");
	on.exit(3);
	const crashText = fs.readFileSync(crashFile, "utf8");
	const crashFacts = { sigint: crashText.includes("SIGINT do console ignorado"), sigbreak: typeof on.SIGBREAK === "function", boom: crashText.includes("uncaughtException: Error: boom"), code: crashText.includes("exit code=3"), report: proc.report, once: h.installCrashLog({}, proc) === crashFile };
	fs.rmSync(crashDir, { recursive: true, force: true });
	const agent = path.join(os.tmpdir(), "pink-hooks-agent")	, cwd = path.join(os.tmpdir(), "pink-hooks-proj");
	fs.mkdirSync(path.join(cwd, ".pink"), { recursive: true });
	const node = JSON.stringify(process.execPath);
	const user = path.join(agent, "hooks.json"), project = path.join(cwd, ".pink", "hooks.json");
	const files = {
		[user]: JSON.stringify({
			PreToolUse: [
				{ matcher: "bash", hooks: [{ type: "command", command: `${node} -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(j.tool_input.command.includes('proibido')){console.error('nao pode');process.exit(2)}})"` }] },
				{ matcher: "write", command: `${node} -e "console.log(JSON.stringify({decision:'block',reason:'json diz nao'}))"` },
				{ matcher: "read", command: `${node} -e "setTimeout(()=>{},10000)"`, timeout: 1 },
			{ matcher: "edit", command: `${node} -e "console.log(JSON.stringify({hookSpecificOutput:{permissionDecision:'deny',permissionDecisionReason:'formato novo'}}))"` },
			],
			PostToolUse: [{ matcher: "bash", command: `${node} -e "console.error('lint achou 2');process.exit(2)"` }],
			SessionStart: [{ command: `${node} -e "console.log('contexto do hook')"` }],
			Stop: [{ command: `${node} -e "require('fs').writeFileSync(process.env.PINK_PROJECT_DIR+'/stop.txt','ok')"` }],
		}),
		[project]: JSON.stringify({ PreToolUse: [{ command: `${node} -e "process.exit(2)"` }] }),
	};
	const make = (trusted) => {
		const handlers = {}, notes = [];
		const pi = { on: (n, fn) => (handlers[n] ??= []).push(fn), registerCommand: () => {} };
		h.hooksExtension(pi, { env: { ...process.env, PINK_CODING_AGENT_DIR: agent }, read: (f) => { if (f in files) return files[f]; throw new Error("ENOENT"); } });
		const ctx = { cwd, hasUI: true, isProjectTrusted: () => trusted, ui: { notify: (t) => notes.push(t) } };
		const ev = async (name, e) => (await handlers[name][0](e, ctx)) ?? "ok";
		return { ev, notes };
	};
	const u = make(false), t = make(true);
	try { fs.unlinkSync(path.join(cwd, "stop.txt")); } catch {}
	const t0 = Date.now();
	const out = {
		blockExit2: await u.ev("tool_call", { toolName: "bash", input: { command: "echo proibido" } }),
		passBash: await u.ev("tool_call", { toolName: "bash", input: { command: "ls" } }),
		blockJson: await u.ev("tool_call", { toolName: "write", input: { path: "a" } }),
		timeoutRead: await u.ev("tool_call", { toolName: "read", input: { path: "a" } }),
		timeoutMs: Date.now() - t0,
		timeoutNote: u.notes.some((n) => n.includes("foi parado")),
		untrustedGrep: await u.ev("tool_call", { toolName: "grep", input: {} }),
		trustedGrep: await t.ev("tool_call", { toolName: "grep", input: {} }),
		post: await u.ev("tool_result", { toolName: "bash", input: {}, content: [{ type: "text", text: "saida" }] }),
		crashLog: crashFacts,
	};
	await u.ev("session_start", { reason: "startup" });
	const first = { systemPromptOptions: { sections: {} } }, second = { systemPromptOptions: { sections: {} } };
	await u.ev("before_agent_start", first);
	await u.ev("before_agent_start", second);
	out.context = first.systemPromptOptions.sections.pink_hooks_session;
	out.contextAgain = second.systemPromptOptions.sections.pink_hooks_session === out.context;
	await u.ev("agent_settled", { aborted: false });
	out.stop = fs.existsSync(path.join(cwd, "stop.txt"));
	out.newFormat = await u.ev("tool_call", { toolName: "edit", input: { path: "a" } });
	const childHandlers = {};
	h.hooksExtension({ on: (n, fn) => (childHandlers[n] ??= []).push(fn), registerCommand: () => {} }, { env: { PINK_SUBAGENT: "1", PINK_CODING_AGENT_DIR: agent }, read: () => { throw new Error("ENOENT"); } });
	out.childEvents = Object.keys(childHandlers).sort();
	return out;
})();
// pink-notify.ts (card 1dfwh7kfmqr): foco pelo terminal, comando por sistema, liga/desliga
out.notify = await (async () => {
	const nFile = path.join(path.dirname(file), "pink-notify.ts");
	const nCopy = nFile.replace(/\.ts$/, ".driver.mjs");
	fs.copyFileSync(nFile, nCopy);
	const n = await import(pathToFileURL(nCopy).href);
	fs.unlinkSync(nCopy);
	const make = (env = {}, saved) => {
		const handlers = {}, commands = {}, writes = [], runs = [], written = [];
		let input, clock = 0;
		const pi = { on: (name, fn) => (handlers[name] ??= []).push(fn), registerCommand: (name, spec) => { commands[name] = spec; } };
		n.notifyExtension(pi, { env: { PINK_CODING_AGENT_DIR: path.join(os.tmpdir(), "pink-notify-agent"), ...env }, platform: "win32", now: () => clock,
			read: () => { if (saved === undefined) throw new Error("ENOENT"); return saved; }, write: (f, t) => written.push(t), mkdir: () => {},
			out: { write: (s) => writes.push(s) }, run: (bin, args) => runs.push([bin, args.at(-1).includes("ToastNotificationManager")]) });
		const ctx = { mode: "tui", cwd: path.join(os.tmpdir(), "meu-projeto"), ui: { onTerminalInput: (fn) => { input = fn; return () => { input = undefined; }; }, notify: () => {} } };
		const ev = (name, e = {}) => handlers[name]?.[0]?.(e, ctx);
		return { ev, writes, runs, written, commands, ctx, type: (s) => input?.(s), tick: (ms) => { clock += ms; }, hasInput: () => Boolean(input) };
	};
	const run = async (x, { blur, ms = 1000, aborted = false } = {}) => {
		await x.ev("agent_start");
		if (blur !== undefined) x.type(blur ? "\x1b[O" : "\x1b[I");
		x.tick(ms);
		await x.ev("agent_settled", { aborted });
		return x.runs.length;
	};
	const a = make();
	await a.ev("session_start");
	const unknownShort = await run(a, { ms: 1000 }), unknownLong = await run(a, { ms: 25_000 });
	const consumed = a.type("\x1b[O"), mixed = a.type("ab\x1b[Ic");
	const focusedRun = await run(a, { blur: false, ms: 60_000 }), blurredRun = await run(a, { blur: true }), abortedRun = await run(a, { blur: true, aborted: true });
	await a.commands.notificacoes.handler("", a.ctx);
	const offRun = await run(a, { blur: true });
	const before = a.runs.length;
	await a.commands.sugestao.handler("modo escuro & ; rm -rf", a.ctx);
	const idea = { opener: a.runs.length - before === 1 ? a.runs.at(-1)[0] : null, url: n.ideaUrl("modo escuro & ; rm -rf"), empty: n.ideaUrl("   ") };
	await a.ev("session_shutdown");
	const offFile = make({}, JSON.stringify({ on: false }));
	await offFile.ev("session_start");
	const envOff = make({ PINK_NOTIFY: "0" });
	await envOff.ev("session_start");
	const child = make({ PINK_SUBAGENT: "1" });
	const print = make();
	print.ctx.mode = "print";
	await print.ev("session_start");
	return {
		idea, modes: [a.writes[0], a.writes.at(-1)], unknownShort, unknownLong, consumed, mixed, focusedRun, blurredRun, abortedRun, toast: a.runs[0],
		saved: a.written[0], offRun, offFile: await run(offFile, { blur: true }), envOff: await run(envOff, { blur: true }),
		child: Object.keys(child.commands).length, print: print.hasInput() || print.writes.length,
		mac: n.notifyCommand("Pink", "ok", { platform: "darwin", env: {} })[0], linux: n.notifyCommand("Pink", "ok", { platform: "linux", env: {}, has: (b) => b === "notify-send" })[0],
		osc: n.notifyCommand("Pink", "a;b", { platform: "linux", env: {} }).osc, injection: (() => { const [, args, env] = n.notifyCommand("Pink", "x\u2019;calc;\u2019 $(y) <b>", { platform: "win32", env: {} }); return !args.join(" ").includes("calc") && env.PINK_TOAST_BODY === "x\u2019 calc \u2019 $(y) <b>"; })(),
		oscControls: n.notifyCommand("Pink", "a;b\x9c\rc", { platform: "linux", env: {} }).osc,
	};
})();
// pink-web.ts (card 1dfwh7kfmqy): busca hospedada só na OpenAI; web_search/web_fetch locais com fetch falso
out.web = await (async () => {
	const wFile = path.join(path.dirname(file), "pink-web.ts");
	const wCopy = wFile.replace(/\.ts$/, ".driver.mjs");
	fs.copyFileSync(wFile, wCopy);
	const w = await import(pathToFileURL(wCopy).href);
	fs.unlinkSync(wCopy);
	const page = (body, { status = 200, type = "text/html; charset=utf-8", url = "https://ex.com/p" } = {}) => async () => ({ ok: status < 400, status, url, headers: new Headers({ "content-type": type }), body: new Blob([body]).stream(), text: async () => body });
	const handlers = {}, tools = {};
	w.webExtension({ on: (name, fn) => (handlers[name] ??= []).push(fn), registerTool: (t) => { tools[t.name] = t; } }, { env: {}, fetchImpl: page("<html><title>T &amp; U</title><script>x()</script><p>Oi <b>mundo</b></p><a href=\"https://a.b/c\">link</a></html>") });
	const openai = { api: "openai-responses", provider: "openai", baseUrl: "https://api.openai.com/v1" };
	const req = (model, payload = { input: [] }) => handlers.before_provider_request[0]({ payload }, { model });
	const ddg = '<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fen&amp;rut=x">Node.js &mdash; Run</a><a class="result__snippet" href="x">O <b>runtime</b></a>'
		+ '<a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Anúncio</a>';
	const text = (r) => r.content[0].text;
	const fetched = await tools.web_fetch.execute("1", { url: "https://ex.com/p" });
	const big = await w.webFetch("https://ex.com/big", { fetchImpl: page("a".repeat(w.MAX_BYTES + 10), { type: "text/plain" }) });
	const slow = await w.webFetch("https://ex.com/slow", { fetchImpl: async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; } });
	return {
		tools: Object.values(tools).map((t) => [t.name, t.exposure, t.annotations.readOnlyHint]),
		hosted: req(openai).tools, kept: req(openai, { input: [], tools: [{ type: "function", name: "x" }, { type: "web_search" }] }).tools.length,
		gateway: req({ ...openai, provider: "thoth", baseUrl: "http://127.0.0.1:9999/v1" }), anthropic: req({ api: "anthropic-messages", provider: "anthropic" }),
		off: w.hostedSearch(openai, { PINK_WEB_HOSTED: "0" }),
		fetched: [fetched.isError ?? false, fetched.details.title, text(fetched).startsWith("Conteúdo de fora"), text(fetched).includes("Oi mundo"), text(fetched).includes("x()"), text(fetched).includes("link (https://a.b/c)")],
		file: (await w.webFetch("file:///etc/passwd")).isError, bad: (await w.webFetch("nada")).isError,
		binary: (await w.webFetch("https://ex.com/i.png", { fetchImpl: page("x", { type: "image/png" }) })).isError,
		notFound: text(await w.webFetch("https://ex.com/x", { fetchImpl: page("", { status: 404 }) })),
		big: [big.details.cut, big.details.chars], slow: text(slow),
		search: (await w.webSearch("node", { fetchImpl: page(ddg) })).details.results,
		captcha: text(await w.webSearch("node", { fetchImpl: page("<p>anomaly detected</p>") })), empty: (await w.webSearch("  ")).isError,
		offline: text(await w.webSearch("node", { fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND"); } })),
		// Argus: busca hospedada fora do minimal; null explícito no que fica intocado
		minimal: req(openai, { input: [], reasoning: { effort: "minimal" } }) ?? null, lookalike: req({ ...openai, baseUrl: "https://api.openai.com.evil.tld/v1" }) ?? null,
		gatewayNull: req({ ...openai, provider: "thoth", baseUrl: "http://127.0.0.1:9999/v1" }) ?? null,
		// timeout e cancelamento de verdade: o fetch falso só termina pelo signal
		...await (async () => {
			const hang = (_u, o) => new Promise((_r, reject) => o.signal.addEventListener("abort", () => reject(o.signal.reason)));
			const user = new AbortController();
			const keep = setInterval(() => {}, 1000); // o timer do AbortSignal.timeout não segura o processo sozinho
			const realTimeout = text(await w.webFetch("https://ex.com/h", { fetchImpl: hang, timeoutMs: 50 }));
			setTimeout(() => user.abort(), 30);
			const userAbort = text(await w.webFetch("https://ex.com/h", { fetchImpl: hang, signal: user.signal }));
			clearInterval(keep);
			return { realTimeout, userAbort };
		})(),
		hostile: (() => { const t0 = Date.now(); w.htmlToText("<script ".repeat(250_000) + '<a href="https://x">'.repeat(100_000) + "<".repeat(500_000)); return Date.now() - t0 < 3000; })(),
		metadata: text(await w.webFetch("http://169.254.169.254/latest/meta-data/")),
		redirectToMetadata: text(await w.webFetch("https://ex.com/r", { fetchImpl: async () => ({ ok: false, status: 302, url: "", headers: new Headers({ location: "http://metadata.google.internal/computeMetadata/v1/" }) }) })),
		redirected: (await w.webFetch("https://ex.com/r", { fetchImpl: async (u) => (u.endsWith("/r") ? { ok: false, status: 301, headers: new Headers({ location: "/final" }) } : page("<p>fim</p>")()) })).details.url,
		latin1: text(await w.webFetch("https://ex.com/l", { fetchImpl: page(new Uint8Array([0x61, 0xe7, 0xe3, 0x6f]), { type: "text/plain; charset=iso-8859-1" }) })).endsWith("ação"),
		dns: text(await w.webFetch("https://nao.existe/", { fetchImpl: async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); } })),
		entities: w.htmlToText("<p>&#225;&#xE9; &lt;b&gt; &bogus;</p><li>um</li><a href='https://s.q/x'>simples</a>").text,
		permissions: await (async () => {
			const pFile = path.join(path.dirname(file), "pink-permissions.ts");
			const pCopy = pFile.replace(/\.ts$/, ".webdriver.mjs");
			fs.copyFileSync(pFile, pCopy);
			const perm = await import(pathToFileURL(pCopy).href);
			fs.unlinkSync(pCopy);
			const rules = { allow: [], ask: [], deny: [] };
			const d = (url, r = rules) => perm.decide(r, "web_fetch", perm.targetOf("web_fetch", { url }, os.tmpdir())).action;
			return [d("https://docs.python.org/3/"), d("https://evil.tld/?d=" + "x".repeat(80)), d("https://evil.tld/", { ...rules, deny: ["web_fetch(https://evil.tld/*)"] })];
		})(),
	};
})();
console.log(JSON.stringify({ web: out.web, notify: out.notify, hooks: out.hooks, permissions: out.permissions, natives: out.natives, prompt: out.prompt, pink3: { compact: out.compact, thinking: out.thinking, stale: out.stale, language: out.language, rightModels: out.rightModels, sideAgents: out.sideAgents, dagAgents: out.dagAgents, thothInstalled: out.thothInstalled }, thoth: out.thoth, plan: out.plan, own: out.own, mcp: out.mcp, run: out.run, wiring: out.wiring }));
