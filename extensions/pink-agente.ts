// Sessão inteira num agente instalado (owner 2026-11-23, card 1dfwh7kgf8k), como o OpenBot faz: com /agente claude (ou
// codex, opencode, cline...), o que a pessoa digita vai para o programa oficial do agente, com o login, a cota e o
// histórico dele, e a resposta aparece no Pink. A conversa continua entre mensagens (claude --resume, codex
// thread/resume, ACP session/load). /agente off volta ao modelo do Pink, que vê a conversa (as mensagens ficam na sessão).
// O transporte é o mesmo dos subagentes externos (examples/extensions/subagent/external.ts, cards 1dfwh7kgf8g/h/j).
import { t } from "./pink-i18n.ts";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeKept, externalAgents, listModels, pinkExtras, runExternal, warmKept } from "../examples/extensions/subagent/external.ts";
import { bulleted, elapsedLabel, fit, runLabel, shortModel, streamedTokens, thinkingLabel, toolSummary, userLines, workingLabel } from "./pink-ui.ts";

// o Pink junto (card 1dfwh7kgfjx): MCPs do mcp.json, AGENTS.md e skills do Pink, mais o próprio Pink como MCP
const readJson = (file: string) => {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return undefined;
	}
};
// pink_tela (owner 2026-11-24): o agente instalado usa a tela DESTE Pink, a que a pessoa ligou com /tela ligar, pelo MCP
// do Pink. Pipe local com uma chave aleatória (o nome do pipe outros usuários conseguem listar; a chave só vai nos argumentos
// do MCP, que só o próprio usuário lê). Cada pedido passa pelo execute da tela: desligada recusa, agir pede confirmação aqui.
export function telaBridge(getCtx: () => any, tela: () => any = () => Reflect.get(globalThis, "__pinkTela")) {
	const key = crypto.randomUUID();
	const id = crypto.randomUUID();
	const pipe = process.platform === "win32" ? `\\\\.\\pipe\\pink-agente-tela-${id}` : path.join(os.tmpdir(), `pink-agente-tela-${id}.sock`);
	const fail = (text: string) => ({ content: [{ type: "text", text }], isError: true });
	const answer = async (request: any) => {
		const given = Buffer.from(String(request?.key ?? ""));
		if (given.length !== key.length || !crypto.timingSafeEqual(given, Buffer.from(key))) return fail("Chave errada.");
		const screen = tela();
		if (!screen?.execute) return fail(t("A tela do Pink não está disponível neste Pink.", "La pantalla de Pink no está disponible en este Pink.", "Pink's screen is not available in this Pink."));
		const args = request.args && typeof request.args === "object" && !Array.isArray(request.args) ? request.args : {};
		const done = await screen.execute("pink-agente", { action: String(request.action ?? ""), args }, undefined, undefined, getCtx() ?? { hasUI: false });
		return { content: done?.content ?? [], isError: Boolean(done?.isError) };
	};
	const server = net.createServer((socket) => {
		let buffer = "";
		socket.setEncoding("utf8");
		socket.on("error", () => undefined);
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			if (buffer.length > 1_000_000) return void socket.destroy();
			const end = buffer.indexOf("\n");
			if (end < 0) return;
			let request: any;
			try {
				request = JSON.parse(buffer.slice(0, end));
			} catch {
				return void socket.destroy();
			}
			buffer = "";
			answer(request).then(
				(value) => socket.end(`${JSON.stringify(value)}\n`),
				(error) => socket.end(`${JSON.stringify(fail(String(error?.message ?? error)))}\n`),
			);
		});
	});
	server.on("error", () => undefined);
	server.listen(pipe);
	server.unref();
	return { pipe, key, close: () => server.close() };
}

export function gatherExtras(pink: any, dir = process.env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent"), tela?: { pipe: string; key: string }) {
	let rules = "";
	try {
		rules = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
	} catch {
		/* sem regras globais */
	}
	let skills: any[] = [];
	try {
		skills = (pink.getCommands?.() ?? []).filter((command: any) => command.source === "skill" && String(command.name).startsWith("skill:")).map((command: any) => ({ name: command.name.slice(6), description: command.description, path: command.sourceInfo?.path }));
	} catch {
		/* sem skills */
	}
	const server = { command: process.execPath, args: [path.join(path.dirname(fileURLToPath(import.meta.url)), "pink-mcp-server.mjs"), ...(tela ? ["--tela", tela.pipe, tela.key] : [])] };
	return pinkExtras({ mcp: readJson(path.join(dir, "mcp.json"))?.mcpServers ?? {}, rules, skills, server });
}

