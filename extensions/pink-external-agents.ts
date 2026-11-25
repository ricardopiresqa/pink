// Agentes instalados na máquina como subagentes do Pink (owner 2026-11-23, cards 1dfwh7kgf8g, 1dfwh7kgf8h, 1dfwh7kgf8j),
// como o OpenBot faz: o Pink roda o programa oficial no modo para outros programas e conversa com ele. Login, cota e
// histórico são os do próprio programa; o Pink não lê credencial nenhuma.
// - claude: claude -p --output-format stream-json (a tarefa entra pela entrada padrão)
// - codex: codex app-server --listen stdio:// (JSON-RPC: thread/start, turn/start; aprovações viram pergunta no Pink)
// - ACP (Agent Client Protocol): opencode acp, cline --acp, copilot --acp, qwen --acp, goose acp, gemini --experimental-acp
// A tarefa nunca vai como argumento: os argumentos são fixos, então rodar o atalho .cmd do npm pelo shell é seguro.
// Copiado para examples/extensions/subagent/external.ts pelo build (rebrand.json); agents.ts e index.ts o importam.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type Kind = "claude" | "codex" | "acp";

export interface ExternalAgent {
	name: string;
	description: string;
	systemPrompt: string;
	source: "builtin";
	filePath: string;
	external: Kind;
	command: string;
	args: string[];
	model?: string; // escolhido no /agente (card 1dfwh7kgfjf); sem ele vale o padrão do agente
	effort?: string; // esforço escolhido no /agente: claude --effort, codex turn/start.effort; sem ele vale o padrão
	extras?: Extras; // o Pink junto (card 1dfwh7kgfjx): MCPs, regras e skills do Pink
}

// MCP no formato do mcp.json do Pink (o mesmo do Claude): stdio {command, args, env} ou http {type, url, headers}
export type McpServer = { command?: string; args?: string[]; env?: Record<string, string>; type?: string; url?: string; headers?: Record<string, string> };
export type Extras = { mcp: Record<string, McpServer>; instructions: string };

// shortcut: os MCPs thoth* ficam de fora porque o thoth-client já os instala em cada agente; ler a config de cada agente
// se aparecer outro repetido
export function pinkExtras({ mcp = {}, rules = "", skills = [], server }: { mcp?: Record<string, McpServer>; rules?: string; skills?: { name: string; description?: string; path?: string }[]; server?: McpServer }): Extras {
	const servers: Record<string, McpServer> = {};
	for (const [name, config] of Object.entries(mcp)) {
		if (/^thoth/i.test(name) || !config || typeof config !== "object") continue;
		const { command, args, env, type, url, headers } = config as McpServer; // só o que os agentes entendem (sem exposure, timeout)
		servers[name] = JSON.parse(JSON.stringify({ command, args, env, type, url, headers }));
	}
	if (server) servers.pink = server;
	const parts = ["# Pink", "Você está sendo usado pelo Pink (comando /agente). Além das suas regras, ferramentas e skills, valem as do Pink abaixo."];
	if (rules.trim()) parts.push("## Regras do Pink (AGENTS.md)", rules.trim().slice(0, 20000));
	if (skills.length) parts.push("## Skills do Pink", "Quando o assunto da tarefa bater com uma destas, leia o SKILL.md dela antes de agir e siga-o:", ...skills.map((skill) => `- ${skill.name}: ${(skill.description ?? "").replace(/\s+/g, " ").slice(0, 200)}${skill.path ? ` (${skill.path})` : ""}`));
	if (server) parts.push("## Ferramentas do Pink", "O MCP \"pink\" tem a ferramenta pink_tarefa: entrega uma tarefa ao Pink, que tem o que só ele tem (a memória do Pink, os subagentes e os MCPs dele). Use quando a tarefa precisar disso.");
	if (server?.args?.includes("--tela")) parts.push("Para ver ou controlar a tela do PC use a ferramenta pink_tela do MCP \"pink\" (não o pink_tarefa): ela usa a tela que a pessoa ligou com /tela ligar no Pink, e cada clique ou digitação pede a confirmação dela lá. Se responder que a tela está desligada, peça à pessoa para rodar /tela ligar no Pink e tente de novo depois.");
	return { mcp: servers, instructions: parts.join("\n\n") };
}

// formatos de cada agente
// o codex abre o MCP com um ambiente mínimo: sem as variáveis do Pink (chave do provedor, PINK_*) o Pink de dentro cai em
// outro provedor. env_vars repassa pelo nome, sem o valor ir na configuração
export function codexMcpConfig(mcp: Record<string, McpServer>, names: string[] = Object.keys(process.env)): Record<string, unknown> {
	const config: Record<string, unknown> = {};
	// tool_timeout_sec do pink: o padrão do codex é 60 s, e a confirmação da tela esperando a pessoa e o pink_tarefa (até
	// 15 min) estouravam
	for (const [name, server] of Object.entries(mcp)) config[`mcp_servers.${name}`] = server.url ? { url: server.url, ...(server.headers ? { http_headers: server.headers } : {}) } : { command: server.command, args: server.args ?? [], ...(server.env ? { env: server.env } : {}), env_vars: names, ...(name === "pink" ? { tool_timeout_sec: 960 } : {}) };
	return config;
}

