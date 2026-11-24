# ruff: noqa: E501
"""Cards 1dfwh7kgf8g (Claude), 1dfwh7kgf8h (Codex) e 1dfwh7kgf8j (ACP): agentes instalados como subagentes do Pink.

Um driver de node importa o external.ts do pacote construído e roda o runExternal contra processos falsos (scripts de
node que falam stream-json, o JSON-RPC do codex app-server e o ACP), com as mensagens no formato real. Confere a
tradução para mensagens do subagente, os pedidos de aprovação virando pergunta e as mensagens de erro. Também confere
que os patches entraram no pacote. Não roda nenhum agente de verdade.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, cli, package_dir  # noqa: E402, F401 - fixtures do pacote construido (cli: instalado com as dependências)

FAKE_CLAUDE = r"""
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const say = (m) => process.stdout.write(JSON.stringify(m) + "\n");
  say({ type: "system", subtype: "hook_started" });
  say({ type: "system", subtype: "init", model: "claude-fake", session_id: "claude-sess" });
  say({ type: "assistant", message: { content: [{ type: "text", text: "Vou ler." }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }] } });
  if (input.includes("sem login")) return say({ type: "result", is_error: true, num_turns: 0, result: "Invalid API key · Please run /login", usage: {} });
  say({ type: "result", subtype: "success", is_error: false, num_turns: 2, result: "eco: " + input + " args=" + process.argv.slice(2).join(" "), usage: { input_tokens: 2, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 4 } });
});
"""

FAKE_CODEX = r"""
const rl = (await import("node:readline")).createInterface({ input: process.stdin });
const fs = await import("node:fs");
const say = (m) => process.stdout.write(JSON.stringify(m) + "\n");
let task = "";
rl.on("line", (line) => {
  const m = JSON.parse(line);
  if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ agent: "codex", ...m }) + "\n");
  if (m.method === "initialize") return say({ id: m.id, result: { userAgent: "fake" } });
  if (m.method === "initialized") return;
  if (m.method === "model/list") return say({ id: m.id, result: { data: [{ id: "a", model: "gpt-5", displayName: "GPT-5", isDefault: true, hidden: false }, { id: "h", model: "oculto", displayName: "x", hidden: true }, { id: "m", model: "gpt-mini", displayName: "GPT mini", hidden: false }], nextCursor: null } });
  if (m.method === "thread/start") return say({ id: m.id, result: { thread: { id: "th1" }, model: m.params.model ?? "gpt-fake", cwd: m.params.cwd, approvalPolicy: m.params.approvalPolicy, sandbox: m.params.sandbox } });
  if (m.method === "thread/resume") return say({ id: m.id, result: { thread: { id: m.params.threadId }, model: "gpt-retomado" } });
  if (m.method === "turn/start") {
    task = m.params.input[0].text;
    say({ id: m.id, result: { turn: { id: "t1" } } });
    if (task.startsWith("mcp:")) return say({ id: 98, method: "mcpServer/elicitation/request", params: { threadId: "th1", turnId: "t1", serverName: task.slice(4), mode: "form", message: "Permitir a ferramenta?", requestedSchema: {} } });
    if (task.includes("sem login")) return say({ method: "turn/completed", params: { turn: { id: "t1", status: "failed", items: [], error: { message: "401 Unauthorized: please sign in" } } } });
    return say({ id: 99, method: "item/commandExecution/requestApproval", params: { command: "rm -rf build", cwd: "C:\\proj", reason: "limpar" } });
  }
  if (m.id === 98) return say({ method: "turn/completed", params: { turn: { id: "t1", status: "completed", items: [{ type: "agentMessage", id: "e", text: `mcp ${m.result.action}` }] } } });
  if (m.id === 99) {
    say({ method: "item/started", params: { item: { type: "commandExecution", id: "c1", command: "rm -rf build" } } });
    say({ method: "item/completed", params: { item: { type: "commandExecution", id: "c1", command: "rm -rf build" } } });
    say({ method: "item/completed", params: { item: { type: "fileChange", id: "f1", changes: [{ path: "src/a.ts", kind: { type: "update" } }, { path: "src/novo.ts", kind: { type: "add" } }] } } });
    const text = `decisão ${m.result.decision} para: ${task}`;
    say({ method: "item/completed", params: { item: { type: "agentMessage", id: "m1", text } } });
    say({ method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { totalTokens: 130, inputTokens: 120, cachedInputTokens: 100, outputTokens: 10 }, last: { totalTokens: 130 } } } });
    say({ method: "turn/completed", params: { turn: { id: "t1", status: "completed", items: [{ type: "agentMessage", id: "m1", text }] } } });
  }
});
"""

FAKE_ACP = r"""
const rl = (await import("node:readline")).createInterface({ input: process.stdin });
const fs = await import("node:fs");
const say = (m) => process.stdout.write(JSON.stringify(m) + "\n");
let promptId;
rl.on("line", (line) => {
  const m = JSON.parse(line);
  if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ agent: "acp", ...m }) + "\n");
  if (m.method === "initialize") return say({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true } } });
  if (m.method === "session/load") {
    say({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "HISTORICO" } } } });
    return say({ jsonrpc: "2.0", id: m.id, result: {} });
  }
  if (m.method === "session/new") return say({ jsonrpc: "2.0", id: m.id, result: { sessionId: "s-" + require_cwd(m.params.cwd), configOptions: [{ id: "modelo", category: "model", type: "select", currentValue: "a/1", options: [{ group: "g", name: "G", options: [{ value: "a/1", name: "A 1" }, { value: "b/2", name: "B 2" }] }] }] } });
  if (m.method === "session/set_config_option") return say(m.params.value === "ruim" || m.params.configId !== "modelo" ? { jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "modelo desconhecido" } } : { jsonrpc: "2.0", id: m.id, result: {} });
  if (m.method === "session/prompt") {
    promptId = m.id;
    const up = (u) => say({ jsonrpc: "2.0", method: "session/update", params: { sessionId: m.params.sessionId, update: u } });
    up({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Vou editar. " } });
    up({ sessionUpdate: "tool_call", toolCallId: "k1", title: "Editar src/b.ts", kind: "edit", locations: [{ path: "src/b.ts" }] });
    return say({ jsonrpc: "2.0", id: 7, method: "session/request_permission", params: { sessionId: m.params.sessionId, toolCall: { toolCallId: "k1", title: "Editar src/b.ts" }, options: [{ optionId: "sim", kind: "allow_once", name: "Permitir" }, { optionId: "nao", kind: "reject_once", name: "Recusar" }] } });
  }
  if (m.id === 7) {
    say({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Escolha: " + m.result.outcome.optionId } } } });
    say({ jsonrpc: "2.0", id: promptId, result: { stopReason: "end_turn", usage: { inputTokens: 50, outputTokens: 7, cachedReadTokens: 5 } } });
  }
});
function require_cwd(cwd) { return cwd ? "ok" : "sem-cwd"; }
"""

DRIVER = r"""
const [url, root, claudeJs, codexJs, acpJs] = process.argv.slice(1);
const ext = await import(url);
const path = await import("node:path");
const { spawn } = await import("node:child_process");
const out = {};

// descoberta: o .exe antes do .cmd do npm; cada agente com o seu modo
const bin = path.join(root, "bin");
const files = new Set(["claude.exe", "codex.cmd", "codex.exe", "opencode.cmd", "cline.cmd"].map((f) => path.join(bin, f)));
const found = ext.externalAgents({ PATH: ["C:\\nada", bin].join(path.delimiter) }, (f) => files.has(f), "win32");
out.found = found.map((a) => [a.name, a.external, path.basename(a.command), a.args.join(" ")]);
out.missing = ext.externalAgents({ PATH: "C:\\nada" }, (f) => files.has(f), "win32");

const fresh = () => ({ messages: [], stderr: "", exitCode: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 } });
const parts = (r) => r.messages.map((m) => m.content.map((p) => (p.type === "text" ? `text:${p.text}` : p.type === "thinking" ? `thinking:${p.thinking}` : `${p.name}:${p.arguments.path ?? p.arguments.command ?? p.arguments.file_path ?? p.arguments.title ?? ""}`)));
const fake = (script) => (cmd, args, opts) => { out.spawned = (out.spawned ?? []).concat([{ cmd, args, shell: opts.shell, cwd: opts.cwd }]); return spawn(process.execPath, [script, ...args], { ...opts, shell: false }); };
const agent = (name, kind, args, command = `C:\\bin\\${name}.exe`) => ({ name, external: kind, args, command });
const asked = [];
const say = (answer) => () => async (title, body) => (asked.push({ title, body }), answer);
const summary = (r, emits) => ({ stop: r.stopReason, error: r.errorMessage ?? null, model: r.model, usage: r.usage, parts: parts(r), exit: r.exitCode, emits });

let emits = 0;
let r = await ext.runExternal(agent("claude", "claude", ["-p", "--output-format", "stream-json", "--verbose"]), "-faça algo", root, undefined, fresh(), () => emits++, fake(claudeJs));
out.claude = summary(r, emits);
r = await ext.runExternal(agent("claude", "claude", []), "sem login", root, undefined, fresh(), () => {}, fake(claudeJs));
out.claudeLogin = summary(r, 0);

r = await ext.runExternal(agent("codex", "codex", ["app-server", "--listen", "stdio://"], "C:\\npm\\codex.cmd"), "arrumar build", root, undefined, fresh(), () => {}, fake(codexJs), say(true));
out.codexYes = summary(r, 0);
r = await ext.runExternal(agent("codex", "codex", []), "arrumar build", root, undefined, fresh(), () => {}, fake(codexJs), say(false));
out.codexNo = r.messages.at(-1).content[0].text;
r = await ext.runExternal(agent("codex", "codex", []), "arrumar build", root, undefined, fresh(), () => {}, fake(codexJs), () => undefined);
out.codexHeadless = r.messages.at(-1).content[0].text;
r = await ext.runExternal(agent("codex", "codex", []), "sem login", root, undefined, fresh(), () => {}, fake(codexJs), say(true));
out.codexLogin = summary(r, 0);

r = await ext.runExternal(agent("opencode", "acp", ["acp"], "C:\\npm\\opencode.cmd"), "editar b", root, undefined, fresh(), () => {}, fake(acpJs), say(true));
out.acpYes = summary(r, 0);
r = await ext.runExternal(agent("opencode", "acp", ["acp"]), "editar b", root, undefined, fresh(), () => {}, fake(acpJs), say(false));
out.acpNo = r.messages.at(-1).content[0].text;

// agente que some no meio: erro claro, sem travar
r = await ext.runExternal(agent("codex", "codex", []), "x", root, undefined, fresh(), () => {}, () => spawn(process.execPath, ["-e", "process.exit(3)"], { stdio: ["pipe", "pipe", "pipe"] }), say(true));
out.dies = { stop: r.stopReason, error: r.errorMessage };
// cancelar mata o processo e avisa como os subagentes do Pink
const ac = new AbortController();
const slow = ext.runExternal(agent("claude", "claude", []), "x", root, ac.signal, fresh(), () => {}, () => spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: ["pipe", "pipe", "pipe"] }));
setTimeout(() => ac.abort(), 300);
out.aborted = await slow.then(() => "terminou", (e) => e.message);
out.asked = [...asked];

