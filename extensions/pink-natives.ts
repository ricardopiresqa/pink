// Ferramentas opcionais do Pink (owner 2026-11-15, card 1dfwh7kffk2), carregadas com a pink-ui. Cada pessoa escolhe no
// /ferramentas; vem tudo desligado e a escolha fica em <pasta do agente>/pink-tools.json:
// - Ponytail (MIT, dependência npm fixa): o modo "lazy senior dev", /ponytail e as skills ponytail-*;
// - RTK: comandos do bash passam pelo `rtk rewrite` (o rtk não vem junto: parte é BUSL; usa o que estiver instalado);
// - Headroom: o MCP da máquina (127.0.0.1:8789), só se ele se apresentar como headroom;
// - graphify: o MCP do grafo do projeto (graphify-out/graph.json), só em pasta confiável.
// Tudo falha aberto: sem a ferramenta, o Pink segue igual.
//
// Google Antigravity (card 1dfwh7kffnt) é do Pink, sempre ligado (owner 2026-11-15: "instalou o pink já vem tudo"):
// Gemini e Claude pela conta Google, UMA conta no /login google, e a cota na coluna COTA. O uso viola os termos do Google
// e a conta pode ser suspensa (risco aceito pelo owner em 2026-11-15). Base MIT fixada no rebrand.json (NOTICE.md).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HEADROOM_MCP = "http://127.0.0.1:8789/mcp";
export const TOOLS = [
	{ id: "ponytail", label: "Ponytail", what: "modo lazy senior dev: a menor mudança que resolve (vale depois do /reload)" },
	{ id: "rtk", label: "RTK", what: "resume a saída dos comandos do bash para gastar menos tokens (precisa do rtk instalado)" },
	{ id: "headroom", label: "Headroom", what: "MCP de compressão de contexto da máquina (precisa do Headroom no ar)" },
	{ id: "graphify", label: "graphify", what: "MCP do grafo do projeto (precisa de graphify-out/graph.json e do graphify-mcp)" },
];
export const ANTIGRAVITY_PACKAGE = "@cortexkit/pi-antigravity-auth";
const ANTIGRAVITY_CORE = "@cortexkit/antigravity-auth-core";
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

// só executáveis que o pi.exec (spawn sem shell) consegue abrir: no Windows, .exe/.com (um .cmd daria ENOENT).
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
		if (result?.code === 2) return { command, block: (result.stdout || result.stderr || "").trim() || "o rtk negou este comando" };
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

// a cota pelo mesmo cliente do pacote (retrieveUserQuotaSummary, com o User-Agent e os endpoints dele). Só com o login
// do Antigravity: o refresh guardado traz "|projeto"; uma chave do Google AI Studio no mesmo provedor não é enviada.
export async function antigravityQuota({ core, getKey, readAuth }) {
	const stored = readAuth()?.google;
	if (stored?.type !== "oauth" || typeof stored.refresh !== "string" || !stored.refresh.includes("|")) return undefined;
	const token = await getKey?.("google");
	if (typeof token !== "string" || !token) return undefined;
	const { projectId, managedProjectId } = core.parseRefreshParts(stored.refresh);
	const { summary } = await core.fetchQuotaSummary({ accessToken: token, endpoints: core.ANTIGRAVITY_ENDPOINT_FALLBACKS, projectId, managedProjectId });
	return core.aggregateQuotaSummary(summary);
}

