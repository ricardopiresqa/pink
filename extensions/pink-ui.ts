// Pink UI (F50b): the OpenCode look on top of the Pink engine.
//
//   home (empty session)   a big PINK in the middle, the input box right under it, a line of hints
//   session                the logo goes away; full-screen frame: top bar, SESSÕES | conversation + input box | CONTEXTO/PLANO/
//                          ALTERAÇÕES/SESSÃO, bottom bar; the side columns come and go with the terminal width
//
// Loaded by default by the Pink build (pink/rebrand.json patches the extension list). It uses the public extension API
// (setHeader, setEditorComponent, setFooter, setWidget, registerMarkdownTransformer); the root layout and the label over each
// answer, the pink bar of the user message and the root layout come from three small dist patches (frame-layout,
// assistant-footer, user-bar) that only call globalThis.__pinkFrame, __pinkAssistantFooter and __pinkUserBar.
// The layout functions are pure and exported for tests.

import { t } from "./pink-i18n.ts";
export const LOGO = [
	"██████╗ ██╗███╗   ██╗██╗  ██╗",
	"██╔══██╗██║████╗  ██║██║ ██╔╝",
	"██████╔╝██║██╔██╗ ██║█████╔╝ ",
	"██╔═══╝ ██║██║╚██╗██║██╔═██╗ ",
	"██║     ██║██║ ╚████║██║  ██╗",
	"╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝",
];
export const HOME_WIDTH = 78; // the input box on the home screen, like OpenCode's centered prompt
export const BAR = "▌"; // a barra rosa cheia da caixa de envio e da mensagem do usuário (#ff6eb4, a cor accent do tema)
// códigos que não ocupam coluna: CSI (cor, cursor), OSC (links) e APC/DCS/PM/SOS (o Pink marca o cursor com
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