export function acpMcpServers(mcp: Record<string, McpServer>, http: boolean): any[] {
	const pairs = (value?: Record<string, string>) => Object.entries(value ?? {}).map(([name, item]) => ({ name, value: String(item) }));
	return Object.entries(mcp).flatMap(([name, server]) => (server.url ? (http ? [{ type: "http", name, url: server.url, headers: pairs(server.headers) }] : []) : [{ name, command: String(server.command ?? ""), args: server.args ?? [], env: pairs(server.env) }]));
}

interface Spec {
	name: string;
	bin: string;
	kind: Kind;
	args: string[];
	label: string;
}

const SPECS: Spec[] = [
	{ name: "claude", bin: "claude", kind: "claude", args: ["-p", "--output-format", "stream-json", "--verbose"], label: "Claude Code (the person's Claude login and quota)" },
	{ name: "codex", bin: "codex", kind: "codex", args: ["app-server", "--listen", "stdio://"], label: "Codex (the person's ChatGPT login and quota)" },
	{ name: "opencode", bin: "opencode", kind: "acp", args: ["acp"], label: "OpenCode (its own models and login)" },
	{ name: "cline", bin: "cline", kind: "acp", args: ["--acp"], label: "Cline (its own models and login)" },
	{ name: "copilot", bin: "copilot", kind: "acp", args: ["--acp", "--no-auto-update"], label: "GitHub Copilot CLI (the person's Copilot plan)" },
	{ name: "qwen", bin: "qwen", kind: "acp", args: ["--acp"], label: "Qwen Code" },
	{ name: "goose", bin: "goose", kind: "acp", args: ["acp"], label: "Goose" },
	{ name: "gemini", bin: "gemini", kind: "acp", args: ["--experimental-acp"], label: "Gemini CLI (the person's Google login)" },
];

// o executável de verdade antes do atalho do npm
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = fs.existsSync, platform = process.platform): string | undefined {
	const names = platform === "win32" ? [`${name}.exe`, `${name}.cmd`] : [name];
	const dirs = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean).map((dir) => dir.replace(/^"|"$/g, ""));
	for (const file of names) {
		for (const dir of dirs) {
			const full = path.join(dir, file);
			if (exists(full)) return full;
		}
	}
	return undefined;
}

export function externalAgents(env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = fs.existsSync, platform = process.platform): ExternalAgent[] {
	const found: ExternalAgent[] = [];
	for (const spec of SPECS) {
		const command = findOnPath(spec.bin, env, exists, platform);
		if (!command) continue;
		found.push({
			name: spec.name,
			description: `${spec.label}, installed on this machine: another coding agent with its own tools and context. Use it when the person asks for it by name or for a second opinion from another model.`,
			systemPrompt: "",
			source: "builtin",
			filePath: command,
			external: spec.kind,
			command,
			args: spec.args,
		});
	}
	return found;
}

const NEEDS_LOGIN = /log ?in|auth|api key|credential|unauthori[sz]ed|\b401\b|sign in/i;
const loginHint = (name: string, text: string) => (NEEDS_LOGIN.test(text) ? `\n\nAbra o ${name} no terminal e faça login; o Pink usa o login dele.` : "");

const push = (result: any, content: any[], stopReason = "toolUse") => {
	if (content.length) result.messages.push({ role: "assistant", content, model: result.model, stopReason });
};
const tool = (name: string, args: Record<string, unknown>, id = "") => ({ type: "toolCall", id, name, arguments: args });

// a resposta final entra como texto só se ainda não for o último texto mostrado
function finalText(result: any, text: string) {
	const last = [...result.messages].reverse().find((msg: any) => msg.role === "assistant");
	const lastText = last?.content?.find((part: any) => part.type === "text")?.text;
	if (text && lastText !== text) push(result, [{ type: "text", text }], "stop");
}

