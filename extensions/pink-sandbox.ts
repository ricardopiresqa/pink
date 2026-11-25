// Sandbox dos comandos do agente (owner 2026-11-19, card 1dfwh7kfzxu). Decisão do owner: no Windows, token restrito + ACL,
// como o Codex sem elevação; desligado por padrão, ligado com /sandbox. Com ele ligado, o bash e o powershell do agente
// rodam pelo pink-sandbox.exe (fonte em pink-sandbox.cs, compilado na primeira vez com o csc.exe que vem no Windows): o
// processo só grava onde o SID do Pink tem permissão (a pasta do projeto e um temporário próprio) ou onde Todos já gravam
// (limite conhecido). Leitura e rede não mudam. O Job Object do helper mata a árvore inteira junto com ele.
// Os comandos que a pessoa roda com ! não passam pelo sandbox: são dela. Linux e macOS ficam para depois.
import { type Choice, choose, completeFrom, t } from "./pink-i18n.ts";

const SANDBOX_CHOICES = (): Choice[] => [
	{ value: "status", description: t("ligado ou desligado?", "¿activado o desactivado?", "on or off?") },
	{ value: "ligar", description: t("os comandos só gravam na pasta do projeto", "los comandos solo escriben en la carpeta del proyecto", "commands only write to the project folder") },
	{ value: "desligar", description: t("volta a rodar os comandos fora do isolamento", "vuelve a ejecutar los comandos sin aislamiento", "runs commands without isolation again") },
	{ value: "remover", description: t("apaga o isolamento desta pasta", "borra el aislamiento de esta carpeta", "removes this folder's isolation") },
];
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
		return { error: t(`fonte do sandbox não encontrada: ${source}`, `fuente del sandbox no encontrada: ${source}`, `sandbox source not found: ${source}`) };
	}
	const exe = path.join(dir, `pink-sandbox-${crypto.createHash("sha256").update(text).digest("hex").slice(0, 12)}.exe`);
	if (fs.existsSync(exe)) return { exe };
	if (!fs.existsSync(compiler)) return { error: t(`compilador do Windows não encontrado: ${compiler}`, `compilador de Windows no encontrado: ${compiler}`, `Windows compiler not found: ${compiler}`) };
	fs.mkdirSync(dir, { recursive: true });
	// csc lê "/..." como opção: o caminho vai resolvido, com barras do Windows
	const built = run(compiler, ["/nologo", "/optimize", `/out:${exe}`, path.resolve(source)], { encoding: "utf8", windowsHide: true });
	if (built.status !== 0 || !fs.existsSync(exe)) return { error: `${t("não consegui compilar o sandbox", "no pude compilar el sandbox", "could not compile the sandbox")}: ${String(built.stdout || built.stderr || built.error?.message || "").trim().slice(0, 400)}` };
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
export const BASH_OFF = t(
	"[sandbox] Com o sandbox ligado, o bash do Git não roda (o MSYS não abre com o token restrito). Use a ferramenta powershell, que roda isolada, ou peça à pessoa /sandbox desligar.\n",
	"[sandbox] Con el sandbox activado, el bash de Git no se ejecuta (MSYS no abre con el token restringido). Usa la herramienta powershell, que se ejecuta aislada, o pide a la persona /sandbox desactivar.\n",
	"[sandbox] With the sandbox on, Git's bash does not run (MSYS does not start with the restricted token). Use the powershell tool, which runs isolated, or ask the person for /sandbox off.\n",
);
export function hintFor(tail: string): string | undefined {
	if (MSYS.test(tail))
		return t(
			"\n[sandbox] O bash do Git (MSYS) não roda com o token restrito do sandbox. Use a ferramenta powershell, ou peça à pessoa /sandbox desligar.\n",
			"\n[sandbox] El bash de Git (MSYS) no se ejecuta con el token restringido del sandbox. Usa la herramienta powershell, o pide a la persona /sandbox desactivar.\n",
			"\n[sandbox] Git's bash (MSYS) does not run with the sandbox's restricted token. Use the powershell tool, or ask the person for /sandbox off.\n",
		);
	if (DENIED.test(tail) && /[\\/]\.git\b|\.git[\\/]|index\.lock/i.test(tail))
		return "\n[sandbox] A pasta .git é só leitura no sandbox (hooks e config rodam depois fora dele): git add, commit e checkout a pessoa roda, ou /sandbox desligar.\n";
	if (DENIED.test(tail))
		return "\n[sandbox] Pode ter sido o sandbox do Pink: com ele ligado, o comando só grava na pasta do projeto e no temporário do sandbox. Se precisa gravar fora, peça à pessoa para rodar o comando ou /sandbox desligar.\n";
	return undefined;
}

