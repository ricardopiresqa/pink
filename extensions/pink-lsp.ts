// Erros do servidor de linguagem depois de editar (owner 2026-11-19, card 1dfwh7kfzxt), como o Claude Code, o Cursor e o
// OpenCode: depois de um write ou edit que deu certo, o arquivo vai ao servidor de linguagem (typescript-language-server,
// pyright-langserver) e até MAX_SHOWN erros entram no resultado da ferramenta; o agente corrige sem esperar build ou teste.
// - Só em pasta confiável: o servidor do TypeScript carrega plugins do tsconfig do projeto (código do repositório).
// - Um servidor por linguagem e projeto, aberto na primeira edição e fechado no fim da sessão (session_shutdown).
// - Sem o servidor instalado, ou se ele demorar, nada muda: o resultado da ferramenta segue como veio.
// - PINK_NO_LSP=1 desliga.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { t } from "./pink-i18n.ts";

export const MAX_SHOWN = 10;
const MAX_FILE = 1024 * 1024;
const MAX_BUFFER = 32 * 1024 * 1024;
const MAX_OPEN = 20; // arquivos abertos no servidor; o mais antigo recebe didClose
const BUDGET_MS = 6000; // espera por edição
const FIRST_BUDGET_MS = 12000; // a primeira edição espera também o servidor subir a frio (pyright levou ~6 s)
const INIT_MS = 30000;
// shortcut: o primeiro publish do tsserver às vezes é só o sintático; erros de tipo de projeto grande podem chegar depois
// do settle e ficar para a próxima edição. Esperar mais atrasaria toda edição de arquivo sem erro.
const SETTLE_MS = 400;
const RETRY_MS = 60000; // servidor ausente ou quebrado: não tenta de novo antes disso

type Candidate = { command: string; args: string[] };
type Language = { id: string; candidates: Candidate[]; languageId: (ext: string) => string; exts: string[] };
type Server = Candidate & Pick<Language, "id" | "languageId">;

// em ordem: o TypeScript 7 (nativo) traz o próprio servidor em `tsc --lsp`, sem o tsserver.js de que o
// typescript-language-server precisa; o 5.x não aceita --lsp, sai na hora e o próximo é tentado.
// O `tsc` é o do PATH (global), não o do projeto: projeto com TS 7 local e tsc 5 global cai no typescript-language-server
export const SERVERS: Language[] = [
	{
		id: "typescript",
		candidates: [
			{ command: "tsc", args: ["--lsp", "--stdio"] },
			{ command: "typescript-language-server", args: ["--stdio"] },
		],
		exts: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
		languageId: (ext) => ({ ".tsx": "typescriptreact", ".jsx": "javascriptreact", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript" })[ext] ?? "typescript",
	},
	{ id: "python", candidates: [{ command: "pyright-langserver", args: ["--stdio"] }], exts: [".py", ".pyi"], languageId: () => "python" },
];

export const serverFor = (file: string) => SERVERS.find((server) => server.exts.includes(path.extname(file).toLowerCase()));

// o servidor devolve a URI do jeito dele (file:///c%3A/x no Windows): compara pela forma decodificada, unidade em minúscula
export function normUri(uri: string, platform = process.platform) {
	let out = String(uri ?? "");
	try {
		out = decodeURIComponent(out);
	} catch {
		/* fica como veio */
	}
	out = out.replace(/\\/g, "/");
	return platform === "win32" ? out.toLowerCase() : out;
}

export function encode(message: unknown) {
	const body = Buffer.from(JSON.stringify(message), "utf8");
	return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

// quadros "Content-Length: N\r\n\r\n<json>"; devolve false quando o fluxo passa do limite (servidor quebrado).
// Guarda os pedaços e só junta quando o quadro inteiro chegou: juntar a cada pedaço seria quadrático numa mensagem grande.
export function createDecoder(onMessage: (message: any) => void) {
	let chunks: Buffer[] = [];
	let total = 0;
	let need = 0; // tamanho do quadro em espera (cabeçalho + corpo), 0 quando ainda não se sabe
	const take = () => {
		const all = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, total);
		chunks = [all];
		return all;
	};
	return (chunk: Buffer) => {
		chunks.push(chunk);
		total += chunk.length;
		if (total > MAX_BUFFER) return false;
		for (;;) {
			if (need && total < need) return true;
			const buffer = take();
			const end = buffer.indexOf("\r\n\r\n");
			if (end < 0) return true;
			const size = /Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, end).toString("ascii"));
			const rest = (from: number) => {
				const left = buffer.subarray(from);
				chunks = left.length ? [left] : [];
				total = left.length;
				need = 0;
			};
			if (!size) {
				rest(end + 4);
				continue;
			}
			const length = Number(size[1]);
			if (length > MAX_BUFFER) return false;
			if (buffer.length < end + 4 + length) {
				need = end + 4 + length;
				return true;
			}
			const body = buffer.subarray(end + 4, end + 4 + length).toString("utf8");
			rest(end + 4 + length);
			try {
				onMessage(JSON.parse(body));
			} catch {
				/* quadro inválido: ignora */
			}
		}
	};
}