export function inputBox({ theme, content, width, label, inline = false, hints = BOX_HINTS }) {
	// `content` are the lines of the built-in editor without its top and bottom borders; the box is exactly `width` wide.
	// Barra rosa cheia à esquerda + fundo, como a barra do OpenCode (owner 2026-10-29, pink.3; antes era a borda inteira);
	// `inline`: o rótulo "Build · modelo" fica à direita da primeira linha (o editor foi desenhado mais estreito para caber);
	// senão ele vai para a linha das dicas, à esquerda
	const text = Math.max(1, width - 3); // a barra e um espaço de cada lado
	const panel = (value) => (theme.bg ? theme.bg("userMessageBg", value) : value);
	// o editor do Pink devolve a linha com "resetar cor" no meio (cursor, texto): sem reaplicar o fundo depois de cada reset,
	// a faixa do texto ficava preta e só o rodapé da caixa ficava rosado
	const open = theme.bg ? theme.bg("userMessageBg", "\u0000").split("\u0000")[0] : "";
	const keep = (value) => (open ? value.replace(/\x1b\[(?:0|49)?m/g, (reset) => reset + open) : value);
	const row = (value) => `${theme.fg("accent", BAR)}${panel(keep(` ${pad(fit(value, text), text)} `))}`;
	const tip = theme.fg("dim", hints);
	const lines = inline && label ? [footerLine({ theme, width: text, left: content[0] ?? "", right: label }), ...content.slice(1)] : content;
	if (!inline && label && visible(label) + 1 + visible(tip) > text) {
		// rótulo e dicas não cabem juntos: o rótulo ganha a linha dele, em vez de cortar as dicas
		return [row(""), ...lines.map(row), row(""), row(theme.fg("muted", label)), row(footerLine({ theme, width: text, left: "", right: tip }))];
	}
	const last = inline || !label ? footerLine({ theme, width: text, left: "", right: tip }) : footerLine({ theme, width: text, left: theme.fg("muted", label), right: tip });
	return [row(""), ...lines.map(row), row(""), row(last)];
}

export function footerLine({ theme, width, left, right }) {
	const gap = Math.max(1, width - visible(left) - visible(right));
	return fit(`${left}${" ".repeat(gap)}${right}`, width);
}

const THINKING_PT = { minimal: t("mínimo", "mínimo", "minimal"), low: t("baixo", "bajo", "low"), medium: t("médio", "medio", "medium"), high: t("alto", "alto", "high"), xhigh: t("muito alto", "muy alto", "very high"), max: t("máximo", "máximo", "max") };

// "thoth  thoth  off" dizia modelo, provedor e nível sem explicar nada: agora o nome do modelo, o provedor só quando é
// outro, e o pensamento só quando está ligado ("pensamento alto")
// como no OpenCode, o agente (Build/Plano) vem antes do modelo, na cor da marca
export function modelLabel({ theme, model, thinking, agent, permission = "edits" }) {
	const mode = agent === "build" && permission === "ask" ? t(" (pergunta tudo)", " (pregunta todo)", " (ask everything)") : "";
	const who = AGENTS[agent] ? `${theme.fg("accent", `${AGENTS[agent].label}${mode}`)}${theme.fg("muted", " · ")}` : "";
	if (!model) return `${who}${theme.fg("muted", t("sem modelo", "sin modelo", "no model"))}`;
	const name = model.name || model.id;
	const provider = model.provider && model.provider !== model.id && model.provider !== name ? theme.fg("muted", ` · ${model.provider}`) : "";
	const level = THINKING_PT[thinking] ? theme.fg("muted", ` · ${t("pensamento", "razonamiento", "thinking")} ${THINKING_PT[thinking]}`) : "";
	return `${who}${name}${provider}${level}`;
}

export function hintsLine({ theme, width }) {
	return center(theme.fg("dim", t("ctrl+p comandos   tab agente   alt+m modo   @ arquivo   ! bash   ctrl+t pensamento   ctrl+c sair", "ctrl+p comandos   tab agente   alt+m modo   @ archivo   ! bash   ctrl+t razonamiento   ctrl+c salir", "ctrl+p commands   tab agent   alt+m mode   @ file   ! bash   ctrl+t thinking   ctrl+c quit")), width);
}

// -- funções do OpenCode (owner 2026-10-28: "gosto muito do opencode, poderia replicar as funções dele")
// agentes: Build (padrão, tudo liberado) e Plano (só leitura: analisa e planeja, não edita), trocados com tab na caixa vazia
export const AGENTS = { build: { label: "Build" }, plan: { label: t("Plano", "Plan", "Plan") } };
const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls", "todowrite", "tool_search"]);
export const PLAN_PROMPT = "\n\n# Modo Plano (Pink)\nVocê está no agente Plano: só leia, pesquise e planeje. Não edite nem crie arquivos e não rode comandos que mudem o projeto. Termine com um plano em passos; o usuário troca para o agente Build (tab) para executar.";

export function planDecision(toolName, annotations) {
	if (READ_ONLY_TOOLS.has(toolName) || annotations?.readOnlyHint === true) return "allow";
	return toolName === "bash" ? "ask" : "block";  // como o agente plan do OpenCode: edição negada, shell só com confirmação
}

// paleta de comandos (ctrl+p, como no OpenCode): os comandos do Pink com a descrição em português e os das extensões
export const BUILTIN_COMMANDS = [
	["new", t("Nova sessão", "Nueva sesión", "New session")], ["resume", t("Trocar de sessão (lista as salvas)", "Cambiar de sesión (lista las guardadas)", "Switch session (lists saved ones)")], ["sessions", t("Sessões desta pasta", "Sesiones de esta carpeta", "Sessions in this folder")], ["delete-session", t("Apagar sessão (vai para a lixeira .trash)", "Borrar sesión (va a la papelera .trash)", "Delete session (moves it to the .trash bin)")], ["name", t("Renomear a sessão", "Renombrar la sesión", "Rename the session")],
	["model", t("Escolher o modelo", "Elegir el modelo", "Choose the model")], ["thinking", t("Nível de pensamento", "Nivel de razonamiento", "Thinking level")], ["themes", t("Escolher o tema", "Elegir el tema", "Choose the theme")], ["settings", t("Configurações", "Configuración", "Settings")],
	["undo", t("Desfazer a última mensagem e as mudanças nos arquivos", "Deshacer el último mensaje y los cambios en los archivos", "Undo the last message and the file changes")], ["redo", t("Refazer o que o /undo desfez", "Rehacer lo que deshizo /undo", "Redo what /undo undid")],
	["plan", t("Agente Plano (só leitura)", "Agente Plan (solo lectura)", "Plan agent (read-only)")], ["build", t("Agente Build (edita e roda comandos)", "Agente Build (edita y ejecuta comandos)", "Build agent (edits and runs commands)")], ["todos", t("Lista de tarefas do agente", "Lista de tareas del agente", "The agent's task list")],
	["compact", t("Compactar o contexto", "Compactar el contexto", "Compact the context")], ["tree", t("Árvore da sessão", "Árbol de la sesión", "Session tree")], ["fork", t("Nova sessão a partir de uma mensagem", "Nueva sesión desde un mensaje", "New session from a message")], ["clone", t("Duplicar a sessão", "Duplicar la sesión", "Duplicate the session")],
	["copy", t("Copiar a última resposta", "Copiar la última respuesta", "Copy the last response")], ["export", t("Exportar a sessão (HTML ou JSONL)", "Exportar la sesión (HTML o JSONL)", "Export the session (HTML or JSONL)")], ["share", t("Compartilhar a sessão", "Compartir la sesión", "Share the session")], ["session", t("Dados da sessão", "Datos de la sesión", "Session data")],
	["init", t("Criar ou atualizar o AGENTS.md", "Crear o actualizar el AGENTS.md", "Create or update AGENTS.md")], ["details", t("Mostrar ou esconder a saída das ferramentas", "Mostrar u ocultar la salida de las herramientas", "Show or hide tool output")], ["lateral", t("Mostrar ou esconder a lateral", "Mostrar u ocultar la barra lateral", "Show or hide the sidebar")],
	["hotkeys", t("Atalhos de teclado", "Atajos de teclado", "Keyboard shortcuts")], ["login", t("Entrar num provedor", "Iniciar sesión en un proveedor", "Log in to a provider")], ["logout", t("Sair de um provedor", "Cerrar sesión en un proveedor", "Log out of a provider")], ["mcp", t("Servidores MCP", "Servidores MCP", "MCP servers")],
	["reload", t("Recarregar extensões, temas e atalhos", "Recargar extensiones, temas y atajos", "Reload extensions, themes and shortcuts")], ["quit", t("Sair do Pink", "Salir de Pink", "Quit Pink")],
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

// `max`: linhas no total (com o título); passando dele, ficam as em andamento e pendentes e um "+N"
export function todoLines({ theme, todos, width, max = Infinity }) {
	const mark = { pending: theme.fg("dim", "○"), in_progress: theme.fg("accent", "◐"), completed: theme.fg("success", "✓"), cancelled: theme.fg("dim", "✗") };
	const done = todos.filter((item) => item.status === "completed").length;
	const line = (item) => fit(`  ${mark[item.status]} ${item.status === "completed" || item.status === "cancelled" ? theme.fg("dim", item.content) : theme.fg("text", item.content)}`, width);
	const title = fit(`${theme.fg("text", t("Tarefas", "Tareas", "Tasks"))} ${theme.fg("muted", `${done}/${todos.length}`)}`, width);
	if (todos.length + 1 <= max) return [title, ...todos.map(line)];
	const open = todos.filter((item) => item.status === "in_progress").concat(todos.filter((item) => item.status === "pending"));
	const shown = open.slice(0, Math.max(1, max - 2));
	return [title, ...shown.map(line), fit(theme.fg("dim", `  … +${todos.length - shown.length} ${t("tarefas", "tareas", "tasks")}`), width)];
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

// índice próprio, guardado entre execuções (a segunda foto só relê o que mudou); nunca o índice do usuário
// e objetos próprios (o repositório entra só como leitura, por alternates): a foto não suja o .git do projeto
export async function undoStore(cwd, run = runGit) {
	const top = (await run(["rev-parse", "--show-toplevel"], { cwd })).stdout.trim();
	if (!top) return undefined;
	const path = node("node:path");
	const base = path.join(node("node:os").tmpdir(), `pink-undo-${node("node:crypto").createHash("sha1").update(top.toLowerCase()).digest("hex").slice(0, 12)}`);
	const objects = path.resolve(top, (await run(["rev-parse", "--git-path", "objects"], { cwd: top })).stdout.trim() || ".git/objects");
	return { top, base, store: { GIT_OBJECT_DIRECTORY: `${base}.objects`, GIT_ALTERNATE_OBJECT_DIRECTORIES: objects } };
}

export async function gitSnapshot(cwd, run = runGit) {
	const where = await undoStore(cwd, run);
	if (!where) return undefined;  // fora de um repositório Git não há como desfazer arquivos (no OpenCode também é assim)
	const { top, store, base } = where;
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

// ponto salvo na sessão por uma execução anterior; só vale se a árvore ainda existe nos objetos do Pink (a pasta temporária
// pode ter sido limpa: aí o /undo volta só a conversa, como antes)
export const UNDO_ENTRY = "pink-undo-point";
// A sessão é dado de fora (pode ser de outra máquina ou forjada): dela só vale o tree (hash), e só se o repositório salvo
// é o da pasta atual; repositório, objetos e env vêm daqui (Argus S1)
export async function savedSnapshot(entries, entryId, cwd, run = runGit) {
	const saved = [...(entries ?? [])].reverse().find((e) => e?.type === "custom" && e.customType === UNDO_ENTRY && e.data?.entryId === entryId)?.data;
	if (typeof saved?.tree !== "string" || !/^[0-9a-f]{40,64}$/.test(saved.tree) || typeof saved.top !== "string") return undefined;
	const here = await undoStore(cwd, run);
	if (!here || here.top.toLowerCase() !== saved.top.toLowerCase()) return undefined;
	const ok = (await run(["cat-file", "-e", `${saved.tree}^{tree}`], { cwd: here.top, env: here.store })).code === 0;
	return ok ? { top: here.top, tree: saved.tree, store: here.store } : undefined;
}

// -- moldura de tela cheia (owner 2026-10-29, card 86e3x0ckk): topo, SESSÕES à esquerda, conversa no centro, CONTEXTO/PLANO/
// ALTERAÇÕES/SESSÃO à direita e rodapé. Adaptativa como os painéis do OBS: a largura decide quantas colunas cabem. Só mostra
// dado real; o que o Pink não sabe (custo zero, contexto ainda não medido) some. O patch frame-layout do build monta o layout
// raiz com quatro espaços (top, left, right, bottom) que chamam globalThis.__pinkFrame; sem a extensão, eles ficam invisíveis.
export const LEFT_WIDTH = 32; // com a borda (pink.3: +2 para o horário de cada sessão)
export const RIGHT_WIDTH = 36; // com a borda
export const THREE_COLUMNS = 150; // >= 150: sessões, conversa e contexto
export const TWO_COLUMNS = 115; // 115-149: some a coluna de sessões; < 115: só a conversa
export const PLACEHOLDER = t("Peça a próxima etapa...", "Pide el siguiente paso...", "Ask for the next step...");
export const BOX_HINTS = t("Enter enviar · shift+tab pensar · ctrl+t ver pensamento", "Enter enviar · shift+tab pensar · ctrl+t ver razonamiento", "Enter send · shift+tab think · ctrl+t show thinking");

export function frameColumns(width, { home = false, on = true, sessions = true } = {}) {
	if (home || !on) return { left: false, right: false };
	return { left: sessions && width >= THREE_COLUMNS, right: width >= TWO_COLUMNS };
}

export function barRows(rows) {
	return rows < 20 ? 1 : 2; // terminal baixo: topo e rodapé sem a linha separadora
}

const bold = (theme, text) => (theme.bold ? theme.bold(text) : text);

export function kTokens(value) {
	const n = Number(value) || 0;
	return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);
}

export function meter({ theme, percent, cells }) {
	const full = Math.max(0, Math.min(cells, Math.round(((Number(percent) || 0) / 100) * cells)));
	return `${theme.fg("accent", "━".repeat(full))}${theme.fg("borderMuted", "━".repeat(cells - full))}`;
}

export function topBar({ theme, width, rows, data }) {
	const sep = theme.fg("dim", " │ ");
	let left = `${theme.fg("accent", "✱")} ${bold(theme, theme.fg("text", "pink"))}${width >= 100 && data.version ? theme.fg("dim", ` ${data.version}`) : ""}`;
	left += `${sep}${theme.fg("text", data.folder || "")}`;
	if (data.branch && width >= 80) left += `${sep}${theme.bg ? theme.bg("selectedBg", theme.fg("accent", ` ⎇ ${data.branch} `)) : ` ⎇ ${data.branch} `}`;
	let right = `${bold(theme, theme.fg("text", "THOTH"))}${theme.fg("muted", " · ")}${theme.fg("accent", (AGENTS[data.agent]?.label ?? "Build").toUpperCase())}`;
	const ctx = data.context;
	if (width >= TWO_COLUMNS && ctx?.tokens != null && ctx.window) {
		right += `${sep}${meter({ theme, percent: ctx.percent, cells: 14 })} ${theme.fg("text", `${Math.round(ctx.percent ?? 0)}% · ${kTokens(ctx.tokens)} / ${kTokens(ctx.window)}`)}`;
	}
	const line = footerLine({ theme, width, left: ` ${left}`, right: `${right} ` });
	return barRows(rows) > 1 ? [line, theme.fg("borderMuted", "─".repeat(width))] : [line];
}

export const SHORTCUTS = [["ctrl+p", t("comandos", "comandos", "commands")], ["ctrl+c", t("limpar", "limpiar", "clear")], ["/hotkeys", t("ajuda", "ayuda", "help")]]; // os atalhos reais do Pink

export function bottomBar({ theme, width, rows, data }) {
	const sep = theme.fg("dim", " │ ");
	const left = ` ${theme.fg("muted", data.folder || "")}${data.branch && width >= 80 ? `${sep}${theme.fg("accent", `⎇ ${data.branch}`)}` : ""}`;
	let keys = SHORTCUTS;
	const render = (list) => `${list.map(([key, what]) => `${theme.fg("muted", key)} ${theme.fg("dim", what)}`).join(sep)} `;
	while (keys.length > 1 && visible(left) + visible(render(keys)) + 2 > width) keys = keys.slice(0, -1);
	const line = footerLine({ theme, width, left, right: render(keys) });
	return barRows(rows) > 1 ? [theme.fg("borderMuted", "─".repeat(width)), line] : [line];
}

const rule = (theme, width) => theme.fg("borderMuted", "─".repeat(Math.max(0, width)));
const heading = (theme, text, extra = "") => `${bold(theme, theme.fg("text", text))}${extra}`;

export function leftColumn({ theme, width, height, data }) {
	// SESSÕES no alto (a atual destacada), "+ Nova sessão" e, embaixo, FERRAMENTAS com quantas estão ativas
	const inner = Math.max(4, width - 1);
	const cell = (text = "") => pad(fit(text, inner), inner);
	const foot = height >= 8 ? [rule(theme, inner - 1), cell(` ${heading(theme, t("FERRAMENTAS", "HERRAMIENTAS", "TOOLS"))}  ${theme.fg("success", "●")} ${theme.fg("muted", `${data.tools ?? 0} ${t("ativas", "activas", "active")}`)}`)] : [];
	const top = [cell(` ${heading(theme, t("SESSÕES", "SESIONES", "SESSIONS"))}`), cell()];
	const room = Math.max(0, height - top.length - foot.length - 1);
	const sessions = (data.sessions ?? []).slice(0, room);
	// o horário à direita separa as sessões de mesmo nome ("oi" às 14:32 e "oi" ontem); a atual leva o ● no fim
	const name = (title, room) => fit(String(title || t("(sem título)", "(sin título)", "(untitled)")).replace(/\s+/g, " ").trim(), room);
	const highlight = (value) => (theme.bg ? theme.bg("selectedBg", value) : value);
	const entry = (item) => {
		const when = item.when ? `${theme.fg("dim", item.when)}${item.current ? theme.fg("accent", " ●") : "  "} ` : item.current ? `${theme.fg("accent", "●")} ` : "";
		const room = inner - 3 - visible(when) - 1;
		const title = item.current ? bold(theme, theme.fg("accent", name(item.title, room))) : theme.fg("text", name(item.title, room));
		return footerLine({ theme, width: inner, left: ` ${item.current ? theme.fg("accent", "▌") : " "} ${title}`, right: when });
	};
	const list = sessions.map((item) => (item.current ? highlight(entry(item)) : entry(item)));
	const body = [...top, ...list, cell(`   ${theme.fg("muted", t("+ Nova sessão", "+ Nueva sesión", "+ New session"))} ${theme.fg("dim", "/new")}`)].slice(0, Math.max(0, height - foot.length));
	const lines = [...body, ...Array(Math.max(0, height - body.length - foot.length)).fill(cell()), ...foot];
	return lines.map((line) => `${pad(line, inner)}${theme.fg("borderMuted", "│")}`);
}

export function rightColumn({ theme, width, height, data }) {
	// CONTEXTO, PLANO (o todowrite), ALTERAÇÕES (edit/write desta sessão) e SESSÃO (tokens; custo só quando há)
	const inner = Math.max(6, width - 3);
	const out = [heading(theme, "CONTEXTO")];
	const ctx = data.context;
	if (ctx?.tokens != null && ctx.window) {
		out.push(meter({ theme, percent: ctx.percent, cells: inner }), `${theme.fg("accent", `${kTokens(ctx.tokens)} tokens`)}${theme.fg("muted", ` · ${Math.round(ctx.percent ?? 0)}% ${t("de", "de", "of")} ${kTokens(ctx.window)}`)}`);
	} else {
		out.push(theme.fg("dim", t("ainda sem medida", "todavía sin medir", "not measured yet")));
	}
	if (data.thoth) out.push("", rule(theme, inner), heading(theme, "THOTH"), ...thothLines({ theme, thoth: data.thoth, width: inner }));
	if (data.plan) out.push("", rule(theme, inner), heading(theme, t("COTA", "CUOTA", "QUOTA")), ...planLines({ theme, plan: data.plan, width: inner }));
	if (data.mcp) {
		out.push("", rule(theme, inner));
		if (data.hits) data.hits.mcp = out.length; // a linha do título: o clique abre e fecha a lista
		out.push(...mcpLines({ theme, mcp: data.mcp, open: data.mcpOpen, width: inner }));
	}
	const todos = data.todos ?? [];
	out.push("", rule(theme, inner), heading(theme, t("PLANO", "PLAN", "PLAN"), todos.length ? theme.fg("muted", `  ${todos.filter((item) => item.status === "completed").length}/${todos.length}`) : ""));
	if (todos.length) out.push(...todoLines({ theme, todos, width: inner }).slice(1).map((line) => line.replace(/^ {2}/, "")));
	else out.push(theme.fg("dim", t("sem plano nesta sessão", "sin plan en esta sesión", "no plan in this session")));
	const changes = data.changes ?? [];
	out.push("", rule(theme, inner), heading(theme, t("ALTERAÇÕES", "CAMBIOS", "CHANGES"), changes.length ? theme.fg("muted", `  ${changes.length}`) : ""));
	if (changes.length) {
		for (const item of changes) {
			const status = item.status === "novo" ? `${theme.fg("accent", "●")} ${theme.fg("muted", t("novo", "nuevo", "new"))}` : `${theme.fg("success", "●")} ${theme.fg("muted", t("editado", "editado", "edited"))}`;
			const room = inner - visible(status) - 1;
			const path = item.path.length > room ? `…${item.path.slice(-(room - 1))}` : item.path;
			out.push(footerLine({ theme, width: inner, left: theme.fg("text", path), right: status }));
		}
	} else {
		out.push(theme.fg("dim", t("nenhum arquivo alterado", "ningún archivo cambiado", "no files changed")));
	}
	out.push("", rule(theme, inner), heading(theme, t("SESSÃO", "SESIÓN", "SESSION")));
	out.push(`${theme.fg("text", formatTokens(data.input))} ${theme.fg("muted", t("entrada", "entrada", "in"))}${theme.fg("dim", " │ ")}${theme.fg("text", formatTokens(data.output))} ${theme.fg("muted", t("saída", "salida", "out"))}`);
	if (data.models?.length) out.push(theme.fg("muted", `${t("modelo", "modelo", "model")} ${data.models.map(shortModel).join(", ")}`));
	if (data.cost > 0) out.push(theme.fg("muted", `$${data.cost.toFixed(2)} ${t("gasto", "gastado", "spent")}`));
	if (data.project) out.push(theme.fg("muted", `${t("projeto", "proyecto", "project")} ${data.project}`));
	const lines = out.slice(0, height).map((line) => pad(fit(line, inner), inner));
	return [...lines, ...Array(Math.max(0, height - lines.length)).fill(" ".repeat(inner))].map((line) => `${theme.fg("borderMuted", "│")} ${line} `);
}

export function changesFromBranch(entries, created = new Set()) {
	// arquivos que as ferramentas edit/write tocaram no ramo atual (o /undo volta o ramo, e a lista volta junto)
	const seen = new Map();
	for (const entry of entries ?? []) {
		const message = entry?.type === "message" ? entry.message : undefined;
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			const path = part?.type === "toolCall" && (part.name === "edit" || part.name === "write") ? part.arguments?.path : undefined;
			if (typeof path === "string" && path && !seen.has(path)) seen.set(path, created.has(path) ? "novo" : "editado");
		}
	}
	return [...seen.entries()].map(([path, status]) => ({ path: path.replace(/\\/g, "/"), status }));
}

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

// -- THOTH na lateral (card 86e3px66t): o que vem do Thoth desta máquina, lido em segundo plano. Sem o Thoth o Pink segue:
// cada fonte que falha vira "—", todas falhando viram "Thoth indisponível". Nada de token na tela: o texto de fora passa por
// safeText (sem códigos de controle, sequências de 20+ letras/dígitos sem separador, que parecem segredo ou hash, ficam cortadas).
export const THOTH_POLL_MS = 30000;
export const THOTH_TIMEOUT_MS = 3000; // dashboard e gateway em 127.0.0.1; o CLI de aprovações tem 15 s (o Python demora ~3 s para subir)

export function safeText(value, max = 60) {
	const text = String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/[A-Za-z0-9_+=]{20,}/g, () => "•••").replace(/\s+/g, " ").trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function thothSnapshot({ approvals, cards, calls }, now = Date.now()) {
	// cada fonte chega crua (ou undefined quando não respondeu); aqui vira só o que a lateral mostra
	const list = (value) => (Array.isArray(value) ? value : undefined);
	const waiting = list(approvals)?.filter((item) => item?.state === "WAITING" && !(Date.parse(item?.request?.expires_at) <= now));
	const running = list(cards?.cards)?.find((card) => card?.state === "RUNNING");
	const last = list(calls?.data)?.filter((call) => call?.provider).at(-1);
	const snapshot = {
		approvals: waiting && { count: waiting.length, top: waiting.length ? safeText(`${waiting.at(-1).request?.action ?? ""} ${waiting.at(-1).request?.resource ?? ""} · ${waiting.at(-1).request?.project_id ?? ""}`) : "" },
		card: cards?.cards === undefined ? undefined : running ? { id: safeText(running.task_id, 30), goal: safeText(running.mission?.goal) } : null,
		free: calls?.data === undefined ? undefined : last ? safeText(`${last.provider} · ${last.model ?? ""}`) : null,
	};
	return { ...snapshot, ok: Object.values(snapshot).some((value) => value !== undefined) };
}

export function thothLines({ theme, thoth, width }) {
	if (!thoth?.ok) return [theme.fg("dim", thoth?.loading ? t("consultando…", "consultando…", "loading…") : t("Thoth indisponível", "Thoth no disponible", "Thoth unavailable"))];
	const row = (label, value, tone = "text") => {
		const left = theme.fg("muted", label);
		return footerLine({ theme, width, left, right: value === undefined ? theme.fg("dim", "—") : theme.fg(tone, fit(value, Math.max(1, width - visible(left) - 1))) });
	};
	const detail = (text) => (text ? [theme.fg("dim", fit(`  ${text}`, width))] : []);
	const { approvals, card, free } = thoth;
	return [
		row(t("aprovações", "aprobaciones", "approvals"), approvals && (approvals.count ? `${approvals.count} ${t("aguardando", "pendientes", "waiting")}` : t("nenhuma", "ninguna", "none")), approvals?.count ? "warning" : "text"),
		...detail(approvals?.top),
		row("card", card === undefined ? undefined : card ? card.id : t("nenhum em andamento", "ninguno en curso", "none in progress"), card ? "accent" : "text"),
		...detail(card?.goal),
		row("thoth free", free === undefined ? undefined : free ?? t("sem chamadas", "sin llamadas", "no calls")),
	];
}

// as fontes reais: o CLI `thoth approvals list --json`, o painel local (/api/work-center/cards) e as chamadas do
// gateway thoth free (/v1/thoth/calls). Todas só leem; o token do gateway vai no
// cabeçalho e nunca para a tela.
export function thothSources({ vault, project, env = process.env }) {
	const fs = process.getBuiltinModule?.("node:fs");
	const path = process.getBuiltinModule?.("node:path");
	const child = process.getBuiltinModule?.("node:child_process");
	const getJson = async (url, headers) => {
		const response = await fetch(url, { headers, signal: AbortSignal.timeout(THOTH_TIMEOUT_MS) });
		if (!response.ok) throw new Error(String(response.status));
		return response.json();
	};
	return {
		approvals: () => new Promise((resolve, reject) => {
			if (!vault || !child) return reject(new Error("no vault"));
			child.execFile("thoth", ["approvals", "list", "--json", "--workspace", vault], { timeout: 15000, windowsHide: true, maxBuffer: 4 << 20 }, (error, stdout) => {
				if (error) return reject(error);
				try {
					resolve(JSON.parse(stdout));
				} catch (parse) {
					reject(parse);
				}
			});
		}),
		// shortcut: o mapeamento dá o canonical_name e o painel quer o project_id; hoje são iguais em todo projeto com pasta
		cards: () => (project ? getJson(`http://127.0.0.1:8788/api/work-center/cards?project_id=${encodeURIComponent(project)}`) : Promise.reject(new Error("no project"))),
		calls: async () => {
			let token = env.THOTH_GATEWAY_TOKEN || "";
			if (!token && env.LOCALAPPDATA) token = (await fs.promises.readFile(path.join(env.LOCALAPPDATA, "thoth", "runtime", "gateway", "token"), "utf8")).trim();
			if (!token) throw new Error("no gateway token");
			return getJson("http://127.0.0.1:11435/v1/thoth/calls", { Authorization: `Bearer ${token}` });
		},
	};
}

// -- COTA: o mesmo uso do plano do painel local (thoth-client uso estado --json): 5 horas e semana do Claude e do Codex
export const PLAN_POLL_MS = 180000; // o CLI leva ~15 s (pergunta ao Codex e soma o mês): de 3 em 3 minutos basta
export function planSnapshot(raw, now = Date.now() / 1000) {
	const pick = (usage) => {
		const out = {};
		for (const key of ["h5", "week"]) {
			const window = usage?.[key];
			const pct = Number(window?.pct), resets = Number(window?.resets_at);
			if (!Number.isFinite(pct) || !Number.isFinite(resets)) continue;
			out[key] = resets <= now ? { pct: 0 } : { pct: Math.max(0, Math.min(100, pct)), resets };
		}
		return Object.keys(out).length ? out : undefined;
	};
	const claude = raw?.claude?.installed ? pick(raw.claude.usage) ?? null : undefined;
	const codex = raw?.codex?.installed ? pick(raw.codex.usage) ?? null : undefined;
	return { ok: claude !== undefined || codex !== undefined, claude, codex };
}

export function resetLabel(epoch, now = new Date()) {
	if (!epoch) return "";
	const when = new Date(epoch * 1000);
	const hm = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
	if (when.toDateString() === now.toDateString()) return hm;
	return `${t("dom,seg,ter,qua,qui,sex,sáb", "dom,lun,mar,mié,jue,vie,sáb", "Sun,Mon,Tue,Wed,Thu,Fri,Sat").split(",")[when.getDay()]} ${hm}`;
}

export function planLines({ theme, plan, width, now = new Date() }) {
	if (!plan?.ok) return [theme.fg("dim", plan?.loading ? t("consultando…", "consultando…", "loading…") : t("sem dado do plano (thoth-client uso)", "sin dato del plan (thoth-client uso)", "no plan data (thoth-client uso)"))];
	const out = [];
	for (const [name, usage] of [["Claude", plan.claude], ["Codex", plan.codex]]) {
		if (usage === undefined) continue;
		out.push(theme.fg("text", name));
		if (!usage) {
			out.push(theme.fg("dim", name === "Claude" ? t("  ligue: thoth-client uso ativar", "  activa: thoth-client uso activar", "  turn on: thoth-client uso activar") : t("  sem leitura ainda", "  sin lectura todavía", "  no reading yet")));
			continue;
		}
		for (const [key, label] of [["h5", "5 h"], ["week", t("semana", "semana", "week")]]) {
			const window = usage[key];
			if (!window) continue;
			const tone = window.pct >= 90 ? "error" : window.pct >= 70 ? "warning" : "muted";
			const right = theme.fg(tone, `${Math.round(window.pct)}%${window.resets ? ` · ${t("volta", "vuelve", "resets")} ${resetLabel(window.resets, now)}` : ""}`);
			const left = theme.fg("muted", `  ${label}`);
			out.push(footerLine({ theme, width, left, right }));
			out.push(`  ${meter({ theme, percent: window.pct, cells: Math.max(4, width - 2) })}`);
		}
	}
	return out.length ? out : [theme.fg("dim", "nenhum plano conectado")];
}

// -- MCP (como a lateral do OpenCode): título com a contagem; clique abre a lista completa com o estado de cada um
export function mcpLines({ theme, mcp, open, width }) {
	const connected = mcp.filter((item) => String(item.state).startsWith("connected")).length;
	const out = [heading(theme, `${open ? "▾" : "▸"} MCP`, theme.fg("muted", `  ${connected}/${mcp.length} ${t("conectados", "conectados", "connected")}`))];
	if (!open) return out;
	if (!mcp.length) return [...out, theme.fg("dim", t("nenhum MCP (pink mcp add)", "ningún MCP (pink mcp add)", "no MCP (pink mcp add)"))];
	for (const item of mcp) {
		const state = safeText(item.state, 40);
		const tone = state.startsWith("connected") ? "success" : state === "disabled" ? "dim" : state.startsWith("failed") || state === "needs sign-in" ? "error" : "warning";
		const left = `${theme.fg(tone, "●")} ${theme.fg("text", safeText(item.name, 30))}`;
		out.push(footerLine({ theme, width, left, right: theme.fg("muted", state.replace(/^connected · /, "")) }));
	}
	return out;
}

// a cota do Claude vem do login do Pink (assinatura Pro/Max): o mesmo uso da conta que o /usage do Claude Code mostra,
// sem precisar do Claude Code aberto. Só com token de assinatura (sk-ant-oat…); chave de API não tem essa cota e não é enviada.
export function claudeUsageWindows(body, now = Date.now() / 1000) {
	const out = {};
	for (const [key, name] of [["five_hour", "h5"], ["seven_day", "week"]]) {
		const pct = Number(body?.[key]?.utilization);
		const resets = Date.parse(body?.[key]?.resets_at ?? "") / 1000;
		if (!Number.isFinite(pct) || !Number.isFinite(resets)) continue;
		out[name] = resets <= now ? { pct: 0 } : { pct: Math.max(0, Math.min(100, pct)), resets };
	}
	return Object.keys(out).length ? out : undefined;
}

export async function readClaudeFromPink(getKey, fetcher = fetch) {
	const token = await getKey?.("anthropic");
	if (typeof token !== "string" || !token.startsWith("sk-ant-oat")) return undefined;
	const response = await fetcher("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" }, signal: AbortSignal.timeout(10000) });
	if (!response.ok) return undefined;
	return claudeUsageWindows(await response.json());
}