// pastas cujo conteúdo roda depois fora do sandbox (hooks do git, extensões e skills do projeto, tarefas do editor)
export const PROTECTED = [".git", ".pink", ".husky", ".vscode"];
const SCOPE = t("Vale para o powershell do agente (o bash do Git fica indisponível enquanto ligado); edit e write seguem as permissões do Pink, e os comandos com ! são seus. Git que grava em .git (add, commit, checkout) fica para você.", "Aplica al powershell del agente (bash de Git no está disponible mientras está activado); edit y write siguen los permisos de Pink, y los comandos con ! son tuyos. Git que escribe en .git (add, commit, checkout) queda para ti.", "Applies to the agent's powershell (Git's bash is unavailable while on); edit and write follow Pink's permissions, and commands with ! are yours. Git writes to .git (add, commit, checkout) are for you to run.");

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
		return t(`pasta não encontrada: ${root}`, `carpeta no encontrada: ${root}`, `folder not found: ${root}`);
	}
	if (path.dirname(real) === real) return t("a raiz de um disco não pode ser a pasta do sandbox", "la raíz de un disco no puede ser la carpeta del sandbox", "a disk root cannot be the sandbox folder");
	const home = os.homedir();
	if (same(path.resolve(real), path.resolve(home))) return t("a pasta pessoal inteira não pode ser a pasta do sandbox: abra o Pink na pasta do projeto", "la carpeta personal completa no puede ser la carpeta del sandbox: abre Pink en la carpeta del proyecto", "the whole home folder cannot be the sandbox folder: open Pink in the project folder");
	if (contains(real.toLowerCase(), path.resolve(agentDir(env)).toLowerCase())) return t("esta pasta contém a pasta do Pink (sandbox, sessões, memória): abra o Pink na pasta do projeto", "esta carpeta contiene la carpeta de Pink (sandbox, sesiones, memoria): abre Pink en la carpeta del proyecto", "this folder contains Pink's folder (sandbox, sessions, memory): open Pink in the project folder");
	for (const system of [env.SystemRoot, env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramData].filter(Boolean) as string[])
		if (contains(path.resolve(system).toLowerCase(), real.toLowerCase()) || contains(real.toLowerCase(), path.resolve(system).toLowerCase())) return t(`pasta do sistema (${system}) não pode ser a pasta do sandbox`, `carpeta del sistema (${system}) no puede ser la carpeta del sandbox`, `system folder (${system}) cannot be the sandbox folder`);
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
		else throw new Error(t(`[sandbox] não consegui proteger ${target}; o comando não rodou`, `[sandbox] no pude proteger ${target}; el comando no se ejecutó`, `[sandbox] could not protect ${target}; the command did not run`));
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
			if (!program) throw new Error(t(`[sandbox] não achei o executável ${config.shell} fora da pasta do projeto`, `[sandbox] no encontré el ejecutable ${config.shell} fuera de la carpeta del proyecto`, `[sandbox] could not find the ${config.shell} executable outside the project folder`));
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
		if (platform !== "win32") return t("O sandbox por enquanto só existe no Windows (Linux e macOS vêm depois).", "El sandbox por ahora solo existe en Windows (Linux y macOS vienen después).", "The sandbox currently exists only on Windows (Linux and macOS come later).");
		const problem = rootProblem(root, env);
		if (problem) return t(`Não liguei o sandbox: ${problem}.`, `No activé el sandbox: ${problem}.`, `Could not turn on the sandbox: ${problem}.`);
		const dir = sandboxDir(env);
		const built = helper(dir);
		if (!built.exe) return built.error ?? t("não consegui preparar o sandbox", "no pude preparar el sandbox", "could not prepare the sandbox");
		const sid = ensureSid(dir);
		const tmp = path.join(dir, "tmp");
		fs.mkdirSync(tmp, { recursive: true });
		for (const target of [tmp, root]) {
			if ((await grant(built.exe, "--has", sid, target)).code === 0) continue;
			if (target === root) notify(t(`Preparando ${root} para o sandbox (só na primeira vez; em projeto grande demora)…`, `Preparando ${root} para el sandbox (solo la primera vez; en un proyecto grande tarda)…`, `Preparing ${root} for the sandbox (first time only; large projects take a while)…`));
			const done = await grant(built.exe, "--grant", sid, target);
			if (done.code !== 0) return t(`Não consegui dar a permissão em ${target}: ${done.err}`, `No pude dar el permiso en ${target}: ${done.err}`, `Could not grant permission on ${target}: ${done.err}`);
		}
		const locked: string[] = [];
		for (const name of PROTECTED) {
			const target = path.join(root, name);
			if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) continue;
			const done = await grant(built.exe, "--deny", sid, target);
			if (done.code !== 0) return t(`Não consegui proteger ${target}: ${done.err}`, `No pude proteger ${target}: ${done.err}`, `Could not protect ${target}: ${done.err}`);
			locked.push(name);
		}
		state = { sid, helper: built.exe, tmp, root, locked: new Set(locked) };
		exportEnv(state);
		return t(`Sandbox ligado: os comandos do agente só gravam em ${root} e em ${tmp}${locked.length ? `, menos ${locked.join(", ")} (só leitura)` : ""}. Leitura e rede seguem abertas. ${SCOPE} /sandbox desligar para voltar.`, `Sandbox activado: los comandos del agente solo escriben en ${root} y en ${tmp}${locked.length ? `, menos ${locked.join(", ")} (solo lectura)` : ""}. La lectura y la red siguen abiertas. ${SCOPE} /sandbox desactivar para volver.`, `Sandbox on: the agent's commands only write to ${root} and ${tmp}${locked.length ? `, except ${locked.join(", ")} (read-only)` : ""}. Reading and network stay open. ${SCOPE} /sandbox off to go back.`);
	}
	function off() {
		const was = Boolean(state);
		state = undefined;
		exportEnv(undefined);
		return was ? t("Sandbox desligado: os comandos do agente voltam a rodar com as suas permissões.", "Sandbox desactivado: los comandos del agente vuelven a ejecutarse con tus permisos.", "Sandbox off: the agent's commands run with your permissions again.") : t("O sandbox já estava desligado.", "El sandbox ya estaba desactivado.", "The sandbox was already off.");
	}
	async function remove(root: string) {
		off();
		const dir = sandboxDir(env);
		const built = helper(dir);
		if (!built.exe) return built.error ?? t("não consegui achar o sandbox", "no pude encontrar el sandbox", "could not find the sandbox");
		const sid = ensureSid(dir);
		for (const target of [root, ...PROTECTED.map((name) => path.join(root, name)).filter((target) => fs.existsSync(target))]) {
			const done = await grant(built.exe, "--revoke", sid, target);
			if (done.code !== 0) return t(`Não consegui remover a permissão de ${target}: ${done.err}`, `No pude quitar el permiso de ${target}: ${done.err}`, `Could not remove the permission from ${target}: ${done.err}`);
		}
		return t(`Sandbox desligado e permissão do Pink removida de ${root}.`, `Sandbox desactivado y permiso de Pink quitado de ${root}.`, `Sandbox off and Pink's permission removed from ${root}.`);
	}
	const status = () =>
		state
			? t(`Sandbox ligado: grava só em ${state.root} (menos ${PROTECTED.join(", ")}) e em ${state.tmp}; leitura e rede abertas. ${SCOPE} Limites: pastas onde Todos já gravam continuam graváveis; serviços que aceitam pedidos de qualquer processo seu (Docker, agente do ssh) seguem alcançáveis; npm/pip com cache global falham; o bash do Git fica indisponível (use o powershell); pastas com permissão privada (só o dono) não são lidas; o que fica rodando em segundo plano morre quando o comando acaba.`, `Sandbox activado: escribe solo en ${state.root} (menos ${PROTECTED.join(", ")}) y en ${state.tmp}; lectura y red abiertas. ${SCOPE} Límites: las carpetas donde Todos ya escriben siguen escribibles; los servicios que aceptan pedidos de cualquier proceso tuyo (Docker, agente de ssh) siguen alcanzables; npm/pip con caché global fallan; el bash de Git no está disponible (usa powershell); las carpetas con permiso privado (solo el dueño) no se leen; lo que queda corriendo en segundo plano muere cuando termina el comando.`, `Sandbox on: writes only to ${state.root} (except ${PROTECTED.join(", ")}) and ${state.tmp}; reading and network open. ${SCOPE} Limits: folders where Everyone already has write access stay writable; services that accept requests from any of your processes (Docker, ssh agent) stay reachable; npm/pip with a global cache fail; Git's bash is unavailable (use powershell); folders with private permissions (owner only) cannot be read; anything running in the background dies when the command ends.`)
			: platform === "win32"
				? t("Sandbox desligado. /sandbox ligar isola os comandos do agente (só gravam na pasta do projeto).", "Sandbox desactivado. /sandbox activar aísla los comandos del agente (solo escriben en la carpeta del proyecto).", "Sandbox off. /sandbox on isolates the agent's commands (they only write to the project folder).")
				: t("O sandbox por enquanto só existe no Windows.", "El sandbox por ahora solo existe en Windows.", "The sandbox currently exists only on Windows.");
	return { on, off, remove, status, active: () => Boolean(state), operations: (kind: "bash" | "powershell", shellPath?: string) => (state ? makeOperations(state, kind, shellPath) : undefined) };
}

