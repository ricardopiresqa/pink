// Pink UI (F50b): the OpenCode look on top of the Pi engine.
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

export function inputBox({ theme, content, width, label, inline = false, hints = BOX_HINTS }) {
	// `content` are the lines of the built-in editor without its top and bottom borders; the box is exactly `width` wide.
	// Barra rosa cheia à esquerda + fundo, como a barra do OpenCode (owner 2026-10-29, pink.3; antes era a borda inteira);
	// `inline`: o rótulo "Build · modelo" fica à direita da primeira linha (o editor foi desenhado mais estreito para caber);
	// senão ele vai para a linha das dicas, à esquerda
	const text = Math.max(1, width - 3); // a barra e um espaço de cada lado
	const panel = (value) => (theme.bg ? theme.bg("userMessageBg", value) : value);
	// o editor do Pi devolve a linha com "resetar cor" no meio (cursor, texto): sem reaplicar o fundo depois de cada reset,
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
	["new", "Nova sessão"], ["resume", "Trocar de sessão (lista as salvas)"], ["sessions", "Sessões desta pasta"], ["delete-session", "Apagar sessão (vai para a lixeira .trash)"], ["name", "Renomear a sessão"],
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

// -- moldura de tela cheia (owner 2026-10-29, card 86e3x0ckk): topo, SESSÕES à esquerda, conversa no centro, CONTEXTO/PLANO/
// ALTERAÇÕES/SESSÃO à direita e rodapé. Adaptativa como os painéis do OBS: a largura decide quantas colunas cabem. Só mostra
// dado real; o que o Pink não sabe (custo zero, contexto ainda não medido) some. O patch frame-layout do build monta o layout
// raiz com quatro espaços (top, left, right, bottom) que chamam globalThis.__pinkFrame; sem a extensão, eles ficam invisíveis.
export const LEFT_WIDTH = 32; // com a borda (pink.3: +2 para o horário de cada sessão)
export const RIGHT_WIDTH = 36; // com a borda
export const THREE_COLUMNS = 150; // >= 150: sessões, conversa e contexto
export const TWO_COLUMNS = 115; // 115-149: some a coluna de sessões; < 115: só a conversa
export const PLACEHOLDER = "Peça a próxima etapa...";
export const BOX_HINTS = "Enter enviar · shift+tab pensar · ctrl+t ver pensamento";

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

export const SHORTCUTS = [["ctrl+p", "comandos"], ["ctrl+c", "limpar"], ["/hotkeys", "ajuda"]]; // os atalhos reais do Pink

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
	const foot = height >= 8 ? [rule(theme, inner - 1), cell(` ${heading(theme, "FERRAMENTAS")}  ${theme.fg("success", "●")} ${theme.fg("muted", `${data.tools ?? 0} ativas`)}`)] : [];
	const top = [cell(` ${heading(theme, "SESSÕES")}`), cell()];
	const room = Math.max(0, height - top.length - foot.length - 1);
	const sessions = (data.sessions ?? []).slice(0, room);
	// o horário à direita separa as sessões de mesmo nome ("oi" às 14:32 e "oi" ontem); a atual leva o ● no fim
	const name = (title, room) => fit(String(title || "(sem título)").replace(/\s+/g, " ").trim(), room);
	const highlight = (value) => (theme.bg ? theme.bg("selectedBg", value) : value);
	const entry = (item) => {
		const when = item.when ? `${theme.fg("dim", item.when)}${item.current ? theme.fg("accent", " ●") : "  "} ` : item.current ? `${theme.fg("accent", "●")} ` : "";
		const room = inner - 3 - visible(when) - 1;
		const title = item.current ? bold(theme, theme.fg("accent", name(item.title, room))) : theme.fg("text", name(item.title, room));
		return footerLine({ theme, width: inner, left: ` ${item.current ? theme.fg("accent", "▌") : " "} ${title}`, right: when });
	};
	const list = sessions.map((item) => (item.current ? highlight(entry(item)) : entry(item)));
	const body = [...top, ...list, cell(`   ${theme.fg("muted", "+ Nova sessão")} ${theme.fg("dim", "/new")}`)].slice(0, Math.max(0, height - foot.length));
	const lines = [...body, ...Array(Math.max(0, height - body.length - foot.length)).fill(cell()), ...foot];
	return lines.map((line) => `${pad(line, inner)}${theme.fg("borderMuted", "│")}`);
}

