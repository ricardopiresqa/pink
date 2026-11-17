// Hooks configuráveis do Pink (owner 2026-11-17, card 1dfwh7kfmqq), no formato do Claude Code (dá para copiar de lá).
// Arquivos: <pasta do agente>/hooks.json e, só em pasta confiável, <projeto>/.pink/hooks.json (os dois rodam):
//   { "PreToolUse":  [{ "matcher": "bash|write", "hooks": [{ "type": "command", "command": "node check.js", "timeout": 30 }] }],
//     "PostToolUse": [...], "SessionStart": [...], "Stop": [...] }
//   (também vale a forma curta { "matcher": "...", "command": "...", "timeout": 30 })
// O comando recebe no stdin um JSON { hook_event_name, tool_name, tool_input, tool_response, cwd } e PINK_PROJECT_DIR.
// - PreToolUse: saída 2 (motivo no stderr) ou stdout {"decision":"block","reason":"..."} bloqueia a ferramenta.
// - PostToolUse: saída 2 manda o stderr ao modelo junto com o resultado.
// - SessionStart: o stdout entra no prompt de sistema da sessão. Stop: roda quando o agente termina.
// Timeout por hook (padrão 60 s) mata o processo; erro, timeout e outra saída não bloqueiam (avisam na tela).
// matcher: expressão regular sobre o nome da ferramenta, inteira, sem diferença de maiúsculas; vazio ou "*" = todas.
// Diferença do Claude Code: tool_name chega como no Pink (bash, write, edit), sem session_id/transcript_path.
// Em subagente (PINK_SUBAGENT) só rodam PreToolUse e PostToolUse.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const agentDir = (env = process.env) => env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent");
export const EVENTS = ["PreToolUse", "PostToolUse", "SessionStart", "Stop"];
const DEFAULT_TIMEOUT = 60;

export function loadHooks(files, read = fs.readFileSync) {
	const hooks = Object.fromEntries(EVENTS.map((e) => [e, []]));
	const errors = [];
	for (const file of files) {
		let text;
		try { text = read(file, "utf8"); } catch { continue; }
		let data;
		try { data = JSON.parse(text); } catch (error) { errors.push(`${file}: ${error?.message ?? error}`); continue; }
		const root = data?.hooks && typeof data.hooks === "object" ? data.hooks : data; // aceita {"hooks": {...}} como o settings do Claude Code
		for (const event of EVENTS) {
			for (const group of Array.isArray(root?.[event]) ? root[event] : []) {
				const list = Array.isArray(group?.hooks) ? group.hooks : [group];
				for (const hook of list) {
					if (typeof hook?.command !== "string" || !hook.command.trim()) { errors.push(`${file}: ${event} sem "command"`); continue; }
					let matcher;
					try { matcher = !group.matcher || group.matcher === "*" ? undefined : new RegExp(`^(?:${group.matcher})$`, "i"); }
					catch { errors.push(`${file}: matcher inválido ${JSON.stringify(group.matcher)}`); continue; }
					const timeout = Number(hook.timeout) > 0 ? Number(hook.timeout) : DEFAULT_TIMEOUT;
					hooks[event].push({ command: hook.command, timeout, matcher, file });
				}
			}
		}
	}
	return { hooks, errors };
}

const killTree = (child) => {
	if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore", timeout: 5000 });
	else try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } // grupo inteiro: sh -c "a && sleep" não deixa órfão
};