// ---------- Claude Code: stream-json ----------
export function applyClaudeEvent(event: any, result: any, emit: () => void): void {
	if (event?.type === "system" && event.subtype === "init") {
		if (typeof event.model === "string") result.model = event.model;
		return;
	}
	if (event?.type === "assistant" && Array.isArray(event.message?.content)) {
		const content = event.message.content
			.map((part: any) =>
				part?.type === "text" && typeof part.text === "string"
					? { type: "text", text: part.text }
					: part?.type === "tool_use"
						? tool(String(part.name ?? "tool"), part.input && typeof part.input === "object" ? part.input : {}, String(part.id ?? ""))
						: undefined,
			)
			.filter(Boolean);
		if (!content.length) return;
		push(result, content);
		emit();
		return;
	}
	if (event?.type === "result") {
		const usage = event.usage ?? {};
		result.usage.input += (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
		result.usage.output += usage.output_tokens || 0;
		result.usage.cacheRead += usage.cache_read_input_tokens || 0;
		result.usage.turns += event.num_turns || 0; // custo 0: no plano o total_cost_usd é estimativa, não cobrança
		const text = typeof event.result === "string" ? event.result : "";
		if (event.is_error) {
			result.stopReason = "error";
			result.errorMessage = (text || String(event.subtype ?? "error")) + loginHint("claude", text);
		} else {
			result.stopReason = "stop";
			finalText(result, text);
		}
		emit();
	}
}

// ---------- Codex: itens do app-server ----------
export function applyCodexItem(item: any, result: any, emit: () => void): void {
	if (!item || typeof item !== "object") return;
	if (item.type === "agentMessage" && typeof item.text === "string" && item.text) push(result, [{ type: "text", text: item.text }]);
	else if (item.type === "commandExecution") push(result, [tool("bash", { command: String(item.command ?? "") }, item.id)]);
	else if (item.type === "fileChange") push(result, (item.changes ?? []).map((change: any) => tool(change?.kind?.type === "add" || change?.kind === "add" ? "write" : "edit", { path: String(change?.path ?? "") }, item.id)));
	else if (item.type === "mcpToolCall") push(result, [tool(`mcp__${item.server}__${item.tool}`, item.arguments && typeof item.arguments === "object" ? item.arguments : {}, item.id)]);
	else if (item.type === "webSearch") push(result, [tool("web_search", { query: String(item.query ?? "") }, item.id)]);
	else return;
	emit();
}

export function codexUsage(tokenUsage: any, result: any): void {
	const total = tokenUsage?.total;
	if (!total) return;
	result.usage.input = (total.inputTokens || 0) - (total.cachedInputTokens || 0);
	result.usage.cacheRead = total.cachedInputTokens || 0;
	result.usage.output = total.outputTokens || 0;
	result.usage.contextTokens = tokenUsage.last?.totalTokens || total.totalTokens || 0;
}

// ---------- ACP: atualizações da sessão ----------
// o tipo da ferramenta no ACP vira o nome da ferramenta do Pink, para a linha sair igual ("Rodou: ...", "Leu ...")
const ACP_TOOLS: Record<string, string> = { execute: "bash", read: "read", edit: "edit", search: "grep", fetch: "web_fetch", delete: "delete", move: "move" };
function acpArgs(update: any, before: Record<string, unknown> = {}): Record<string, unknown> {
	const input = update.rawInput && typeof update.rawInput === "object" ? update.rawInput : {};
	const where = Array.isArray(update.locations) ? update.locations[0]?.path : undefined;
	const args: Record<string, unknown> = { ...before };
	if (update.title) args.title = String(update.title);
	const pathArg = input.path ?? input.filePath ?? input.file_path ?? where;
	if (pathArg) args.path = String(pathArg);
	if (input.command) args.command = String(input.command);
	if (input.pattern ?? input.query) args.pattern = String(input.pattern ?? input.query);
	if (typeof input.code === "string") args.code = input.code; // opencode chama MCP por código: tools.pink.pink_tela({...})
	return args;
}
const flushThinking = (result: any, state: any) => {
	if (state.thinking) push(result, [{ type: "thinking", thinking: state.thinking, ms: Date.now() - state.thoughtAt }]);
	state.thinking = "";
	state.thoughtAt = undefined;
};
export function applyAcpUpdate(update: any, result: any, state: { text: string; thinking?: string; thoughtAt?: number }, emit: () => void): void {
	if (!update || typeof update !== "object") return;
	if (update.sessionUpdate === "agent_thought_chunk" && update.content?.type === "text") {
		state.thoughtAt ??= Date.now();
		state.thinking = (state.thinking ?? "") + String(update.content.text ?? "");
		return;
	}
	if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
		flushThinking(result, state);
		state.text += String(update.content.text ?? "");
		return;
	}
	if (update.sessionUpdate === "tool_call") {
		flushThinking(result, state);
		if (state.text) push(result, [{ type: "text", text: state.text }]), (state.text = "");
		const name = ACP_TOOLS[update.kind] ?? (typeof update.kind === "string" && update.kind !== "other" ? update.kind : "tool");
		push(result, [tool(name, acpArgs(update), String(update.toolCallId ?? ""))]);
		emit();
		return;
	}
	// o opencode manda o comando e o arquivo só na atualização (o tool_call chega com título "shell" e entrada vazia)
	if (update.sessionUpdate === "tool_call_update" && update.toolCallId) {
		for (const message of result.messages) {
			const part = message.content?.find((item: any) => item.type === "toolCall" && item.id === String(update.toolCallId));
			if (!part) continue;
			part.arguments = acpArgs(update, part.arguments);
			if (part.name === "bash" && !part.arguments.command && update.title) part.arguments.command = String(update.title);
			emit();
			return;
		}
	}
}

