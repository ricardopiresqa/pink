// O Pink como MCP (owner 2026-11-23, card 1dfwh7kgfjx): o /agente entrega este servidor aos agentes instalados (claude,
// codex, ACP) para eles alcançarem o que só o Pink tem. Uma ferramenta, pink_tarefa: roda `pink -p <tarefa>` na pasta e
// devolve a resposta; no Pink sem tela valem /tela, a memória, os subagentes, as skills e os MCPs dele.
// MCP por stdio, JSON-RPC por linha (o transporte stdio do MCP). Sem dependências: roda com o node que abriu o Pink.
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PINK = process.env.PINK_MCP_BIN || path.join(here, "..", "dist", "mux", "pink.mjs");
const LIMIT = Number(process.env.PINK_MCP_TIMEOUT_MS || 15 * 60 * 1000);
const depth = Number(process.env.PINK_MCP_DEPTH || 0);

const TOOL = {
	name: "pink_tarefa",
	description: "Entrega uma tarefa ao Pink (agente do Thoth nesta máquina) e devolve a resposta dele. Use para o que só o Pink tem: controlar a tela (/tela), a memória do Pink, os subagentes do Pink e os MCPs dele. Escreva a tarefa completa: o Pink não vê esta conversa.",
	inputSchema: { type: "object", properties: { tarefa: { type: "string", description: "O que o Pink deve fazer, com todo o contexto necessário." }, pasta: { type: "string", description: "Pasta de trabalho (padrão: a pasta atual)." } }, required: ["tarefa"] },
};

export function runPink(task, cwd, start = spawn) {
	return new Promise((resolve) => {
		if (depth >= 1) return resolve({ text: "O Pink já está dentro de outro Pink: pink_tarefa não roda em cadeia.", error: true });
		let out = "";
		let err = "";
		const child = start(process.execPath, [PINK, "-p", task], { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PINK_MCP_DEPTH: String(depth + 1) } });
		const timer = setTimeout(() => child.kill(), LIMIT);
		child.stdout.on("data", (data) => (out += data));
		child.stderr.on("data", (data) => err.length < 4000 && (err += data));
		child.on("error", (error) => (err += String(error?.message ?? error)));
		child.on("close", (code) => {
			clearTimeout(timer);
			const text = out.trim() || err.trim().slice(-2000) || `pink saiu com código ${code}`;
			resolve({ text: text.slice(-60000), error: code !== 0 });
		});
	});
}

export async function handle(msg, run = runPink) {
	if (msg.method === "initialize") return { protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "pink", version: "1" } };
	if (msg.method === "ping") return {};
	if (msg.method === "tools/list") return { tools: [TOOL] };
	if (msg.method === "tools/call") {
		if (msg.params?.name !== TOOL.name) throw Object.assign(new Error(`ferramenta desconhecida: ${msg.params?.name}`), { code: -32602 });
		const args = msg.params?.arguments ?? {};
		if (typeof args.tarefa !== "string" || !args.tarefa.trim()) return { content: [{ type: "text", text: "Informe a tarefa." }], isError: true };
		const done = await run(args.tarefa, typeof args.pasta === "string" && args.pasta ? args.pasta : process.cwd());
		return { content: [{ type: "text", text: done.text }], isError: done.error };
	}
	throw Object.assign(new Error(`método desconhecido: ${msg.method}`), { code: -32601 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const say = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
	readline.createInterface({ input: process.stdin }).on("line", async (line) => {
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}
		if (msg?.id === undefined || msg.id === null) return; // notificação (initialized, cancelled): sem resposta
		try {
			say({ jsonrpc: "2.0", id: msg.id, result: await handle(msg) });
		} catch (error) {
			say({ jsonrpc: "2.0", id: msg.id, error: { code: error.code ?? -32603, message: String(error.message ?? error) } });
		}
	});
}
