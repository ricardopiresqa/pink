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

export function footerLine({ theme, width, left, right }) {
	const gap = Math.max(1, width - visible(left) - visible(right));
	return fit(`${left}${" ".repeat(gap)}${right}`, width);
}

const THINKING_PT = { minimal: "mínimo", low: "baixo", medium: "médio", high: "alto", xhigh: "muito alto", max: "máximo" };

// "thoth  thoth  off" dizia modelo, provedor e nível sem explicar nada: agora o nome do modelo, o provedor só quando é
// outro, e o pensamento só quando está ligado ("pensamento alto")
// como no OpenCode, o agente (Build/Plano) vem antes do modelo, na cor da marca
export function modelLabel({ theme, model, thinking, agent }) {
	const who = AGENTS[agent] ? `${theme.fg("accent", AGENTS[agent].label)}${theme.fg("muted", " · ")}` : "";
	if (!model) return `${who}${theme.fg("muted", "sem modelo")}`;
	const name = model.name || model.id;
	const provider = model.provider && model.provider !== model.id && model.provider !== name ? theme.fg("muted", ` · ${model.provider}`) : "";
	const level = THINKING_PT[thinking] ? theme.fg("muted", ` · pensamento ${THINKING_PT[thinking]}`) : "";
	return `${who}${name}${provider}${level}`;
}

export function hintsLine({ theme, width }) {
	return center(theme.fg("dim", "ctrl+p comandos   tab agente   @ arquivo   ! bash   ctrl+t pensamento   ctrl+c sair"), width);
}

// -- funções do OpenCode (owner 2026-10-28: "gosto muito do opencode, poderia replicar as funções dele")
// agentes: Build (padrão, tudo liberado) e Plano (só leitura: analisa e planeja, não edita), trocados com tab na caixa vazia
export const AGENTS = { build: { label: "Build" }, plan: { label: "Plano" } };
const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls", "todowrite", "tool_search"]);
export const PLAN_PROMPT = "\n\n# Modo Plano (Pink)\nVocê está no agente Plano: só leia, pesquise e planeje. Não edite nem crie arquivos e não rode comandos que mudem o projeto. Termine com um plano em passos; o usuário troca para o agente Build (tab) para executar.";

export function planDecision(toolName, annotations) {
	if (READ_ONLY_TOOLS.has(toolName) || annotations?.readOnlyHint === true) return "allow";
	return toolName === "bash" ? "ask" : "block";  // como o agente plan do OpenCode: edição negada, shell só com confirmação
}

// paleta de comandos (ctrl+p, como no OpenCode): os comandos do Pi com a descrição em português e os das extensões
export const BUILTIN_COMMANDS = [
	["new", "Nova sessão"], ["resume", "Trocar de sessão (lista as salvas)"], ["sessions", "Sessões desta pasta"], ["name", "Renomear a sessão"],
	["model", "Escolher o modelo"], ["thinking", "Nível de pensamento"], ["themes", "Escolher o tema"], ["settings", "Configurações"],
	["undo", "Desfazer a última mensagem e as mudanças nos arquivos"], ["redo", "Refazer o que o /undo desfez"],
	["plan", "Agente Plano (só leitura)"], ["build", "Agente Build (edita e roda comandos)"], ["todos", "Lista de tarefas do agente"],
	["compact", "Compactar o contexto"], ["tree", "Árvore da sessão"], ["fork", "Nova sessão a partir de uma mensagem"], ["clone", "Duplicar a sessão"],
	["copy", "Copiar a última resposta"], ["export", "Exportar a sessão (HTML ou JSONL)"], ["share", "Compartilhar a sessão"], ["session", "Dados da sessão"],
	["init", "Criar ou atualizar o AGENTS.md"], ["details", "Mostrar ou esconder a saída das ferramentas"], ["lateral", "Mostrar ou esconder a lateral"],
	["hotkeys", "Atalhos de teclado"], ["login", "Entrar num provedor"], ["logout", "Sair de um provedor"], ["mcp", "Servidores MCP"],
	["reload", "Recarregar extensões, temas e atalhos"], ["quit", "Sair do Pink"],
];

export function paletteItems(extensionCommands = []) {
	const seen = new Set(BUILTIN_COMMANDS.map(([name]) => name));
	const extra = extensionCommands.filter((command) => command?.name && !seen.has(command.name)).map((command) => [command.name, command.description || ""]);
	return [...BUILTIN_COMMANDS, ...extra].map(([name, description]) => `/${name}${description ? `  ${description}` : ""}`);
}