// ---------- JSON-RPC por linhas sobre a entrada e a saída do processo ----------
type Handler = (params: any) => Promise<any> | any;
function rpc(child: any, agentName: string, onNotify: (method: string, params: any) => void, onRequest: (method: string, params: any) => Promise<any>) {
	let next = 0;
	let buffer = "";
	const waiting = new Map<number, (msg: any) => void>();
	const write = (msg: unknown) => {
		try {
			child.stdin.write(`${JSON.stringify(msg)}\n`);
		} catch {
			/* processo já saiu */
		}
	};
	child.stdout.setEncoding?.("utf8");
	child.stdout.on("data", (chunk: string) => {
		buffer += chunk;
		for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
			const line = buffer.slice(0, end).trim();
			buffer = buffer.slice(end + 1);
			let msg: any;
			try {
				msg = line ? JSON.parse(line) : undefined;
			} catch {
				continue;
			}
			if (!msg) continue;
			if (msg.method && msg.id != null) {
				Promise.resolve(onRequest(msg.method, msg.params)).then(
					(value) => write(value === undefined ? { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Pink não trata ${msg.method}` } } : { jsonrpc: "2.0", id: msg.id, result: value }),
					(error) => write({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: String(error?.message ?? error) } }),
				);
			} else if (msg.method) onNotify(msg.method, msg.params);
			else if (msg.id != null) waiting.get(msg.id)?.(msg), waiting.delete(msg.id);
		}
	});
	const gone = (code?: unknown) => {
		const why = typeof code === "number" ? ` (código ${code})` : "";
		for (const finish of waiting.values()) finish({ error: { message: `o ${agentName} saiu${why} antes de terminar.` } });
		waiting.clear();
	};
	child.on("exit", gone);
	child.on("error", () => gone());
	return {
		request: (method: string, params: unknown) =>
			new Promise<any>((resolve) => {
				const id = ++next;
				waiting.set(id, resolve);
				write({ jsonrpc: "2.0", id, method, params });
			}),
		notify: (method: string, params?: unknown) => write({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) }),
	};
}

export type Ask = (title: string, body: string) => Promise<boolean>;
const asker = (): Ask | undefined => (globalThis as any).__pinkExternalAsk;

// ---------- execução: o subagente externo é dono do processo ----------
// os argumentos são fixos (nunca a tarefa nem o modelo de outra origem que não o menu), então o .cmd do npm pelo shell é seguro
function spawnAgent(agent: ExternalAgent, args: string[], cwd: string, start: typeof spawn): any {
	const shell = /\.cmd$/i.test(agent.command);
	const safe = shell ? args.map((arg) => (/^[\w./:@-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, "")}"`)) : args;
	return start(shell ? `"${agent.command}"` : agent.command, safe, { cwd, shell, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PINK_SUBAGENT: "1" } });
}

// efforts: os níveis de esforço que o modelo aceita (claude --effort; codex supportedReasoningEfforts); effort: o padrão
export type ModelChoice = { id: string; label: string; current?: boolean; efforts?: string[]; effort?: string };
const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const CLAUDE_MODELS: ModelChoice[] = ["opus", "sonnet", "haiku"].map((id) => ({ id, label: id, efforts: CLAUDE_EFFORTS }));

// os modelos que o agente informa: claude pelos apelidos do próprio CLI, codex por model/list, ACP pelas opções da sessão
// shortcut: no ACP a lista vem de uma session/new, então fica uma sessão vazia no histórico do agente; session/close se incomodar
export async function listModels(agent: ExternalAgent, cwd: string, start: typeof spawn = spawn, timeoutMs = 30000): Promise<ModelChoice[]> {
	if (agent.external === "claude") return CLAUDE_MODELS;
	const child = spawnAgent(agent, agent.args, cwd, start);
	child.stderr?.on?.("data", () => {});
	const client = rpc(child, agent.name, () => {}, async () => undefined);
	let timer: any;
	const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`o ${agent.name} não respondeu a lista de modelos`)), timeoutMs)));
	const ask = async (method: string, params: unknown) => {
		const answer = await Promise.race([client.request(method, params), timeout]);
		if (answer.error) throw new Error(String(answer.error.message ?? `${method} falhou`));
		return answer.result ?? {};
	};
	try {
		if (agent.external === "codex") {
			await ask("initialize", { clientInfo: { name: "pink", version: "1" } });
			client.notify("initialized");
			const list = await ask("model/list", { limit: 200 });
			return (list.data ?? []).filter((model: any) => !model?.hidden).map((model: any) => {
				const efforts = (Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts : []).map((item: any) => String(item?.reasoningEffort ?? item)).filter((item: string) => /^[a-z]+$/.test(item));
				return { id: String(model.model || model.id), label: String(model.displayName || model.model || model.id), current: Boolean(model.isDefault), ...(efforts.length ? { efforts, ...(model.defaultReasoningEffort ? { effort: String(model.defaultReasoningEffort) } : {}) } : {}) };
			});
		}
		await ask("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "pink", version: "1" } });
		return acpModels(await ask("session/new", { cwd, mcpServers: [] }));
	} finally {
		clearTimeout(timer);
		try {
			child.kill();
		} catch {
			/* já saiu */
		}
	}
}

// configOptions (categoria model, com ou sem grupos) ou o models antigo do ACP
export function acpModels(session: any): ModelChoice[] {
	const option = (session?.configOptions ?? []).find((item: any) => item?.category === "model");
	if (option) {
		const flat = (option.options ?? []).flatMap((item: any) => (Array.isArray(item?.options) ? item.options : [item]));
		return flat.filter((item: any) => item?.value != null).map((item: any) => ({ id: String(item.value), label: String(item.name ?? item.value), current: item.value === option.currentValue }));
	}
	const models = session?.models;
	return (models?.availableModels ?? []).map((item: any) => ({ id: String(item.modelId), label: String(item.name ?? item.modelId), current: item.modelId === models.currentModelId }));
}

