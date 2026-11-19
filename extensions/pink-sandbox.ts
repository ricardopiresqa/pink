// Sandbox dos comandos do agente (owner 2026-11-19, card 1dfwh7kfzxu). Decisão do owner: no Windows, token restrito + ACL,
// como o Codex sem elevação; desligado por padrão, ligado com /sandbox. Com ele ligado, o bash e o powershell do agente
// rodam pelo pink-sandbox.exe (fonte em pink-sandbox.cs, compilado na primeira vez com o csc.exe que vem no Windows): o
// processo só grava onde o SID do Pink tem permissão (a pasta do projeto e um temporário próprio) ou onde Todos já gravam
// (limite conhecido). Leitura e rede não mudam. O Job Object do helper mata a árvore inteira junto com ele.
// Os comandos que a pessoa roda com ! não passam pelo sandbox: são dela. Linux e macOS ficam para depois.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBashToolDefinition, createPowerShellToolDefinition, getPowerShellConfig, getShellConfig } from "@earendil-works/pi-coding-agent";

export const agentDir = (env = process.env) => env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent");
export const sandboxDir = (env = process.env) => path.join(agentDir(env), "sandbox");
const here = () => {
	try {
		return path.dirname(fileURLToPath(import.meta.url));
	} catch {
		return __dirname;
	}
};
export const csc = (env = process.env) => path.join(env.SystemRoot || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
const ENV_KEYS = ["PINK_SANDBOX_SID", "PINK_SANDBOX_HELPER", "PINK_SANDBOX_TMP", "PINK_SANDBOX_ROOT"] as const;

// SID do Pink nesta máquina: não é de conta nenhuma, só marca o que o sandbox pode gravar
export function ensureSid(dir: string): string {
	const file = path.join(dir, "sid");
	try {
		const sid = fs.readFileSync(file, "utf8").trim();
		if (/^S-1-5-21(-\d{1,10}){4}$/.test(sid)) return sid;
	} catch {}
	const sid = `S-1-5-21-${Array.from({ length: 4 }, () => crypto.randomInt(1, 2 ** 31)).join("-")}`;
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(file, sid);
	return sid;
}

// compila uma vez por versão da fonte (o nome leva o hash dela)
export function ensureHelper(dir: string, source = path.join(here(), "pink-sandbox.cs"), compiler = csc(), run = spawnSync): { exe?: string; error?: string } {
	let text: string;
	try {
		text = fs.readFileSync(source, "utf8");
	} catch {
		return { error: `fonte do sandbox não encontrada: ${source}` };
	}
	const exe = path.join(dir, `pink-sandbox-${crypto.createHash("sha256").update(text).digest("hex").slice(0, 12)}.exe`);
	if (fs.existsSync(exe)) return { exe };
	if (!fs.existsSync(compiler)) return { error: `compilador do Windows não encontrado: ${compiler}` };
	fs.mkdirSync(dir, { recursive: true });
	// csc lê "/..." como opção: o caminho vai resolvido, com barras do Windows
	const built = run(compiler, ["/nologo", "/optimize", `/out:${exe}`, path.resolve(source)], { encoding: "utf8", windowsHide: true });
	if (built.status !== 0 || !fs.existsSync(exe)) return { error: `não consegui compilar o sandbox: ${String(built.stdout || built.stderr || built.error?.message || "").trim().slice(0, 400)}` };
	return { exe };
}

// a permissão desce pela árvore toda (em projeto grande, com node_modules, demora a primeira vez)
export function acl(helper: string, mode: "--grant" | "--revoke" | "--has", sid: string, dir: string): Promise<{ code: number; err: string }> {
	return new Promise((resolve) => {
		const child = spawn(helper, [mode, sid, dir], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
		let err = "";
		child.stderr?.on("data", (data) => (err += data));
		child.on("error", (error) => resolve({ code: 126, err: error.message }));
		child.on("close", (code) => resolve({ code: code ?? 1, err: err.trim() }));
	});
}

// programa absoluto, achado no PATH e nunca na pasta do projeto (um bash.exe plantado ali não entra)
export function absoluteProgram(program: string, env = process.env): string | undefined {
	if (path.isAbsolute(program)) return fs.existsSync(program) ? program : undefined;
	const exts = path.extname(program) ? [""] : (env.PATHEXT || ".EXE;.CMD;.BAT").split(";");
	for (const dir of (env.PATH || env.Path || "").split(path.delimiter).filter((item) => path.isAbsolute(item))) {
		for (const ext of exts) {
			const candidate = path.join(dir, program + ext);
			if (fs.existsSync(candidate)) return candidate;
		}
	}
	return undefined;
}

const DENIED = /access (to the path .{0,300} )?(is )?denied|acesso .{0,300}negado|permission denied|operation not permitted|EACCES|EPERM|UnauthorizedAccess/i;
const MSYS = /CreateFileMapping.*(error 5|erro 5)/i;
export const BASH_OFF = "[sandbox] Com o sandbox ligado, o bash do Git não roda (o MSYS não abre com o token restrito). Use a ferramenta powershell, que roda isolada, ou peça à pessoa /sandbox desligar.\n";
export function hintFor(tail: string): string | undefined {
	if (MSYS.test(tail))
		return "\n[sandbox] O bash do Git (MSYS) não roda com o token restrito do sandbox. Use a ferramenta powershell, ou peça à pessoa /sandbox desligar.\n";
	if (DENIED.test(tail) && /[\\/]\.git\b|\.git[\\/]|index\.lock/i.test(tail))
		return "\n[sandbox] A pasta .git é só leitura no sandbox (hooks e config rodam depois fora dele): git add, commit e checkout a pessoa roda, ou /sandbox desligar.\n";
	if (DENIED.test(tail))
		return "\n[sandbox] Pode ter sido o sandbox do Pink: com ele ligado, o comando só grava na pasta do projeto e no temporário do sandbox. Se precisa gravar fora, peça à pessoa para rodar o comando ou /sandbox desligar.\n";
	return undefined;
}

// pastas cujo conteúdo roda depois fora do sandbox (hooks do git, extensões e skills do projeto, tarefas do editor)
export const PROTECTED = [".git", ".pink", ".husky", ".vscode"];
const SCOPE = "Vale para o powershell do agente (o bash do Git fica indisponível enquanto ligado); edit e write seguem as permissões do Pink, e os comandos com ! são seus. Git que grava em .git (add, commit, checkout) fica para você.";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const contains = (outer: string, inner: string) => {
	const relative = path.relative(outer, inner);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
// raiz ampla demais daria ao sandbox a pasta do agente (o próprio helper, o barramento entre sessões), o perfil ou o sistema
export function rootProblem(root: string, env = process.env): string | undefined {
	let real = root;
	try {
		real = fs.realpathSync(root);
	} catch {
		return `pasta não encontrada: ${root}`;
	}
	if (path.dirname(real) === real) return "a raiz de um disco não pode ser a pasta do sandbox";
	const home = os.homedir();
	if (same(path.resolve(real), path.resolve(home))) return "a pasta pessoal inteira não pode ser a pasta do sandbox: abra o Pink na pasta do projeto";
	if (contains(real.toLowerCase(), path.resolve(agentDir(env)).toLowerCase())) return "esta pasta contém a pasta do Pink (sandbox, sessões, memória): abra o Pink na pasta do projeto";
	for (const system of [env.SystemRoot, env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramData].filter(Boolean) as string[])
		if (contains(path.resolve(system).toLowerCase(), real.toLowerCase()) || contains(real.toLowerCase(), path.resolve(system).toLowerCase())) return `pasta do sistema (${system}) não pode ser a pasta do sandbox`;
	return undefined;
}

// o ambiente herdado só liga o sandbox no subagente se apontar para o helper e o temporário do próprio Pink
export function validEnvState(env = process.env): { sid: string; helper: string; tmp: string; root: string } | undefined {
	const { PINK_SANDBOX_SID: sid, PINK_SANDBOX_HELPER: helper, PINK_SANDBOX_TMP: tmp, PINK_SANDBOX_ROOT: root } = env;
	if (!sid || !helper || !tmp || !root) return undefined;
	const dir = path.resolve(sandboxDir(env));
	if (!/^S-1-5-21(-\d{1,10}){4}$/.test(sid)) return undefined;
	if (!same(path.dirname(path.resolve(helper)), dir) || !/^pink-sandbox-[0-9a-f]{12}\.exe$/.test(path.basename(helper)) || !fs.existsSync(helper)) return undefined;
	if (!same(path.resolve(tmp), path.join(dir, "tmp"))) return undefined;
	return { sid, helper: path.resolve(helper), tmp: path.resolve(tmp), root: path.resolve(root) };
}

type State = { sid: string; helper: string; tmp: string; root: string; locked?: Set<string> };

// pasta protegida criada depois do /sandbox ligar (npm install cria .husky): ganha a negação antes do próximo comando
export async function lockNew(state: State, grant = acl) {
	state.locked ??= new Set();
	for (const name of PROTECTED) {
		if (state.locked.has(name)) continue;
		const target = path.join(state.root, name);
		if (!fs.existsSync(target)) continue;
		if ((await grant(state.helper, "--deny", state.sid, target)).code === 0) state.locked.add(name);
		else throw new Error(`[sandbox] não consegui proteger ${target}; o comando não rodou`);
	}
}
const killTree = (pid?: number) => pid && spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => {});

export function makeOperations(state: State, kind: "bash" | "powershell", shellPath?: string, start = spawn) {
	return {
		exec: async (command: string, cwd: string, { onData, signal, timeout, env }: any) => {
			if (signal?.aborted) throw new Error("aborted");
			// decisão do owner 2026-11-19: o MSYS do Git não abre com o token restrito, então o bash não roda isolado
			if (kind === "bash") {
				onData(Buffer.from(BASH_OFF));
				return { exitCode: 126 };
			}
			await lockNew(state);
			const config = kind === "bash" ? getShellConfig(shellPath) : getPowerShellConfig();
			const program = absoluteProgram(config.shell, env ?? process.env);
			if (!program) throw new Error(`[sandbox] não achei o executável ${config.shell} fora da pasta do projeto`);
			const viaStdin = config.commandTransport === "stdin";
			const child = start(state.helper, [state.sid, "--", program, ...config.args, ...(viaStdin ? [] : [command])], {
				cwd,
				env: { ...(env ?? process.env), TEMP: state.tmp, TMP: state.tmp },
				stdio: [viaStdin ? "pipe" : "ignore", "pipe", "pipe"],
				windowsHide: true,
			});
			if (viaStdin) {
				child.stdin?.on("error", () => {});
				child.stdin?.end(command);
			}
			let tail = "";
			const collect = (data: Buffer) => {
				tail = (tail + data.toString("utf8")).slice(-8192);
				onData(data);
			};
			child.stdout?.on("data", collect);
			child.stderr?.on("data", collect);
			let timedOut = false;
			const onAbort = () => killTree(child.pid);
			const timer = typeof timeout === "number" && timeout > 0 ? setTimeout(() => ((timedOut = true), killTree(child.pid)), timeout * 1000) : undefined;
			signal?.addEventListener("abort", onAbort, { once: true });
			try {
				const exitCode: number = await new Promise((resolve, reject) => {
					child.on("error", reject);
					child.on("close", (code: number | null) => resolve(code ?? 1));
				});
				if (signal?.aborted) throw new Error("aborted");
				if (timedOut) throw new Error(`timeout:${timeout}`);
				const hint = exitCode !== 0 ? hintFor(tail) : undefined;
				if (hint) onData(Buffer.from(hint));
				return { exitCode };
			} finally {
				if (timer) clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
			}
		},
	};
}

export function createSandbox({ env = process.env, platform = process.platform, helper = ensureHelper, grant = acl } = {}) {
	// o subagente herda o sandbox ligado da sessão pelo ambiente (validado: helper e temporário do próprio Pink)
	let state: State | undefined = validEnvState(env);
	const exportEnv = (value?: State) => {
		for (const key of ENV_KEYS) delete env[key];
		if (value) Object.assign(env, { PINK_SANDBOX_SID: value.sid, PINK_SANDBOX_HELPER: value.helper, PINK_SANDBOX_TMP: value.tmp, PINK_SANDBOX_ROOT: value.root });
	};
	async function on(root: string, notify: (text: string) => void): Promise<string> {
		if (platform !== "win32") return "O sandbox por enquanto só existe no Windows (Linux e macOS vêm depois).";
		const problem = rootProblem(root, env);
		if (problem) return `Não liguei o sandbox: ${problem}.`;
		const dir = sandboxDir(env);
		const built = helper(dir);
		if (!built.exe) return built.error ?? "não consegui preparar o sandbox";
		const sid = ensureSid(dir);
		const tmp = path.join(dir, "tmp");
		fs.mkdirSync(tmp, { recursive: true });
		for (const target of [tmp, root]) {
			if ((await grant(built.exe, "--has", sid, target)).code === 0) continue;
			if (target === root) notify(`Preparando ${root} para o sandbox (só na primeira vez; em projeto grande demora)…`);
			const done = await grant(built.exe, "--grant", sid, target);
			if (done.code !== 0) return `Não consegui dar a permissão em ${target}: ${done.err}`;
		}
		const locked: string[] = [];
		for (const name of PROTECTED) {
			const target = path.join(root, name);
			if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) continue;
			const done = await grant(built.exe, "--deny", sid, target);
			if (done.code !== 0) return `Não consegui proteger ${target}: ${done.err}`;
			locked.push(name);
		}
		state = { sid, helper: built.exe, tmp, root, locked: new Set(locked) };
		exportEnv(state);
		return `Sandbox ligado: os comandos do agente só gravam em ${root} e em ${tmp}${locked.length ? `, menos ${locked.join(", ")} (só leitura)` : ""}. Leitura e rede seguem abertas. ${SCOPE} /sandbox desligar para voltar.`;
	}
	function off() {
		const was = Boolean(state);
		state = undefined;
		exportEnv(undefined);
		return was ? "Sandbox desligado: os comandos do agente voltam a rodar com as suas permissões." : "O sandbox já estava desligado.";
	}
	async function remove(root: string) {
		off();
		const dir = sandboxDir(env);
		const built = helper(dir);
		if (!built.exe) return built.error ?? "não consegui achar o sandbox";
		const sid = ensureSid(dir);
		for (const target of [root, ...PROTECTED.map((name) => path.join(root, name)).filter((target) => fs.existsSync(target))]) {
			const done = await grant(built.exe, "--revoke", sid, target);
			if (done.code !== 0) return `Não consegui remover a permissão de ${target}: ${done.err}`;
		}
		return `Sandbox desligado e permissão do Pink removida de ${root}.`;
	}
	const status = () =>
		state
			? `Sandbox ligado: grava só em ${state.root} (menos ${PROTECTED.join(", ")}) e em ${state.tmp}; leitura e rede abertas. ${SCOPE} Limites: pastas onde Todos já gravam continuam graváveis; serviços que aceitam pedidos de qualquer processo seu (Docker, agente do ssh) seguem alcançáveis; npm/pip com cache global falham; o bash do Git fica indisponível (use o powershell); pastas com permissão privada (só o dono) não são lidas; o que fica rodando em segundo plano morre quando o comando acaba.`
			: platform === "win32"
				? "Sandbox desligado. /sandbox ligar isola os comandos do agente (só gravam na pasta do projeto)."
				: "O sandbox por enquanto só existe no Windows.";
	return { on, off, remove, status, active: () => Boolean(state), operations: (kind: "bash" | "powershell", shellPath?: string) => (state ? makeOperations(state, kind, shellPath) : undefined) };
}

export default function (pi: any) {
	const sandbox = createSandbox();
	(globalThis as any).__pinkSandbox = sandbox; // pink-shell-bg passa as operações ao bash e ao powershell quando ligado
	// subagente: o pink-shell-bg fica de fora nele, então o bash e o powershell isolados são registrados aqui
	if (process.env.PINK_SUBAGENT) {
		if (!sandbox.active() || process.platform !== "win32") return;
		pi.registerTool(createBashToolDefinition(process.cwd(), { operations: sandbox.operations("bash") }));
		pi.registerTool(createPowerShellToolDefinition(process.cwd(), { operations: sandbox.operations("powershell") }));
		return;
	}
	const label = (ctx: any) => ctx?.ui?.setStatus?.("pink-sandbox", sandbox.active() ? "sandbox" : undefined);
	pi.registerCommand("sandbox", {
		description: "Isola os comandos do agente (só gravam na pasta do projeto): /sandbox ligar | desligar | status | remover",
		handler: async (args: string, ctx: any) => {
			const verb = String(args ?? "").trim().toLowerCase();
			const root = path.resolve(ctx?.cwd ?? process.cwd());
			let text: string;
			if (verb === "ligar" || verb === "on") text = await sandbox.on(root, (note) => ctx.ui.notify(note, "info"));
			else if (verb === "desligar" || verb === "off") text = sandbox.off();
			else if (verb === "remover") text = await sandbox.remove(root);
			else text = sandbox.status();
			label(ctx);
			ctx.ui.notify(text, /^Não|não consegui|não encontrad/.test(text) ? "error" : "info");
		},
	});
	pi.on("session_start", async (_event: any, ctx: any) => label(ctx));
}