// lista de tarefas (a ferramenta todowrite do OpenCode): o agente escreve a lista inteira a cada mudança
const TODO_STATUS = new Set(["pending", "in_progress", "completed", "cancelled"]);
export function normalizeTodos(todos) {
	return (Array.isArray(todos) ? todos : []).map((item) => ({ content: String(item?.content ?? "").trim(), status: TODO_STATUS.has(item?.status) ? item.status : "pending" })).filter((item) => item.content);
}

export function todoLines({ theme, todos, width }) {
	const mark = { pending: theme.fg("dim", "○"), in_progress: theme.fg("accent", "◐"), completed: theme.fg("success", "✓"), cancelled: theme.fg("dim", "✗") };
	const done = todos.filter((item) => item.status === "completed").length;
	return [fit(`${theme.fg("text", "Tarefas")} ${theme.fg("muted", `${done}/${todos.length}`)}`, width),
		...todos.map((item) => fit(`  ${mark[item.status]} ${item.status === "completed" || item.status === "cancelled" ? theme.fg("dim", item.content) : theme.fg("text", item.content)}`, width))];
}

export function todosFromBranch(entries) {
	let todos = [];
	for (const entry of entries ?? []) {
		const message = entry?.type === "message" ? entry.message : undefined;
		if (message?.role === "toolResult" && message.toolName === "todowrite" && message.details?.todos) todos = normalizeTodos(message.details.todos);
	}
	return todos;
}

// /undo e /redo como no OpenCode: voltam a conversa E os arquivos. Os arquivos vão para um índice do Git só do Pink
// (GIT_INDEX_FILE à parte): o índice, o HEAD e o stash do usuário não mudam; arquivos ignorados pelo .gitignore ficam de fora.
export function lastUserEntry(branch) {
	return [...(branch ?? [])].reverse().find((entry) => entry?.type === "message" && entry.message?.role === "user");
}

export function parseNameStatus(text) {
	const parts = String(text ?? "").split("\0").filter((part) => part !== "");
	const out = [];
	for (let i = 0; i + 1 < parts.length; i += 2) out.push({ status: parts[i][0], path: parts[i + 1] });
	return out;
}

function node(name) {
	return process.getBuiltinModule?.(name);
}

export function runGit(args, { cwd, env } = {}) {
	return new Promise((resolve) => {
		node("node:child_process").execFile("git", args, { cwd, env: env ? { ...process.env, ...env } : process.env, maxBuffer: 64 << 20, windowsHide: true }, (error, stdout) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout ?? "") }));
	});
}

// o arquivo volta byte a byte: sem converter fim de linha (core.autocrlf=true no Windows trocava LF por CRLF)
const RAW = ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false"];

export async function gitSnapshot(cwd, run = runGit) {
	const top = (await run(["rev-parse", "--show-toplevel"], { cwd })).stdout.trim();
	if (!top) return undefined;  // fora de um repositório Git não há como desfazer arquivos (no OpenCode também é assim)
	const path = node("node:path");
	// índice próprio, guardado entre execuções (a segunda foto só relê o que mudou); nunca o índice do usuário
	// e objetos próprios (o repositório entra só como leitura, por alternates): a foto não suja o .git do projeto
	const base = path.join(node("node:os").tmpdir(), `pink-undo-${node("node:crypto").createHash("sha1").update(top.toLowerCase()).digest("hex").slice(0, 12)}`);
	const objects = path.resolve(top, (await run(["rev-parse", "--git-path", "objects"], { cwd: top })).stdout.trim() || ".git/objects");
	const store = { GIT_OBJECT_DIRECTORY: `${base}.objects`, GIT_ALTERNATE_OBJECT_DIRECTORIES: objects };
	node("node:fs").mkdirSync(store.GIT_OBJECT_DIRECTORY, { recursive: true });
	const env = { ...store, GIT_INDEX_FILE: `${base}.idx` };
	if ((await run([...RAW, "add", "-A", "--", "."], { cwd: top, env })).code !== 0) return undefined;
	const tree = (await run(["write-tree"], { cwd: top, env })).stdout.trim();
	return tree ? { top, tree, store } : undefined;
}