// resume: a conversa continua entre chamadas (sessão inteira no agente, card 1dfwh7kgf8k); o id é gravado nele
// /agente com ACP (opencode, cline...): o processo fica aberto entre as mensagens (keep), porque subir o agente e abrir a
// sessão custa ~10 s e uma mensagem no processo aberto ~3 s; fecha com closeKept (off, troca, cancelar, erro, saída do Pink)
export type Resume = { id?: string; keep?: boolean; live?: AcpConn };
export function closeKept(resume?: Resume) {
	const conn = resume?.live;
	if (resume) resume.live = undefined;
	if (!conn) return;
	try {
		conn.child.stdin?.end?.(); // fim da entrada: o agente sai sozinho (o kill do .cmd do npm pega só o shell)
		conn.child.kill();
	} catch {
		/* já saiu */
	}
}

function openKept(agent: ExternalAgent, cwd: string, start: typeof spawn, resume: Resume): AcpConn {
	let conn = resume.live;
	if (conn && conn.child.exitCode == null && !conn.child.killed) return conn;
	const child = spawnAgent(agent, agent.args, cwd, start);
	const exited = new Promise<number>((resolve) => {
		child.on("close", (code: number | null) => resolve(code ?? 0));
		child.on("error", (error: any) => {
			if (conn?.turn) conn.turn.result.stderr += String(error?.message ?? error);
			resolve(1);
		});
	});
	conn = resume.live = acpOpen(child, agent.name, exited);
	const opened = conn;
	child.stderr?.on?.("data", (data: any) => {
		const target = opened.turn?.result;
		if (target && target.stderr.length < 8000) target.stderr += String(data);
	});
	return conn;
}

// agente ACP mantido aberto: liga o processo e abre a sessão (com os MCPs) assim que a pessoa escolhe o agente, para a
// primeira mensagem não esperar a partida a frio (~15 s no opencode). Falhou: fecha, e a mensagem tenta de novo e mostra o erro.
export function warmKept(agent: ExternalAgent, cwd: string, resume: Resume, start: typeof spawn = spawn) {
	if (!resume?.keep || agent.external === "claude" || agent.external === "codex") return; // o mesmo recorte do runExternal
	try {
		const conn = openKept(agent, cwd, start, resume);
		if (conn.sessionId || conn.setup) return;
		conn.setup = acpSetup(conn, agent.name, cwd, resume, agent.model, agent.extras);
		conn.setup.then(
			(error) => {
				if (!error) conn.setup = undefined;
				else if (!conn.turn) closeKept(resume);
			},
			() => closeKept(resume),
		);
	} catch {
		/* a mensagem abre e mostra o erro */
	}
}

async function runAcpKept(agent: ExternalAgent, task: string, cwd: string, signal: AbortSignal | undefined, result: any, emit: () => void, start: typeof spawn, ask: () => Ask | undefined, resume: Resume): Promise<any> {
	const conn = openKept(agent, cwd, start, resume);
	let aborted = false;
	const stop = () => {
		aborted = true;
		closeKept(resume); // a próxima mensagem abre de novo e retoma a sessão pelo id
	};
	if (signal?.aborted) stop();
	else signal?.addEventListener?.("abort", stop, { once: true });
	try {
		result.exitCode = aborted ? 1 : await runAcp(conn.child, agent.name, task, cwd, result, emit, ask, conn.exited, resume, agent.model, agent.extras, conn);
	} finally {
		signal?.removeEventListener?.("abort", stop);
	}
	if (aborted) throw new Error("Subagent was aborted");
	if (result.stopReason === "error" || result.exitCode !== 0) {
		closeKept(resume); // processo em estado desconhecido: recomeça limpo na próxima
		if (!result.stopReason) (result.stopReason = "error"), (result.errorMessage = `${agent.name} saiu com código ${result.exitCode}.${loginHint(agent.name, result.stderr)}`);
	}
	return result;
}