// o pi que a base do Antigravity recebe: o provedor aparece como "Google Antigravity" no /login e no /model, o menu
// /antigravity (só do modo cofre, que o Pink não usa) não entra, e um gancho dela que falhe não chega à tela (o provedor
// fica recusando no próprio pedido e o Pink avisa ao abrir: state.unavailable). O resto passa direto para o pi do Pink.
export const ANTIGRAVITY_NAME = "Google Antigravity";
export const ANTIGRAVITY_LOGIN_HELP = "Entre com a conta do Google. No fim o navegador mostra um erro em localhost: é esperado. Copie o endereço inteiro dessa página e cole no Pink.";
export const ANTIGRAVITY_PASTE = "Cole o endereço inteiro da página de erro (http://localhost:51121/...):";
export function antigravityHost(pi, state = {}) {
	const rename = (config) => {
		const unavailable = /unavailable/i.test(String(config?.name ?? ""));
		state.unavailable = unavailable;
		const name = unavailable ? `${ANTIGRAVITY_NAME} (indisponível)` : ANTIGRAVITY_NAME;
		// o login não tem servidor na porta 51121: o navegador cai numa página de erro em localhost e a pessoa cola o endereço
		const login = config?.oauth?.login && ((callbacks) => config.oauth.login({
			...callbacks,
			onAuth: (info) => callbacks.onAuth({ ...info, instructions: ANTIGRAVITY_LOGIN_HELP }),
			onPrompt: (prompt) => callbacks.onPrompt({ ...prompt, message: ANTIGRAVITY_PASTE }),
		}));
		return { ...config, name, ...(config?.oauth ? { oauth: { ...config.oauth, name: ANTIGRAVITY_NAME, ...(login ? { login } : {}) } } : {}) };
	};
	return new Proxy(pi, {
		get(target, key) {
			if (key === "registerProvider") return (name, config) => target.registerProvider(name, rename(config));
			if (key === "registerCommand") return (name, spec) => (name === "antigravity" ? undefined : target.registerCommand?.(name, spec));
			if (key === "on") return (event, handler) => target.on(event, async (...args) => { try { return await handler(...args); } catch { return undefined; } });
			const value = target[key];
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

export async function natives(pi, deps) {
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
			pi.registerMcpServer?.(name, config);
			return true;
		} catch {
			return false;
		}
	};
	const unregister = (name) => {
		try {
			pi.unregisterMcpServer?.(name);
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
			extension.default(pi);
			pi.on("resources_discover", async () => ({ skillPaths: [path.join(ponytail, "skills")] }));
			report.ponytail = true;
		} catch {
			// pacote quebrado: o Pink segue sem o Ponytail
		}
	}

	// Google Antigravity: sempre ligado; o que a pessoa vê é do Pink (nome do provedor, sem o menu de cofre de terceiros)
	let antigravityOn = false;
	let antigravityBroken = false;
	const antigravityState = {};
	const antigravity = findPackage(here, ANTIGRAVITY_PACKAGE, exists);
	if (antigravity) {
		try {
			// sem os caminhos, a base guarda o estado dela em ~/.pi/agent: tudo vai para a pasta do agente do Pink
			const vaultDir = path.join(agentDir(env), "antigravity");
			const extension = await load(path.join(antigravity, "dist", "index.js"));
			// settingsFile também: sem ele a base lê a configuração do plugin do OpenCode (account_models) no XDG do usuário
			await extension.registerCortexKitPiAntigravity(antigravityHost(pi, antigravityState), { vaultDir, modeFile: path.join(vaultDir, "mode.json"), rosterFile: path.join(vaultDir, "roster.json"), settingsFile: path.join(vaultDir, "settings.json") });
			antigravityOn = true;
			const corePath = findPackage(antigravity, ANTIGRAVITY_CORE, exists) ?? findPackage(here, ANTIGRAVITY_CORE, exists);
			const core = corePath ? await load(path.join(corePath, "dist", "index.js")) : undefined;
			const readAuth = () => JSON.parse((read ?? fs.readFileSync)(path.join(agentDir(env), "auth.json"), "utf8"));
			// a pink-ui chama na coluna COTA (como o __pinkMcp): sem o core, a cota fica de fora e os modelos seguem
			if (core) globalThis.__pinkAntigravityQuota = (getKey) => antigravityQuota({ core, getKey, readAuth });
		} catch {
			// base quebrada ou incompatível com esta versão: o Pink segue sem o Antigravity (aviso curto, sem o erro)
			antigravityBroken = true;
		}
	}

	// o caminho do rtk é procurado ao abrir, a cada sessão e ao ligar no /ferramentas (não a cada comando do bash)
	let rtkBin;
	const findRtk = () => { rtkBin = on.rtk && env.PINK_RTK !== "0" ? onPath("rtk", env, exists, platform) : undefined; return Boolean(rtkBin); };
	report.rtk = findRtk();
	pi.on("tool_call", async (event, ctx) => {
		if (event?.toolName !== "bash" || !event.input || !rtkBin) return;
		const result = await rtkRewrite(pi.exec.bind(pi), event.input.command, ctx?.signal, rtkBin);
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
	pi.on("session_start", async (_event, ctx) => {
		report.rtk = findRtk();
		syncGraphify(ctx);
		if (!choices.exists && ctx?.mode === "tui") ctx.ui?.notify?.("O Pink tem ferramentas opcionais (Ponytail, RTK, Headroom, graphify): /ferramentas", "info");
		if (antigravityBroken && ctx?.mode === "tui") ctx.ui?.notify?.("Google Antigravity indisponível nesta instalação: reinstale o Pink", "warning");
		else if (antigravityState.unavailable && ctx?.mode === "tui") ctx.ui?.notify?.(`Google Antigravity indisponível: o Pink não conseguiu ler ${path.join(agentDir(env), "antigravity")}. Feche o Pink, apague essa pasta e faça /login de novo`, "warning");
	});

	pi.registerCommand?.("ferramentas", {
		description: "Liga ou desliga as ferramentas opcionais (Ponytail, RTK, Headroom, graphify)",
		handler: async (_args, ctx) => {
			// a sonda do Headroom (até 1,5 s) roda uma vez por abertura do menu, não a cada Enter
			const headroomOnline = await installed.headroom();
			for (;;) {
				const state = (t) => (t.id === "headroom" ? (headroomOnline ? "no ar" : "fora do ar") : installed[t.id]() ? "instalado" : "não instalado");
				const rows = TOOLS.map((t) => `${on[t.id] ? "●" : "○"} ${t.label}  ${state(t)} · ${t.what}`);
				const picked = await ctx.ui.select("Ferramentas do Pink (Enter liga/desliga; Esc sai)", [...rows, "Pronto"]);
				const index = rows.indexOf(picked);
				if (index < 0) break;
				const id = TOOLS[index].id;
				on[id] = !on[id];
				try {
					mkdir(path.dirname(file), { recursive: true });
					write(file, `${JSON.stringify(on, null, 2)}\n`);
					choices.exists = true;
				} catch (error) {
					ctx.ui.notify?.(`Não deu para salvar ${file}: ${error?.message ?? error}`, "error");
				}
				if (id === "rtk") findRtk();
				if (id === "headroom") {
					if (!on.headroom) { unregister("headroom"); report.headroom = false; }
					else if (!(await startHeadroom())) ctx.ui.notify?.("Headroom ligado, mas fora do ar: o MCP entra quando ele estiver rodando (abra o Pink de novo)", "warning");
				}
				if (id === "graphify") syncGraphify(ctx);
				if (id === "ponytail") ctx.ui.notify?.("O Ponytail liga ou desliga depois do /reload", "info");
			}
		},
	});
	return { report, headroomDone, file, antigravity: antigravityOn };
}

export default async function (pi) {
	await natives(pi, { here: path.dirname(fileURLToPath(import.meta.url)) });
}