// sessão inteira: a conversa continua entre chamadas
const keep = {};
await ext.runExternal(agent("claude", "claude", ["-p"]), "um", root, undefined, fresh(), () => {}, fake(claudeJs), undefined, keep);
r = await ext.runExternal(agent("claude", "claude", ["-p"]), "dois", root, undefined, fresh(), () => {}, fake(claudeJs), undefined, keep);
out.claudeResume = { id: keep.id, last: r.messages.at(-1).content[0].text };
const cx = {};
await ext.runExternal(agent("codex", "codex", []), "a", root, undefined, fresh(), () => {}, fake(codexJs), say(true), cx);
r = await ext.runExternal(agent("codex", "codex", []), "b", root, undefined, fresh(), () => {}, fake(codexJs), say(true), cx);
out.codexResume = { id: cx.id, model: r.model };
const ac2 = { id: "s-antiga" };
r = await ext.runExternal(agent("opencode", "acp", ["acp"]), "c", root, undefined, fresh(), () => {}, fake(acpJs), say(true), ac2);
out.acpResume = { id: ac2.id, parts: parts(r) };

// modelo escolhido no /agente
r = await ext.runExternal({ ...agent("claude", "claude", ["-p"]), model: "opus" }, "m", root, undefined, fresh(), () => {}, fake(claudeJs));
out.claudeModel = r.messages.at(-1).content[0].text;
r = await ext.runExternal({ ...agent("codex", "codex", []), model: "gpt-mini" }, "arrumar build", root, undefined, fresh(), () => {}, fake(codexJs), say(true));
out.codexModel = r.model;
r = await ext.runExternal({ ...agent("opencode", "acp", ["acp"]), model: "b/2" }, "editar b", root, undefined, fresh(), () => {}, fake(acpJs), say(true));
out.acpModel = [r.stopReason, r.model];
r = await ext.runExternal({ ...agent("opencode", "acp", ["acp"]), model: "ruim" }, "editar b", root, undefined, fresh(), () => {}, fake(acpJs), say(true));
out.acpBadModel = [r.stopReason, r.errorMessage];
out.listCodex = await ext.listModels(agent("codex", "codex", []), root, fake(codexJs));
out.listAcp = await ext.listModels(agent("opencode", "acp", ["acp"]), root, fake(acpJs));
out.listClaude = (await ext.listModels(agent("claude", "claude", []), root)).map((m) => m.id);
out.listSilent = await ext.listModels(agent("codex", "codex", []), root, () => spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { stdio: ["pipe", "pipe", "pipe"] }), 300).then(() => "ok", (e) => e.message);
// opencode: o comando e o arquivo chegam no tool_call_update; o pensamento vira "+ Pensou"
const live = fresh(), st = { text: "" };
const up = (u) => ext.applyAcpUpdate(u, live, st, () => {});
up({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "pensando" } });
up({ sessionUpdate: "tool_call", toolCallId: "x1", title: "shell", kind: "execute", rawInput: {} });
up({ sessionUpdate: "tool_call_update", toolCallId: "x1", title: "echo ola", rawInput: { command: "echo ola", workdir: "C:\\p" } });
up({ sessionUpdate: "tool_call", toolCallId: "x2", title: "read", kind: "read", rawInput: {}, locations: [{ path: "C:\\p\\a.txt" }] });
up({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "pronto" } });
out.acpLive = { parts: parts(live), text: st.text };
out.acpOld = ext.acpModels({ models: { currentModelId: "x", availableModels: [{ modelId: "x", name: "X" }, { modelId: "y" }] } });