export async function runExternal(agent: ExternalAgent, task: string, cwd: string, signal: AbortSignal | undefined, result: any, emit: () => void, start: typeof spawn = spawn, ask: () => Ask | undefined = asker, resume?: Resume): Promise<any> {
	result.model = result.model ?? agent.model ?? agent.name;
	if (resume?.keep && agent.external !== "claude" && agent.external !== "codex") {
		return runAcpKept(agent, task, cwd, signal, result, emit, start, ask, resume);
	}
	// claude: MCPs e regras do Pink por arquivo (os cabeçalhos podem ter chave: nunca na linha de comando); apagados no fim
	let scratch: string | undefined;
	const extra: string[] = [];
	if (agent.external === "claude" && agent.extras) {
		scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pink-agente-"));
		const mcpFile = path.join(scratch, "mcp.json");
		const rulesFile = path.join(scratch, "regras.md");
		fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: agent.extras.mcp }), { mode: 0o600 });
		fs.writeFileSync(rulesFile, agent.extras.instructions, { mode: 0o600 });
		if (Object.keys(agent.extras.mcp).length) extra.push("--mcp-config", mcpFile);
		// no -p o claude recusa ferramenta não liberada; libera só a do Pink (os outros MCPs seguem as permissões do claude)
		if (agent.extras.mcp.pink) extra.push("--allowedTools", "mcp__pink__pink_tarefa,mcp__pink__pink_tela"); // a tela confirma cada ação no Pink
		extra.push("--append-system-prompt-file", rulesFile);
	}
	const args = agent.external === "claude" ? [...agent.args, ...(agent.model ? ["--model", agent.model] : []), ...(agent.effort ? ["--effort", agent.effort] : []), ...extra, ...(resume?.id ? ["--resume", resume.id] : [])] : agent.args;
	const child = spawnAgent(agent, args, cwd, start);
	if (scratch) {
		const dir = scratch;
		child.on?.("close", () => fs.rmSync(dir, { recursive: true, force: true }));
	}
	let aborted = false;
	const killChild = () => {
		aborted = true;
		try {
			child.kill();
		} catch {
			/* já saiu */
		}
	};
	if (signal?.aborted) killChild();
	else signal?.addEventListener?.("abort", killChild, { once: true });
	child.stderr?.on?.("data", (data: any) => {
		if (result.stderr.length < 8000) result.stderr += String(data);
	});
	const exited = new Promise<number>((resolve) => {
		child.on("close", (code: number | null) => resolve(code ?? 0));
		child.on("error", (error: any) => {
			result.stderr += String(error?.message ?? error);
			resolve(1);
		});
	});
	try {
		if (agent.external === "claude") {
			let buffer = "";
			child.stdout.setEncoding?.("utf8");
			child.stdout.on("data", (chunk: string) => {
				buffer += chunk;
				for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
					const line = buffer.slice(0, end);
					buffer = buffer.slice(end + 1);
					try {
						const event = JSON.parse(line);
						if (resume && event?.type === "system" && event.subtype === "init" && typeof event.session_id === "string") resume.id = event.session_id;
						applyClaudeEvent(event, result, emit);
					} catch {
						/* linha que não é JSON */
					}
				}
			});
			child.stdin.end(task);
			result.exitCode = await exited;
		} else if (agent.external === "codex") result.exitCode = await runCodex(child, task, cwd, result, emit, ask, exited, resume, agent.model, agent.extras, agent.effort);
		else result.exitCode = await runAcp(child, agent.name, task, cwd, result, emit, ask, exited, resume, agent.model, agent.extras);
	} finally {
		signal?.removeEventListener?.("abort", killChild);
		if (child.exitCode == null) killChild();
	}
	if (aborted && signal?.aborted) throw new Error("Subagent was aborted");
	if (!result.stopReason && result.exitCode !== 0) {
		result.stopReason = "error";
		result.errorMessage = result.errorMessage || `${agent.name} saiu com código ${result.exitCode}.${loginHint(agent.name, result.stderr)}`;
	}
	return result;
}

const failed = (result: any, name: string, message: string) => {
	result.stopReason = "error";
	result.errorMessage = `${message}${loginHint(name, message)}`;
	return 1;
};

async function runCodex(child: any, task: string, cwd: string, result: any, emit: () => void, ask: () => Ask | undefined, exited: Promise<number>, resume?: { id?: string }, model?: string, extras?: Extras, effort?: string): Promise<number> {
	let done: (code: number) => void = () => {};
	const finished = new Promise<number>((resolve) => (done = resolve));
	const client = rpc(
		child,
		"codex",
		(method, params) => {
			if (method === "item/completed") applyCodexItem(params?.item, result, emit);
			else if (method === "thread/tokenUsage/updated") codexUsage(params?.tokenUsage, result);
			else if (method === "error" && params?.error?.message) result.errorMessage = String(params.error.message);
			else if (method === "turn/completed") {
				const turn = params?.turn ?? {};
				if (turn.status === "failed" || turn.status === "interrupted") done(failed(result, "codex", String(turn.error?.message ?? result.errorMessage ?? turn.status)));
				else {
					result.stopReason = "stop";
					result.usage.turns += 1;
					const last = (turn.items ?? []).filter((item: any) => item?.type === "agentMessage").at(-1);
					if (last?.text) finalText(result, last.text);
					emit();
					done(0);
				}
			}
		},
		async (method, params) => {
			const confirm = ask();
			if (method === "item/commandExecution/requestApproval") {
				const ok = confirm ? await confirm("O Codex quer rodar um comando", [params?.command, params?.cwd && `em ${params.cwd}`, params?.reason].filter(Boolean).join("\n")) : false;
				return { decision: ok ? "accept" : "decline" };
			}
			if (method === "item/fileChange/requestApproval") {
				const ok = confirm ? await confirm("O Codex quer alterar arquivos", [params?.reason, params?.grantRoot && `pasta: ${params.grantRoot}`].filter(Boolean).join("\n") || "Alterar arquivos nesta pasta.") : false;
				return { decision: ok ? "accept" : "decline" };
			}
			if (method === "mcpServer/elicitation/request") {
				// o codex pede licença para usar ferramenta MCP; a do próprio Pink (pink_tarefa) vem do /agente e já está liberada
				if (params?.mode === "url") return { action: "decline", content: null, _meta: null };
				const ok = params?.serverName === "pink" || (confirm ? await confirm(`O Codex quer usar o MCP ${params?.serverName ?? ""}`, String(params?.message ?? "")) : false);
				return { action: ok ? "accept" : "decline", content: ok ? {} : null, _meta: null };
			}
			return undefined; // o resto (pergunta ao usuário, login) o Pink não trata: o Codex recebe erro
		},
	);
	const init = await client.request("initialize", { clientInfo: { name: "pink", version: "1" } });
	if (init.error) return failed(result, "codex", String(init.error.message ?? "initialize falhou"));
	client.notify("initialized");
	const pinkSide = extras ? { developerInstructions: extras.instructions, ...(Object.keys(extras.mcp).length ? { config: codexMcpConfig(extras.mcp) } : {}) } : {};
	const options = { cwd, approvalPolicy: "on-request", sandbox: "workspace-write", ...(model ? { model } : {}), ...pinkSide };
	const thread = await client.request(resume?.id ? "thread/resume" : "thread/start", resume?.id ? { threadId: resume.id, ...options } : options);
	if (thread.error) return failed(result, "codex", String(thread.error.message ?? "thread/start falhou"));
	if (typeof thread.result?.model === "string") result.model = thread.result.model;
	if (resume && thread.result?.thread?.id) resume.id = thread.result.thread.id;
	const turn = await client.request("turn/start", { threadId: thread.result?.thread?.id, input: [{ type: "text", text: task, text_elements: [] }], ...(effort ? { effort } : {}) });
	if (turn.error) return failed(result, "codex", String(turn.error.message ?? "turn/start falhou"));
	return Promise.race([finished, exited.then((code) => (result.stopReason ? code : failed(result, "codex", result.errorMessage || `o codex saiu (código ${code}) antes de terminar.${result.stderr ? `\n${result.stderr.slice(-400)}` : ""}`)))]);
}

