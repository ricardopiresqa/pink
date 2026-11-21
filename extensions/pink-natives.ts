// Ferramentas opcionais do Pink (owner 2026-11-15, card 1dfwh7kffk2), carregadas com a pink-ui. Cada pessoa escolhe no
// /ferramentas; vem tudo desligado e a escolha fica em <pasta do agente>/pink-tools.json:
// - Ponytail (MIT, dependência npm fixa): o modo "lazy senior dev", /ponytail e as skills ponytail-*;
// - RTK: comandos do bash passam pelo `rtk rewrite` (o rtk não vem junto: parte é BUSL; usa o que estiver instalado);
// - Headroom: o MCP da máquina (127.0.0.1:8789), só se ele se apresentar como headroom;
// - graphify: o MCP do grafo do projeto (graphify-out/graph.json), só em pasta confiável.
// Tudo falha aberto: sem a ferramenta, o Pink segue igual.
import { t } from "./pink-i18n.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HEADROOM_MCP = "http://127.0.0.1:8789/mcp";
export const TOOLS = [
	{ id: "ponytail", label: "Ponytail", what: t("modo lazy senior dev: a menor mudança que resolve (vale depois do /reload)", "modo lazy senior dev: el menor cambio que resuelve (vale después del /reload)", "lazy senior dev mode: the smallest change that solves it (takes effect after /reload)") },
	{ id: "rtk", label: "RTK", what: t("resume a saída dos comandos do bash para gastar menos tokens (precisa do rtk instalado)", "resume la salida de los comandos de bash para gastar menos tokens (necesita rtk instalado)", "summarizes bash command output to spend fewer tokens (needs rtk installed)") },
	{ id: "headroom", label: "Headroom", what: t("MCP de compressão de contexto da máquina (precisa do Headroom no ar)", "MCP de compresión de contexto de la máquina (necesita Headroom en marcha)", "machine-wide context compression MCP (needs Headroom running)") },
	{ id: "graphify", label: "graphify", what: t("MCP do grafo do projeto (precisa de graphify-out/graph.json e do graphify-mcp)", "MCP del grafo del proyecto (necesita graphify-out/graph.json y graphify-mcp)", "project graph MCP (needs graphify-out/graph.json and graphify-mcp)") },
];
const RTK_TIMEOUT_MS = 2000;

export const agentDir = (env = process.env) => env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent");

export function readChoices(file, read = fs.readFileSync) {
	try {
		const saved = JSON.parse(read(file, "utf8"));
		return { exists: true, on: Object.fromEntries(TOOLS.map((t) => [t.id, saved?.[t.id] === true])) };
	} catch {
		return { exists: false, on: Object.fromEntries(TOOLS.map((t) => [t.id, false])) };
	}
}

// a dependência sobe para o node_modules mais próximo (instalação global ou local): procura subindo a partir da extensão
export function findPackage(fromDir, name, exists = fs.existsSync) {
	for (let dir = fromDir; ; dir = path.dirname(dir)) {
		const candidate = path.join(dir, "node_modules", ...name.split("/"));
		if (exists(path.join(candidate, "package.json"))) return candidate;
		if (path.dirname(dir) === dir) return undefined;
	}
}

// só executáveis que o pink.exec (spawn sem shell) consegue abrir: no Windows, .exe/.com (um .cmd daria ENOENT).
// Devolve o caminho absoluto e ignora pastas relativas do PATH (".", "bin"): quem chama roda esse caminho, nunca o nome
// solto, porque no Windows o spawn procura primeiro na pasta do projeto e um rtk.exe plantado no repositório rodaria.
export function onPath(name, env = process.env, exists = fs.existsSync, platform = process.platform) {
	const exts = platform === "win32" ? [".exe", ".com"] : [""];
	const absolute = platform === "win32" ? path.win32.isAbsolute : path.posix.isAbsolute;
	for (const raw of String(env.PATH || env.Path || "").split(platform === "win32" ? ";" : ":")) {
		const dir = raw.trim().replace(/^"|"$/g, "");
		if (!dir || !absolute(dir)) continue;
		for (const ext of exts) {
			const file = path.join(dir, name + ext);
			if (exists(file)) return file;
		}
	}
	return undefined;
}