export function rightColumn({ theme, width, height, data }) {
	// CONTEXTO, PLANO (o todowrite), ALTERAÇÕES (edit/write desta sessão) e SESSÃO (tokens; custo só quando há)
	const inner = Math.max(6, width - 3);
	const out = [heading(theme, "CONTEXTO")];
	const ctx = data.context;
	if (ctx?.tokens != null && ctx.window) {
		out.push(meter({ theme, percent: ctx.percent, cells: inner }), `${theme.fg("accent", `${kTokens(ctx.tokens)} tokens`)}${theme.fg("muted", ` · ${Math.round(ctx.percent ?? 0)}% de ${kTokens(ctx.window)}`)}`);
	} else {
		out.push(theme.fg("dim", "ainda sem medida"));
	}
	if (data.thoth) out.push("", rule(theme, inner), heading(theme, "THOTH"), ...thothLines({ theme, thoth: data.thoth, width: inner }));
	if (data.plan) out.push("", rule(theme, inner), heading(theme, "COTA"), ...planLines({ theme, plan: data.plan, width: inner }));
	if (data.mcp) {
		out.push("", rule(theme, inner));
		if (data.hits) data.hits.mcp = out.length; // a linha do título: o clique abre e fecha a lista
		out.push(...mcpLines({ theme, mcp: data.mcp, open: data.mcpOpen, width: inner }));
	}
	const todos = data.todos ?? [];
	out.push("", rule(theme, inner), heading(theme, "PLANO", todos.length ? theme.fg("muted", `  ${todos.filter((item) => item.status === "completed").length}/${todos.length}`) : ""));
	if (todos.length) out.push(...todoLines({ theme, todos, width: inner }).slice(1).map((line) => line.replace(/^ {2}/, "")));
	else out.push(theme.fg("dim", "sem plano nesta sessão"));
	const changes = data.changes ?? [];
	out.push("", rule(theme, inner), heading(theme, "ALTERAÇÕES", changes.length ? theme.fg("muted", `  ${changes.length}`) : ""));
	if (changes.length) {
		for (const item of changes) {
			const status = item.status === "novo" ? `${theme.fg("accent", "●")} ${theme.fg("muted", "novo")}` : `${theme.fg("success", "●")} ${theme.fg("muted", "editado")}`;
			const room = inner - visible(status) - 1;
			const path = item.path.length > room ? `…${item.path.slice(-(room - 1))}` : item.path;
			out.push(footerLine({ theme, width: inner, left: theme.fg("text", path), right: status }));
		}
	} else {
		out.push(theme.fg("dim", "nenhum arquivo alterado"));
	}
	out.push("", rule(theme, inner), heading(theme, "SESSÃO"));
	out.push(`${theme.fg("text", formatTokens(data.input))} ${theme.fg("muted", "entrada")}${theme.fg("dim", " │ ")}${theme.fg("text", formatTokens(data.output))} ${theme.fg("muted", "saída")}`);
	if (data.models?.length) out.push(theme.fg("muted", `modelo ${data.models.map(shortModel).join(", ")}`));
	if (data.cost > 0) out.push(theme.fg("muted", `$${data.cost.toFixed(2)} gasto`));
	if (data.project) out.push(theme.fg("muted", `projeto ${data.project}`));
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
	if (!thoth?.ok) return [theme.fg("dim", thoth?.loading ? "consultando…" : "Thoth indisponível")];
	const row = (label, value, tone = "text") => {
		const left = theme.fg("muted", label);
		return footerLine({ theme, width, left, right: value === undefined ? theme.fg("dim", "—") : theme.fg(tone, fit(value, Math.max(1, width - visible(left) - 1))) });
	};
	const detail = (text) => (text ? [theme.fg("dim", fit(`  ${text}`, width))] : []);
	const { approvals, card, free } = thoth;
	return [
		row("aprovações", approvals && (approvals.count ? `${approvals.count} aguardando` : "nenhuma"), approvals?.count ? "warning" : "text"),
		...detail(approvals?.top),
		row("card", card === undefined ? undefined : card ? card.id : "nenhum em andamento", card ? "accent" : "text"),
		...detail(card?.goal),
		row("thoth free", free === undefined ? undefined : free ?? "sem chamadas"),
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
	return `${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][when.getDay()]} ${hm}`;
}

export function planLines({ theme, plan, width, now = new Date() }) {
	if (!plan?.ok) return [theme.fg("dim", plan?.loading ? "consultando…" : "sem dado do plano (thoth-client uso)")];
	const out = [];
	for (const [name, usage] of [["Claude", plan.claude], ["Codex", plan.codex]]) {
		if (usage === undefined) continue;
		out.push(theme.fg("text", name));
		if (!usage) {
			out.push(theme.fg("dim", name === "Claude" ? "  ligue: thoth-client uso ativar" : "  sem leitura ainda"));
			continue;
		}
		for (const [key, label] of [["h5", "5 h"], ["week", "semana"]]) {
			const window = usage[key];
			if (!window) continue;
			const tone = window.pct >= 90 ? "error" : window.pct >= 70 ? "warning" : "muted";
			const right = theme.fg(tone, `${Math.round(window.pct)}%${window.resets ? ` · volta ${resetLabel(window.resets, now)}` : ""}`);
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
	const out = [heading(theme, `${open ? "▾" : "▸"} MCP`, theme.fg("muted", `  ${connected}/${mcp.length} conectados`))];
	if (!open) return out;
	if (!mcp.length) return [...out, theme.fg("dim", "nenhum MCP (pink mcp add)")];
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
	if (title) lines.push(field("Sessão", title.length > 70 ? `${title.slice(0, 69)}…` : title));
	const totals = (stats?.models ?? []).reduce((sum, item) => ({ input: sum.input + item.input, output: sum.output + item.output }), { input: 0, output: 0 });
	if (totals.input || totals.output) lines.push(field("Tokens", `${formatTokens(totals.input)} entrada  ${formatTokens(totals.output)} saída  $${(stats.cost ?? 0).toFixed(2)}`));
	if (resume) lines.push(field("Continuar", theme.fg("accent", resume)));
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

export const PINK_GLOBALS = ["__pinkFrame", "__pinkAssistantFooter", "__pinkUserBar", "__pinkThinkingLabel"];

export function install(pi, ctx, { CustomEditor, SessionManager, version = "", matchesKey, onPalette, onAgent }) {
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
	pi.on("agent_start", () => {
		signal("\x1b]9;4;3\x07");
		leaveHome();
	});
	pi.on("input", leaveHome);
	void pi.exec?.("git", ["branch", "--show-current"], { cwd: ctx.cwd }).then((result) => {
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
	pi.on("agent_end", () => {
		signal("\x1b]9;4;0\x07\x07");
		// título automático (owner 2026-10-29): só quando a sessão ainda não tem nome
		if (!pi.getSessionName?.()) {
			const title = autoTitle(ctx.sessionManager?.getBranch?.());
			if (title) pi.setSessionName?.(title);
		}
		loadSessions();
	});

	// a moldura só existe na tela cheia; no modo regular do Pi (--tui-mode regular) fica o rodapé de uma linha
	const framed = () => (state.tui?.mode ?? "fullscreen") === "fullscreen";
	const rows = () => state.tui?.terminal?.rows ?? 24;
	const homeRows = () => (framed() ? rows() - 2 * barRows(rows()) + 1 : rows()); // homeTop/homeBottomPad já descontam uma linha de rodapé

	ctx.ui.setHeader((tui, theme) => {
		state.tui = tui;
		return {
			render: live((width) => (state.home ? homeHeader({ theme, width, rows: homeRows(), subtitle: `coding agent · modelo ${ctx.model?.id ?? "thoth"}` }) : []), []),
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

		// ctrl+p abre a paleta e tab com a caixa vazia troca o agente (OpenCode); o resto segue para o editor do Pi
		handleInput(data) {
			if (matchesKey?.(data, "ctrl+p") && onPalette) return void onPalette();
			if (matchesKey?.(data, "tab") && onAgent && !String(this.getText?.() ?? "").trim()) return void onAgent();
			// ctrl+n nova sessão; alt+↑/alt+↓ a sessão anterior/seguinte da coluna, salvo onde o Pi já usa a tecla (dequeue fora do Windows)
			if (matchesKey?.(data, "ctrl+n")) return void runCommand("/new");
			const step = matchesKey?.(data, "alt+up") ? -1 : matchesKey?.(data, "alt+down") ? 1 : 0;
			if (step && !this.pinkKeys?.matches?.(data, "app.message.dequeue")) return void openNeighbour(step);
			super.handleInput(data);
		}

		render(width) {
			try {
				return this.pinkRender(width);
			} catch {
				return super.render(width);  // ctx antigo durante a troca de sessão: o editor do Pi, sem moldura
			}
		}

		pinkRender(width) {
			const outer = state.home ? Math.min(width, HOME_WIDTH) : width;
			const margin = state.home ? Math.floor((width - outer) / 2) : 0;
			const theme = ctx.ui.theme;
			const label = modelLabel({ theme, model: ctx.model, thinking: pi.getThinkingLevel?.(), agent: PINK.agent });
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
		if (ctx.isIdle && !ctx.isIdle()) return void ctx.ui.notify?.("Espere a resposta terminar para trocar de sessão", "info");
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

	// pensamento atrás de um título, como no OpenCode: recolhido por padrão; o Pi 1.x abre e recolhe cada bloco com um clique,
	// ctrl+t abre e recolhe todos (e salva); o título do bloco aberto vem do patch thinking-header-when-shown
	ctx.ui.setHiddenThinkingLabel?.("+ Pensou");
	globalThis.__pinkThinkingHeader = "− Pensou · clique ou ctrl+t recolhe";
	globalThis.__pinkThinkingLabel = (message, runIndex) => thinkingLabel(PINK.thinking.get(message?.timestamp)?.[runIndex]?.ms);
	// "Pink · Build" sobre cada resposta (patch assistant-label); o agente é o da hora da resposta, desconhecido em sessão reaberta
	// rodapé de cada resposta final (patch assistant-footer), lido a cada quadro: o tempo chega no message_end
	globalThis.__pinkAssistantFooter = live((message, streaming, width, outputPad = 1) => {
		if (streaming) return [];
		const timing = PINK.timing.get(message?.timestamp) ?? {};
		const line = assistantFooter({ theme: ctx.ui.theme, model: message?.model, agent: PINK.agentOf.get(message?.timestamp), ms: timing.ms, output: message?.usage?.output, run: PINK.runOf.get(message?.timestamp) });
		return [fit(" ".repeat(outputPad) + line, width)];
	}, []);
	// barra rosa cheia à esquerda da mensagem do usuário (patch user-bar), a mesma da caixa de envio
	globalThis.__pinkUserBar = live((line) => `${ctx.ui.theme.fg("accent", BAR)}${line}`, (line) => line);
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
				const title = ctx.sessionManager?.getSessionName?.() || sessionStats(ctx.sessionManager?.getEntries?.()).title || "Sessão atual";
				const listed = state.sessions.map((item) => ({ title: item.name || item.firstMessage, current: item.path === current, when: relativeTime(item.modified) }));
				const sessions = listed.some((item) => item.current) ? listed : [{ title, current: true, when: relativeTime(Date.now()) }, ...listed];
				return leftColumn({ theme, width: LEFT_WIDTH, height, data: { sessions, tools: (pi.getActiveTools?.() ?? []).length } });
			}
			startThoth();
			const stats = sessionStats(ctx.sessionManager?.getEntries?.());
			const total = stats.models.reduce((sum, item) => ({ input: sum.input + item.input, output: sum.output + item.output }), { input: 0, output: 0 });
			return rightColumn({ theme, width: RIGHT_WIDTH, height, data: { ...total, cost: stats.cost, models: stats.models.map((item) => item.model).filter((model) => model && model !== "?"), project, context: bars().context, todos: PINK.todos, thoth: PINK.thoth.data, plan: PINK.plan.data, mcp: globalThis.__pinkMcp?.(), mcpOpen: PINK.mcpOpen, hits: (PINK.rightHits = {}), changes: changesFromBranch(ctx.sessionManager?.getBranch?.(), PINK.created) } });
		}, []),
	};
	// tarefas sobre a caixa de digitar quando a coluna da direita não cabe (com ela, as tarefas aparecem no PLANO)
	ctx.ui.setWidget?.("pink-tarefas", (tui, theme) => ({
		render: live((width) => (!PINK.todos.some((item) => item.status === "pending" || item.status === "in_progress") || columns(tui.terminal?.columns ?? width).right ? [] : todoLines({ theme, todos: PINK.todos, width })), []),
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
				const right = `${theme.fg("muted", "ctrl+t pensamento")}${theme.fg("dim", `   ${used ? `ctx ${used}   ` : ""}pink ${version} `)}`;
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

// "Apagar sessão" nunca apaga (regra do owner): move o arquivo para <pasta das sessões>/.trash/, que o Pi não lista
export function trashSession(file, current, { fs, path, now = Date.now() }) {
	if (!file) return { ok: false, reason: "sessão sem arquivo" };
	if (current && path.resolve(file).toLowerCase() === path.resolve(current).toLowerCase()) return { ok: false, reason: "é a sessão atual: troque de sessão antes de apagar" };
	const dir = path.join(path.dirname(file), ".trash");
	fs.mkdirSync(dir, { recursive: true });
	let target = path.join(dir, path.basename(file));
	if (fs.existsSync(target)) target = path.join(dir, `${now}-${path.basename(file)}`);
	fs.renameSync(file, target);
	return { ok: true, target };
}

// ferramentas e pensamento compactos, como no OpenCode (owner 2026-10-29): uma linha cinza por bloco; ctrl+o (ferramentas)
// e ctrl+t (pensamento) expandem para a visão completa do Pi, com o diff do edit
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

export function toolSummary(name, args = {}, result) {
	const file = (value) => String(value ?? "").replace(/\\/g, "/");
	if (name === "read") return `Leu ${file(args.path)}`;
	if (name === "write") return `Escreveu ${file(args.path)}${typeof args.content === "string" ? ` · ${args.content.split("\n").length} linhas` : ""}`;
	if (name === "edit") {
		const patch = result?.details?.patch ?? result?.details?.diff;
		const stats = patch ? diffStats(patch) : undefined;
		return `Editou ${file(args.path)}${stats ? ` +${stats.add} −${stats.del}` : ""}`;
	}
	if (name === "bash") return `Rodou: ${shorten(args.command, 60)}`;
	if (name === "grep") return `Buscou "${shorten(args.pattern, 40)}"`;
	if (name === "find") return `Procurou ${shorten(args.pattern ?? args.path, 40)}`;
	if (name === "ls") return `Listou ${file(args.path ?? ".")}`;
	if (name === "todowrite") {
		const todos = normalizeTodos(args.todos);
		return `Plano · ${todos.filter((item) => item.status === "completed").length}/${todos.length}`;
	}
	return name;
}

export function compactToolRenderer(toolName, next) {
	const base = next?.();
	const empty = { render: () => [], invalidate() {} };
	const line = (theme, pad, text, extra = "") => ({ render: (width) => [fit(`${" ".repeat(pad)}${theme.fg("muted", `→ ${text}`)}${extra}`, width)], invalidate() {} });
	// expandido: a visão do Pi; as do Pi com moldura própria ("default") ganham só o recuo, já que esta é "self"
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
			return context.isPartial ? line(theme, context.outputPad, toolSummary(toolName, args ?? {}), theme.fg("dim", " …")) : empty;
		},
		renderResult(result, options, theme, context) {
			if (options.expanded) return wrap(base?.renderResult?.(result, options, theme, context) ?? output(result, theme, 0), context.outputPad);
			if (options.isPartial) return empty;
			const time = context.durationMs >= 100 ? theme.fg("dim", ` · ${(context.durationMs / 1000).toFixed(1)}s`) : "";
			return line(theme, context.outputPad, toolSummary(toolName, context.args ?? {}, result), `${time}${context.isError ? theme.fg("error", " · erro") : ""}`);
		},
	};
}

export function thinkingLabel(ms) {
	return `+ Pensou${ms > 0 ? ` · ${(ms / 1000).toFixed(1)}s` : ""}`;
}

export const LANGUAGE_PROMPT = "\n\n# Idioma (Pink)\nResponda no idioma em que o usuário escreve. Quando não der para saber (mensagem curta, só código), responda em português do Brasil.";

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

// a nova tentativa automática do Pi (erro do provedor, contexto estourado) é agent_end + agent_start: continua o mesmo pedido
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
export const PINK = { agent: "build", todos: [], snapshots: new Map(), redo: [], agentOf: new Map(), timing: new Map(), runOf: new Map(), run: undefined, runTimer: undefined, lastRun: undefined, lastRunEnd: 0, thinking: new Map(), created: new Set(), thoth: { data: { ok: false, loading: true }, timer: undefined, busy: false, redraw: undefined }, plan: { data: { ok: false, loading: true }, timer: undefined, busy: false }, mcpOpen: false, rightHits: {} };

// "Você" sobre a mensagem do usuário, pela API pública de transformar o markdown antes de desenhar
export function labelUserMarkdown(markdown, context) {
	return context?.messageType === "user" ? `**Você**\n\n${markdown}` : markdown;
}

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

const DELETE_ITEM = "× Apagar uma sessão…";

async function deleteSession(ctx) {
	const { SessionManager } = await import("@earendil-works/pi-coding-agent");
	const current = ctx.sessionManager?.getSessionFile?.();
	const path = node("node:path");
	const list = (await SessionManager.list(ctx.cwd)).filter((item) => !current || path.resolve(item.path).toLowerCase() !== path.resolve(current).toLowerCase()).sort((a, b) => b.modified - a.modified).slice(0, 40);
	if (!list.length) return void ctx.ui.notify?.("Nenhuma outra sessão para apagar (a atual não pode ser apagada)", "info");
	const labels = list.map((item, i) => `${i + 1}. ${String(item.name || item.firstMessage || "(sem título)").replace(/\s+/g, " ").slice(0, 60)}  · ${relativeTime(item.modified)}`);
	const choice = await ctx.ui.select?.("Apagar qual sessão? (vai para a lixeira .trash)", labels);
	if (!choice) return;
	const item = list[labels.indexOf(choice)];
	if (!(await ctx.ui.confirm?.("Apagar sessão?", `${choice}\nO arquivo vai para ${path.join(path.dirname(item.path), ".trash")} (nada é excluído).`))) return;
	try {
		const done = trashSession(item.path, current, { fs: node("node:fs"), path });
		ctx.ui.notify?.(done.ok ? `Sessão na lixeira: ${done.target}` : `Não apagada: ${done.reason}`, done.ok ? "info" : "error");
	} catch (error) {
		ctx.ui.notify?.(`Não apagada: ${error?.message ?? error}`, "error");
	}
	PINK.refreshSessions?.();
}

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
		const choice = await ctx.ui.select?.("Sessões", [DELETE_ITEM, ...labels]);
		if (choice === DELETE_ITEM) return void (await deleteSession(ctx));
		if (choice) await ctx.switchSession(list[labels.indexOf(choice)].path);
	});
	command("session-open", "Abrir uma sessão pelo arquivo (o clique e alt+↑/↓ na coluna SESSÕES usam este)", async (args, ctx) => {
		const target = String(args ?? "").trim();
		if (target) await ctx.switchSession(target);
	});
	command("delete-session", "Apagar sessão (vai para a lixeira .trash, com confirmação)", async (_args, ctx) => deleteSession(ctx));
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
	// "Trabalhando · 1m 12s · ↓ 3.1k tokens" ao vivo; no fim, o rodapé da última resposta guarda o total do pedido
	// (registrado antes do ponto de restauração: o Pi espera cada gancho, e o git não pode atrasar o relógio)
	pi.on("agent_start", async (_event, ctx) => {
		clearInterval(PINK.runTimer);
		const run = (PINK.run = continueRun(PINK.lastRun, PINK.lastRunEnd) ?? createRun());
		const show = () => {
			try {
				ctx.ui.setWorkingMessage?.(`Trabalhando · ${runLabel(run.summary())}`);
			} catch {
				clearInterval(PINK.runTimer);  // ctx velho (sessão trocada): para o relógio
			}
		};
		show();
		PINK.runShow = show;  // o message_update também atualiza (tokens), o relógio só o tempo
		PINK.runTimer = setInterval(show, 1000);
		PINK.runTimer.unref?.();
	});
	pi.on("agent_end", async (_event, ctx) => {
		clearInterval(PINK.runTimer);
		ctx.ui.setWorkingMessage?.();
		if (PINK.run?.last !== undefined) PINK.runOf.set(PINK.run.last, PINK.run.summary());
		[PINK.lastRun, PINK.lastRunEnd, PINK.run, PINK.runShow] = [PINK.run, Date.now(), undefined, undefined];
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
	pi.on("message_start", async (event) => {
		if (event?.message?.role !== "assistant") return;
		PINK.agentOf.set(event.message.timestamp, PINK.agent);
		PINK.timing.set(event.message.timestamp, { start: PINK.turnStart ?? Date.now() });  // do pedido ao fim, como o OpenCode
	});
	pi.on("message_update", async (event) => {
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
	pi.on("turn_start", async () => {
		PINK.turnStart = Date.now();
	});
	pi.on("message_end", async (event) => {
		PINK.run?.add(event?.message);
		const timing = event?.message?.role === "assistant" ? PINK.timing.get(event.message.timestamp) : undefined;
		if (timing?.start) timing.ms = Date.now() - timing.start;
	});
	pi.on("tool_call", async (event, ctx) => {
		const target = event.toolName === "write" ? event.input?.path : undefined;
		if (typeof target === "string" && target) {
			try {
				if (!node("node:fs").existsSync(node("node:path").resolve(ctx.cwd ?? ".", target))) PINK.created.add(target);
			} catch {
				// sem como saber: a coluna ALTERAÇÕES mostra "editado"
			}
		}
		if (PINK.agent !== "plan") return;
		const decision = planDecision(event.toolName, pi.getAllTools?.().find((tool) => tool.name === event.toolName)?.annotations);
		if (decision === "allow") return;
		if (decision === "ask" && ctx.hasUI && (await ctx.ui.confirm?.("Agente Plano: rodar este comando?", String(event.input?.command ?? event.toolName)))) return;
		return { block: true, reason: `Agente Plano (só leitura): ${event.toolName} não é permitido. Peça ao usuário para trocar para o Build (tab).` };
	});
	// seções do prompt, não o prompt inteiro: devolver systemPrompt forçava o texto e apagava as seções das outras extensões (Ponytail)
	pi.on("before_agent_start", async (event) => {
		const sections = event?.systemPromptOptions?.sections;
		if (!sections || typeof sections !== "object") return { systemPrompt: `${event.systemPrompt ?? ""}${LANGUAGE_PROMPT}${PINK.agent === "plan" ? PLAN_PROMPT : ""}` };
		sections.pink_language = LANGUAGE_PROMPT.trim();
		if (PINK.agent === "plan") sections.pink_plan = PLAN_PROMPT.trim();
		else delete sections.pink_plan;
	});
	pi.on("session_tree", async (_event, ctx) => {
		PINK.todos = todosFromBranch(ctx.sessionManager?.getBranch?.());
	});
}

const TODO_RUNTIMES = new WeakSet();

async function registerTodoTool(pi) {
	// uma vez por runtime: trocar de sessão cria um runtime novo, que precisa da ferramenta de novo (antes sumia: "4 ativas")
	if (TODO_RUNTIMES.has(pi) || !pi.registerTool) return;
	TODO_RUNTIMES.add(pi);
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
		for (const name of PINK_GLOBALS) globalThis[name] = undefined;  // a sessão seguinte reinstala; até lá, nada lê o ctx antigo
		clearInterval(PINK.runTimer);
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
	pi.registerMarkdownTransformer?.(labelUserMarkdown);
	pi.registerToolRenderer?.(compactToolRenderer);
	pi.on("session_start", async (_event, ctx) => {
		await registerTodoTool(pi);
		PINK.todos = todosFromBranch(ctx.sessionManager?.getBranch?.());
		if (ctx.mode !== "tui") return;
		const { CustomEditor, SessionManager, VERSION } = await import("@earendil-works/pi-coding-agent");
		const { matchesKey } = await import("@earendil-works/pi-tui");
		install(pi, ctx, { CustomEditor, SessionManager, version: VERSION ?? "", matchesKey, onPalette: () => openPalette(pi, ctx), onAgent: () => switchAgent(ctx) });
	});
}