// a ligação com um agente ACP: o processo, a sessão aberta e a mensagem em andamento (turn), para servir várias mensagens
type AcpTurn = { result: any; state: { text: string; loading: boolean }; emit: () => void; ask: () => Ask | undefined };
type AcpConn = { child: any; client: ReturnType<typeof rpc>; exited: Promise<number>; turn?: AcpTurn; sessionId?: string; model?: string; setup?: Promise<string | undefined>; fresh?: boolean; loading?: boolean };
// o que o agente quer fazer, em palavras: o título do ACP sozinho às vezes é só "bash" ou "edit" (owner 2026-11-25:
// "permitindo no escuro"). Junta o tipo, o comando ou os arquivos e diz que o sim vale só para esta vez.
const PERMISSION_KINDS: Record<string, string> = { read: "Ler arquivo", edit: "Editar arquivo", delete: "Apagar arquivo", move: "Mover arquivo", search: "Buscar nos arquivos", execute: "Rodar um comando", fetch: "Acessar a internet", think: "Pensar", other: "Outra ação" };
export function permissionText(call: any): string {
	const input = call?.rawInput && typeof call.rawInput === "object" ? call.rawInput : {};
	const title = String(call?.title ?? "").trim();
	const kind = PERMISSION_KINDS[String(call?.kind ?? "")];
	const command = [input.command, input.cmd].find((v) => typeof v === "string" && v.trim()) ?? (Array.isArray(input.command) ? input.command.join(" ") : "");
	const files = [...new Set([...(Array.isArray(call?.locations) ? call.locations.map((l: any) => l?.path) : []), input.filePath, input.file_path, input.path, input.url].filter((v) => typeof v === "string" && v.trim()))];
	const lines = [kind && kind.toLowerCase() !== title.toLowerCase() ? `${kind}: ${title || "?"}` : title || kind || "Executar uma ação."];
	if (command && !title.includes(command)) lines.push(`Comando: ${command}`);
	for (const file of files.slice(0, 5)) if (!title.includes(file)) lines.push(`Arquivo: ${file}`);
	if (typeof input.description === "string" && input.description.trim()) lines.push(`Motivo: ${input.description.trim()}`);
	if (!title && !kind && !command && !files.length) lines.push("O agente não disse mais nada sobre esta ação.");
	lines.push("Sim vale só para esta vez.");
	return lines.join("\n");
}

function acpOpen(child: any, name: string, exited: Promise<number>): AcpConn {
	const conn = { child, exited } as AcpConn;
	conn.client = rpc(
		child,
		name,
		(method, params) => {
			const turn = conn.turn;
			if (method === "session/update" && turn && !conn.loading) applyAcpUpdate(params?.update, turn.result, turn.state, turn.emit); // session/load repete o histórico: não mostrar de novo
		},
		async (method, params) => {
			if (method !== "session/request_permission") return undefined; // sem fs nem terminal do cliente: o agente usa os dele
			const options: any[] = Array.isArray(params?.options) ? params.options : [];
			const allow = options.find((option) => option?.kind === "allow_once") ?? options.find((option) => String(option?.kind).startsWith("allow"));
			const reject = options.find((option) => option?.kind === "reject_once") ?? options.find((option) => String(option?.kind).startsWith("reject"));
			const confirm = conn.turn?.ask();
			const ok = Boolean(allow && confirm && (await confirm(`O ${name} pede permissão`, permissionText(params?.toolCall))));
			if (ok) return { outcome: { outcome: "selected", optionId: allow.optionId } };
			return reject ? { outcome: { outcome: "selected", optionId: reject.optionId } } : { outcome: { outcome: "cancelled" } };
		},
	);
	return conn;
}

async function runAcp(child: any, name: string, task: string, cwd: string, result: any, emit: () => void, ask: () => Ask | undefined, exited: Promise<number>, resume?: { id?: string }, model?: string, extras?: Extras, kept?: AcpConn): Promise<number> {
	const conn = kept ?? acpOpen(child, name, exited);
	const state = { text: "", loading: false };
	conn.turn = { result, state, emit, ask };
	try {
		return await acpTurn(conn, name, task, cwd, result, state, emit, resume, model, extras);
	} finally {
		conn.turn = undefined;
	}
}