// contrato do `rtk rewrite` (rtk rewrite --help): 0 = use o comando novo; 3 = comando novo, aprovação fica com o host
// (o Pink não tem gate no Build, então reescreve); 2 = uma regra do rtk negou: bloqueia com a mensagem; 1 ou erro = original
export async function rtkRewrite(exec, command, signal, bin = "rtk") {
	if (typeof command !== "string" || !command.trim() || command.startsWith("rtk ")) return { command };
	try {
		const result = await exec(bin, ["rewrite", command], { timeout: RTK_TIMEOUT_MS, signal });
		if (result?.killed) return { command };
		if (result?.code === 2) return { command, block: (result.stdout || result.stderr || "").trim() || t("o rtk negou este comando", "rtk negó este comando", "rtk denied this command") };
		if (result?.code !== 0 && result?.code !== 3) return { command };
		return { command: result.stdout?.trim() || command };
	} catch {
		return { command };
	}
}

// o MCP tem de se apresentar como headroom no initialize: outro programa na porta 8789 não vira fonte de ferramentas
export async function headroomUp(fetcher = fetch, url = HEADROOM_MCP) {
	try {
		const response = await fetcher(url, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "pink", version: "1" } } }),
			signal: AbortSignal.timeout(1500),
		});
		const text = await response.text();
		return /"serverInfo"\s*:\s*\{[^}]*"name"\s*:\s*"[^"]*headroom/i.test(text);
	} catch {
		return false;
	}
}

// devolve { graph, bin } (o executável já com caminho absoluto) ou undefined
export function graphFor(cwd, trusted, env, exists = fs.existsSync, platform = process.platform) {
	const graph = path.join(cwd, "graphify-out", "graph.json");
	const bin = trusted && exists(graph) ? onPath("graphify-mcp", env, exists, platform) : undefined;
	return bin ? { graph, bin } : undefined;
}