export function readPlan(run = node("node:child_process")?.execFile) {
	return new Promise((resolve, reject) => {
		if (!run) return reject(new Error("no child_process"));
		run("thoth-client", ["uso", "estado", "--json"], { timeout: 60000, windowsHide: true, maxBuffer: 4 << 20 }, (error, stdout) => {
			if (error) return reject(error);
			try {
				resolve(planSnapshot(JSON.parse(stdout)));
			} catch (parse) {
				reject(parse);
			}
		});
	});
}

export async function pollThoth(sources, now = Date.now()) {
	const names = ["approvals", "cards", "calls"];
	const settled = await Promise.allSettled(names.map((name) => Promise.resolve().then(() => sources[name]())));
	return thothSnapshot(Object.fromEntries(names.map((name, index) => [name, settled[index].status === "fulfilled" ? settled[index].value : undefined])), now);
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
	if (title) lines.push(field(t("Sessão", "Sesión", "Session"), title.length > 70 ? `${title.slice(0, 69)}…` : title));
	const totals = (stats?.models ?? []).reduce((sum, item) => ({ input: sum.input + item.input, output: sum.output + item.output }), { input: 0, output: 0 });
	if (totals.input || totals.output) lines.push(field("Tokens", `${formatTokens(totals.input)} ${t("entrada", "entrada", "in")}  ${formatTokens(totals.output)} ${t("saída", "salida", "out")}  $${(stats.cost ?? 0).toFixed(2)}`));
	if (resume) lines.push(field(t("Continuar", "Continuar", "Resume"), theme.fg("accent", resume)));
	return `${lines.join("\n")}\n\n`;
}