// o Pink junto: MCPs (sem os thoth*), regras, skills e o próprio Pink como MCP
const extras = ext.pinkExtras({
  mcp: { thoth: { type: "http", url: "https://x", headers: { Authorization: "segredo" }, exposure: "direct" }, "thoth-board": { command: "py" }, playwright: { command: "node", args: ["pw.js"], timeout: 5 }, web: { type: "http", url: "https://w", headers: { K: "v" } } },
  rules: "Responda em português.",
  skills: [{ name: "deploy", description: "Publica\no site", path: "C:\\skills\\deploy\\SKILL.md" }],
  server: { command: "node", args: ["pink-mcp-server.mjs"] },
});
out.extras = { names: Object.keys(extras.mcp), playwright: extras.mcp.playwright, instructions: extras.instructions };
out.codexConfig = ext.codexMcpConfig(extras.mcp, ["PATH", "THOTH_TOKEN"]);
const elicit = async (server, ask) => (await ext.runExternal(agent("codex", "codex", []), `mcp:${server}`, root, undefined, fresh(), () => {}, fake(codexJs), ask)).messages.at(-1).content[0].text;
out.elicit = [await elicit("pink", () => undefined), await elicit("outro", () => undefined), await elicit("outro", say(true))];
out.acpServers = [ext.acpMcpServers(extras.mcp, true), ext.acpMcpServers(extras.mcp, false).map((s) => s.name)];
const fsx = await import("node:fs");
process.env.FAKE_LOG = path.join(root, "log.jsonl");
r = await ext.runExternal({ ...agent("claude", "claude", ["-p"]), extras }, "x", root, undefined, fresh(), () => {}, fake(claudeJs));
const echoed = r.messages.at(-1).content[0].text.split("args=")[1].split(" ");
const mcpFile = echoed[echoed.indexOf("--mcp-config") + 1];
out.claudeExtras = { flags: echoed.filter((a) => a.startsWith("--")), mcpGone: !fsx.existsSync(mcpFile) };
await ext.runExternal({ ...agent("codex", "codex", []), extras }, "arrumar build", root, undefined, fresh(), () => {}, fake(codexJs), say(true));
const k1 = {};
await ext.runExternal({ ...agent("opencode", "acp", ["acp"]), extras }, "primeira", root, undefined, fresh(), () => {}, fake(acpJs), say(true), k1);
const log = fsx.readFileSync(process.env.FAKE_LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const ts = log.find((m) => m.method === "thread/start").params;
out.codexExtras = { dev: ts.developerInstructions === extras.instructions, config: Object.keys(ts.config ?? {}) };
const sn = log.find((m) => m.method === "session/new").params;
const sp = log.find((m) => m.method === "session/prompt").params;
out.acpExtras = { servers: sn.mcpServers.map((s) => s.name), first: sp.prompt.map((b) => b.text.slice(0, 6)) };
delete process.env.FAKE_LOG;
console.log(JSON.stringify(out));
"""

SESSION_DRIVER = r"""
const [url, tuiUrl, codingUrl] = process.argv.slice(1);
const mod = await import(url);
const sent = [], notes = [], status = [], commands = {}, handlers = {}, runs = [], widgets = [], renderers = {};
const pi = { registerCommand: (name, spec) => (commands[name] = spec), on: (event, fn) => (handlers[event] = fn), sendMessage: (m) => sent.push(m), registerMessageRenderer: (type, fn) => (renderers[type] = fn) };
const agents = [{ name: "claude", external: "claude" }, { name: "codex", external: "codex" }];
let release;
const run = async (agent, text, cwd, signal, result, emit, start, ask, resume) => {
  out.extrasSeen = agent.extras?.instructions ?? null;
  runs.push({ agent: agent.name, model: agent.model ?? null, text, cwd, sameResume: runs.length ? resume === runs[0].resume : true, resume });
  resume.id = resume.id ?? "sess-1";
  if (text === "devagar") await new Promise((r) => (release = r));
  result.messages.push({ content: [{ type: "toolCall", name: "bash", arguments: { command: "ls -la" } }] }, { content: [{ type: "text", text: `resposta a ${text}` }] });
  result.stopReason = "stop";
  emit();
};
const menus = [];
const models = async (agent) => (agent.name === "codex" ? [{ id: "gpt-5", label: "GPT-5", current: true }, { id: "gpt-mini", label: "GPT mini" }] : [{ id: "opus", label: "opus" }]);
mod.default(pi, () => agents, run, models, () => ({ mcp: {}, instructions: "regras do pink" }), () => Promise.all([import(tuiUrl), import(codingUrl)]));
const answers = [];
const plain = { fg: (c, s) => s, bold: (s) => s, bg: (c, s) => s };
const shown = (v) => (typeof v === "function" ? v({ requestRender() {} }, plain).render(80) : v).join("|").trim();
const ui = { notify: (text, level) => notes.push(level), setStatus: (k, v) => status.push(v ?? null), setWidget: (k, v, o) => widgets.push([k, v ? shown(v) : null, o?.placement ?? null]), select: async (title, options) => (menus.push([title, options]), answers.shift()), confirm: async () => true };
answers.push("Padrão do claude");
const ctx = { hasUI: true, cwd: "C:\\proj", ui };
const input = (text, c = ctx) => handlers.input({ text, source: "interactive" }, c);
const out = {};
out.before = (await input("oi")).action;
await commands.agente.handler("nao-existe", ctx);
out.unknown = notes.at(-1);
await commands.agente.handler("claude", ctx);
out.slash = (await input("/model")).action;
out.first = (await input("primeira")).action;
await new Promise((r) => setTimeout(r, 20));
out.second = (await input("segunda")).action;
await new Promise((r) => setTimeout(r, 20));
out.sent = sent.map((m) => [m.customType, m.content]);
out.runs = runs.map((r) => [r.agent, r.text, r.cwd, r.sameResume]);
input("devagar");
await new Promise((r) => setTimeout(r, 20));
out.busy = [(await input("outra")).action, notes.at(-1)];
out.working = widgets.filter((w) => w[1]).at(-1);
release();
await new Promise((r) => setTimeout(r, 20));
out.workingEnd = widgets.at(-1);
out.status = status.filter(Boolean).slice(0, 3);
answers.push("codex", "GPT mini — gpt-mini");
await commands.agente.handler("", ctx);
out.picked = runs.length && (await input("pelo menu"), await new Promise((r) => setTimeout(r, 20)), [runs.at(-1).agent, runs.at(-1).model]);
await commands.agente.handler("claude opus", ctx);
await input("direto");
await new Promise((r) => setTimeout(r, 20));
out.direct = [runs.at(-1).agent, runs.at(-1).model, status.at(-1)];
await commands.agente.handler("codex x;rm", ctx);
out.badModel = [notes.at(-1), runs.length];
answers.push(undefined);
await commands.agente.handler("codex", ctx);
out.cancelKeeps = (await input("ainda claude"), await new Promise((r) => setTimeout(r, 20)), runs.at(-1).agent);
out.menus = menus;
answers.push("Voltar ao Pink (desliga o claude)");
await commands.agente.handler("", ctx);
out.back = [(await input("pro pink")).action, menus.at(-1)[1][0]];
const theme = { fg: (c, s) => s, bold: (s) => s, bg: (c, s) => s };
await new Promise((r) => setTimeout(r, 300));
(await import(codingUrl)).initTheme?.(); // o Pink inicia o tema ao abrir; aqui o driver faz isso
const draw = (type, message) => renderers[type]?.(message, { outputPad: 1, expanded: false }, theme)?.render(60).join("\n").replace(/\x1b\[[0-9;]*m/g, "").replace(/\s+$/gm, "") ?? null;
out.renderers = Object.keys(renderers).sort();
out.drawAsk = draw("pink-agente-pedido", { content: "› claude: oi", details: { agent: "claude", text: "oi" } });
const answerSteps = [{ kind: "thinking", ms: 400 }, { kind: "tool", line: "Rodou: echo ola" }, { kind: "text", text: "**olá**" }];
out.drawAnswer = draw("pink-agente", { content: "**olá**", details: { agent: "opencode", model: "opencode/big-pickle", steps: answerSteps, ms: 7200, output: 49 } });
out.tools = [mod.pinkTool({ name: "Read", arguments: { file_path: "C:\\proj\\src\\a.ts" } }, "C:\\proj"), mod.pinkTool({ name: "Glob", arguments: { pattern: "*.ts" } }), mod.pinkTool({ name: "tool", arguments: { title: "Algo" } })];
const complete = (p) => commands.agente.getArgumentCompletions(p);
out.completeOff = (await complete(""))?.map((i) => i.value) ?? null;
await commands.agente.handler("claude opus", ctx);
out.complete = [(await complete(""))?.map((i) => i.value), (await complete("co"))?.map((i) => i.value), (await complete("codex "))?.map((i) => i.value), (await complete("codex gpt-m"))?.map((i) => i.label), await complete("zzz"), await complete("zzz x")];
await commands.agente.handler("off", ctx);
out.after = (await input("de volta")).action;
out.headless = await (async () => {
  await commands.agente.handler("claude", { ...ctx, hasUI: false });
  const n = sent.length;
  await input("sem tela", { ...ctx, hasUI: false });
  return sent.length - n; // pink -p: a resposta já saiu quando o input volta
})();
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def ext(package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    root = tmp_path_factory.mktemp("ext")
    scripts = []
    for name, body in (("claude.mjs", FAKE_CLAUDE), ("codex.mjs", FAKE_CODEX), ("acp.mjs", FAKE_ACP)):
        (root / name).write_text(body, encoding="utf-8")
        scripts.append(str(root / name))
    url = (package_dir / "examples" / "extensions" / "subagent" / "external.ts").as_uri()
    done = subprocess.run(["node", "--input-type=module", "-e", DRIVER, url, str(root), *scripts], capture_output=True, text=True, encoding="utf-8", timeout=180, check=False)
    assert done.returncode == 0, done.stderr[-2000:]
    return json.loads(done.stdout.strip().splitlines()[-1])


def test_installed_agents_are_found_exe_before_the_npm_shim(ext: dict) -> None:
    assert ext["found"] == [
        ["claude", "claude", "claude.exe", "-p --output-format stream-json --verbose"],
        ["codex", "codex", "codex.exe", "app-server --listen stdio://"],
        ["opencode", "acp", "opencode.cmd", "acp"],
        ["cline", "acp", "cline.cmd", "--acp"],
    ]
    assert ext["missing"] == []


def test_the_task_never_goes_on_the_command_line_and_npm_shims_run_through_the_shell(ext: dict) -> None:
    spawned = ext["spawned"]
    assert all("faça algo" not in " ".join(s["args"]) and "arrumar" not in " ".join(s["args"]) for s in spawned)
    assert spawned[0]["shell"] is False and spawned[2] == {"cmd": '"C:\\npm\\codex.cmd"', "args": ["app-server", "--listen", "stdio://"], "shell": True, "cwd": spawned[2]["cwd"]}


def test_claude_stream_json_becomes_subagent_messages(ext: dict) -> None:
    c = ext["claude"]
    assert c["stop"] == "stop" and c["model"] == "claude-fake" and c["exit"] == 0 and c["error"] is None
    assert c["parts"][0] == ["text:Vou ler.", "Read:a.ts"]
    assert c["parts"][1] == ["text:eco: -faça algo args=-p --output-format stream-json --verbose"]  # a tarefa entrou pela entrada padrão
    assert c["usage"] == {"input": 12, "output": 4, "cacheRead": 100, "cacheWrite": 0, "cost": 0, "contextTokens": 0, "turns": 2}
    assert c["emits"] == 2
    assert ext["claudeLogin"]["stop"] == "error" and "faça login" in ext["claudeLogin"]["error"]


def test_codex_runs_a_turn_and_its_approvals_become_questions(ext: dict) -> None:
    c = ext["codexYes"]
    assert c["stop"] == "stop" and c["model"] == "gpt-fake" and c["exit"] == 0
    assert c["parts"] == [["bash:rm -rf build"], ["edit:src/a.ts", "write:src/novo.ts"], ["text:decisão accept para: arrumar build"]]
    assert c["usage"] == {"input": 20, "output": 10, "cacheRead": 100, "cacheWrite": 0, "cost": 0, "contextTokens": 130, "turns": 1}
    assert ext["codexNo"] == "decisão decline para: arrumar build"
    assert ext["codexHeadless"] == "decisão decline para: arrumar build"  # sem tela para perguntar: recusa
    assert ext["codexLogin"]["stop"] == "error" and ext["codexLogin"]["error"].startswith("401 Unauthorized") and "faça login" in ext["codexLogin"]["error"]


def test_acp_agents_run_a_prompt_and_permissions_become_questions(ext: dict) -> None:
    a = ext["acpYes"]
    assert a["stop"] == "stop" and a["exit"] == 0
    assert a["parts"] == [["text:Vou editar. "], ["edit:src/b.ts"], ["text:Escolha: sim"]]
    assert a["usage"]["input"] == 50 and a["usage"]["output"] == 7 and a["usage"]["cacheRead"] == 5
    assert ext["acpNo"] == "Escolha: nao"
    assert a["model"] == "a/1"  # o modelo que o agente usa (currentValue), não o nome dele
    live = ext["acpLive"]
    assert live["parts"] == [["thinking:pensando"], ["bash:echo ola"], ["read:C:\\p\\a.txt"]] and live["text"] == "pronto"


def test_questions_name_the_agent_and_the_action(ext: dict) -> None:
    titles = [q["title"] for q in ext["asked"]]
    assert titles == ["O Codex quer rodar um comando", "O Codex quer rodar um comando", "O opencode pede permissão", "O opencode pede permissão"]
    assert ext["asked"][0]["body"] == "rm -rf build\nem C:\\proj\nlimpar" and ext["asked"][2]["body"] == "Editar src/b.ts"


def test_a_dying_agent_gives_a_clear_error_and_cancel_kills_it(ext: dict) -> None:
    assert ext["dies"]["stop"] == "error" and "o codex saiu (código 3)" in ext["dies"]["error"]
    assert ext["aborted"] == "Subagent was aborted"


def test_the_conversation_continues_between_calls(ext: dict) -> None:
    assert ext["claudeResume"]["id"] == "claude-sess" and ext["claudeResume"]["last"].endswith("args=-p --resume claude-sess")
    assert ext["codexResume"] == {"id": "th1", "model": "gpt-retomado"}
    assert ext["acpResume"]["id"] == "s-antiga" and all("HISTORICO" not in str(p) for p in ext["acpResume"]["parts"])  # o histórico repetido não aparece


@pytest.fixture(scope="module")
def session(package_dir: Path, cli: Path) -> dict:
    url = (package_dir / "extensions" / "pink-agente.ts").as_uri()
    installed = cli.parents[2]  # <prefixo>/node_modules/@thothdev/pink: os componentes de tela vêm do pacote instalado
    tui = next(p for p in (installed / "node_modules" / "@earendil-works" / "pi-tui" / "dist" / "index.js", installed.parents[1] / "@earendil-works" / "pi-tui" / "dist" / "index.js") if p.is_file())
    done = subprocess.run(["node", "--input-type=module", "-e", SESSION_DRIVER, url, tui.as_uri(), (installed / "dist" / "index.js").as_uri()], capture_output=True, text=True, encoding="utf-8", timeout=120, check=False)
    assert done.returncode == 0, done.stderr[-2000:]
    return json.loads(done.stdout.strip().splitlines()[-1])


def test_agente_sends_what_the_person_types_to_the_agent_and_keeps_the_conversation(session: dict) -> None:
    assert session["before"] == "continue" and session["unknown"] == "warning"
    assert session["slash"] == "continue"  # comandos do Pink seguem funcionando
    assert session["first"] == session["second"] == "handled"
    assert session["runs"][:2] == [["claude", "primeira", "C:\\proj", True], ["claude", "segunda", "C:\\proj", True]]
    assert session["sent"][:2] == [["pink-agente-pedido", "› claude: primeira"], ["pink-agente", "→ Rodou: ls -la\n\nresposta a primeira"]]
    assert session["status"][:2] == ["claude: buscando modelos…", "agente: claude"] and session["status"][2].startswith("claude trabalhando")


def test_agente_refuses_a_second_message_while_busy_picks_from_a_menu_and_turns_off(session: dict) -> None:
    assert session["busy"] == ["handled", "warning"]
    assert session["picked"] == ["codex", "gpt-mini"]
    assert session["after"] == "continue"
    assert session["headless"] == 2


def test_agente_shows_working_while_the_agent_answers_and_the_menu_goes_back_to_pink(session: dict) -> None:
    key, line, placement = session["working"]
    assert key == "pink-agente-trabalhando" and placement == "aboveEditor" and "Trabalhando · 0s · ↓ 0 tokens" in line  # o mesmo do Pink, acima da caixa
    assert session["workingEnd"] == ["pink-agente-trabalhando", None, None]  # some quando a resposta chega
    assert session["back"] == ["continue", "Voltar ao Pink (desliga o claude)"]  # 1º item do menu com agente ligado
    assert session["menus"][1][1][0] == "Voltar ao Pink (desliga o claude)"


def test_agente_messages_are_drawn_like_the_conversation_not_with_the_raw_type(session: dict) -> None:
    assert session["renderers"] == ["pink-agente", "pink-agente-pedido"]
    ask = [row for row in session["drawAsk"].split("\n") if row.strip()]
    assert ask == ["> oi"]  # como a mensagem nativa, sem "Você →"
    assert session["drawAsk"] == "> oi" and session["drawAnswer"].startswith(" + Pensou")  # sem linha em branco a mais: o Pink já põe uma antes de cada mensagem
    rows = [row.strip() for row in session["drawAnswer"].split("\n") if row.strip()]
    assert rows == ["+ Pensou · 0.4s", "→ Rodou: echo ola", "● olá", "opencode · big-pickle · 7s · ↓ 49 tokens"]
    assert session["tools"] == ["Leu src/a.ts", "Procurou *.ts", "Algo"]  # nomes do Claude viram os do Pink, caminho relativo


def test_agente_space_lists_agents_then_models(session: dict) -> None:
    assert session["completeOff"] == ["claude", "codex"]  # sem agente ligado, sem "off"
    all_items, co, codex_models, filtered, unknown, unknown_models = session["complete"]
    assert all_items == ["off", "claude", "codex"] and co == ["codex"]
    assert codex_models == ["codex gpt-5", "codex gpt-mini"] and filtered == ["gpt-mini"]
    assert unknown is None and unknown_models is None


def test_agente_model_menu_direct_choice_and_validation(session: dict) -> None:
    assert session["runs"][0][:2] == ["claude", "primeira"]
    assert session["menus"][0] == ["Modelo do claude", ["Padrão do claude", "opus"]]  # padrão primeiro: mantém o do agente
    assert session["menus"][2] == ["Modelo do codex", ["Padrão do codex (GPT-5)", "GPT-5 — gpt-5", "GPT mini — gpt-mini"]]
    assert session["direct"] == ["claude", "opus", "agente: claude · opus"]  # com o nome, sem menu
    assert session["badModel"][0] == "warning"
    assert session["cancelKeeps"] == "claude"  # Esc no menu não troca o agente


def test_the_chosen_model_reaches_each_agent(ext: dict) -> None:
    assert ext["claudeModel"].endswith("args=-p --model opus")
    assert ext["codexModel"] == "gpt-mini"
    assert ext["acpModel"] == ["stop", "b/2"]
    assert ext["acpBadModel"][0] == "error" and "recusou o modelo ruim" in ext["acpBadModel"][1]


def test_model_lists_come_from_each_agent(ext: dict) -> None:
    assert ext["listCodex"] == [{"id": "gpt-5", "label": "GPT-5", "current": True}, {"id": "gpt-mini", "label": "GPT mini", "current": False}]  # escondido fica de fora
    assert ext["listAcp"] == [{"id": "a/1", "label": "A 1", "current": True}, {"id": "b/2", "label": "B 2", "current": False}]  # grupos achatados
    assert ext["listClaude"] == ["opus", "sonnet", "haiku"]
    assert "não respondeu" in ext["listSilent"]
    assert ext["acpOld"] == [{"id": "x", "label": "X", "current": True}, {"id": "y", "label": "y", "current": False}]


def test_pink_extras_skip_thoth_servers_and_carry_rules_skills_and_the_pink_server(ext: dict) -> None:  # card 1dfwh7kgfjx
    e = ext["extras"]
    assert e["names"] == ["playwright", "web", "pink"]  # thoth* o agente já tem pelo thoth-client
    assert e["playwright"] == {"command": "node", "args": ["pw.js"]}  # timeout e exposure são do Pink
    assert "Responda em português." in e["instructions"] and "- deploy: Publica o site (C:\\skills\\deploy\\SKILL.md)" in e["instructions"] and "pink_tarefa" in e["instructions"]
    assert ext["codexConfig"]["mcp_servers.playwright"] == {"command": "node", "args": ["pw.js"], "env_vars": ["PATH", "THOTH_TOKEN"]}  # só os nomes, nunca os valores
    assert ext["codexConfig"]["mcp_servers.web"] == {"url": "https://w", "http_headers": {"K": "v"}}
    with_http, without_http = ext["acpServers"]
    assert with_http[0] == {"name": "playwright", "command": "node", "args": ["pw.js"], "env": []}
    assert with_http[1] == {"type": "http", "name": "web", "url": "https://w", "headers": [{"name": "K", "value": "v"}]}
    assert without_http == ["playwright", "pink"]  # agente sem http não recebe o servidor http


def test_each_agent_receives_the_pink_side(ext: dict, session: dict) -> None:
    assert ext["claudeExtras"] == {"flags": ["--mcp-config", "--allowedTools", "--append-system-prompt-file"], "mcpGone": True}  # arquivo com cabeçalhos apagado no fim
    assert ext["codexExtras"] == {"dev": True, "config": ["mcp_servers.playwright", "mcp_servers.web", "mcp_servers.pink"]}
    assert ext["acpExtras"] == {"servers": ["playwright", "pink"], "first": ["# Pink", "primei"]}  # sem http no agente; regras antes da 1ª mensagem
    assert session["extrasSeen"] == "regras do pink"  # o /agente liga o agente com o Pink junto
    assert ext["elicit"] == ["mcp accept", "mcp decline", "mcp accept"]  # só o MCP do Pink passa sem perguntar; outro pergunta, sem tela recusa


MCP_DRIVER = r"""
const [url, fakePink] = process.argv.slice(1);
const { spawn } = await import("node:child_process");
const file = (await import("node:url")).fileURLToPath(url);
const talk = (env, lines) => new Promise((resolve) => {
  const child = spawn(process.execPath, [file], { env: { ...process.env, PINK_MCP_BIN: fakePink, ...env }, stdio: ["pipe", "pipe", "inherit"] });
  let buf = "";
  const got = [];
  child.stdout.on("data", (d) => {
    buf += d;
    for (let n = buf.indexOf("\n"); n >= 0; n = buf.indexOf("\n")) { got.push(JSON.parse(buf.slice(0, n))); buf = buf.slice(n + 1); }
    if (got.length === lines.filter((l) => l.id != null).length) { child.kill(); resolve(got); }
  });
  for (const l of lines) child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...l }) + "\n");
});
const out = {};
const r = await talk({}, [
  { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
  { method: "notifications/initialized" },
  { id: 2, method: "tools/list" },
  { id: 3, method: "tools/call", params: { name: "pink_tarefa", arguments: { tarefa: "tire um print" } } },
  { id: 4, method: "tools/call", params: { name: "pink_tarefa", arguments: {} } },
  { id: 5, method: "tools/call", params: { name: "outra", arguments: {} } },
]);
const byId = Object.fromEntries(r.map((m) => [m.id, m]));
out.server = byId[1].result.serverInfo.name;
out.tools = byId[2].result.tools.map((t) => t.name);
out.call = byId[3].result;
out.empty = byId[4].result.isError;
out.unknown = byId[5].error.code;
const nested = await talk({ PINK_MCP_DEPTH: "1" }, [{ id: 1, method: "tools/call", params: { name: "pink_tarefa", arguments: { tarefa: "x" } } }]);
out.nested = nested[0].result;
console.log(JSON.stringify(out));
"""


def test_the_pink_mcp_server_runs_a_task_in_pink_and_refuses_to_chain(package_dir: Path, tmp_path: Path) -> None:
    fake = tmp_path / "pink.mjs"
    fake.write_text('console.log("pink fez: " + process.argv.slice(2).join(" | ") + " depth=" + process.env.PINK_MCP_DEPTH);\n', encoding="utf-8")
    url = (package_dir / "extensions" / "pink-mcp-server.mjs").as_uri()
    done = subprocess.run(["node", "--input-type=module", "-e", MCP_DRIVER, url, str(fake)], capture_output=True, text=True, encoding="utf-8", timeout=120, check=False)
    assert done.returncode == 0, done.stderr[-2000:]
    out = json.loads(done.stdout.strip().splitlines()[-1])
    assert out["server"] == "pink" and out["tools"] == ["pink_tarefa"]
    assert out["call"] == {"content": [{"type": "text", "text": "pink fez: -p | tire um print depth=1"}], "isError": False}
    assert out["empty"] is True and out["unknown"] == -32602
    assert out["nested"]["isError"] is True and "em cadeia" in out["nested"]["content"][0]["text"]


def test_the_subagent_patches_are_in_the_package(package_dir: Path) -> None:
    sub = package_dir / "examples" / "extensions" / "subagent"
    agents, index = (sub / "agents.ts").read_text(encoding="utf-8"), (sub / "index.ts").read_text(encoding="utf-8")
    assert 'import { externalAgents } from "./external.ts"' in agents and "for (const agent of externalAgents())" in agents
    assert agents.index("externalAgents())") < agents.index('agentMap.set("revisor"')  # o revisor segue sendo o último
    assert 'import { runExternal } from "./external.ts"' in index and "return runExternal(agent as any, task, cwd ?? defaultCwd, signal, currentResult, emitUpdate)" in index
    assert "__pinkExternalAsk = ctx?.hasUI ?" in index