export default function (pink: any) {
	const sandbox = createSandbox();
	(globalThis as any).__pinkSandbox = sandbox; // pink-shell-bg passa as operações ao bash e ao powershell quando ligado
	// subagente: o pink-shell-bg fica de fora nele, então o bash e o powershell isolados são registrados aqui
	if (process.env.PINK_SUBAGENT) {
		if (!sandbox.active() || process.platform !== "win32") return;
		pink.registerTool(createBashToolDefinition(process.cwd(), { operations: sandbox.operations("bash") }));
		pink.registerTool(createPowerShellToolDefinition(process.cwd(), { operations: sandbox.operations("powershell") }));
		return;
	}
	const label = (ctx: any) => ctx?.ui?.setStatus?.("pink-sandbox", sandbox.active() ? "sandbox" : undefined);
	pink.registerCommand("sandbox", {
		description: t("Isola os comandos do agente (só gravam na pasta do projeto): /sandbox ligar | desligar | status | remover", "Aísla los comandos del agente (solo escriben en la carpeta del proyecto): /sandbox activar | desactivar | status | quitar", "Isolates the agent's commands (they only write to the project folder): /sandbox on | off | status | remove"),
		getArgumentCompletions: completeFrom(SANDBOX_CHOICES),
		handler: async (args: string, ctx: any) => {
			let verb: string | undefined = String(args ?? "").trim().toLowerCase();
			if (!verb && (verb = await choose(ctx, "/sandbox", SANDBOX_CHOICES())) === undefined) return;
			const root = path.resolve(ctx?.cwd ?? process.cwd());
			let text: string;
			if (["ligar", "on", "activar"].includes(verb)) text = await sandbox.on(root, (note) => ctx.ui.notify(note, "info"));
			else if (["desligar", "off", "desactivar"].includes(verb)) text = sandbox.off();
			else if (["remover", "remove", "quitar"].includes(verb)) text = await sandbox.remove(root);
			else text = sandbox.status();
			label(ctx);
			ctx.ui.notify(text, /^(Não|No |Could not|Did not)|não consegui|não encontrad|no pude|no encontr|could not|not found/i.test(text) ? "error" : "info");
		},
	});
	pink.on("session_start", async (_event: any, ctx: any) => label(ctx));
}