function tilde(cwd) {
	const home = process.env.USERPROFILE || process.env.HOME || "";
	return (home && cwd.toLowerCase().startsWith(home.toLowerCase()) ? `~${cwd.slice(home.length)}` : cwd).replace(/\\/g, "/");
}

export function hasMessages(ctx) {
	try {
		return ctx.sessionManager.getEntries().some((entry) => entry.type === "message");
	} catch {
		return false;
	}
}

// depois de trocar de sessão (ou /reload) o ctx antigo lança "ctx is stale" em qualquer leitura; até o session_start novo
// reinstalar a interface, o que ainda desenha com ele devolve vazio em vez de derrubar o Pink
export function live(fn, fallback) {
	return (...args) => {
		try {
			return fn(...args);
		} catch {
			return typeof fallback === "function" ? fallback(...args) : fallback;
		}
	};
}

export const PINK_GLOBALS = ["__pinkFrame", "__pinkAssistantFooter", "__pinkUserBar", "__pinkThinkingLabel", "__pinkSkipThinking"];

export function install(pink, ctx, { CustomEditor, SessionManager, version = "", matchesKey, onPalette, onAgent }) {
	const state = { home: !hasMessages(ctx), tui: undefined, branch: "", sessions: [] };
	const redraw = () => state.tui?.requestRender();
	const leaveHome = () => {
		if (state.home) {
			state.home = false;
			redraw();
		}
	};
	// sessão do multiplexador (pink/mux): progresso (OSC 9;4) enquanto trabalha e sino ao terminar, para a lateral mostrar o estado
	const signal = (text) => process.env.PINK_MUX_CHILD === "1" && process.stdout.isTTY && process.stdout.write(text);
	pink.on("agent_start", () => {
		signal("\x1b]9;4;3\x07");
		leaveHome();
	});
	pink.on("input", leaveHome);
	void pink.exec?.("git", ["branch", "--show-current"], { cwd: ctx.cwd }).then((result) => {
		state.branch = (result?.stdout ?? "").trim();
		redraw();
	}).catch(() => undefined);
	// sessões desta pasta (as mesmas do /sessions): relidas ao abrir e ao fim de cada execução (a sessão nova ganha arquivo e título)
	const loadSessions = () => void SessionManager?.list?.(ctx.cwd).then((list) => {
		state.sessions = [...list].sort((a, b) => b.modified - a.modified);
		redraw();
	}).catch(() => undefined);
	loadSessions();
	PINK.refreshSessions = loadSessions;  // o "Apagar sessão" relê a coluna depois de mover o arquivo
	pink.on("agent_end", () => {
		signal("\x1b]9;4;0\x07\x07");
		// o multiplexador guarda o arquivo de cada sessão aberta para reabri-la no próximo Pink (card 1dfwh7kfyty)
		const file = ctx.sessionManager?.getSessionFile?.();
		if (file) signal(`\x1b]9;pink-session=${file}\x07`);
		// título automático (owner 2026-10-29): só quando a sessão ainda não tem nome
		if (!pink.getSessionName?.()) {
			const title = autoTitle(ctx.sessionManager?.getBranch?.());
			if (title) pink.setSessionName?.(title);
		}
		loadSessions();
	});

	// a moldura só existe na tela cheia; no modo regular do Pink (--tui-mode regular) fica o rodapé de uma linha
	const framed = () => (state.tui?.mode ?? "fullscreen") === "fullscreen";
	const rows = () => state.tui?.terminal?.rows ?? 24;
	const homeRows = () => (framed() ? rows() - 2 * barRows(rows()) + 1 : rows()); // homeTop/homeBottomPad já descontam uma linha de rodapé

	ctx.ui.setHeader((tui, theme) => {
		state.tui = tui;
		return {
			render: live((width) => (state.home ? homeHeader({ theme, width, rows: homeRows(), subtitle: `coding agent · ${t("modelo", "modelo", "model")} ${ctx.model?.id ?? "thoth"}` }) : []), []),
			invalidate() {},
		};
	});

	class PinkEditor extends CustomEditor {
		constructor(tui, theme, keybindings) {
			super(tui, theme, keybindings, { paddingX: 0 });
			state.tui = tui;
			state.editor = this;
			this.pinkKeys = keybindings;
		}

		// ctrl+p abre a paleta e tab com a caixa vazia troca o agente (OpenCode); o resto segue para o editor do Pink
		handleInput(data) {
			if (matchesKey?.(data, "ctrl+p") && onPalette) return void onPalette();
			if (matchesKey?.(data, "tab") && onAgent && !String(this.getText?.() ?? "").trim()) return void onAgent();
			// ctrl+n nova sessão; alt+↑/alt+↓ a sessão anterior/seguinte da coluna, salvo onde o Pink já usa a tecla (dequeue fora do Windows)
			if (matchesKey?.(data, "ctrl+n")) return void runCommand("/new");
			const step = matchesKey?.(data, "alt+up") ? -1 : matchesKey?.(data, "alt+down") ? 1 : 0;
			if (step && !this.pinkKeys?.matches?.(data, "app.message.dequeue")) return void openNeighbour(step);
			super.handleInput(data);
		}

		render(width) {
			try {
				return this.pinkRender(width);
			} catch {
				return super.render(width);  // ctx antigo durante a troca de sessão: o editor do Pink, sem moldura
			}
		}

		pinkRender(width) {
			const outer = state.home ? Math.min(width, HOME_WIDTH) : width;
			const margin = state.home ? Math.floor((width - outer) / 2) : 0;
			const theme = ctx.ui.theme;
			const label = modelLabel({ theme, model: ctx.model, thinking: pink.getThinkingLevel?.(), agent: PINK.agent, permission: PINK.permission });
			const text = outer - 4;
			// o rótulo fica embaixo, na linha das dicas: à direita da 1ª linha ele estreitava o editor e o pedido quebrava em
			// ~35 colunas na tela inicial (owner 2026-11-15)
			const inline = false;
			const raw = super.render(Math.max(1, text));
			let content = raw.length >= 3 ? raw.slice(1, -1) : raw; // the built-in editor draws its own top and bottom borders
			if (typeof this.getText === "function" && this.getText() === "" && content.length) content = [`${content[0].replace(/\s+$/, "")}${theme.fg("dim", PLACEHOLDER)}`, ...content.slice(1)];
			const lines = inputBox({ theme, content, width: outer, label, inline }).map((line) => " ".repeat(margin) + line);
			if (!state.home) return lines;
			const body = [...lines, "", hintsLine({ theme, width })];
			return [...body, ...Array(homeBottomPad(homeRows(), homeTop(homeRows()) + HEADER_BODY, body.length)).fill("")];
		}
	}

	// trocar de sessão só é permitido a comandos (ExtensionCommandContext): o clique e as teclas digitam o comando na caixa
	const runCommand = (text) => {
		if (ctx.isIdle && !ctx.isIdle()) return void ctx.ui.notify?.(t("Espere a resposta terminar para trocar de sessão", "Espera a que termine la respuesta para cambiar de sesión", "Wait for the response to finish before switching sessions"), "info");
		if (!state.editor?.setText) return;
		state.editor.setText(text);
		state.editor.handleInput("\r");
	};
	const openNeighbour = (step) => {
		const current = ctx.sessionManager?.getSessionFile?.();
		const index = state.sessions.findIndex((item) => item.path === current);
		const target = state.sessions[index === -1 ? (step > 0 ? 0 : -1) : index + step];
		if (target) runCommand(`/session-open ${target.path}`);
	};
	const shownSessions = (height) => state.sessions.slice(0, Math.max(0, height - 2 - (height >= 8 ? 2 : 0) - 1));

	// pensamento atrás de um título, como no OpenCode: recolhido por padrão; o Pink abre e recolhe cada bloco com um clique,
	// ctrl+t abre e recolhe todos; toda sessão começa recolhida, como o Claude Code (patch thinking-collapsed-every-session);
	// o título do bloco aberto vem do patch thinking-header-when-shown
	ctx.ui.setHiddenThinkingLabel?.(t("+ Pensou", "+ Pensó", "+ Thought"));
	globalThis.__pinkThinkingHeader = t("− Pensou · clique ou ctrl+t recolhe", "− Pensó · haz clic o ctrl+t contrae", "− Thought · click or ctrl+t collapses");
	globalThis.__pinkThinkingLabel = (message, runIndex) => thinkingLabel(PINK.thinking.get(message?.timestamp)?.[runIndex]?.ms);
	// "Pink · Build" sobre cada resposta (patch assistant-label); o agente é o da hora da resposta, desconhecido em sessão reaberta
	// rodapé de cada resposta final (patch assistant-footer), lido a cada quadro: o tempo chega no message_end
	globalThis.__pinkAssistantFooter = live((message, streaming, width, outputPad = 1) => {
		if (streaming) return [];
		const timing = PINK.timing.get(message?.timestamp) ?? {};
		const line = assistantFooter({ theme: ctx.ui.theme, model: message?.model, agent: PINK.agentOf.get(message?.timestamp), ms: timing.ms, output: message?.usage?.output, run: PINK.runOf.get(message?.timestamp) });
		return [fit(" ".repeat(outputPad) + line, width)];
	}, []);
	globalThis.__pinkUserBar = live((lines) => userLines(lines, ctx.ui.theme.fg("muted", ">")), (lines) => lines);
	globalThis.__pinkSkipThinking = skipThinking;
	ctx.ui.setEditorComponent((tui, theme, keybindings) => new PinkEditor(tui, theme, keybindings));
	const project = (() => {
		try {
			const fs = process.getBuiltinModule?.("node:fs");
			return fs ? thothProject(ctx.cwd, process.env.THOTH_VAULT_PATH || "", (path) => fs.readFileSync(path, "utf8")) : "";
		} catch {
			return "";
		}
	})();
	// a seção THOTH só consulta quando a coluna da direita aparece pela primeira vez; um único relógio para o processo todo
	// (trocar de sessão reinstala a interface e só troca quem redesenha), sem segurar a saída do Pink (unref)
	const startThoth = () => {
		PINK.thoth.redraw = redraw;
		if (PINK.thoth.timer) return;
		const sources = thothSources({ vault: process.env.THOTH_VAULT_PATH || "", project });
		const tick = async () => {
			if (PINK.thoth.busy) return;
			PINK.thoth.busy = true;
			try {
				PINK.thoth.data = await pollThoth(sources);
			} catch {
				PINK.thoth.data = { ok: false };
			} finally {
				PINK.thoth.busy = false;
			}
			try {
				PINK.thoth.redraw?.();
			} catch {
				// interface antiga durante a troca de sessão: o próximo quadro já mostra o dado novo
			}
		};
		PINK.thoth.timer = setInterval(tick, THOTH_POLL_MS);
		PINK.thoth.timer.unref?.();
		void tick();
		const planTick = async () => {
			if (PINK.plan.busy) return;
			PINK.plan.busy = true;
			const [cli, own] = await Promise.allSettled([readPlan(), readClaudeFromPink((provider) => ctx.modelRegistry?.getApiKeyForProvider?.(provider))]);
			try {
				const data = cli.status === "fulfilled" ? cli.value : { ok: false };
				// o uso medido pelo login do Pink vale mais que o da linha de status do Claude Code (que só atualiza com ele aberto)
				PINK.plan.data = own.status === "fulfilled" && own.value ? { ...data, ok: true, claude: own.value } : data;
			} catch {
				PINK.plan.data = { ok: false };
			} finally {
				PINK.plan.busy = false;
			}
			try {
				PINK.thoth.redraw?.();
			} catch {
				// troca de sessão: o próximo quadro mostra
			}
		};
		PINK.plan.timer = setInterval(planTick, PLAN_POLL_MS);
		PINK.plan.timer.unref?.();
		void planTick();
	};
	Object.defineProperty(globalThis, "__pinkHome", { get: () => state.home, configurable: true });
	// dentro do multiplexador (pink/mux) a lateral dele já lista as sessões: a coluna SESSÕES daqui sairia duplicada
	const columns = (width) => frameColumns(width, { home: state.home, on: globalThis.__pinkSidebarOn ?? true, sessions: process.env.PINK_MUX_CHILD !== "1" });
	const bars = () => {
		const usage = ctx.getContextUsage?.();
		return { version, folder: tilde(ctx.cwd), branch: state.branch, agent: PINK.agent, context: usage ? { tokens: usage.tokens, percent: usage.percent, window: usage.contextWindow } : undefined };
	};
	globalThis.__pinkFrame = {
		// clique na coluna SESSÕES: linha 0 título, 1 em branco, depois as sessões e "+ Nova sessão"
		mouse: live((slot, event) => {
			if (event?.type !== "click" || event.button !== "left") return undefined;
			if (slot === "right") {
				if (event.y !== PINK.rightHits.mcp) return undefined;
				PINK.mcpOpen = !PINK.mcpOpen;
				PINK.thoth.redraw?.();
				return { handled: true };
			}
			if (slot !== "left") return undefined;
			const shown = shownSessions(Math.max(1, rows() - 2 * barRows(rows())));
			const index = event.y - 2;
			if (index >= 0 && index < shown.length) runCommand(`/session-open ${shown[index].path}`);
			else if (index === shown.length) runCommand("/new");
			else return undefined;
			return { handled: true };
		}, undefined),
		visible: live((slot, viewport) => (slot === "top" || slot === "bottom" ? true : Boolean(columns(viewport.width)[slot])), false),
		render: live((slot, width) => {
			const theme = ctx.ui.theme;
			const height = Math.max(1, rows() - 2 * barRows(rows()));
			if (slot === "top") return topBar({ theme, width, rows: rows(), data: bars() });
			if (slot === "bottom") return bottomBar({ theme, width, rows: rows(), data: bars() });
			if (slot === "left") {
				const current = ctx.sessionManager?.getSessionFile?.();
				const title = ctx.sessionManager?.getSessionName?.() || sessionStats(ctx.sessionManager?.getEntries?.()).title || t("Sessão atual", "Sesión actual", "Current session");
				const listed = state.sessions.map((item) => ({ title: item.name || item.firstMessage, current: item.path === current, when: relativeTime(item.modified) }));
				const sessions = listed.some((item) => item.current) ? listed : [{ title, current: true, when: relativeTime(Date.now()) }, ...listed];
				return leftColumn({ theme, width: LEFT_WIDTH, height, data: { sessions, tools: (pink.getActiveTools?.() ?? []).length } });
			}
			startThoth();
			const stats = sessionStats(ctx.sessionManager?.getEntries?.());
			const total = stats.models.reduce((sum, item) => ({ input: sum.input + item.input, output: sum.output + item.output }), { input: 0, output: 0 });
			return rightColumn({ theme, width: RIGHT_WIDTH, height, data: { ...total, cost: stats.cost, models: stats.models.map((item) => item.model).filter((model) => model && model !== "?"), project, context: bars().context, todos: PINK.todos, thoth: PINK.thoth.data, plan: PINK.plan.data, mcp: globalThis.__pinkMcp?.(), mcpOpen: PINK.mcpOpen, hits: (PINK.rightHits = {}), changes: changesFromBranch(ctx.sessionManager?.getBranch?.(), PINK.created) } });
		}, []),
	};
	// tarefas sobre a caixa de digitar quando a coluna da direita não cabe (com ela, as tarefas aparecem no PLANO)
	ctx.ui.setWidget?.("pink-tarefas", (tui, theme) => ({
		// no teto: em janela estreita a lista inteira empurrava as perguntas do agente para fora da tela (owner 2026-11-20)
		render: live((width) => (!PINK.todos.some((item) => item.status === "pending" || item.status === "in_progress") || columns(tui.terminal?.columns ?? width).right ? [] : todoLines({ theme, todos: PINK.todos, width, max: Math.max(3, Math.floor((tui.terminal?.rows ?? 24) / 5)) })), []),
		invalidate() {},
	}));
	ctx.ui.setFooter((tui, theme) => {
		state.tui = tui;
		return {
			render: live((width) => {
				if (framed()) return []; // na tela cheia, o rodapé é o da moldura (largura toda, sob as colunas)
				const usage = ctx.getContextUsage?.();
				const window = usage?.contextWindow ?? ctx.model?.contextWindow;
				const used = usage && usage.percent !== null && window ? `${Math.round(usage.percent)}%/${Math.round(window / 1000)}k` : "";
				const left = theme.fg("muted", ` ${tilde(ctx.cwd)}${state.branch ? ` (${state.branch})` : ""}`);
				const right = `${theme.fg("muted", t("ctrl+t pensamento", "ctrl+t razonamiento", "ctrl+t thinking"))}${theme.fg("dim", `   ${used ? `ctx ${used}   ` : ""}pink ${version} `)}`;
				return [footerLine({ theme, width, left, right })];
			}, []),
			invalidate() {},
		};
	});
	return state;
}