export function runHook(hook, payload, cwd, env = process.env) {
	return new Promise((resolve) => {
		let stdout = "", stderr = "", done = false;
		const child = spawn(hook.command, { cwd, shell: true, detached: process.platform !== "win32", env: { ...env, PINK_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: cwd }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
		const finish = (result) => { if (!done) { done = true; clearTimeout(timer); resolve({ stdout: stdout.trim(), stderr: stderr.trim(), ...result }); } };
		const timer = setTimeout(() => { killTree(child); finish({ code: null, timedOut: true }); }, hook.timeout * 1000);
		child.stdout.on("data", (d) => { if (stdout.length < 100_000) stdout += d; });
		child.stderr.on("data", (d) => { if (stderr.length < 100_000) stderr += d; });
		child.on("error", (error) => finish({ code: null, error: String(error?.message ?? error) }));
		child.on("close", (code) => finish({ code }));
		child.stdin.on("error", () => {}); // hook que não lê o stdin
		child.stdin.end(JSON.stringify(payload));
	});
}

const textOf = (content) => (Array.isArray(content) ? content.map((c) => (c?.type === "text" ? c.text : "")).join("\n") : "");

export function hooksExtension(pi, deps = {}) {
	const { env = process.env, read = fs.readFileSync, run = runHook } = deps;
	let sessionContext = "";
	const filesFor = (ctx) => {
		const files = [path.join(agentDir(env), "hooks.json")];
		if (ctx?.isProjectTrusted?.()) files.push(path.join(ctx.cwd ?? process.cwd(), ".pink", "hooks.json"));
		return files;
	};
	const warned = new Set();
	const notify = (ctx, text) => { if (ctx?.hasUI) ctx.ui.notify?.(text, "warning"); else process.stderr.write(`${text}\n`); };
	// bloqueio de PreToolUse: saída 2, {"decision":"block"} ou o formato novo do Claude Code (hookSpecificOutput.permissionDecision)
	const blockOf = (r) => {
		let out;
		try { out = r.stdout.trim().startsWith("{") ? JSON.parse(r.stdout) : undefined; } catch { out = undefined; }
		const specific = out?.hookSpecificOutput;
		if (r.code === 2 || out?.decision === "block" || specific?.permissionDecision === "deny")
			return out?.reason || specific?.permissionDecisionReason || r.stderr || "sem motivo";
		return undefined;
	};
	const fire = async (event, ctx, payload, toolName, stopWhen) => {
		const cwd = ctx?.cwd ?? process.cwd();
		const { hooks, errors } = loadHooks(filesFor(ctx), read);
		for (const e of errors) if (!warned.has(e)) { warned.add(e); notify(ctx, `Hooks: ${e}`); }
		const results = [];
		for (const hook of hooks[event]) {
			if (toolName !== undefined && hook.matcher && !hook.matcher.test(toolName)) continue;
			const result = await run(hook, { hook_event_name: event, cwd, ...payload }, cwd, env);
			if (result.timedOut) notify(ctx, `Hook ${event} passou de ${hook.timeout} s e foi parado: ${hook.command}`);
			else if (result.error || (result.code !== 0 && result.code !== 2)) notify(ctx, `Hook ${event} falhou (${result.error ?? `saída ${result.code}`}): ${result.stderr || hook.command}`);
			results.push(result);
			if (stopWhen?.(result)) break;
		}
		return results;
	};
	pi.on("tool_call", async (event, ctx) => {
		const results = await fire("PreToolUse", ctx, { tool_name: event?.toolName, tool_input: event?.input }, event?.toolName, (r) => blockOf(r) !== undefined);
		const reason = results.map(blockOf).find((r) => r !== undefined);
		return reason === undefined ? undefined : { block: true, reason: `Bloqueado por hook: ${reason}` };
	});
	pi.on("tool_result", async (event, ctx) => {
		const results = await fire("PostToolUse", ctx, { tool_name: event?.toolName, tool_input: event?.input, tool_response: textOf(event?.content), is_error: Boolean(event?.isError) }, event?.toolName);
		const feedback = results.filter((r) => r.code === 2 && r.stderr).map((r) => r.stderr);
		if (!feedback.length) return undefined;
		return { content: [...(event.content ?? []), { type: "text", text: `[hook PostToolUse] ${feedback.join("\n")}` }] };
	});
	// subagente filho: só os hooks de ferramenta (segurança); sessão e fim são da conversa principal
	if (env.PINK_SUBAGENT) return;
	pi.on("session_start", async (event, ctx) => {
		const results = await fire("SessionStart", ctx, { source: event?.reason });
		sessionContext = results.filter((r) => r.code === 0 && r.stdout).map((r) => r.stdout).join("\n");
	});
	// seção do prompt de sistema da sessão inteira, como o Claude Code: uma mensagem solta depois do pedido o modelo
	// ignorava (QA da Tifa, cenário 7)
	pi.on("before_agent_start", async (event) => {
		const sections = event?.systemPromptOptions?.sections;
		if (sessionContext && sections) sections.pink_hooks_session = `# Contexto do hook SessionStart (hooks.json)\n${sessionContext}`;
		return undefined;
	});
	pi.on("agent_settled", async (event, ctx) => {
		await fire("Stop", ctx, { aborted: Boolean(event?.aborted) });
	});
	pi.registerCommand?.("hooks", {
		description: "Mostra os hooks em uso (usuário e projeto confiável)",
		handler: async (_args, ctx) => {
			const files = filesFor(ctx);
			const { hooks, errors } = loadHooks(files, read);
			const lines = [`Arquivos: ${files.join(" · ")}`, ...EVENTS.map((e) => `${e}: ${hooks[e].map((h) => h.command).join(" | ") || "-"}`), ...errors.map((e) => `Erro: ${e}`)];
			ctx.ui.notify?.(lines.join("\n"), errors.length ? "warning" : "info");
		},
	});
}

export default function (pi) {
	hooksExtension(pi);
}