export async function gitRestore(snapshot, run = runGit) {
	const now = await gitSnapshot(snapshot.top, run);
	if (!now) return undefined;
	const changes = parseNameStatus((await run(["diff-tree", "-r", "--no-renames", "--name-status", "-z", snapshot.tree, now.tree], { cwd: snapshot.top, env: now.store })).stdout);
	const path = node("node:path");
	const fs = node("node:fs");
	const inside = (file) => {
		const full = path.resolve(snapshot.top, file);
		return full.toLowerCase().startsWith(path.resolve(snapshot.top).toLowerCase() + path.sep) ? full : undefined;
	};
	const back = changes.filter((change) => change.status !== "A").map((change) => change.path);
	const created = changes.filter((change) => change.status === "A").map((change) => change.path);
	if (back.length) {
		const env = { ...now.store, GIT_INDEX_FILE: path.join(node("node:os").tmpdir(), `pink-undo-restore-${process.pid}.idx`) };
		await run(["read-tree", snapshot.tree], { cwd: snapshot.top, env });
		for (let i = 0; i < back.length; i += 100) await run([...RAW, "checkout-index", "-f", "--", ...back.slice(i, i + 100)], { cwd: snapshot.top, env });
	}
	for (const file of created) {
		const full = inside(file);
		if (full) fs.rmSync(full, { force: true });  // só o que nasceu depois do ponto restaurado, e só dentro do repositório
	}
	return { now, changed: back.length + created.length };
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
	if (data.todos?.length) out.push(...todoLines({ theme, todos: data.todos, width: w }), "");
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

export function install(pi, ctx, { CustomEditor, version = "", matchesKey, onPalette, onAgent }) {
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

		// ctrl+p abre a paleta e tab com a caixa vazia troca o agente (OpenCode); o resto segue para o editor do Pi
		handleInput(data) {
			if (matchesKey?.(data, "ctrl+p") && onPalette) return void onPalette();
			if (matchesKey?.(data, "tab") && onAgent && !String(this.getText?.() ?? "").trim()) return void onAgent();
			super.handleInput(data);
		}

		render(width) {
			const outer = state.home ? Math.min(width, HOME_WIDTH) : width;
			const margin = state.home ? Math.floor((width - outer) / 2) : 0;
			const raw = super.render(Math.max(1, outer - 2));
			const content = raw.length >= 3 ? raw.slice(1, -1) : raw; // the built-in editor draws its own top and bottom borders
			const theme = ctx.ui.theme;
			const label = modelLabel({ theme, model: ctx.model, thinking: pi.getThinkingLevel?.(), agent: PINK.agent });
			const lines = inputBox({ theme, content, width: outer, label }).map((line) => " ".repeat(margin) + line);
			if (!state.home) return lines;
			const rows = state.tui?.terminal?.rows ?? 24;
			const body = [...lines, "", hintsLine({ theme, width })];
			return [...body, ...Array(homeBottomPad(rows, homeTop(rows) + HEADER_BODY, body.length)).fill("")];
		}
	}

	// pensamento atrás de um título, como no OpenCode: recolhido por padrão; o Pi 1.x abre e recolhe cada bloco com um clique,
	// ctrl+t abre e recolhe todos (e salva); o título do bloco aberto vem do patch thinking-header-when-shown
	ctx.ui.setHiddenThinkingLabel?.("▸ Pensamento · clique ou ctrl+t para ver");
	globalThis.__pinkThinkingHeader = "▾ Pensamento · clique ou ctrl+t para recolher";
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
				model: modelLabel({ theme, model: ctx.model, thinking: pi.getThinkingLevel?.(), agent: PINK.agent }),
				todos: PINK.todos,
				project,
				tools: pi.getActiveTools?.() ?? [],
				folder: tilde(ctx.cwd),
				branch: state.branch,
				version,
			} });
		},
		invalidate() {},
	};
	// tarefas sobre a caixa de digitar quando a lateral não cabe (com a lateral, elas aparecem nela)
	ctx.ui.setWidget?.("pink-tarefas", (tui, theme) => ({
		render: (width) => (!PINK.todos.some((item) => item.status === "pending" || item.status === "in_progress") || globalThis.__pinkSidebar.visible({ width: tui.terminal?.columns ?? width }) ? [] : todoLines({ theme, todos: PINK.todos, width })),
		invalidate() {},
	}));
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