// horário relativo da coluna SESSÕES: hoje "14:32", ontem "ontem", até uma semana "3d", depois "28/10"
export function relativeTime(when, now = new Date()) {
	const date = new Date(when);
	if (Number.isNaN(date.getTime())) return "";
	const day = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
	const days = Math.round((day(now) - day(date)) / 86400000);
	const two = (n) => String(n).padStart(2, "0");
	if (days <= 0) return `${two(date.getHours())}:${two(date.getMinutes())}`;
	if (days === 1) return "ontem";
	if (days < 7) return `${days}d`;
	return `${two(date.getDate())}/${two(date.getMonth() + 1)}`;
}

// título automático: a primeira mensagem do usuário com mais de 3 palavras (as sessões ficavam todas "oi")
export function autoTitle(entries, max = 50) {
	for (const entry of entries ?? []) {
		const message = entry?.type === "message" ? entry.message : undefined;
		if (message?.role !== "user") continue;
		const content = Array.isArray(message.content) ? message.content.filter((part) => part?.type === "text").map((part) => part.text).join(" ") : message.content;
		const text = String(content ?? "").replace(/\s+/g, " ").trim();
		if (text.startsWith("/") || text.split(" ").length <= 3) continue;
		return text.length > max ? `${text.slice(0, max - 1)}…` : text;
	}
	return "";
}

// "Apagar sessão" nunca apaga (regra do owner): move o arquivo para <pasta das sessões>/.trash/, que o Pink não lista
export function trashSession(file, current, { fs, path, now = Date.now() }) {
	if (!file) return { ok: false, reason: t("sessão sem arquivo", "sesión sin archivo", "session has no file") };
	if (current && path.resolve(file).toLowerCase() === path.resolve(current).toLowerCase()) return { ok: false, reason: t("é a sessão atual: troque de sessão antes de apagar", "es la sesión actual: cambia de sesión antes de borrar", "it is the current session: switch sessions before deleting") };
	const dir = path.join(path.dirname(file), ".trash");
	fs.mkdirSync(dir, { recursive: true });
	let target = path.join(dir, path.basename(file));
	if (fs.existsSync(target)) target = path.join(dir, `${now}-${path.basename(file)}`);
	fs.renameSync(file, target);
	return { ok: true, target };
}

// ferramentas e pensamento compactos, como no OpenCode (owner 2026-10-29): uma linha cinza por bloco; ctrl+o (ferramentas)
// e ctrl+t (pensamento) expandem para a visão completa do Pink, com o diff do edit
const shorten = (text, max) => {
	const value = String(text ?? "").replace(/\s+/g, " ").trim();
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

export function diffStats(patch) {
	let add = 0;
	let del = 0;
	for (const line of String(patch ?? "").split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) add += 1;
		else if (line.startsWith("-") && !line.startsWith("---")) del += 1;
	}
	return { add, del };
}

// diff aberto como no Claude Code (owner 2026-11-20, card 1dfwh7kg4g2): número da linha, fundo vermelho no que saiu e
// verde no que entrou; linha longa quebra com o recuo do número. `diff` no formato do edit ("+12 texto", "-12 texto",
// " 12 texto", "   ..."); `max` linhas de diff, o resto vira "+N linhas (ctrl+o)"
// CJK e emoji ocupam 2 colunas; o diff é o primeiro lugar que desenha texto arbitrário de arquivo (Argus 2026-11-20)
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u;
const cols = (ch) => (WIDE.test(ch) ? 2 : 1);
// controles (ESC, \r, NUL, U+2028...) do arquivo não chegam ao terminal: viram "·"
const clean = (text) => text.replace(/\t/g, "   ").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "·");

export function diffBlock({ theme, diff, width, max = Infinity }) {
	const rows = String(diff ?? "").replace(/\r/g, "").split("\n").filter((line) => line !== "");
	const parsed = rows.map((line) => line.match(/^([+\- ])(\s*\d*)\s(.*)$/));
	const numWidth = Math.max(1, ...parsed.map((match) => (match ? match[2].trim().length : 0)));
	const room = Math.max(4, width - numWidth - 3);
	const paint = { "+": (text) => (theme.bg ? theme.bg("toolSuccessBg", text) : theme.fg("success", text)), "-": (text) => (theme.bg ? theme.bg("toolErrorBg", text) : theme.fg("error", text)) };
	const out = [];
	const shown = rows.slice(0, max);
	shown.forEach((line, index) => {
		const match = parsed[index];
		if (!match) return void out.push(fit(theme.fg("dim", " ".repeat(numWidth + 1) + clean(line.trim())), width));
		const [, sign, num, content] = match;
		const pieces = [];
		let piece = "", used = 0;
		for (const ch of clean(content)) {
			if (used + cols(ch) > room) pieces.push([piece, used]), (piece = ""), (used = 0);
			piece += ch;
			used += cols(ch);
		}
		pieces.push([piece, used]);
		pieces.forEach(([piece, used], part) => {
			const head = `${part === 0 ? num.trim().padStart(numWidth) : " ".repeat(numWidth)} ${part === 0 && sign !== " " ? sign : " "} `;
			const text = head + piece + " ".repeat(Math.max(0, width - numWidth - 3 - used));
			out.push(paint[sign] ? paint[sign](text) : theme.fg("toolDiffContext", text));
		});
	});
	if (rows.length > shown.length) out.push(fit(theme.fg("dim", `${" ".repeat(numWidth + 1)}… +${rows.length - shown.length} ${t("linhas", "líneas", "lines")} (ctrl+o)`), width));
	return out;
}

// o write vira um diff só de linhas novas (o arquivo inteiro entrou)
// só as `max` primeiras linhas viram diff (arquivo de MBs não é montado inteiro); o resto entra como "+N linhas"
export function writeDiff(content, max = 40) {
	if (typeof content !== "string") return "";
	const all = content.replace(/\r/g, "").replace(/\n$/, "");
	const head = all.split("\n", max);
	const rest = (all.match(/\n/g)?.length ?? 0) + 1 - head.length;
	return [...head.map((line, index) => `+${index + 1} ${line}`), ...(rest > 0 ? [`   … +${rest} ${t("linhas", "líneas", "lines")} (ctrl+o)`] : [])].join("\n");
}

export function toolSummary(name, args = {}, result) {
	const file = (value) => String(value ?? "").replace(/\\/g, "/");
	if (name === "read") return `${t("Leu", "Leyó", "Read")} ${file(args.path)}`;
	if (name === "write") return `${t("Escreveu", "Escribió", "Wrote")} ${file(args.path)}${typeof args.content === "string" ? ` · ${args.content.split("\n").length} ${t("linhas", "líneas", "lines")}` : ""}`;
	if (name === "edit") {
		const patch = result?.details?.patch ?? result?.details?.diff;
		const stats = patch ? diffStats(patch) : undefined;
		return `${t("Editou", "Editó", "Edited")} ${file(args.path)}${stats ? ` +${stats.add} −${stats.del}` : ""}`;
	}
	if (name === "bash" || name === "powershell") return `${t("Rodou", "Ejecutó", "Ran")}: ${shorten(args.command, 60)}`;
	if (name === "grep") return `${t("Buscou", "Buscó", "Searched")} "${shorten(args.pattern, 40)}"`;
	if (name === "find") return `${t("Procurou", "Buscó", "Looked for")} ${shorten(args.pattern ?? args.path, 40)}`;
	if (name === "ls") return `${t("Listou", "Listó", "Listed")} ${file(args.path ?? ".")}`;
	if (name === "todowrite") {
		const todos = normalizeTodos(args.todos);
		return `${t("Plano", "Plan", "Plan")} · ${todos.filter((item) => item.status === "completed").length}/${todos.length}`;
	}
	return name;
}