// abre a sessão (initialize, session/new ou load, modelo). Uma vez por processo: o warmKept faz isto assim que a pessoa
// escolhe o agente, e a primeira mensagem só espera o que faltar. Devolve o erro, ou nada.
// cada passo da partida tem prazo e percebe o processo morto: sem isso, um agente travado (ex.: um MCP que não abre em
// session/new) deixava o "Trabalhando" contando para sempre, e nem o Esc soltava (owner 2026-11-24, opencode no outro PC)
export const ACP_SETUP_MS = 120000;
export function acpStep(conn: Pick<AcpConn, "exited">, name: string, step: string, request: Promise<any>, ms = ACP_SETUP_MS): Promise<any> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise((resolve) => {
		timer = setTimeout(() => resolve({ error: { message: `o ${name} não respondeu ${step} em ${Math.round(ms / 1000)} s${step === "session/new" ? " (um MCP que não abre nesta máquina pode travar aqui)" : ""}` } }), ms);
		timer.unref?.();
	});
	const died = conn.exited.then((code) => ({ error: { message: `o ${name} saiu (código ${code}) durante ${step}` } }));
	return Promise.race([request, late, died]).finally(() => clearTimeout(timer));
}

async function acpSetup(conn: AcpConn, name: string, cwd: string, resume?: { id?: string }, model?: string, extras?: Extras): Promise<string | undefined> {
	const client = { request: (method: string, params: any) => acpStep(conn, name, method, conn.client.request(method, params)) };
	let config: any[] = [];
	const init = await client.request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "pink", version: "1" } });
	if (init.error) return String(init.error.message ?? "initialize falhou");
	let sessionId: string | undefined;
	const mcpServers = extras ? acpMcpServers(extras.mcp, Boolean(init.result?.agentCapabilities?.mcpCapabilities?.http)) : [];
	if (resume?.id && init.result?.agentCapabilities?.loadSession) {
		conn.loading = true;
		const loaded = await client.request("session/load", { sessionId: resume.id, cwd, mcpServers });
		conn.loading = false;
		if (!loaded.error) (sessionId = resume.id), (config = loaded.result?.configOptions ?? []);
	}
	if (!sessionId) {
		const session = await client.request("session/new", { cwd, mcpServers });
		if (session.error) return String(session.error.message ?? "session/new falhou");
		sessionId = session.result?.sessionId;
		conn.fresh = true;
		config = session.result?.configOptions ?? [];
	}
	if (resume && sessionId) resume.id = sessionId;
	// sem escolha, o rodapé mostra o modelo que o agente usa de fato (ex.: opencode/big-pickle), não o nome do agente
	const current = config.find((item: any) => item?.category === "model")?.currentValue;
	if (!model && typeof current === "string" && current) conn.model = current;
	if (model && sessionId) {
		const option = config.find((item: any) => item?.category === "model");
		const set = option ? await client.request("session/set_config_option", { sessionId, configId: option.id, value: model }) : await client.request("session/set_model", { sessionId, modelId: model });
		if (set.error) return `O ${name} recusou o modelo ${model}: ${set.error.message ?? "erro"}`;
		conn.model = model;
	}
	conn.sessionId = sessionId;
	return undefined;
}

async function acpTurn(conn: AcpConn, name: string, task: string, cwd: string, result: any, state: AcpTurn["state"], emit: () => void, resume?: { id?: string }, model?: string, extras?: Extras): Promise<number> {
	const { client, exited } = conn;
	if (!conn.sessionId) {
		conn.setup ??= acpSetup(conn, name, cwd, resume, model, extras);
		const error = await conn.setup;
		conn.setup = undefined;
		if (error) return failed(result, name, error);
	}
	const fresh = Boolean(conn.fresh);
	conn.fresh = false;
	if (conn.model) result.model = conn.model;
	const sessionId = conn.sessionId;
	// ACP não tem instrução de sistema: as regras do Pink vão antes da primeira mensagem de cada sessão nova
	const blocks = fresh && extras?.instructions ? [{ type: "text", text: extras.instructions }, { type: "text", text: task }] : [{ type: "text", text: task }];
	const prompt = client.request("session/prompt", { sessionId, prompt: blocks });
	const answer = await Promise.race([prompt, exited.then((code) => ({ error: { message: `o ${name} saiu (código ${code}) antes de terminar.${result.stderr ? `\n${result.stderr.slice(-400)}` : ""}` } }))]);
	if (answer.error) return failed(result, name, String(answer.error.message ?? "session/prompt falhou"));
	const usage = answer.result?.usage;
	if (usage) {
		result.usage.input += usage.inputTokens || 0;
		result.usage.output += usage.outputTokens || 0;
		result.usage.cacheRead += usage.cachedReadTokens || 0;
	}
	result.usage.turns += 1;
	if (answer.result?.stopReason === "refusal" || answer.result?.stopReason === "cancelled") return failed(result, name, `o ${name} parou: ${answer.result.stopReason}`);
	result.stopReason = "stop";
	finalText(result, state.text);
	emit();
	return 0;
}