// estado das funções do OpenCode, compartilhado entre os comandos e a interface
export const PINK = { agent: "build", todos: [], snapshots: new Map(), redo: [] };

function userText(entry) {
	const content = entry?.message?.content;
	return Array.isArray(content) ? content.filter((part) => part?.type === "text").map((part) => part.text).join("\n") : String(content ?? "");
}

async function openPalette(pi, ctx) {
	const choice = await ctx.ui.select?.("Comandos  (Enter coloca na caixa de digitar)", paletteItems(pi.getCommands?.() ?? []));
	if (choice) ctx.ui.setEditorText?.(choice.split("  ")[0]);
}

function switchAgent(ctx, next = PINK.agent === "build" ? "plan" : "build") {
	PINK.agent = next;
	ctx.ui?.notify?.(next === "plan" ? "Agente Plano: só leitura (tab volta ao Build)" : "Agente Build: edita e roda comandos", "info");
}

export const INIT_PROMPT = "Analise este repositório e crie o arquivo AGENTS.md na raiz (ou atualize, se já existir, sem perder o que vale). Inclua, de forma concisa: os comandos de build, teste e lint (e como rodar um único teste), a arquitetura em alto nível e as convenções de código que um agente precisa seguir. Não invente o que não estiver no repositório.";

function registerOpenCodeFunctions(pi) {
	const command = (name, description, handler) => pi.registerCommand?.(name, { description, handler });
	command("plan", "Agente Plano: só lê e planeja, não edita (tab troca)", async (_args, ctx) => switchAgent(ctx, "plan"));
	command("build", "Agente Build: edita e roda comandos (tab troca)", async (_args, ctx) => switchAgent(ctx, "build"));
	command("help", "Paleta de comandos (ctrl+p)", async (_args, ctx) => openPalette(pi, ctx));
	command("details", "Mostra ou esconde a saída das ferramentas (ctrl+o)", async (_args, ctx) => ctx.ui.setToolsExpanded?.(!ctx.ui.getToolsExpanded?.()));
	command("init", "Cria ou atualiza o AGENTS.md do projeto", async () => pi.sendUserMessage?.(INIT_PROMPT));
	command("themes", "Escolhe o tema (fica salvo)", async (_args, ctx) => {
		const name = await ctx.ui.select?.("Temas", (ctx.ui.getAllThemes?.() ?? []).map((theme) => theme.name));
		if (!name) return;
		const done = ctx.ui.setTheme?.(name);
		ctx.ui.notify?.(done?.success ? `Tema ${name}` : `Tema ${name} não carregou: ${done?.error ?? "?"}`, done?.success ? "info" : "error");
	});
	command("sessions", "Lista as sessões desta pasta e troca de sessão", async (_args, ctx) => {
		const { SessionManager } = await import("@earendil-works/pi-coding-agent");
		const list = (await SessionManager.list(ctx.cwd)).sort((a, b) => b.modified - a.modified).slice(0, 40);
		if (!list.length) return void ctx.ui.notify?.("Nenhuma sessão salva nesta pasta", "info");
		const labels = list.map((item, i) => `${i + 1}. ${String(item.name || item.firstMessage || "(sem título)").replace(/\s+/g, " ").slice(0, 60)}  · ${new Date(item.modified).toLocaleString("pt-BR")}`);
		const choice = await ctx.ui.select?.("Sessões", labels);
		if (choice) await ctx.switchSession(list[labels.indexOf(choice)].path);
	});
	command("todos", "Mostra a lista de tarefas do agente", async (_args, ctx) => {
		const lines = PINK.todos.length ? todoLines({ theme: ctx.ui.theme, todos: PINK.todos, width: 100 }) : ["Sem tarefas nesta sessão"];
		ctx.ui.notify?.(lines.join("\n"), "info");
	});
	command("undo", "Desfaz a última mensagem, as respostas e as mudanças nos arquivos", async (_args, ctx) => {
		await ctx.waitForIdle?.();
		const user = lastUserEntry(ctx.sessionManager.getBranch());
		if (!user) return void ctx.ui.notify?.("Nada para desfazer", "info");
		const leaf = ctx.sessionManager.getLeafId();
		const snapshot = PINK.snapshots.get(user.id);
		if ((await ctx.navigateTree(user.id))?.cancelled) return;
		const restored = snapshot ? await gitRestore(snapshot) : undefined;
		PINK.redo.push({ leaf, files: restored?.now });
		ctx.ui.setEditorText?.(userText(user));
		ctx.ui.notify?.(restored ? `Desfeito: conversa e ${restored.changed} arquivo(s). /redo refaz` : "Desfeito: conversa (arquivos sem ponto salvo: fora do Git ou de antes desta execução do Pink). /redo refaz", "info");
	});
	command("redo", "Refaz o que o /undo desfez, com os arquivos", async (_args, ctx) => {
		await ctx.waitForIdle?.();
		const item = PINK.redo.pop();
		if (!item) return void ctx.ui.notify?.("Nada para refazer", "info");
		if (item.leaf && (await ctx.navigateTree(item.leaf))?.cancelled) return void PINK.redo.push(item);
		const restored = item.files ? await gitRestore(item.files) : undefined;
		ctx.ui.setEditorText?.("");
		ctx.ui.notify?.(restored ? `Refeito: conversa e ${restored.changed} arquivo(s)` : "Refeito: conversa", "info");
	});
	// ponto de restauração dos arquivos antes de cada mensagem (só na TUI, só num repositório Git)
	pi.on("agent_start", async (_event, ctx) => {
		const leaf = ctx.sessionManager?.getLeafEntry?.();
		if (ctx.mode !== "tui" || leaf?.type !== "message" || leaf.message?.role !== "user") return;
		PINK.redo.length = 0;
		// shortcut: os pontos ficam na memória do processo; depois de reabrir a sessão, o /undo volta só a conversa
		const snapshot = await gitSnapshot(ctx.cwd).catch(() => undefined);
		if (snapshot) PINK.snapshots.set(leaf.id, snapshot);
	});
	pi.on("tool_call", async (event, ctx) => {
		if (PINK.agent !== "plan") return;
		const decision = planDecision(event.toolName, pi.getAllTools?.().find((tool) => tool.name === event.toolName)?.annotations);
		if (decision === "allow") return;
		if (decision === "ask" && ctx.hasUI && (await ctx.ui.confirm?.("Agente Plano: rodar este comando?", String(event.input?.command ?? event.toolName)))) return;
		return { block: true, reason: `Agente Plano (só leitura): ${event.toolName} não é permitido. Peça ao usuário para trocar para o Build (tab).` };
	});
	pi.on("before_agent_start", async (event) => (PINK.agent === "plan" ? { systemPrompt: `${event.systemPrompt ?? ""}${PLAN_PROMPT}` } : undefined));
	pi.on("session_tree", async (_event, ctx) => {
		PINK.todos = todosFromBranch(ctx.sessionManager?.getBranch?.());
	});
}