export async function natives(pink, deps) {
	const { env = process.env, exists = fs.existsSync, fetcher = fetch, here, load = (file) => import(pathToFileURL(file).href), read, write = fs.writeFileSync, mkdir = fs.mkdirSync, platform = process.platform } = deps;
	const file = path.join(agentDir(env), "pink-tools.json");
	const choices = readChoices(file, read);
	const on = choices.on;
	const report = { ponytail: false, rtk: false, headroom: false, graphify: false };
	const installed = {
		ponytail: () => Boolean(findPackage(here, "@dietrichgebert/ponytail", exists)),
		rtk: () => Boolean(onPath("rtk", env, exists, platform)),
		headroom: () => headroomUp(fetcher),
		graphify: () => Boolean(onPath("graphify-mcp", env, exists, platform)),
	};
	// um servidor com o mesmo nome no mcp.json tem precedência (o Pink mostra a troca no /mcp); erro de registro não derruba a sessão
	const register = (name, config) => {
		try {
			pink.registerMcpServer?.(name, config);
			return true;
		} catch {
			return false;
		}
	};
	const unregister = (name) => {
		try {
			pink.unregisterMcpServer?.(name);
		} catch {
			// já não estava registrado
		}
	};

	const ponytail = on.ponytail ? findPackage(here, "@dietrichgebert/ponytail", exists) : undefined;
	if (ponytail) {
		try {
			// shortcut: o process.env é global, os filhos do bash herdam; inofensivo (só cala o aviso do Ponytail ao abrir)
			env.PONYTAIL_QUIET_STARTUP ??= "1";
			const extension = await load(path.join(ponytail, "pi-extension", "index.js"));
			extension.default(pink);
			pink.on("resources_discover", async () => ({ skillPaths: [path.join(ponytail, "skills")] }));
			report.ponytail = true;
		} catch {
			// pacote quebrado: o Pink segue sem o Ponytail
		}
	}

	// o caminho do rtk é procurado ao abrir, a cada sessão e ao ligar no /ferramentas (não a cada comando do bash)
	let rtkBin;
	const findRtk = () => { rtkBin = on.rtk && env.PINK_RTK !== "0" ? onPath("rtk", env, exists, platform) : undefined; return Boolean(rtkBin); };
	report.rtk = findRtk();
	pink.on("tool_call", async (event, ctx) => {
		if (event?.toolName !== "bash" || !event.input || !rtkBin) return;
		const result = await rtkRewrite(pink.exec.bind(pink), event.input.command, ctx?.signal, rtkBin);
		if (result.block) return { block: true, reason: `RTK: ${result.block}` };
		event.input.command = result.command;
	});

	// Headroom sem esperar: a sonda não segura o início (servidor registrado depois conecta na hora). Se a pessoa
	// desligar no /ferramentas antes de a sonda voltar, a resposta atrasada não registra de novo.
	const startHeadroom = () => headroomUp(fetcher).then((up) => (report.headroom = Boolean(on.headroom && up && register("headroom", { url: HEADROOM_MCP }))));
	const headroomDone = on.headroom ? startHeadroom() : Promise.resolve();

	// graphify só depois da confiança na pasta: o grafo de um repositório qualquer vira contexto do modelo
	const syncGraphify = (ctx) => {
		const found = on.graphify ? graphFor(ctx?.cwd ?? process.cwd(), Boolean(ctx?.isProjectTrusted?.()), env, exists, platform) : undefined;
		if (found) report.graphify = register("graphify", { command: found.bin, args: ["--graph", found.graph] });
		else if (report.graphify) {
			unregister("graphify");
			report.graphify = false;
		}
	};
	pink.on("session_start", async (_event, ctx) => {
		report.rtk = findRtk();
		syncGraphify(ctx);
		if (!choices.exists && ctx?.mode === "tui") ctx.ui?.notify?.(t("O Pink tem ferramentas opcionais (Ponytail, RTK, Headroom, graphify): /ferramentas", "Pink tiene herramientas opcionales (Ponytail, RTK, Headroom, graphify): /ferramentas", "Pink has optional tools (Ponytail, RTK, Headroom, graphify): /ferramentas"), "info");
	});

	pink.registerCommand?.("ferramentas", {
		description: t("Liga ou desliga as ferramentas opcionais (Ponytail, RTK, Headroom, graphify)", "Activa o desactiva las herramientas opcionales (Ponytail, RTK, Headroom, graphify)", "Turns the optional tools on or off (Ponytail, RTK, Headroom, graphify)"),
		handler: async (_args, ctx) => {
			// a sonda do Headroom (até 1,5 s) roda uma vez por abertura do menu, não a cada Enter
			const headroomOnline = await installed.headroom();
			for (;;) {
				const state = (tool) => (tool.id === "headroom" ? (headroomOnline ? t("no ar", "en marcha", "running") : t("fora do ar", "fuera de línea", "offline")) : installed[tool.id]() ? t("instalado", "instalado", "installed") : t("não instalado", "no instalado", "not installed"));
				const rows = TOOLS.map((t) => `${on[t.id] ? "●" : "○"} ${t.label}  ${state(t)} · ${t.what}`);
				const picked = await ctx.ui.select(t("Ferramentas do Pink (Enter liga/desliga; Esc sai)", "Herramientas de Pink (Enter activa/desactiva; Esc sale)", "Pink tools (Enter turns on/off; Esc exits)"), [...rows, t("Pronto", "Listo", "Done")]);
				const index = rows.indexOf(picked);
				if (index < 0) break;
				const id = TOOLS[index].id;
				on[id] = !on[id];
				try {
					mkdir(path.dirname(file), { recursive: true });
					write(file, `${JSON.stringify(on, null, 2)}\n`);
					choices.exists = true;
				} catch (error) {
					ctx.ui.notify?.(t(`Não deu para salvar ${file}: ${error?.message ?? error}`, `No se pudo guardar ${file}: ${error?.message ?? error}`, `Could not save ${file}: ${error?.message ?? error}`), "error");
				}
				if (id === "rtk") findRtk();
				if (id === "headroom") {
					if (!on.headroom) { unregister("headroom"); report.headroom = false; }
					else if (!(await startHeadroom())) ctx.ui.notify?.(t("Headroom ligado, mas fora do ar: o MCP entra quando ele estiver rodando (abra o Pink de novo)", "Headroom activado, pero fuera de línea: el MCP entra cuando esté en marcha (vuelve a abrir Pink)", "Headroom is on but offline: the MCP joins once it is running (reopen Pink)"), "warning");
				}
				if (id === "graphify") syncGraphify(ctx);
				if (id === "ponytail") ctx.ui.notify?.(t("O Ponytail liga ou desliga depois do /reload", "Ponytail se activa o desactiva después de /reload", "Ponytail turns on or off after /reload"), "info");
			}
		},
	});
	return { report, headroomDone, file };
}

export default async function (pink) {
	await natives(pink, { here: path.dirname(fileURLToPath(import.meta.url)) });
}