const STATUS = "pink-agente";
// subagentes do opencode (owner 2026-11-25: "ta usando subagente, mas eu não vejo"): pelo ACP só chega a chamada da
// ferramenta; cada subagente é uma sessão filha no banco do opencode, com a última mensagem dizendo se terminou
export function opencodeDb(env: NodeJS.ProcessEnv = process.env, home = os.homedir()) {
	return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "opencode", "opencode.db");
}
const tree = (table: string) => `WITH RECURSIVE tree(id, depth) AS (SELECT id, 1 FROM ${table} WHERE parent_id = ? UNION ALL SELECT s.id, depth + 1 FROM ${table} s JOIN tree ON s.parent_id = tree.id WHERE depth < 3)`;
// opencode 2.x: session_v2 diz o estado (ocupado, ocioso com o resultado, suspenso)
const CHILDREN_SQL = `${tree("session_v2")}
SELECT s.title, s.agent, s.time_created AS created, s.time_updated AS updated, s.time_busy AS busy, s.time_idle AS idle, s.idle_outcome AS outcome, s.time_suspended AS suspended
FROM session_v2 s JOIN tree ON s.id = tree.id WHERE s.time_updated > ? ORDER BY s.time_created`;
// opencode 1.x (até 14/10): a última mensagem diz se terminou
const LEGACY_SQL = `${tree("session")}
SELECT s.title, s.agent, s.time_created AS created, s.time_updated AS updated, (SELECT data FROM message m WHERE m.session_id = s.id ORDER BY m.time_created DESC LIMIT 1) AS last
FROM session s JOIN tree ON s.id = tree.id WHERE s.time_updated > ? ORDER BY s.time_created`;
// `external` é o transporte ("acp"), não o agente: olhar o nome e o executável (owner 2026-11-25, subagentes sumiam)
export const isOpencode = (agent: any) => /opencode/i.test(`${agent?.name ?? ""} ${agent?.bin ?? ""}`);
// o que o agente não viu: a conversa depois da última resposta dele (ou toda, se ele nunca falou nesta sessão), com o modelo
// do Pink e outros agentes; vai antes do pedido para ele continuar de onde o outro parou (owner 2026-11-26)
const textOfContent = (content: any) => (typeof content === "string" ? content : (content ?? []).filter((part: any) => part?.type === "text").map((part: any) => part.text).join("\n")).trim();
export function contextFor(entries: any[] | undefined, agent: string, max = 16000): string {
	const list = entries ?? [];
	let from = 0;
	list.forEach((entry, index) => {
		if (entry?.type === "custom_message" && entry.customType === "pink-agente" && entry.details?.agent === agent) from = index + 1;
	});
	const lines = list.slice(from).map((entry) => {
		if (entry?.type === "message" && entry.message?.role === "user") return `${t("Pessoa", "Persona", "User")}: ${textOfContent(entry.message.content)}`;
		if (entry?.type === "message" && entry.message?.role === "assistant") {
			const text = textOfContent(entry.message.content);
			return text ? `${t("Modelo do Pink", "Modelo de Pink", "Pink model")}${entry.message.model ? ` (${entry.message.model})` : ""}: ${text}` : "";
		}
		if (entry?.type === "custom_message" && entry.customType === "pink-agente-pedido") return `${t("Pessoa", "Persona", "User")} → ${entry.details?.agent}: ${entry.details?.text ?? ""}`;
		if (entry?.type === "custom_message" && entry.customType === "pink-agente") return `${entry.details?.agent}: ${textOfContent(entry.content)}`;
		return "";
	}).filter((line) => line.replace(/^[^:]*:\s*/, "").trim());
	if (!lines.length) return "";
	let body = lines.join("\n\n");
	if (body.length > max) body = `…${body.slice(body.length - max)}`; // shortcut: corta pelo começo; um resumo pelo modelo seria melhor em conversa muito longa
	return `${t("Contexto: antes deste pedido a conversa no Pink seguiu sem você. O que aconteceu:", "Contexto: antes de este pedido la conversación en Pink siguió sin ti. Lo que pasó:", "Context: before this request the conversation in Pink went on without you. What happened:")}\n\n${body}\n\n${t("Pedido atual:", "Pedido actual:", "Current request:")}`;
}

// o pedido que o agente largou ao trocarem o modelo, para o novo modelo do Pink continuar
export const handoffText = (agent: string, asks: string[]) =>
	`${t(`O ${agent} foi interrompido na troca de modelo. O que ele já fez está acima; continue este pedido:`, `${agent} fue interrumpido al cambiar de modelo. Lo que ya hizo está arriba; continúa este pedido:`, `${agent} was stopped by the model switch. What it already did is above; continue this request:`)}\n\n${asks.filter((ask) => ask.trim()).join("\n\n")}`;
export const CHILD_DONE_SHOWN_MS = 15000;
function childState(row: any): { state: "running" | "paused" | "done" | "failed" | "stopped"; end?: number } {
	if (row.last === undefined) {
		const busy = Number(row.busy) || 0;
		const idle = Number(row.idle) || 0;
		if (idle && idle >= busy) return { state: row.outcome === "failed" ? "failed" : row.outcome === "interrupted" ? "stopped" : "done", end: idle };
		if (row.suspended && Number(row.suspended) >= busy) return { state: "paused" };
		return { state: "running" };
	}
	let last: any = {};
	try {
		last = row.last ? JSON.parse(row.last) : {};
	} catch {}
	if (last.error) return { state: "failed", end: Number(row.updated) };
	const done = last.role === "assistant" && Boolean(last.time?.completed) && Boolean(last.finish) && last.finish !== "tool-calls";
	return done ? { state: "done", end: Number(row.updated) } : { state: "running" };
}
const CHILD_MARK: Record<string, string | undefined> = { running: undefined, paused: "‖", done: "✓", failed: "✗", stopped: "−" };
export function childAgents(rows: any[], now: number) {
	const out: any[] = [];
	for (const row of rows ?? []) {
		const { state, end } = childState(row);
		if (end && now - end > CHILD_DONE_SHOWN_MS) continue; // terminou há tempo: sai da lista
		if (!end && now - Number(row.updated) > 10 * 60000) continue; // parado há 10 min: o processo morreu
		const title = String(row.title ?? "");
		const named = title.match(/^(.*?)\s*\(@([\w.-]+) subagent\)\s*$/);
		out.push({ agent: named?.[2] ?? (row.agent || "subagente"), task: (named?.[1] ?? title).trim(), started: Number(row.created), mark: CHILD_MARK[state], clock: end ? `${Math.round((end - Number(row.created)) / 1000)}s` : state === "paused" ? t("pausado", "pausado", "paused") : undefined, running: !end });
	}
	return out;
}
export function readChildren(file: string, rootId: string, now = Date.now(), open = (f: string) => new (process.getBuiltinModule?.("node:sqlite") as any).DatabaseSync(f, { readOnly: true })) {
	if (!rootId || !fs.existsSync(file)) return [];
	let db: any;
	try {
		db = open(file);
		const since = now - 10 * 60000;
		const has = (table: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
		const rows = [...(has("session_v2") ? db.prepare(CHILDREN_SQL).all(rootId, since) : []), ...(has("session") ? db.prepare(LEGACY_SQL).all(rootId, since) : [])];
		return childAgents(rows, now);
	} catch {
		return []; // banco trancado, versão sem a tabela ou Node sem node:sqlite: só não mostra
	} finally {
		try {
			db?.close?.();
		} catch {}
	}
}

// os subagentes que o próprio fluxo do agente contou (Claude, Codex e ACP: pink-external-agents marca início e fim)
export function liveAgents(result: any, now: number) {
	return Object.values(result?.subagents ?? {})
		.filter((item: any) => !item.end || now - item.end <= CHILD_DONE_SHOWN_MS)
		.map((item: any) => ({ agent: item.agent, task: item.task, started: item.started, mark: item.state === "failed" ? "✗" : item.end ? "✓" : undefined, clock: item.end ? `${Math.round((item.end - item.started) / 1000)}s` : undefined, running: !item.end }));
}

const WIDGET = "pink-agente-trabalhando";
const CHILDREN = "pink-agente-subagentes";
const QUEUE = "pink-agente-fila";
// o id da conversa do agente fica nos detalhes de cada resposta gravada na sessão do Pink: reabrir a sessão e escolher o
// mesmo agente retoma a conversa dele (claude --resume, codex thread/resume, ACP session/load)
export const lastAgentSession = (entries: any[] | undefined, name: string): string | undefined =>
	[...(entries ?? [])].reverse().find((e) => e?.type === "custom_message" && e.customType === "pink-agente" && e.details?.agent === name && typeof e.details?.session === "string" && e.details.session)?.details.session;
// fila como no Claude Code (owner 2026-11-24): cada mensagem esperando aparece em cinza acima da caixa, numa linha
export const queueLines = (queue: string[], width: number) => queue.map((text) => fit(`> ${String(text).replace(/\s+/g, " ").trim()}`, width));
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const THOUGHT_MAX = 8000; // o pensamento guardado na sessão, por passo
// como o OpenCode: o trabalho antes da resposta vira uma linha "+ 4 comandos, 4 pensamentos" que abre com clique
export function workSummary(list: any[]) {
	const tools = list.filter((step) => step.kind === "tool").reduce((sum, step) => sum + (Number(String(step.line).match(/ ×(\d+)$/)?.[1]) || 1), 0);
	const thoughts = list.filter((step) => step.kind === "thinking").length;
	const parts = [];
	if (tools) parts.push(`${tools} ${tools === 1 ? t("comando", "comando", "command") : t("comandos", "comandos", "commands")}`);
	if (thoughts) parts.push(`${thoughts} ${thoughts === 1 ? t("pensamento", "pensamiento", "thought") : t("pensamentos", "pensamientos", "thoughts")}`);
	return parts.join(", ");
}
// a resposta final fica de fora do grupo; o que vem antes dela (pensamentos, ferramentas e textos do meio) entra
export function splitWork(list: any[]) {
	const last = list.map((step) => step.kind).lastIndexOf("text");
	return last < 0 ? { work: list, answer: [] } : { work: list.slice(0, last), answer: list.slice(last) };
}

const fresh = () => ({ messages: [] as any[], stderr: "", exitCode: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 } });