async function registerTodoTool(pi) {
	if (PINK.todoRegistered || !pi.registerTool) return;
	PINK.todoRegistered = true;
	const { Type } = await import("typebox");
	const status = Type.Union(["pending", "in_progress", "completed", "cancelled"].map((value) => Type.Literal(value)));
	pi.registerTool({
		name: "todowrite",
		label: "Tarefas",
		description: "Create and update the session todo list shown to the user. Send the WHOLE list on every change. Use it for work with 3 or more steps: keep exactly one item in_progress and mark items completed as soon as they are done.",
		parameters: Type.Object({ todos: Type.Array(Type.Object({ content: Type.String({ description: "What to do, short" }), status })) }),
		annotations: { readOnlyHint: true },
		async execute(_id, params) {
			PINK.todos = normalizeTodos(params?.todos);
			return { content: [{ type: "text", text: PINK.todos.map((item) => `[${item.status}] ${item.content}`).join("\n") || "(empty list)" }], details: { todos: PINK.todos } };
		},
	});
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
	registerOpenCodeFunctions(pi);
	pi.on("session_start", async (_event, ctx) => {
		await registerTodoTool(pi);
		PINK.todos = todosFromBranch(ctx.sessionManager?.getBranch?.());
		if (ctx.mode !== "tui") return;
		const { CustomEditor, VERSION } = await import("@earendil-works/pi-coding-agent");
		const { matchesKey } = await import("@earendil-works/pi-tui");
		install(pi, ctx, { CustomEditor, version: VERSION ?? "", matchesKey, onPalette: () => openPalette(pi, ctx), onAgent: () => switchAgent(ctx) });
	});
}