export function formatDiagnostics(list: any[] | undefined, shown: string) {
	const errors = (list ?? []).filter((item) => item && (item.severity === 1 || item.severity === undefined));
	if (!errors.length) return undefined;
	const lines = errors.slice(0, MAX_SHOWN).map((item) => {
		const line = Number(item.range?.start?.line ?? 0) + 1;
		const column = Number(item.range?.start?.character ?? 0) + 1;
		const message = String(item.message ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
		return `  ${shown}:${line}:${column} ${message}`;
	});
	const more = errors.length > MAX_SHOWN ? `\n  … ${t("mais", "más", "more")} ${errors.length - MAX_SHOWN}` : "";
	return `${t("Erros do servidor de linguagem depois desta mudança", "Errores del servidor de lenguaje después de este cambio", "Language server errors after this change")} (${errors.length}):\n${lines.join("\n")}${more}`;
}

// espera ms, ou menos se o sinal (Esc) abortar
const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve) => {
		if (signal?.aborted) return resolve();
		const onAbort = () => (clearTimeout(timer), resolve());
		const timer = setTimeout(() => (signal?.removeEventListener?.("abort", onAbort), resolve()), ms);
		timer.unref?.();
		signal?.addEventListener?.("abort", onAbort, { once: true });
	});

export function createClient(server: Server, root: string, { spawnFn = spawn as any, platform = process.platform } = {}) {
	const windows = platform === "win32";
	// no Windows os servidores do npm são atalhos .cmd e precisam do shell: comando fixo numa string só (nada vindo do
	// modelo) e sem procurar o executável na pasta do projeto antes do PATH
	const child = windows
		? spawnFn(`${server.command} ${server.args.join(" ")}`, [], { cwd: root, stdio: ["pipe", "pipe", "ignore"], shell: true, windowsHide: true, env: { ...process.env, NoDefaultCurrentDirectoryInExePath: "1" } })
		: spawnFn(server.command, server.args, { cwd: root, stdio: ["pipe", "pipe", "ignore"] });
	let dead = false;
	let ready = false;
	let pull = false; // o servidor responde textDocument/diagnostic (o cliente pede) em vez de publicar sozinho
	let waitedInit = false;
	let exited = false;
	let nextId = 1;
	const pending = new Map<number, (value: any) => void>();
	const diagnostics = new Map<string, any[]>();
	const waiters = new Map<string, (() => void)[]>();
	const versions = new Map<string, number>(); // ordem de inserção = ordem de uso (LRU)
	const opened = new Map<string, string>(); // uri normalizada -> uri enviada
	const kill = () => {
		if (windows && child.pid) spawnFn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on?.("error", () => {});
		else child.kill?.();
	};
	const die = () => {
		if (dead) return;
		dead = true;
		if (!exited) kill();
		for (const resolve of pending.values()) resolve(undefined);
		pending.clear();
		for (const list of waiters.values()) list.forEach((resolve) => resolve());
		waiters.clear();
	};
	const send = (message: unknown) => {
		if (dead) return;
		try {
			child.stdin.write(encode(message));
		} catch {
			die();
		}
	};
	child.on?.("error", die);
	child.on?.("exit", () => {
		exited = true;
		die();
	});
	child.stdin?.on?.("error", die);
	const decode = createDecoder((message) => {
		if (message.id !== undefined && message.method === undefined) {
			const resolve = pending.get(message.id);
			pending.delete(message.id);
			return resolve?.(message.error ? undefined : message.result ?? null);
		}
		if (message.method === "textDocument/publishDiagnostics") {
			const uri = normUri(message.params?.uri, platform);
			const sent = versions.get(uri);
			if (sent === undefined) return; // só guarda o que este cliente abriu
			const version = message.params?.version;
			if (typeof version === "number" && version < sent) return; // resposta de uma versão anterior
			diagnostics.set(uri, Array.isArray(message.params?.diagnostics) ? message.params.diagnostics : []);
			waiters.get(uri)?.forEach((resolve) => resolve());
			return waiters.delete(uri);
		}
		// pedido do servidor (configuração, registro de capacidade, applyEdit): responde vazio, não aplica nada
		if (message.id !== undefined && message.method) {
			const result = message.method === "workspace/configuration" ? (message.params?.items ?? []).map(() => null) : null;
			send({ jsonrpc: "2.0", id: message.id, result });
		}
	});
	child.stdout?.on?.("data", (chunk: Buffer) => {
		if (!decode(chunk)) close();
	});
	const request = (method: string, params: unknown, timeout: number) =>
		new Promise<any>((resolve) => {
			const id = nextId++;
			pending.set(id, resolve);
			send({ jsonrpc: "2.0", id, method, params });
			setTimeout(() => pending.delete(id) && resolve(undefined), timeout).unref?.();
		});
	const notify = (method: string, params: unknown) => send({ jsonrpc: "2.0", method, params });
	const rootUri = pathToFileURL(root).href;
	const init = request(
		"initialize",
		{
			processId: process.pid,
			rootUri,
			workspaceFolders: [{ uri: rootUri, name: path.basename(root) }],
			capabilities: { textDocument: { publishDiagnostics: { versionSupport: true }, diagnostic: { dynamicRegistration: false }, synchronization: { didSave: true } }, workspace: { configuration: true, workspaceFolders: true } },
		},
		INIT_MS,
	).then((result) => {
		if (result === undefined) return void die(); // não iniciou: o cliente morre e a falha fica guardada
		pull = Boolean(result?.capabilities?.diagnosticProvider);
		notify("initialized", {});
		ready = true;
	});

	async function check(file: string, text: string, { budget, signal }: { budget?: number; signal?: AbortSignal } = {}) {
		const started = Date.now();
		budget ??= ready ? BUDGET_MS : FIRST_BUDGET_MS;
		// só a primeira edição espera a inicialização; as seguintes não esperam de novo enquanto ela não termina
		if (!ready) {
			if (waitedInit || dead) return undefined;
			waitedInit = true;
			await Promise.race([init, sleep(budget, signal)]);
			if (!ready || dead || signal?.aborted) return undefined;
		}
		const sentUri = pathToFileURL(file).href;
		const uri = normUri(sentUri, platform);
		const version = (versions.get(uri) ?? 0) + 1;
		versions.delete(uri);
		versions.set(uri, version);
		diagnostics.delete(uri);
		const first = new Promise<void>((resolve) => waiters.set(uri, [...(waiters.get(uri) ?? []), resolve]));
		const ext = path.extname(file).toLowerCase();
		if (!opened.has(uri)) {
			opened.set(uri, sentUri);
			notify("textDocument/didOpen", { textDocument: { uri: sentUri, languageId: server.languageId(ext), version, text } });
		} else notify("textDocument/didChange", { textDocument: { uri: sentUri, version }, contentChanges: [{ text }] });
		notify("textDocument/didSave", { textDocument: { uri: sentUri }, text });
		// o arquivo menos usado sai do servidor
		while (opened.size > MAX_OPEN) {
			const [oldest] = versions.keys();
			notify("textDocument/didClose", { textDocument: { uri: opened.get(oldest) } });
			opened.delete(oldest);
			versions.delete(oldest);
			diagnostics.delete(oldest);
		}
		const left = () => Math.max(0, (budget as number) - (Date.now() - started));
		if (pull) {
			const answer = await Promise.race([request("textDocument/diagnostic", { textDocument: { uri: sentUri } }, left()), sleep(left(), signal).then(() => undefined)]);
			if (signal?.aborted || versions.get(uri) !== version) return void waiters.delete(uri);
			if (Array.isArray(answer?.items)) {
				waiters.delete(uri); // quem só responde por pedido nunca publica: a espera não fica pendurada
				return answer.items;
			}
			// sem resposta útil: cai na publicação, se o servidor também publicar
		}
		await Promise.race([first, sleep(left(), signal)]);
		if (!diagnostics.has(uri) || signal?.aborted) return undefined;
		await sleep(SETTLE_MS, signal);
		return versions.get(uri) === version ? diagnostics.get(uri) : undefined;
	}

	function close() {
		if (dead) return;
		send({ jsonrpc: "2.0", id: nextId++, method: "shutdown", params: null });
		notify("exit", null);
		try {
			child.stdin.end();
		} catch {
			/* já fechado */
		}
		die(); // mata a árvore (taskkill /T no Windows: matar só o cmd.exe deixaria o node do servidor vivo)
	}
	return { check, close, isDead: () => dead, wasReady: () => ready };
}