// chamadas seguidas sem texto do modelo no meio viram uma linha só, como no Claude Code ("Rodou 3 comandos, leu 2 arquivos");
// edit, write e o plano ficam de fora: cada um tem a própria linha (e o diff)
const GROUP_SKIP = new Set(["edit", "write", "todowrite"]);
export function toolGroups(entries) {
	const groups = new Map();
	let group;
	for (const entry of entries ?? []) {
		const message = entry?.type === "message" ? entry.message : undefined;
		if (!message) continue;
		if (message.role === "toolResult") {
			const call = groups.get(message.toolCallId)?.calls.find((item) => item.id === message.toolCallId);
			if (call) Object.assign(call, { done: true, isError: Boolean(message.isError) });
			continue;
		}
		if (message.role !== "assistant") {
			group = undefined;
			continue;
		}
		for (const part of Array.isArray(message.content) ? message.content : []) {
			if (part?.type === "text" && part.text?.trim()) group = undefined;
			else if (part?.type === "toolCall") {
				if (GROUP_SKIP.has(part.name)) {
					group = undefined;
					continue;
				}
				group ??= { calls: [] };
				group.calls.push({ id: part.id, name: part.name, done: false, isError: false });
				groups.set(part.id, group);
			}
		}
	}
	return groups;
}

const groupKind = (name) => (name === "bash" || name === "powershell" ? "cmd" : name === "read" ? "read" : name === "grep" || name === "find" ? "search" : name === "ls" ? "ls" : String(name).startsWith("web") ? "web" : "tool");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const GROUP_LABEL = {
	cmd: (n) => t(`rodou ${plural(n, "comando", "comandos")}`, `ejecutó ${plural(n, "comando", "comandos")}`, `ran ${plural(n, "shell command", "shell commands")}`),
	read: (n) => t(`leu ${plural(n, "arquivo", "arquivos")}`, `leyó ${plural(n, "archivo", "archivos")}`, `read ${plural(n, "file", "files")}`),
	search: (n) => t(`buscou ${plural(n, "padrão", "padrões")}`, `buscó ${plural(n, "patrón", "patrones")}`, `searched for ${plural(n, "pattern", "patterns")}`),
	ls: (n) => t(`listou ${plural(n, "pasta", "pastas")}`, `listó ${plural(n, "carpeta", "carpetas")}`, `listed ${plural(n, "folder", "folders")}`),
	web: (n) => t(`consultou ${plural(n, "página", "páginas")}`, `consultó ${plural(n, "página", "páginas")}`, `fetched ${plural(n, "page", "pages")}`),
	tool: (n) => t(`usou ${plural(n, "ferramenta", "ferramentas")}`, `usó ${plural(n, "herramienta", "herramientas")}`, `used ${plural(n, "tool", "tools")}`),
};
export function groupSummary(calls) {
	const counts = new Map();
	for (const call of calls) counts.set(groupKind(call.name), (counts.get(groupKind(call.name)) ?? 0) + 1);
	const text = [...counts].map(([kind, n]) => GROUP_LABEL[kind](n)).join(", ");
	const failed = calls.filter((call) => call.isError).length;
	return { text: text.charAt(0).toUpperCase() + text.slice(1), failed: failed ? ` · ${failed} ${failed === 1 ? t("falhou", "falló", "failed") : t("falharam", "fallaron", "failed")}` : "", running: calls.some((call) => !call.done) };
}

// o grupo da chamada, recalculado só quando a sessão cresce (o desenho pede a cada quadro)
function groupOf(id) {
	const session = PINK.session;
	if (!id || !session?.getBranch) return undefined;
	const key = `${session.getLeafId?.()}:${session.getEntryCount?.()}`;
	if (PINK.groups?.session !== session || PINK.groups.key !== key) PINK.groups = { session, key, map: toolGroups(session.getBranch()) };
	return PINK.groups.map.get(id);
}

export function compactToolRenderer(toolName, next) {
	const base = next?.();
	const empty = { render: () => [], invalidate() {} };
	const line = (theme, pad, text, extra = "") => ({ render: (width) => [fit(`${" ".repeat(pad)}${theme.fg("muted", `→ ${text}`)}${extra}`, width)], invalidate() {} });
	// em grupo, só a primeira chamada desenha (a linha do grupo); as outras somem; sozinha, a linha detalhada de sempre
	const grouped = (theme, pad, id, single) => (GROUP_SKIP.has(toolName) ? single : {
		render: (width) => {
			const group = groupOf(id);
			if (!group || group.calls.length < 2) return single.render(width);
			if (group.calls[0].id !== id) return [];
			const sum = groupSummary(group.calls);
			return [fit(`${" ".repeat(pad)}${theme.fg("muted", `→ ${sum.text}`)}${sum.running ? theme.fg("dim", " …") : ""}${sum.failed ? theme.fg("error", sum.failed) : ""}`, width)];
		},
		invalidate: () => single.invalidate?.(),
	});
	// expandido: a visão do Pink; as do Pink com moldura própria ("default") ganham só o recuo, já que esta é "self"
	const wrap = (component, pad) => (!component || base?.renderShell === "self" ? component : {
		render: (width) => component.render(Math.max(1, width - 2 * pad)).map((row) => " ".repeat(pad) + row),
		invalidate: () => component.invalidate?.(),
		handleMouse: (event) => component.handleMouse?.(event),
	});
	const output = (result, theme, pad) => ({
		render: (width) => (result?.content ?? []).filter((part) => part?.type === "text").flatMap((part) => String(part.text).split("\n")).map((row) => fit(" ".repeat(pad) + theme.fg("toolOutput", row), width)),
		invalidate() {},
	});
	return {
		renderShell: "self",
		renderCall(args, theme, context) {
			if (context.expanded) return wrap(base?.renderCall?.(args, theme, context) ?? line(theme, 0, `${toolName} ${shorten(JSON.stringify(args ?? {}), 80)}`), context.outputPad);
			return context.isPartial ? grouped(theme, context.outputPad, context.toolCallId, line(theme, context.outputPad, toolSummary(toolName, args ?? {}), theme.fg("dim", " …"))) : empty;
		},
		renderResult(result, options, theme, context) {
			if (options.expanded) return wrap(base?.renderResult?.(result, options, theme, context) ?? output(result, theme, 0), context.outputPad);
			if (options.isPartial) return empty;
			const time = context.durationMs >= 100 ? theme.fg("dim", ` · ${(context.durationMs / 1000).toFixed(1)}s`) : "";
			const summary = line(theme, context.outputPad, toolSummary(toolName, context.args ?? {}, result), `${time}${context.isError ? theme.fg("error", " · erro") : ""}`);
			// edit e write: o diff fica aberto sob a linha (como no Claude Code); o write mostra as primeiras 40 linhas
			const diff = context.isError ? "" : toolName === "edit" ? result?.details?.diff : toolName === "write" ? writeDiff(context.args?.content) : "";
			if (!diff) return grouped(theme, context.outputPad, context.toolCallId, summary);
			const cache = new Map();
			const pad2 = context.outputPad + 2;
			return {
				render: (width) => {
					if (!cache.has(width)) cache.set(width, [...summary.render(width), ...diffBlock({ theme, diff, width: Math.max(8, width - pad2), max: 200 }).map((row) => " ".repeat(pad2) + row)]);
					return cache.get(width);
				},
				invalidate: () => cache.clear(),
			};
		},
	};
}

export function thinkingLabel(ms) {
	return `+ ${t("Pensou", "Pensó", "Thought")}${ms > 0 ? ` · ${(ms / 1000).toFixed(1)}s` : ""}`;
}

export const LANGUAGE_PROMPT = `\n\n# Idioma (Pink)\nResponda no idioma em que o usuário escreve. Quando não der para saber (mensagem curta, só código), responda ${t("em português do Brasil", "en español", "in English")}.`;

// rodapé de cada resposta, como o do OpenCode: "Pink · thoth · 20.5s · 45.6 tok/s" (tempo e velocidade só quando medidos)
export function shortModel(id) {
	return String(id ?? "").split("/").at(-1).replace(/-\d{8}$/, "");
}

// tempo e tokens do pedido inteiro (todos os passos), como o Claude Code: "6m 44s · ↓ 6.4k tokens" (card 1dfwh7kffjy)
export function elapsedLabel(ms) {
	const s = Math.max(0, Math.floor((ms || 0) / 1000));
	const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
	return h ? `${h}h ${m}m ${r}s` : m ? `${m}m ${r}s` : `${r}s`;
}

export function tokenLabel(n) {
	const v = Math.max(0, Math.round(n || 0));
	const short = (x) => x.toFixed(1).replace(/\.0$/, "");
	return v < 1000 ? String(v) : v < 999950 ? `${short(v / 1000)}k` : `${short(v / 1e6)}M`;
}

export const runLabel = ({ ms, output }) => `${elapsedLabel(ms)} · ↓ ${tokenLabel(output)} tokens`;

// os provedores só mandam usage.output no fim de cada passo: durante o passo, estima pelo texto que já chegou (~4 caracteres/token)
export function streamedTokens(message) {
	let chars = 0;
	for (const part of Array.isArray(message?.content) ? message.content : []) {
		chars += String(part?.text ?? part?.thinking ?? "").length + (part?.arguments ? JSON.stringify(part.arguments).length : 0);
	}
	return Math.round(chars / 4);
}

// um pedido: soma a saída de cada resposta terminada; a resposta em andamento conta à parte (estimada) até terminar
// shortcut: tokens gastos dentro de ferramentas (usage no toolResult) ficam de fora; somar se alguma ferramenta chamar modelo
export function createRun(now = Date.now) {
	const start = now();
	let done = 0, live = 0, last, stop;
	return {
		live(message) { if (message?.role === "assistant") live = Math.max(message.usage?.output || 0, streamedTokens(message)); },
		add(message) {
			if (message?.role !== "assistant") return;
			done += message.usage?.output || streamedTokens(message);
			live = 0;
			last = message.timestamp;
			stop = message.stopReason;
		},
		get last() { return last; },
		get failed() { return stop === "error"; },
		summary: () => ({ ms: now() - start, output: done + live }),
	};
}

// a nova tentativa automática do Pink (erro do provedor, contexto estourado) é agent_end + agent_start: continua o mesmo pedido
export const RETRY_WINDOW_MS = 120000;
export function continueRun(previous, endedAt, now = Date.now()) {
	return previous?.failed && now - endedAt < RETRY_WINDOW_MS ? previous : undefined;
}

export function assistantFooter({ theme, model, agent, ms, output, run }) {
	const parts = [bold(theme, theme.fg("accent", "Pink"))];
	if (agent === "plan") parts.push(theme.fg("accent", AGENTS.plan.label));
	if (model) parts.push(theme.fg("text", shortModel(model)));
	if (run) return [...parts, theme.fg("muted", runLabel(run))].join(theme.fg("dim", " · "));  // última resposta do pedido
	if (ms > 0) parts.push(theme.fg("muted", `${(ms / 1000).toFixed(1)}s`));
	if (ms >= 250 && output > 0) parts.push(theme.fg("muted", `${(output / (ms / 1000)).toFixed(1)} tok/s`)); // janela curta demais não mede velocidade
	return parts.join(theme.fg("dim", " · "));
}


// estado das funções do OpenCode, compartilhado entre os comandos e a interface
// agentOf: o agente de cada resposta (pelo timestamp da mensagem); created: caminhos que o write criou (não existiam antes)
export const PINK = { agent: "build", permission: globalThis.__pinkPermissionSaved === "ask" ? "ask" : "edits", todos: [], snapshots: new Map(), redo: [], agentOf: new Map(), timing: new Map(), runOf: new Map(), run: undefined, runTimer: undefined, lastRun: undefined, lastRunEnd: 0, thinking: new Map(), created: new Set(), thoth: { data: { ok: false, loading: true }, timer: undefined, busy: false, redraw: undefined }, plan: { data: { ok: false, loading: true }, timer: undefined, busy: false }, mcpOpen: false, rightHits: {} };