// nomes e argumentos de cada agente (Claude: Read/file_path, Glob...) viram os do Pink, para a linha sair igual à nativa
const NAMES: Record<string, string> = { multiedit: "edit", glob: "find", notebookedit: "edit" };
export function pinkTool(part: any, cwd = "") {
	// MCP no Claude e no codex vem como mcp__<servidor>__<ferramenta>: fica só a ferramenta
	const raw = String(part?.name ?? "tool").replace(/^mcp__.+?__/, "");
	const name = NAMES[raw.toLowerCase()] ?? raw.toLowerCase();
	const args = { ...(part?.arguments ?? {}) };
	// pink_tela: a linha diz o que fez na tela (tela · click 120, 340), não só o nome da ferramenta repetido
	if (name === "pink_tela") return tela(args.action, args.args);
	const file = args.path ?? args.file_path ?? args.filePath ?? args.notebook_path;
	if (file) args.path = cwd && path.isAbsolute(String(file)) ? path.relative(cwd, String(file)) || "." : String(file);
	// o "execute" do opencode roda código que chama ferramentas MCP (tools.pink.pink_tela(...)): mostra as ferramentas
	const code = String(args.code ?? "");
	const actions = [...code.matchAll(/action["']?\s*:\s*["']([\w-]+)["']/g)].map((match) => match[1]);
	if (actions.length && /pink_tela\s*\(/.test(code)) return tela(actions.join(", "));
	const called = [...new Set([...code.matchAll(/tools\.[\w$-]+\.([\w$-]+)\s*\(/g)].map((match) => match[1]))];
	if (called.length) return called.join(", ");
	const line = toolSummary(name, args);
	return line === name && args.title ? String(args.title) : line;
}

function tela(action: unknown, args: any = {}) {
	const a = args && typeof args === "object" ? args : {};
	const what = a.text !== undefined ? `"${String(a.text).slice(0, 40)}"` : a.key ?? (Array.isArray(a.keys) ? a.keys.join("+") : a.x !== undefined ? `${a.x}, ${a.y}` : a.name ?? a.direction ?? "");
	return ["tela ·", String(action || "?"), what].filter(Boolean).join(" ");
}

// os passos da resposta, na ordem: pensou, ferramentas e textos (o desenho usa; o modelo do Pink lê o texto puro)
export function steps(result: any, cwd = "") {
	const out: any[] = [];
	for (const message of result.messages) {
		for (const part of message.content ?? []) {
			if (part.type === "text" && part.text?.trim()) out.push({ kind: "text", text: part.text });
			// o pensamento chega de uma vez: tempo quase 0 não diz nada; o texto fica para abrir com clique ou ctrl+t (owner 2026-11-25)
			else if (part.type === "thinking") out.push({ kind: "thinking", ms: part.ms >= 100 ? part.ms : 0, text: String(part.thinking ?? "").trim().slice(0, THOUGHT_MAX) });
			else if (part.type === "toolCall") out.push({ kind: "tool", line: pinkTool(part, cwd) });
		}
	}
	return out;
}

// como no Claude Code: ferramentas seguidas viram uma linha de resumo. A tela vira "tela · 16 ações: list_windows,
// get_window_state ×5, click ×4..." e linhas iguais em sequência viram "linha ×N" (antes eram dezenas de linhas iguais)
export function compact(list: any[]) {
	const out: any[] = [];
	for (const step of list) {
		const last = out.at(-1);
		const screen = step.kind === "tool" && String(step.line).startsWith("tela · ");
		if (screen && last?.screen) last.actions.push(String(step.line).split(" ")[2]);
		else if (step.kind === "tool" && last?.kind === "tool" && !last.screen && last.base === step.line) last.count++;
		else out.push(screen ? { kind: "tool", screen: true, actions: [String(step.line).split(" ")[2]], first: step.line } : step.kind === "tool" ? { ...step, base: step.line, count: 1 } : step);
	}
	return out.map((step) => {
		if (step.screen) {
			if (step.actions.length === 1) return { kind: "tool", line: step.first };
			const counts = new Map<string, number>();
			for (const action of step.actions) counts.set(action, (counts.get(action) ?? 0) + 1);
			const names = [...counts].map(([action, n]) => (n > 1 ? `${action} ×${n}` : action)).join(", ");
			return { kind: "tool", line: `tela · ${step.actions.length} ${t("ações", "acciones", "actions")}: ${names}` };
		}
		return step.kind === "tool" ? { kind: "tool", line: step.count > 1 ? `${step.base} ×${step.count}` : step.base } : step;
	});
}

export function render(result: any, cwd = ""): string {
	const all = compact(steps(result, cwd));
	const tools = all.filter((step) => step.kind === "tool").map((step) => `→ ${step.line}`);
	const answer = all.filter((step) => step.kind === "text").at(-1)?.text ?? "";
	const body = [tools.join("\n"), answer].filter(Boolean).join("\n\n");
	if (result.stopReason === "error") return [body, `⚠ ${result.errorMessage}`].filter(Boolean).join("\n\n");
	return body || t("(sem resposta)", "(sin respuesta)", "(no answer)");
}

const outputOf = (result: any) => result.usage?.output || result.messages.reduce((sum: number, message: any) => sum + streamedTokens(message), 0);

const label = (agent: any) => [agent.name, agent.model, agent.effort].filter(Boolean).join(" · ");

const loadTui = () => Promise.all([import("@earendil-works/pi-tui"), import("@earendil-works/pi-coding-agent")]);

// menu com busca, como o /model: digitar filtra (busca aproximada), setas escolhem, Enter confirma, Esc cancela.
// Sem tela interativa (testes, RPC) cai no ui.select de sempre.
const NAV = ["up", "down", "pageUp", "pageDown", "enter", "escape"] as const;
export async function pick(ctx: any, title: string, options: string[], load: () => Promise<any[]> = loadTui): Promise<string | undefined> {
	if (typeof ctx.ui?.custom !== "function" || (ctx.mode && ctx.mode !== "tui")) return ctx.ui.select(title, options);
	const [tui] = await load();
	return ctx.ui.custom((screen: any, theme: any, _keys: any, done: (value: string | undefined) => void) => {
		const input = new tui.Input({ prompt: "> ", placeholder: t("digite para buscar", "escribe para buscar", "type to search"), placeholderStyle: (text: string) => theme.fg("dim", text) });
		const style = { selectedPrefix: (s: string) => theme.fg("accent", s), selectedText: (s: string) => theme.fg("accent", s), description: (s: string) => theme.fg("muted", s), scrollInfo: (s: string) => theme.fg("dim", s), noMatch: (s: string) => theme.fg("warning", s) };
		const items = options.map((option) => ({ value: option, label: option }));
		let list: any;
		const build = () => {
			const query = input.getValue().trim();
			list = new tui.SelectList(query ? tui.fuzzyFilter(items, query, (item) => item.label) : items, 12, style);
			list.onSelect = (item: any) => done(item.value);
			list.onCancel = () => done(undefined);
		};
		build();
		return {
			get focused() {
				return input.focused;
			},
			set focused(value: boolean) {
				input.focused = value;
			},
			render: (width: number) => [theme.fg("accent", title), ...input.render(width), ...list.render(width)],
			invalidate() {
				input.invalidate?.();
				list.invalidate();
			},
			handleInput(data: string) {
				if (NAV.some((key) => tui.matchesKey(data, key))) list.handleInput(data);
				else {
					const before = input.getValue();
					input.handleInput(data);
					if (input.getValue() !== before) build();
				}
				screen.requestRender?.();
			},
		};
	});
}

export default function (pink: any, list: typeof externalAgents = externalAgents, run: typeof runExternal = runExternal, models: typeof listModels = listModels, extras: (tela?: { pipe: string; key: string }) => any = (tela) => gatherExtras(pink, undefined, tela), load: () => Promise<any[]> = loadTui, bridge: typeof telaBridge = telaBridge, warm: typeof warmKept = run === runExternal ? warmKept : () => undefined) {
	let screen: ReturnType<typeof telaBridge> | undefined; // pink_tela: aberto no primeiro /agente, fechado ao sair do Pink
	let screenCtx: any; // a janela deste Pink, onde a tela pede confirmação
	let active: { agent: any; resume: any; controller?: AbortController; queue?: string[]; live?: any; handoff?: string[] } | undefined;
	let ticker: ReturnType<typeof setInterval> | undefined;
	let lastUi: any;

	// "⠴ Trabalhando · 2s · ↓ 0 tokens" acima da caixa, com o mesmo Loader do Pink: o dele só aparece quando o modelo do Pink
	// responde, e este ocupa o mesmo lugar
	let loader: any;
	const idle = () => {
		if (ticker) clearInterval(ticker);
		ticker = undefined;
		loader?.stop?.();
		loader = undefined;
		lastUi?.setWidget?.(WIDGET, undefined);
		(globalThis as any).__pinkAgentBusy = false; // a caixa volta às dicas de sempre (pink-ui)
	};
	// a fila em cinza fica em cima do "Trabalhando" e uma linha vazia o separa da caixa (owner 2026-11-25, como o Claude Code)
	const around = (lines: string[], width: number, theme: any) => [...queueLines(active?.queue ?? [], width).map((line) => theme.fg("dim", line)), ...lines, ""];
	const busy = (ui: any, output: () => number) => {
		idle();
		lastUi = ui;
		if (!ui?.setWidget) return;
		const started = Date.now();
		const message = () => workingLabel({ ms: Date.now() - started, output: output() });
		(globalThis as any).__pinkAgentBusy = true; // a caixa mostra "esc interromper · ctrl+enter envia agora" (pink-ui)
		// a área dos widgets já deixa uma linha em branco antes: a linha vazia do topo do Loader sai
		if (tui?.Loader) {
			ui.setWidget(WIDGET, (screen: any, theme: any) => {
				screenRef = screen;
				loader?.stop?.(); // a fábrica pode ser chamada de novo: o Loader anterior para de girar
				loader = new tui.Loader(screen, (s: string) => theme.fg("accent", s), (s: string) => theme.fg("muted", s), message());
				const own = loader;
				return { render: (width: number) => around(own.render(width).slice(1), width, theme), invalidate: () => own.invalidate?.() };
			}, { placement: "aboveEditor" });
			ticker = setInterval(() => loader?.setMessage?.(message()), 1000);
		} else {
			let frame = 0;
			const draw = () => ui.setWidget(WIDGET, (screen: any, theme: any) => ((screenRef = screen), { render: (width: number) => around([` ${FRAMES[frame % FRAMES.length]} ${message()}`], width, theme), invalidate() {} }), { placement: "aboveEditor" });
			draw();
			ticker = setInterval(() => (frame++, draw()), 120);
		}
		ticker.unref?.();
	};

	// subagentes do opencode acima da caixa, a cada 2 s, enquanto a mensagem roda ou algum subagente segue vivo (os de
	// segundo plano continuam depois da resposta, como no Claude Code)
	let childTimer: ReturnType<typeof setInterval> | undefined;
	const stopChildren = (ui?: any) => {
		if (childTimer) clearInterval(childTimer);
		childTimer = undefined;
		(globalThis as any).__pinkAgentChildren = undefined;
		(ui ?? lastUi)?.setWidget?.(CHILDREN, undefined);
	};
	const watchChildren = (ui: any, read = readChildren, dbFile = opencodeDb()) => {
		if (childTimer || !ui?.setWidget) return;
		const tick = () => {
			// opencode: o banco dele mostra também os de segundo plano; os outros (e o opencode sem node:sqlite): o fluxo
			const opencode = isOpencode(active?.agent);
			const fromDb = opencode && active?.resume?.id ? read(dbFile, active.resume.id) : [];
			const items = fromDb.length ? fromDb : liveAgents(active?.live, Date.now());
			(globalThis as any).__pinkAgentChildren = items; // a lateral mostra em SUBAGENTES, abaixo da SESSÃO
			if (!items.length && !active?.controller) return stopChildren(ui);
			const side = (globalThis as any).__pinkRightOn === true; // lateral ligada (pink-ui): os subagentes ficam só nela, como os do Pink
			ui.setWidget(CHILDREN, items.length && !side ? (_screen: any, theme: any) => ({
				render: (width: number) => items.map((item: any) => {
					const clock = item.clock ?? elapsedLabel(Date.now() - item.started);
					const mark = theme.fg(item.mark === "✗" ? "error" : item.mark === "✓" ? "success" : "accent", item.mark ?? "●");
					return fit(` ${mark} ${theme.fg("text", item.agent)} ${theme.fg("muted", item.task)}  ${theme.fg("dim", clock)}`, width);
				}),
				invalidate() {},
			}) : undefined, { placement: "belowEditor" }); // sem a lateral: embaixo da caixa, como no Claude Code (owner 2026-11-25)
			screenRef?.requestRender?.(); // a lateral relê a lista mesmo com a conversa parada
		};
		tick();
		childTimer = setInterval(tick, 2000);
		childTimer.unref?.();
	};

	// a fila é desenhada dentro do widget do "Trabalhando" (around): aqui só pede o redesenho
	let screenRef: any;
	const showQueue = (_ui: any) => screenRef?.requestRender?.();
	// ctrl+enter com o agente trabalhando: o texto entra na fila e o agente é interrompido; a fila sai na hora, numa mensagem
	(globalThis as any).__pinkAgentSendNow = (text: string) => {
		if (!active?.controller) return false;
		const value = String(text ?? "").trim();
		if (value) (active.queue ??= []).push(value);
		active.controller.abort();
		return true;
	};
	const stop = (ctx?: any) => {
		(ctx?.ui ?? lastUi)?.setWidget?.(QUEUE, undefined); // fila de versões antigas do widget (a de agora some junto com o agente)
		if (active) active.queue = []; // a fila é descartada junto
		active?.controller?.abort();
		closeKept(active?.resume); // fecha o processo do agente que ficou aberto entre as mensagens
		active = undefined;
		idle();
		stopChildren(ctx?.ui);
		(globalThis as any).__pinkExternalAgent = undefined; // o rótulo da caixa volta a "Build · modelo" (pink-ui)
		ctx?.ui?.setStatus?.(STATUS, undefined);
	};

	// mensagens desenhadas como as do Pink: "> oi", "+ Pensou · 0.4s", "→ Rodou: ...", "● resposta" e o rodapé
	// "opencode · big-pickle · 7s · ↓ 49 tokens" (mesmas funções do pink-ui)
	let tui: any;
	let coding: any;
	void load().then(([a, b]) => {
		tui = a;
		coding = b;
	}).catch(() => undefined);
	const textOf = (message: any) => (typeof message.content === "string" ? message.content : (message.content ?? []).map((part: any) => part.text ?? "").join(""));
	const bold = (theme: any, text: string) => (theme.bold ? theme.bold(text) : text);
	pink.registerMessageRenderer?.("pink-agente-pedido", (message: any, options: any, theme: any) => {
		if (!tui || !coding?.getMarkdownTheme) return undefined;
		const md = new tui.Markdown(String(message.details?.text ?? textOf(message)), options.outputPad, 0, coding.getMarkdownTheme(), { color: (s: string) => theme.fg("userMessageText", s), bgColor: (s: string) => theme.bg("userMessageBg", s) });
		return { render: (width: number) => userLines(md.render(Math.max(1, width - 1)), theme.fg("muted", ">")), invalidate: () => md.invalidate?.() };
	});
	pink.registerMessageRenderer?.("pink-agente", (message: any, options: any, theme: any) => {
		if (!tui || !coding?.getMarkdownTheme) return undefined;
		const details = message.details ?? {};
		const pad = options.outputPad ?? 1;
		const list = compact(Array.isArray(details.steps) ? details.steps : [{ kind: "text", text: textOf(message) }]);
		const { work, answer } = splitWork(list);
		const summary = workSummary(work);
		const grouped = work.length >= 2 && Boolean(summary);
		// aberto pelo clique (esta mensagem) ou por ctrl+t (todas: o Pink avisa em __pinkThinkingShown)
		const opened = { work: false, thoughts: new Set<number>() };
		const all = () => (globalThis as any).__pinkThinkingShown === true;
		const MouseRegion = tui.MouseRegion;
		let current: any;
		let drawnWithAll = all();
		const clickable = (child: any, toggle: () => void) =>
			MouseRegion
				? new MouseRegion(child, (event: any) => {
						if (event?.type !== "click" || event.button !== "left") return undefined;
						toggle();
						current = build();
						return { handled: true };
					})
				: child;
		const thought = (box: any, step: any, index: number) => {
			const open = all() || opened.thoughts.has(index);
			const head = open && step.text ? `− ${thinkingLabel(step.ms).slice(2)}` : thinkingLabel(step.ms);
			box.addChild(clickable(new tui.Text(theme.fg("thinkingText", head), pad, 0), () => (opened.thoughts.has(index) ? opened.thoughts.delete(index) : opened.thoughts.add(index))));
			if (open && step.text) box.addChild(new tui.Text(theme.italic ? theme.italic(theme.fg("thinkingText", step.text)) : theme.fg("thinkingText", step.text), pad + 2, 0));
		};
		const drawSteps = (box: any, steps: any[], offset: number) => {
			for (const [index, step] of steps.entries()) {
				// ferramentas seguidas ficam juntas (uma busca na tela são dezenas de chamadas: com linha em branco virava uma tela inteira)
				if (index && !(step.kind === "tool" && steps[index - 1]?.kind === "tool")) box.addChild(new tui.Spacer(1));
				if (step.kind === "thinking") thought(box, step, offset + index);
				else if (step.kind === "tool") box.addChild(new tui.Text(theme.fg("muted", `→ ${step.line}`), pad, 0));
				else box.addChild(bulleted(new tui.Markdown(String(step.text).trim(), pad, 0, coding.getMarkdownTheme())));
			}
		};
		const build = () => {
			drawnWithAll = all();
			const box = new tui.Container();
			// o Pink já põe uma linha em branco antes de cada mensagem: entre o pedido e a resposta fica só ela, como no Claude Code
			if (grouped) {
				const open = opened.work || all();
				box.addChild(clickable(new tui.Text(theme.fg("muted", `${open ? "−" : "+"} ${summary}`), pad, 0), () => (opened.work = !opened.work)));
				if (open) box.addChild(new tui.Spacer(1)), drawSteps(box, work, 0);
				if (answer.length) box.addChild(new tui.Spacer(1));
				drawSteps(box, answer, work.length);
			} else drawSteps(box, list, 0);
			if (details.error) box.addChild(new tui.Spacer(1)), box.addChild(new tui.Text(theme.fg("error", `⚠ ${details.error}`), pad, 0));
			const footer = [bold(theme, theme.fg("accent", details.agent ?? t("agente", "agente", "agent")))];
			if (details.model) footer.push(theme.fg("text", shortModel(details.model)));
			if (details.ms !== undefined) footer.push(theme.fg("muted", runLabel({ ms: details.ms, output: details.output ?? 0 })));
			box.addChild(new tui.Spacer(1));
			box.addChild(new tui.Text(footer.join(theme.fg("dim", " · ")), pad, 0));
			return box;
		};
		current = build();
		return {
			render: (width: number) => {
				if (all() !== drawnWithAll) current = build(); // ctrl+t abriu ou fechou o pensamento de todas
				return current.render(width);
			},
			invalidate: () => current.invalidate?.(),
			handleMouse: (event: any) => current.handleMouse?.(event),
		};
	});

	const send = async (text: string, ctx: any) => {
		const current = active!;
		screenCtx = ctx;
		const controller = new AbortController();
		current.controller = controller;
		const name = current.agent.name;
		const before = contextFor(ctx.sessionManager?.getBranch?.(), name); // antes de gravar o pedido: só o que veio antes dele
		pink.sendMessage({ customType: "pink-agente-pedido", display: true, content: `› ${name}: ${text}`, details: { agent: name, text } });
		// o mesmo começo e fim de turno do modelo do Pink (o círculo do mux, o ponto do /undo, o título, a coluna de sessões,
		// a notificação e o hook Stop reagem a eles); owner 2026-11-26: "/agente tem que funcionar como um modelo logado"
		pink.events?.emit?.("pink:agent_start", { ctx });
		const result = fresh();
		current.live = result; // os subagentes desta mensagem (liveAgents)
		const started = Date.now();
		const lastTool = () => result.messages.at(-1)?.content?.find((part: any) => part.type === "toolCall")?.name;
		const status = () => {
			const last = lastTool();
			ctx.ui?.setStatus?.(STATUS, `${name} ${t("trabalhando", "trabajando", "working")}${last ? `: ${last}` : "…"}`);
		};
		status();
		if (ctx.hasUI) busy(ctx.ui, () => outputOf(result));
		if (ctx.hasUI) watchChildren(ctx.ui);
		(globalThis as any).__pinkExternalAsk = ctx.hasUI ? (title: string, body: string) => ctx.ui.confirm(title, body) : undefined;
		try {
			await run(current.agent, before ? `${before}\n${text}` : text, ctx.cwd, controller.signal, result, status, undefined, undefined, current.resume);
		} catch (error: any) {
			result.stopReason = "error";
			result.errorMessage = controller.signal.aborted ? t("cancelado", "cancelado", "cancelled") : String(error?.message ?? error);
		}
		if (current.controller === controller) current.controller = undefined;
		if (active === current || !active) idle();
		Reflect.get(globalThis, "__pinkTela")?.hide?.(); // o agente terminou: apaga o contorno da tela
		if (active === current) {
			ctx.ui?.setStatus?.(STATUS, `${t("agente", "agente", "agent")}: ${label(current.agent)}`);
			// a caixa passa a mostrar o modelo que o agente usou de fato, em vez de "modelo padrão"
			if (!current.agent.model && result.model && result.model !== name) (globalThis as any).__pinkExternalAgent = { name, model: result.model, effort: current.agent.effort };
		}
		const error = result.stopReason === "error" ? String(result.errorMessage ?? t("erro", "error", "error")) : undefined;
		pink.sendMessage({ customType: "pink-agente", display: true, content: render(result, ctx.cwd), details: { agent: name, session: current.resume?.id, model: result.model, usage: result.usage, error, steps: steps(result, ctx.cwd), ms: Date.now() - started, output: outputOf(result) } });
		pink.events?.emit?.("pink:agent_settled", { ctx, aborted: controller.signal.aborted });
		// trocaram o modelo do Pink no meio: o que o agente fez já está na sessão; o novo modelo continua o pedido
		if (current.handoff) return void pink.sendUserMessage?.(handoffText(name, [text, ...current.handoff]));
		// a fila sai agora, numa mensagem só (como o Claude Code junta o que você digitou enquanto ele trabalhava)
		if (active === current && current.queue?.length) {
			const next = current.queue.join("\n\n");
			current.queue = [];
			showQueue(ctx.ui); // sai de cima da caixa: agora vira a mensagem enviada
			await send(next, ctx);
		}
	};

	// "/agente " lista as opções, como os outros comandos: off e os agentes; "/agente codex " lista os modelos dele
	const modelCache = new Map<string, Promise<any[]>>();
	const completions = async (prefix: string) => {
		const text = String(prefix ?? "").replace(/^\s+/, "");
		const space = text.indexOf(" ");
		const agents = list();
		if (space < 0) {
			const items = [
				...(active ? [{ value: "off", label: "off", description: t(`volta ao Pink (desliga o ${active.agent.name})`, `vuelve a Pink (apaga ${active.agent.name})`, `back to Pink (turns ${active.agent.name} off)`) }] : []),
				...agents.map((agent) => ({ value: agent.name, label: agent.name, description: t(`conversar com o ${agent.name}, com o login dele`, `conversar con ${agent.name}, con su login`, `talk to ${agent.name}, with its own login`) })),
			];
			const hits = items.filter((item) => item.value.startsWith(text.toLowerCase()));
			return hits.length ? hits : null;
		}
		const agent = agents.find((item) => item.name === text.slice(0, space).toLowerCase());
		if (!agent) return null;
		const wanted = text.slice(space + 1).replace(/^\s+/, ""); // o espaço do fim conta: "gpt-5 " pede os esforços
		if (!modelCache.has(agent.name)) modelCache.set(agent.name, models(agent, process.cwd()).catch(() => (modelCache.delete(agent.name), [])));
		const choices = await modelCache.get(agent.name)!;
		// "/agente codex gpt-5 " lista os esforços daquele modelo
		const gap = wanted.indexOf(" ");
		if (gap >= 0) {
			const id = wanted.slice(0, gap);
			const level = wanted.slice(gap + 1).trim();
			const choice = choices.find((item) => item.id === id);
			const levels = (choice?.efforts ?? []).filter((item: string) => item.startsWith(level)).map((item: string) => ({ value: `${agent.name} ${id} ${item}`, label: item, description: item === choice?.effort ? t("padrão", "predeterminado", "default") : undefined }));
			return levels.length ? levels : null;
		}
		const hits = choices.filter((choice) => choice.id.startsWith(wanted) || String(choice.label).toLowerCase().startsWith(wanted.toLowerCase())).map((choice) => ({ value: `${agent.name} ${choice.id}`, label: choice.id, description: `${choice.label !== choice.id ? choice.label : ""}${choice.current ? ` (${t("padrão", "predeterminado", "default")})` : ""}`.trim() || undefined }));
		return hits.length ? hits : null;
	};

	pink.registerCommand("agente", {
		description: t("Conversa direto com um agente instalado (claude, codex, opencode...) com o login dele; /agente off volta ao Pink", "Conversa directo con un agente instalado (claude, codex, opencode...) con su login; /agente off vuelve a Pink", "Talk straight to an installed agent (claude, codex, opencode...) with its own login; /agente off returns to Pink"),
		getArgumentCompletions: completions,
		handler: async (args: string, ctx: any) => {
			const [first = "", ...rest] = String(args ?? "").trim().split(/\s+/);
			const wanted = first.toLowerCase();
			let [model = "", effort = ""] = rest; // /agente codex gpt-5 high: agente, modelo e esforço
			const agents = list();
			if (wanted === "off" || wanted === "parar" || wanted === "stop") {
				const was = active?.agent.name;
				stop(ctx);
				ctx.ui?.notify?.(was ? t(`Voltou ao Pink (${was} desligado).`, `Volviste a Pink (${was} apagado).`, `Back to Pink (${was} off).`) : t("Nenhum agente ligado.", "Ningún agente encendido.", "No agent on."), "info");
				return;
			}
			let name = wanted;
			if (!name) {
				if (!agents.length) return ctx.ui?.notify?.(t("Nenhum agente instalado encontrado (claude, codex, opencode, cline, copilot, qwen, goose, gemini).", "No se encontró ningún agente instalado (claude, codex, opencode, cline, copilot, qwen, goose, gemini).", "No installed agent found (claude, codex, opencode, cline, copilot, qwen, goose, gemini)."), "warning");
				// com um agente ligado, o primeiro item volta ao modelo/provedor do Pink (o mesmo que /agente off)
				const back = active ? t(`Voltar ao Pink (desliga o ${active.agent.name})`, `Volver a Pink (apaga ${active.agent.name})`, `Back to Pink (turns ${active.agent.name} off)`) : undefined;
				name = ctx.hasUI ? ((await pick(ctx, t("Conversar com qual agente?", "¿Con qué agente conversar?", "Talk to which agent?"), [...(back ? [back] : []), ...agents.map((agent) => agent.name)], load)) ?? "") : "";
				if (!name) return;
				if (name === back) {
					const was = active?.agent.name;
					stop(ctx);
					return ctx.ui?.notify?.(t(`Voltou ao Pink (${was} desligado).`, `Volviste a Pink (${was} apagado).`, `Back to Pink (${was} off).`), "info");
				}
			}
			const agent = agents.find((item) => item.name === name);
			if (!agent) return ctx.ui?.notify?.(t(`${name} não está instalado. Disponíveis: ${agents.map((a) => a.name).join(", ") || "nenhum"}.`, `${name} no está instalado. Disponibles: ${agents.map((a) => a.name).join(", ") || "ninguno"}.`, `${name} is not installed. Available: ${agents.map((a) => a.name).join(", ") || "none"}.`), "warning");
			if (rest.length > 2 || (model && !/^[\w./:@-]+$/.test(model))) return ctx.ui?.notify?.(t(`Nome de modelo inválido: ${rest.join(" ")}`, `Nombre de modelo no válido: ${rest.join(" ")}`, `Invalid model name: ${rest.join(" ")}`), "warning");
			if (effort && !/^[a-z]+$/.test(effort)) return ctx.ui?.notify?.(t(`Esforço inválido: ${effort}`, `Esfuerzo no válido: ${effort}`, `Invalid effort: ${effort}`), "warning");
			if (!model && ctx.hasUI) {
				// menu com os modelos que o agente informa; o primeiro item mantém o padrão dele
				ctx.ui?.setStatus?.(STATUS, t(`${name}: buscando modelos…`, `${name}: buscando modelos…`, `${name}: fetching models…`));
				let choices: Awaited<ReturnType<typeof listModels>> = [];
				try {
					choices = await models(agent, ctx.cwd);
				} catch (error: any) {
					ctx.ui?.notify?.(t(`Não deu para listar os modelos do ${name} (${error?.message ?? error}); fica o padrão dele.`, `No se pudieron listar los modelos de ${name} (${error?.message ?? error}); queda su predeterminado.`, `Could not list ${name}'s models (${error?.message ?? error}); keeping its default.`), "warning");
				}
				ctx.ui?.setStatus?.(STATUS, active ? `${t("agente", "agente", "agent")}: ${label(active.agent)}` : undefined);
				if (choices.length) {
					const current = choices.find((choice) => choice.current);
					const keep = t(`Padrão do ${name}${current ? ` (${current.label})` : ""}`, `Predeterminado de ${name}${current ? ` (${current.label})` : ""}`, `${name} default${current ? ` (${current.label})` : ""}`);
					const shown = choices.map((choice) => (choice.label === choice.id ? choice.id : `${choice.label} — ${choice.id}`));
					const picked = await pick(ctx, t(`Modelo do ${name}`, `Modelo de ${name}`, `${name} model`), [keep, ...shown], load);
					if (picked === undefined) return;
					if (picked !== keep) model = choices[shown.indexOf(picked)]?.id ?? "";
					// esforço (claude e codex informam os níveis de cada modelo); o primeiro item mantém o padrão dele
					const chosen = choices.find((choice) => choice.id === model) ?? current;
					if (chosen?.efforts?.length) {
						const standard = t(`Padrão do ${name}${chosen.effort ? ` (${chosen.effort})` : ""}`, `Predeterminado de ${name}${chosen.effort ? ` (${chosen.effort})` : ""}`, `${name} default${chosen.effort ? ` (${chosen.effort})` : ""}`);
						const level = await pick(ctx, t(`Esforço do ${name}`, `Esfuerzo de ${name}`, `${name} effort`), [standard, ...chosen.efforts], load);
						if (level === undefined) return;
						if (level !== standard) effort = level;
					}
				}
			}
			// o modelo do Pink estava respondendo: para agora e o agente continua o pedido (só um trabalha; owner 2026-11-26)
			const busyAsk = ctx.isIdle?.() === false ? [...(ctx.sessionManager?.getBranch?.() ?? [])].reverse().find((entry: any) => entry?.type === "message" && entry.message?.role === "user") : undefined;
			if (busyAsk) {
				ctx.abort?.();
				await ctx.waitForIdle?.();
			}
			stop(ctx);
			// mesma sessão do Pink + mesmo agente: continua a conversa dele (owner 2026-11-24); sessão nova do Pink começa do zero
			const saved = lastAgentSession(ctx.sessionManager?.getBranch?.(), agent.name);
			active = { agent: { ...agent, ...(model ? { model } : {}), ...(effort ? { effort } : {}), extras: extras((screen ??= bridge(() => screenCtx))) }, resume: { keep: true, ...(saved ? { id: saved } : {}) } }; // keep: o processo do agente ACP fica aberto entre as mensagens; id: retoma a conversa
			warm(active.agent, ctx.cwd, active.resume); // já liga o agente: a primeira mensagem não espera a partida a frio
			(globalThis as any).__pinkExternalAgent = { name: active.agent.name, model: active.agent.model, effort: active.agent.effort }; // rótulo da caixa (pink-ui)
			ctx.ui?.setStatus?.(STATUS, `${t("agente", "agente", "agent")}: ${label(active.agent)}`);
			const again = saved ? t(" Continuando a conversa anterior dele.", " Continuando su conversación anterior.", " Continuing its previous conversation.") : "";
			ctx.ui?.notify?.(t(`Agora suas mensagens vão para o ${label(active.agent)}, com o login e a cota dele.${again} /agente off volta ao Pink.`, `Ahora tus mensajes van a ${label(active.agent)}, con su login y su cuota.${again} /agente off vuelve a Pink.`, `Your messages now go to ${label(active.agent)}, with its own login and quota.${again} /agente off returns to Pink.`), "info");
			if (busyAsk) void send(handoffText(t("modelo do Pink", "modelo de Pink", "Pink model"), [textOfContent(busyAsk.message.content)]), ctx);
		},
	});

	pink.on("input", async (event: any, ctx: any) => {
		if (!active || event.source === "extension" || String(event.text ?? "").trimStart().startsWith("/")) return { action: "continue" };
		if (active.controller) {
			// fila (owner 2026-11-24): o que chega enquanto o agente responde vai junto, numa mensagem só, quando ele terminar
			active.queue = [...(active.queue ?? []), String(event.text)];
			showQueue(ctx.ui);
			return { action: "handled" };
		}
		const done = send(String(event.text), ctx);
		if (!ctx.hasUI) await done; // pink -p: a resposta tem de sair antes de o processo acabar
		return { action: "handled" };
	});

	// escolher um modelo do Pink com o agente ligado volta ao Pink na hora: só um trabalha (owner 2026-11-25, os dois rodavam juntos)
	pink.on("model_select", (event: any, ctx: any) => {
		if (!active || event?.source === "restore") return;
		const current = active;
		const was = current.agent.name;
		if (current.controller) current.handoff = [...(current.queue ?? [])];
		stop(ctx);
		ctx?.ui?.notify?.(t(`Voltou ao Pink (${was} desligado).`, `Volviste a Pink (${was} apagado).`, `Back to Pink (${was} off).`), "info");
	});

	pink.on("session_shutdown", () => {
		stop();
		screen?.close();
		screen = undefined;
	});
}