export function createLsp({ make = createClient, read = fs.readFileSync, stat = fs.statSync, now = Date.now } = {}) {
	const clients = new Map<string, ReturnType<typeof createClient>>();
	const failedAt = new Map<string, number>();
	const candidate = new Map<string, number>(); // qual servidor da lista está em uso para a linguagem e o projeto
	async function onResult(event: any, ctx: any) {
		if (event?.isError || (event?.toolName !== "write" && event?.toolName !== "edit")) return undefined;
		if (ctx?.isProjectTrusted?.() !== true) return undefined;
		const shown = event.input?.path ?? event.input?.file_path;
		if (typeof shown !== "string" || !shown) return undefined;
		const root = path.resolve(ctx?.cwd ?? process.cwd());
		const file = path.resolve(root, shown);
		const inside = path.relative(root, file);
		if (!inside || inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return undefined;
		const language = serverFor(file);
		if (!language) return undefined;
		let text: string;
		try {
			if (stat(file).size > MAX_FILE) return undefined;
			text = String(read(file, "utf8"));
		} catch {
			return undefined;
		}
		const key = `${language.id}\u0000${root.toLowerCase()}`;
		const acquire = () => {
			let client = clients.get(key);
			if (client?.isDead()) {
				clients.delete(key);
				const index = candidate.get(key) ?? 0;
				// nunca iniciou e há outro servidor na lista: tenta o próximo; senão espera antes de tentar de novo
				if (!client.wasReady() && index + 1 < language.candidates.length) candidate.set(key, index + 1);
				else {
					candidate.delete(key);
					failedAt.set(key, now());
				}
				client = undefined;
			}
			if (!client) {
				if (now() - (failedAt.get(key) ?? -Infinity) < RETRY_MS) return undefined;
				const picked = language.candidates[candidate.get(key) ?? 0];
				client = make({ id: language.id, languageId: language.languageId, ...picked }, root);
				clients.set(key, client);
			}
			return client;
		};
		let list: any[] | undefined;
		// o primeiro da lista que sai sem iniciar (TypeScript 5 com `tsc --lsp`) dá lugar ao próximo na mesma edição
		for (let attempt = 0; attempt < language.candidates.length; attempt++) {
			const client = acquire();
			if (!client) return undefined;
			list = await client.check(file, text, { signal: ctx?.signal });
			if (list !== undefined || !client.isDead() || client.wasReady() || ctx?.signal?.aborted) break;
		}
		const note = formatDiagnostics(list, shown);
		if (!note) return undefined;
		// devolver content sem structuredContent apagaria o dele
		return { content: [...(event.content ?? []), { type: "text", text: note }], structuredContent: event.structuredContent };
	}
	const closeAll = () => {
		for (const client of clients.values()) client.close();
		clients.clear();
	};
	return { onResult, closeAll, clients };
}

export default function (pink: any) {
	if (process.env.PINK_SUBAGENT || process.env.PINK_NO_LSP === "1") return;
	const lsp = createLsp();
	pink.on("tool_result", (event: any, ctx: any) => lsp.onResult(event, ctx));
	pink.on("session_shutdown", () => lsp.closeAll());
}