// mensagem do usuário como no Claude Code (patch user-bar): ">" na primeira linha, sem caixa nem fundo; o recuo de 1 do
// Markdown vira o espaço depois do ">"
const BG = /\x1b\[(?:48;(?:2;\d+;\d+;\d+|5;\d+)|49)m/g;
export function userLines(lines, mark = ">") {
	const first = lines.findIndex((row) => String(row).replace(/\x1b\[[0-9;]*m/g, "").trim());
	return lines.map((row, index) => `${index === first ? mark : " "}${String(row).replace(BG, "")}`);
}

// "+ Pensou" some na resposta que só chama ferramenta (sem texto): a linha do grupo já diz o que aconteceu
export function skipThinking(message) {
	const content = Array.isArray(message?.content) ? message.content : [];
	return content.some((part) => part?.type === "toolCall") && !content.some((part) => part?.type === "text" && part.text?.trim());
}

function userText(entry) {
	const content = entry?.message?.content;
	return Array.isArray(content) ? content.filter((part) => part?.type === "text").map((part) => part.text).join("\n") : String(content ?? "");
}

async function openPalette(pink, ctx) {
	const choice = await ctx.ui.select?.(t("Comandos  (Enter coloca na caixa de digitar)", "Comandos  (Enter lo pone en la caja de escribir)", "Commands  (Enter puts it in the input box)"), paletteItems(pink.getCommands?.() ?? []));
	if (choice) ctx.ui.setEditorText?.(choice.split("  ")[0]);
}

function switchAgent(ctx, next = PINK.agent === "build" ? "plan" : "build") {
	PINK.agent = next;
	ctx.ui?.notify?.(next === "plan" ? t("Agente Plano: só leitura (tab volta ao Build)", "Agente Plan: solo lectura (tab vuelve a Build)", "Plan agent: read-only (tab goes back to Build)") : t("Agente Build: edita e roda comandos", "Agente Build: edita y ejecuta comandos", "Build agent: edits and runs commands"), "info");
}

// modo de permissão (card 1dfwh7kfzfg), alt+m roda: pergunta tudo → aceita edições → plano. Não usa tab (Build/Plano) nem
// shift+tab (pensamento). O pink-permissions lê o modo por globalThis.__pinkPermissionMode na hora de cada ferramenta.
export const MODES = { ask: t("Pergunta tudo: confirma cada edição e comando", "Pregunta todo: confirma cada edición y comando", "Ask everything: confirms every edit and command"), edits: t("Aceita edições: só confirma o perigoso (padrão)", "Acepta ediciones: solo confirma lo peligroso (predeterminado)", "Accept edits: only confirms risky actions (default)"), plan: t("Plano: só leitura", "Plan: solo lectura", "Plan: read-only") };
export const currentMode = () => (PINK.agent === "plan" ? "plan" : PINK.permission);
export const nextMode = (mode = currentMode()) => ({ ask: "edits", edits: "plan", plan: "ask" })[mode] ?? "edits";
export function setMode(ctx, mode) {
	if (!MODES[mode]) return;
	if (mode === "plan") return switchAgent(ctx, "plan");
	PINK.permission = mode;
	// fora do PINK: o /reload reimporta o módulo e o "pergunta tudo" não pode voltar sozinho ao padrão menos seguro
	globalThis.__pinkPermissionSaved = mode;
	PINK.agent = "build";
	ctx.ui?.notify?.(`${t("Modo", "Modo", "Mode")} ${MODES[mode]} (${t("alt+m troca", "alt+m cambia", "alt+m switches")})`, "info");
}
Object.defineProperty(globalThis, "__pinkPermissionMode", { get: () => currentMode(), configurable: true });
const MODE_ARGS = { perguntar: "ask", preguntar: "ask", ask: "ask", editar: "edits", edit: "edits", plano: "plan", plan: "plan" };

export const INIT_PROMPT = "Analise este repositório e crie o arquivo AGENTS.md na raiz (ou atualize, se já existir, sem perder o que vale). Inclua, de forma concisa: os comandos de build, teste e lint (e como rodar um único teste), a arquitetura em alto nível e as convenções de código que um agente precisa seguir. Não invente o que não estiver no repositório.";

const DELETE_ITEM = t("× Apagar uma sessão…", "× Borrar una sesión…", "× Delete a session…");

async function deleteSession(ctx) {
	const { SessionManager } = await import("@earendil-works/pi-coding-agent");
	const current = ctx.sessionManager?.getSessionFile?.();
	const path = node("node:path");
	const list = (await SessionManager.list(ctx.cwd)).filter((item) => !current || path.resolve(item.path).toLowerCase() !== path.resolve(current).toLowerCase()).sort((a, b) => b.modified - a.modified).slice(0, 40);
	if (!list.length) return void ctx.ui.notify?.(t("Nenhuma outra sessão para apagar (a atual não pode ser apagada)", "No hay otra sesión para borrar (la actual no se puede borrar)", "No other session to delete (the current one cannot be deleted)"), "info");
	const labels = list.map((item, i) => `${i + 1}. ${String(item.name || item.firstMessage || t("(sem título)", "(sin título)", "(untitled)")).replace(/\s+/g, " ").slice(0, 60)}  · ${relativeTime(item.modified)}`);
	const choice = await ctx.ui.select?.(t("Apagar qual sessão? (vai para a lixeira .trash)", "¿Qué sesión borrar? (va a la papelera .trash)", "Which session to delete? (moves it to the .trash bin)"), labels);
	if (!choice) return;
	const item = list[labels.indexOf(choice)];
	if (!(await ctx.ui.confirm?.(t("Apagar sessão?", "¿Borrar sesión?", "Delete session?"), `${choice}\n${t("O arquivo vai para", "El archivo va a", "The file goes to")} ${path.join(path.dirname(item.path), ".trash")} (${t("nada é excluído", "no se borra nada", "nothing is deleted")}).`))) return;
	try {
		const done = trashSession(item.path, current, { fs: node("node:fs"), path });
		ctx.ui.notify?.(done.ok ? t(`Sessão na lixeira: ${done.target}`, `Sesión en la papelera: ${done.target}`, `Session moved to the bin: ${done.target}`) : t(`Não apagada: ${done.reason}`, `No borrada: ${done.reason}`, `Not deleted: ${done.reason}`), done.ok ? "info" : "error");
	} catch (error) {
		ctx.ui.notify?.(t(`Não apagada: ${error?.message ?? error}`, `No borrada: ${error?.message ?? error}`, `Not deleted: ${error?.message ?? error}`), "error");
	}
	PINK.refreshSessions?.();
}

function registerOpenCodeFunctions(pink) {
	const command = (name, description, handler) => pink.registerCommand?.(name, { description, handler });
	command("plan", t("Agente Plano: só lê e planeja, não edita (tab troca)", "Agente Plan: solo lee y planifica, no edita (tab cambia)", "Plan agent: reads and plans, does not edit (tab switches)"), async (_args, ctx) => switchAgent(ctx, "plan"));
	command("build", t("Agente Build: edita e roda comandos (tab troca)", "Agente Build: edita y ejecuta comandos (tab cambia)", "Build agent: edits and runs commands (tab switches)"), async (_args, ctx) => switchAgent(ctx, "build"));
	pink.registerShortcut?.("alt+m", { description: t("Troca o modo de permissão: pergunta tudo, aceita edições, plano", "Cambia el modo de permisos: pregunta todo, acepta ediciones, plan", "Switches the permission mode: ask everything, accept edits, plan"), handler: (ctx) => setMode(ctx, nextMode()) });
	pink.registerCommand?.("modo", {
		description: t("Modo de permissão: perguntar, editar ou plano (sem nome, troca para o próximo; alt+m)", "Modo de permisos: preguntar, editar o plan (sin nombre, pasa al siguiente; alt+m)", "Permission mode: ask, edit or plan (no name, moves to the next; alt+m)"),
		getArgumentCompletions: (prefix) => Object.keys(MODE_ARGS).filter((name) => name.startsWith(prefix)).map((name) => ({ value: name, label: name })),
		handler: async (args, ctx) => {
			const name = String(args ?? "").trim().toLowerCase();
			if (name && !MODE_ARGS[name]) return void ctx.ui.notify?.(t("Use /modo perguntar, /modo editar ou /modo plano", "Usa /modo preguntar, /modo editar o /modo plan", "Use /modo ask, /modo edit or /modo plan"), "warning");
			setMode(ctx, name ? MODE_ARGS[name] : nextMode());
		},
	});
	command("help", t("Paleta de comandos (ctrl+p)", "Paleta de comandos (ctrl+p)", "Command palette (ctrl+p)"), async (_args, ctx) => openPalette(pink, ctx));
	command("details", t("Mostra ou esconde a saída das ferramentas (ctrl+o)", "Muestra u oculta la salida de las herramientas (ctrl+o)", "Show or hide tool output (ctrl+o)"), async (_args, ctx) => ctx.ui.setToolsExpanded?.(!ctx.ui.getToolsExpanded?.()));
	command("init", t("Cria ou atualiza o AGENTS.md do projeto", "Crea o actualiza el AGENTS.md del proyecto", "Create or update the project's AGENTS.md"), async () => pink.sendUserMessage?.(INIT_PROMPT));
	command("themes", t("Escolhe o tema (fica salvo)", "Elige el tema (queda guardado)", "Choose the theme (it is saved)"), async (_args, ctx) => {
		const name = await ctx.ui.select?.("Temas", (ctx.ui.getAllThemes?.() ?? []).map((theme) => theme.name));
		if (!name) return;
		const done = ctx.ui.setTheme?.(name);
		ctx.ui.notify?.(done?.success ? t(`Tema ${name}`, `Tema ${name}`, `Theme ${name}`) : t(`Tema ${name} não carregou: ${done?.error ?? "?"}`, `El tema ${name} no se cargó: ${done?.error ?? "?"}`, `Theme ${name} did not load: ${done?.error ?? "?"}`), done?.success ? "info" : "error");
	});
	command("sessions", t("Lista as sessões desta pasta e troca de sessão", "Lista las sesiones de esta carpeta y cambia de sesión", "Lists this folder's sessions and switches session"), async (_args, ctx) => {
		const { SessionManager } = await import("@earendil-works/pi-coding-agent");
		const list = (await SessionManager.list(ctx.cwd)).sort((a, b) => b.modified - a.modified).slice(0, 40);
		if (!list.length) return void ctx.ui.notify?.(t("Nenhuma sessão salva nesta pasta", "Ninguna sesión guardada en esta carpeta", "No saved sessions in this folder"), "info");
		const labels = list.map((item, i) => `${i + 1}. ${String(item.name || item.firstMessage || t("(sem título)", "(sin título)", "(untitled)")).replace(/\s+/g, " ").slice(0, 60)}  · ${new Date(item.modified).toLocaleString(t("pt-BR", "es-419", "en-US"))}`);
		const choice = await ctx.ui.select?.(t("Sessões", "Sesiones", "Sessions"), [DELETE_ITEM, ...labels]);
		if (choice === DELETE_ITEM) return void (await deleteSession(ctx));
		if (choice) await ctx.switchSession(list[labels.indexOf(choice)].path);
	});
	command("session-open", t("Abrir uma sessão pelo arquivo (o clique e alt+↑/↓ na coluna SESSÕES usam este)", "Abre una sesión por archivo (el clic y alt+↑/↓ en la columna SESIONES usan este)", "Open a session by file (the click and alt+↑/↓ in the SESSIONS column use this)"), async (args, ctx) => {
		const target = String(args ?? "").trim();
		if (target) await ctx.switchSession(target);
	});
	command("delete-session", t("Apagar sessão (vai para a lixeira .trash, com confirmação)", "Borrar sesión (va a la papelera .trash, con confirmación)", "Delete session (moves it to the .trash bin, with confirmation)"), async (_args, ctx) => deleteSession(ctx));
	command("todos", t("Mostra a lista de tarefas do agente", "Muestra la lista de tareas del agente", "Show the agent's task list"), async (_args, ctx) => {
		const lines = PINK.todos.length ? todoLines({ theme: ctx.ui.theme, todos: PINK.todos, width: 100 }) : [t("Sem tarefas nesta sessão", "Sin tareas en esta sesión", "No tasks in this session")];
		ctx.ui.notify?.(lines.join("\n"), "info");
	});
	command("undo", t("Desfaz a última mensagem, as respostas e as mudanças nos arquivos", "Deshace el último mensaje, las respuestas y los cambios en los archivos", "Undo the last message, the responses and the file changes"), async (_args, ctx) => {
		await ctx.waitForIdle?.();
		const user = lastUserEntry(ctx.sessionManager.getBranch());
		if (!user) return void ctx.ui.notify?.(t("Nada para desfazer", "Nada que deshacer", "Nothing to undo"), "info");
		const leaf = ctx.sessionManager.getLeafId();
		const snapshot = PINK.snapshots.get(user.id) ?? (await savedSnapshot(ctx.sessionManager.getEntries?.(), user.id, ctx.cwd));
		if ((await ctx.navigateTree(user.id))?.cancelled) return;
		const restored = snapshot ? await gitRestore(snapshot) : undefined;
		PINK.redo.push({ leaf, files: restored?.now });
		ctx.ui.setEditorText?.(userText(user));
		ctx.ui.notify?.(restored ? t(`Desfeito: conversa e ${restored.changed} arquivo(s). /redo refaz`, `Deshecho: conversación y ${restored.changed} archivo(s). /redo rehace`, `Undone: conversation and ${restored.changed} file(s). /redo redoes`) : t("Desfeito: conversa (arquivos sem ponto salvo: fora do Git ou de antes desta execução do Pink). /redo refaz", "Deshecho: conversación (archivos sin punto guardado: fuera de Git o de antes de esta ejecución de Pink). /redo rehace", "Undone: conversation (files with no saved point: outside Git or from before this Pink run). /redo redoes"), "info");
	});
	command("redo", t("Refaz o que o /undo desfez, com os arquivos", "Rehace lo que deshizo /undo, con los archivos", "Redo what /undo undid, with the files"), async (_args, ctx) => {
		await ctx.waitForIdle?.();
		const item = PINK.redo.pop();
		if (!item) return void ctx.ui.notify?.(t("Nada para refazer", "Nada que rehacer", "Nothing to redo"), "info");
		if (item.leaf && (await ctx.navigateTree(item.leaf))?.cancelled) return void PINK.redo.push(item);
		const restored = item.files ? await gitRestore(item.files) : undefined;
		ctx.ui.setEditorText?.("");
		ctx.ui.notify?.(restored ? t(`Refeito: conversa e ${restored.changed} arquivo(s)`, `Rehecho: conversación y ${restored.changed} archivo(s)`, `Redone: conversation and ${restored.changed} file(s)`) : t("Refeito: conversa", "Rehecho: conversación", "Redone: conversation"), "info");
	});
	// "Trabalhando · 1m 12s · ↓ 3.1k tokens" ao vivo; no fim, o rodapé da última resposta guarda o total do pedido
	// (registrado antes do ponto de restauração: o Pink espera cada gancho, e o git não pode atrasar o relógio)
	pink.on("agent_start", async (_event, ctx) => {
		clearInterval(PINK.runTimer);
		const run = (PINK.run = continueRun(PINK.lastRun, PINK.lastRunEnd) ?? createRun());
		const show = () => {
			try {
				ctx.ui.setWorkingMessage?.(`${t("Trabalhando", "Trabajando", "Working")} · ${runLabel(run.summary())}`);
			} catch {
				clearInterval(PINK.runTimer);  // ctx velho (sessão trocada): para o relógio
			}
		};
		show();
		PINK.runShow = show;  // o message_update também atualiza (tokens), o relógio só o tempo
		PINK.runTimer = setInterval(show, 1000);
		PINK.runTimer.unref?.();
	});
	pink.on("agent_end", async (_event, ctx) => {
		clearInterval(PINK.runTimer);
		ctx.ui.setWorkingMessage?.();
		if (PINK.run?.last !== undefined) PINK.runOf.set(PINK.run.last, PINK.run.summary());
		[PINK.lastRun, PINK.lastRunEnd, PINK.run, PINK.runShow] = [PINK.run, Date.now(), undefined, undefined];
	});
	// ponto de restauração dos arquivos antes de cada mensagem (só na TUI, só num repositório Git)
	pink.on("agent_start", async (_event, ctx) => {
		const leaf = ctx.sessionManager?.getLeafEntry?.();
		if (ctx.mode !== "tui" || leaf?.type !== "message" || leaf.message?.role !== "user") return;
		PINK.redo.length = 0;
		const snapshot = await gitSnapshot(ctx.cwd).catch(() => undefined);
		if (!snapshot) return;
		PINK.snapshots.set(leaf.id, snapshot);
		// card 1dfwh7kfmqr: o ponto também vai para a sessão (fora do contexto do modelo); o /undo funciona depois de reabrir
		try { pink.appendEntry?.(UNDO_ENTRY, { entryId: leaf.id, top: snapshot.top, tree: snapshot.tree }); } catch { /* sem gravar: o /undo desta execução ainda vale */ }
	});
	pink.on("message_start", async (event) => {
		if (event?.message?.role !== "assistant") return;
		PINK.agentOf.set(event.message.timestamp, PINK.agent);
		PINK.timing.set(event.message.timestamp, { start: PINK.turnStart ?? Date.now() });  // do pedido ao fim, como o OpenCode
	});
	pink.on("message_update", async (event) => {
		if (PINK.run) {
			PINK.run.live(event?.message);
			PINK.runShow?.();
		}
		const kind = event?.assistantMessageEvent?.type;
		if (kind !== "thinking_start" && kind !== "thinking_end") return;
		const key = event.message?.timestamp;
		const runs = PINK.thinking.get(key) ?? [];
		if (kind === "thinking_start") runs.push({ start: Date.now() });
		else if (runs.length && runs.at(-1).ms === undefined) runs.at(-1).ms = Date.now() - runs.at(-1).start;
		PINK.thinking.set(key, runs);
	});
	pink.on("turn_start", async () => {
		PINK.turnStart = Date.now();
	});
	pink.on("message_end", async (event) => {
		PINK.run?.add(event?.message);
		const timing = event?.message?.role === "assistant" ? PINK.timing.get(event.message.timestamp) : undefined;
		if (timing?.start) timing.ms = Date.now() - timing.start;
	});
	pink.on("tool_call", async (event, ctx) => {
		const target = event.toolName === "write" ? event.input?.path : undefined;
		if (typeof target === "string" && target) {
			try {
				if (!node("node:fs").existsSync(node("node:path").resolve(ctx.cwd ?? ".", target))) PINK.created.add(target);
			} catch {
				// sem como saber: a coluna ALTERAÇÕES mostra "editado"
			}
		}
		if (PINK.agent !== "plan") return;
		const decision = planDecision(event.toolName, pink.getAllTools?.().find((tool) => tool.name === event.toolName)?.annotations);
		if (decision === "allow") return;
		if (decision === "ask" && ctx.hasUI && (await ctx.ui.confirm?.(t("Agente Plano: rodar este comando?", "Agente Plan: ¿ejecutar este comando?", "Plan agent: run this command?"), String(event.input?.command ?? event.toolName)))) return;
		return { block: true, reason: t(`Agente Plano (só leitura): ${event.toolName} não é permitido. Peça ao usuário para trocar para o Build (tab).`, `Agente Plan (solo lectura): ${event.toolName} no está permitido. Pide al usuario que cambie a Build (tab).`, `Plan agent (read-only): ${event.toolName} is not allowed. Ask the user to switch to Build (tab).`) };
	});
	// seções do prompt, não o prompt inteiro: devolver systemPrompt forçava o texto e apagava as seções das outras extensões (Ponytail)
	pink.on("before_agent_start", async (event) => {
		const sections = event?.systemPromptOptions?.sections;
		if (!sections || typeof sections !== "object") return { systemPrompt: `${event.systemPrompt ?? ""}${LANGUAGE_PROMPT}${PINK.agent === "plan" ? PLAN_PROMPT : ""}` };
		sections.pink_language = LANGUAGE_PROMPT.trim();
		if (PINK.agent === "plan") sections.pink_plan = PLAN_PROMPT.trim();
		else delete sections.pink_plan;
	});
	pink.on("session_tree", async (_event, ctx) => {
		PINK.todos = todosFromBranch(ctx.sessionManager?.getBranch?.());
	});
}

const TODO_RUNTIMES = new WeakSet();

async function registerTodoTool(pink) {
	// uma vez por runtime: trocar de sessão cria um runtime novo, que precisa da ferramenta de novo (antes sumia: "4 ativas")
	if (TODO_RUNTIMES.has(pink) || !pink.registerTool) return;
	TODO_RUNTIMES.add(pink);
	const { Type } = await import("typebox");
	const status = Type.Union(["pending", "in_progress", "completed", "cancelled"].map((value) => Type.Literal(value)));
	pink.registerTool({
		name: "todowrite",
		label: t("Tarefas", "Tareas", "Tasks"),
		description: "Create and update the session todo list shown to the user. Send the WHOLE list on every change. Use it for work with 3 or more steps: keep exactly one item in_progress and mark items completed as soon as they are done.",
		parameters: Type.Object({ todos: Type.Array(Type.Object({ content: Type.String({ description: "What to do, short" }), status })) }),
		annotations: { readOnlyHint: true },
		async execute(_id, params) {
			PINK.todos = normalizeTodos(params?.todos);
			return { content: [{ type: "text", text: PINK.todos.map((item) => `[${item.status}] ${item.content}`).join("\n") || "(empty list)" }], details: { todos: PINK.todos } };
		},
	});
}

export default function (pink) {
	// ao sair, o contexto da extensão já foi desligado quando o Pink imprime a linha de retomar: o fechamento é montado no
	// session_shutdown (contexto ainda ativo) e só recebe o comando de continuar depois
	pink.on("session_shutdown", async (event, ctx) => {
		for (const name of PINK_GLOBALS) globalThis[name] = undefined;  // a sessão seguinte reinstala; até lá, nada lê o ctx antigo
		clearInterval(PINK.runTimer);
		if (event?.reason !== "quit" || ctx?.mode !== "tui") return;
		try {
			const stats = sessionStats(ctx.sessionManager?.getEntries?.());
			const banner = exitBanner({ theme: ctx.ui.theme, title: stats.title, stats, resume: "\u0000" });
			globalThis.__pinkExitBanner = (resume) => {
				const text = banner.replace("\u0000", resume);
				// dentro da lateral de sessões (mux) a saída cai num terminal virtual que some: o mux lê o fechamento deste arquivo
				if (process.env.PINK_MUX_BANNER) try { node("node:fs").writeFileSync(process.env.PINK_MUX_BANNER, text); } catch { /* sem arquivo, só o terminal virtual */ }
				return text;
			};
		} catch {
			globalThis.__pinkExitBanner = undefined;  // sem fechamento, o Pink imprime a linha dele
		}
	});
	pink.registerCommand?.("lateral", {
		description: t("Mostra ou esconde a lateral (sessão, contexto, tokens)", "Muestra u oculta la barra lateral (sesión, contexto, tokens)", "Show or hide the sidebar (session, context, tokens)"),
		handler: async (_args, ctx) => {
			globalThis.__pinkSidebarOn = !(globalThis.__pinkSidebarOn ?? true);
			ctx.ui.notify?.(globalThis.__pinkSidebarOn ? t("Lateral visível", "Barra lateral visible", "Sidebar shown") : t("Lateral escondida", "Barra lateral oculta", "Sidebar hidden"), "info");
		},
	});
	registerOpenCodeFunctions(pink);
	pink.registerToolRenderer?.(compactToolRenderer);
	pink.on("session_start", async (_event, ctx) => {
		await registerTodoTool(pink);
		PINK.session = ctx.sessionManager;
		PINK.todos = todosFromBranch(ctx.sessionManager?.getBranch?.());
		if (ctx.mode !== "tui") return;
		const { CustomEditor, SessionManager, VERSION } = await import("@earendil-works/pi-coding-agent");
		const { matchesKey } = await import("@earendil-works/pi-tui");
		install(pink, ctx, { CustomEditor, SessionManager, version: VERSION ?? "", matchesKey, onPalette: () => openPalette(pink, ctx), onAgent: () => switchAgent(ctx) });
	});
}
