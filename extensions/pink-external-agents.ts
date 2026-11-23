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
export function applyAcpUpdate(update: any, result: any, state: { text: string }, emit: () => void): void {
	if (!update || typeof update !== "object") return;
	if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
		state.text += String(update.content.text ?? "");
		return;
	}
	if (update.sessionUpdate === "tool_call") {
		if (state.text) push(result, [{ type: "text", text: state.text }]), (state.text = "");
		const name = typeof update.kind === "string" && update.kind !== "other" ? update.kind : "tool";
		push(result, [tool(name, { title: String(update.title ?? ""), ...(Array.isArray(update.locations) && update.locations[0]?.path ? { path: update.locations[0].path } : {}) }, String(update.toolCallId ?? ""))]);
		emit();
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
// resume: a conversa continua entre chamadas (sessão inteira no agente, card 1dfwh7kgf8k); o id é gravado nele
export async function runExternal(agent: ExternalAgent, task: string, cwd: string, signal: AbortSignal | undefined, result: any, emit: () => void, start: typeof spawn = spawn, ask: () => Ask | undefined = asker, resume?: { id?: string }): Promise<any> {
	result.model = result.model ?? agent.name;
	const shell = /\.cmd$/i.test(agent.command);
	const args = agent.external === "claude" && resume?.id ? [...agent.args, "--resume", resume.id] : agent.args;
	const child: any = start(shell ? `"${agent.command}"` : agent.command, args, { cwd, shell, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PINK_SUBAGENT: "1" } });
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
		} else if (agent.external === "codex") result.exitCode = await runCodex(child, task, cwd, result, emit, ask, exited, resume);
		else result.exitCode = await runAcp(child, agent.name, task, cwd, result, emit, ask, exited, resume);
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

async function runCodex(child: any, task: string, cwd: string, result: any, emit: () => void, ask: () => Ask | undefined, exited: Promise<number>, resume?: { id?: string }): Promise<number> {
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
			return undefined; // o resto (pergunta ao usuário, login) o Pink não trata: o Codex recebe erro
		},
	);
	const init = await client.request("initialize", { clientInfo: { name: "pink", version: "1" } });
	if (init.error) return failed(result, "codex", String(init.error.message ?? "initialize falhou"));
	client.notify("initialized");
	const options = { cwd, approvalPolicy: "on-request", sandbox: "workspace-write" };
	const thread = await client.request(resume?.id ? "thread/resume" : "thread/start", resume?.id ? { threadId: resume.id, ...options } : options);
	if (thread.error) return failed(result, "codex", String(thread.error.message ?? "thread/start falhou"));
	if (typeof thread.result?.model === "string") result.model = thread.result.model;
	if (resume && thread.result?.thread?.id) resume.id = thread.result.thread.id;
	const turn = await client.request("turn/start", { threadId: thread.result?.thread?.id, input: [{ type: "text", text: task, text_elements: [] }] });
	if (turn.error) return failed(result, "codex", String(turn.error.message ?? "turn/start falhou"));
	return Promise.race([finished, exited.then((code) => (result.stopReason ? code : failed(result, "codex", result.errorMessage || `o codex saiu (código ${code}) antes de terminar.${result.stderr ? `\n${result.stderr.slice(-400)}` : ""}`)))]);
}

async function runAcp(child: any, name: string, task: string, cwd: string, result: any, emit: () => void, ask: () => Ask | undefined, exited: Promise<number>, resume?: { id?: string }): Promise<number> {
	const state = { text: "", loading: false };
	const client = rpc(
		child,
		name,
		(method, params) => {
			if (method === "session/update" && !state.loading) applyAcpUpdate(params?.update, result, state, emit); // session/load repete o histórico: não mostrar de novo
		},
		async (method, params) => {
			if (method !== "session/request_permission") return undefined; // sem fs nem terminal do cliente: o agente usa os dele
			const options: any[] = Array.isArray(params?.options) ? params.options : [];
			const allow = options.find((option) => option?.kind === "allow_once") ?? options.find((option) => String(option?.kind).startsWith("allow"));
			const reject = options.find((option) => option?.kind === "reject_once") ?? options.find((option) => String(option?.kind).startsWith("reject"));
			const confirm = ask();
			const ok = Boolean(allow && confirm && (await confirm(`O ${name} pede permissão`, String(params?.toolCall?.title ?? "Executar uma ação."))));
			if (ok) return { outcome: { outcome: "selected", optionId: allow.optionId } };
			return reject ? { outcome: { outcome: "selected", optionId: reject.optionId } } : { outcome: { outcome: "cancelled" } };
		},
	);
	const init = await client.request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "pink", version: "1" } });
	if (init.error) return failed(result, name, String(init.error.message ?? "initialize falhou"));
	let sessionId: string | undefined;
	if (resume?.id && init.result?.agentCapabilities?.loadSession) {
		state.loading = true;
		const loaded = await client.request("session/load", { sessionId: resume.id, cwd, mcpServers: [] });
		state.loading = false;
		if (!loaded.error) sessionId = resume.id;
	}
	if (!sessionId) {
		// shortcut: agente sem loadSession recomeça a conversa a cada mensagem; manter o processo vivo resolveria
		const session = await client.request("session/new", { cwd, mcpServers: [] });
		if (session.error) return failed(result, name, String(session.error.message ?? "session/new falhou"));
		sessionId = session.result?.sessionId;
	}
	if (resume && sessionId) resume.id = sessionId;
	const prompt = client.request("session/prompt", { sessionId, prompt: [{ type: "text", text: task }] });
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
