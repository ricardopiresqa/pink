// Notificação quando o Pink termina (owner 2026-11-17, card 1dfwh7kfmqr), como o Claude Code e o Codex.
// Só na TUI e só se a janela está sem foco: o terminal avisa foco com CSI ?1004 (Windows Terminal, iTerm2, kitty,
// WezTerm, Ghostty). Terminal que nunca avisou foco: notifica só pedido longo (>= 20 s).
// Windows: toast do sistema (pelo PowerShell). macOS: osascript. Linux: notify-send; sem ele, OSC 777.
// Desligar: /notificacoes (fica salvo em <pasta do agente>/pink-notify.json) ou PINK_NOTIFY=0. Subagente não notifica.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const agentDir = (env = process.env) => env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent");
export const LONG_RUN_MS = 20_000;
const FOCUS_IN = "\x1b[I", FOCUS_OUT = "\x1b[O";
// app id do PowerShell: toast de app sem registro no Windows não aparece
const PS_APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

// script fixo: título e corpo chegam por variável de ambiente e o XML é escapado pelo próprio PowerShell, nada do texto
// (nome da pasta) entra no código (Argus N1: ’ e ‘ também fecham string no PowerShell)
export function windowsToast() {
	const t = "Windows.UI.Notifications";
	const esc = (v) => `[System.Security.SecurityElement]::Escape($env:${v})`;
	return [
		`[${t}.ToastNotificationManager, ${t}, ContentType = WindowsRuntime] > $null`,
		"[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null",
		"$x = New-Object Windows.Data.Xml.Dom.XmlDocument",
		`$x.LoadXml('<toast><visual><binding template="ToastGeneric"><text>' + ${esc("PINK_TOAST_TITLE")} + '</text><text>' + ${esc("PINK_TOAST_BODY")} + '</text></binding></visual></toast>')`,
		`[${t}.ToastNotificationManager]::CreateToastNotifier('${PS_APP_ID}').Show([${t}.ToastNotification]::new($x))`,
	].join("; ");
}

const plain = (s) => String(s).replace(/[\x00-\x1f\x7f-\x9f;]/g, " ");
// o comando de notificação de cada sistema: [programa, argumentos, env] ou { osc } para escrever no terminal
export function notifyCommand(title, body, { platform = process.platform, env = process.env, has = () => false } = {}) {
	if (platform === "win32" || env.WSL_DISTRO_NAME) return ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", windowsToast()], { PINK_TOAST_TITLE: plain(title), PINK_TOAST_BODY: plain(body), ...(env.WSL_DISTRO_NAME ? { WSLENV: [env.WSLENV, "PINK_TOAST_TITLE/u:PINK_TOAST_BODY/u"].filter(Boolean).join(":") } : {}) }];  // no WSL só passa o que está no WSLENV
	if (platform === "darwin") return ["osascript", ["-e", `display notification ${JSON.stringify(plain(body))} with title ${JSON.stringify(plain(title))}`]];
	if (has("notify-send")) return ["notify-send", [plain(title), plain(body)]];
	return { osc: `\x1b]777;notify;${plain(title)};${plain(body)}\x07` };
}

// tira os avisos de foco da entrada e diz o que veio
export function readFocus(data) {
	let focus;
	const text = String(data);
	const lastIn = text.lastIndexOf(FOCUS_IN), lastOut = text.lastIndexOf(FOCUS_OUT);
	if (lastIn >= 0 || lastOut >= 0) focus = lastIn > lastOut;
	return { focus, rest: text.split(FOCUS_IN).join("").split(FOCUS_OUT).join("") };
}

export function shouldNotify({ on, focused, focusKnown, elapsed }) {
	if (!on) return false;
	return focusKnown ? !focused : elapsed >= LONG_RUN_MS;
}

export function notifyExtension(pi, deps = {}) {
	const { env = process.env, read = fs.readFileSync, write = fs.writeFileSync, mkdir = fs.mkdirSync, out = process.stdout, run = execFile, platform = process.platform, now = Date.now } = deps;
	if (env.PINK_SUBAGENT) return;
	const file = path.join(agentDir(env), "pink-notify.json");
	let on = env.PINK_NOTIFY !== "0";
	try { if (JSON.parse(read(file, "utf8"))?.on === false) on = false; } catch { /* sem arquivo: ligado */ }
	const state = { focused: true, focusKnown: false, start: 0, active: false, unsubscribe: undefined };
	const has = (bin) => String(env.PATH ?? "").split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, bin)));
	const send = (title, body) => {
		const cmd = notifyCommand(title, body, { platform, env, has });
		if (!Array.isArray(cmd)) return void out.write(cmd.osc);
		try { run(cmd[0], cmd[1], { windowsHide: true, timeout: 10_000, env: cmd[2] ? { ...process.env, ...cmd[2] } : process.env }, () => {}); } catch { /* sem notificador: segue sem aviso */ }
	};
	pi.on("session_start", async (_event, ctx) => {
		if (ctx?.mode !== "tui" || state.active) return;
		state.active = true;
		out.write("\x1b[?1004h"); // pede ao terminal os avisos de foco
		if (!state.exitHook) { state.exitHook = true; process.once("exit", () => { if (state.active) out.write("\x1b[?1004l"); }); } // queda sem session_shutdown
		state.unsubscribe = ctx.ui.onTerminalInput?.((data) => {
			const { focus, rest } = readFocus(data);
			if (focus === undefined) return undefined;
			state.focused = focus;
			state.focusKnown = true;
			return rest ? { data: rest } : { consume: true };
		});
	});
	pi.on("session_shutdown", async () => {
		if (!state.active) return;
		state.active = false;
		state.unsubscribe?.();
		out.write("\x1b[?1004l");
	});
	pi.on("agent_start", async () => { if (!state.start) state.start = now(); });
	pi.on("agent_settled", async (event, ctx) => {
		const elapsed = state.start ? now() - state.start : 0;
		state.start = 0;
		if (!state.active || event?.aborted || !shouldNotify({ on, focused: state.focused, focusKnown: state.focusKnown, elapsed })) return;
		send("Pink", `Terminou em ${path.basename(ctx?.cwd ?? process.cwd())}: pronto para o próximo pedido`);
	});
	pi.registerCommand?.("notificacoes", {
		description: "Liga ou desliga a notificação do sistema quando o Pink termina e a janela está sem foco",
		handler: async (_args, ctx) => {
			on = !on;
			try { mkdir(path.dirname(file), { recursive: true }); write(file, `${JSON.stringify({ on }, null, 2)}\n`); } catch (error) { ctx.ui.notify?.(`Não deu para salvar ${file}: ${error?.message ?? error}`, "error"); }
			ctx.ui.notify?.(on ? "Notificações ligadas" : "Notificações desligadas", "info");
		},
	});
	return { state, send, isOn: () => on };
}

export default function (pi) {
	notifyExtension(pi);
}
