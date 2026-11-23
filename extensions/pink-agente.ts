// Sessão inteira num agente instalado (owner 2026-11-23, card 1dfwh7kgf8k), como o OpenBot faz: com /agente claude (ou
// codex, opencode, cline...), o que a pessoa digita vai para o programa oficial do agente, com o login, a cota e o
// histórico dele, e a resposta aparece no Pink. A conversa continua entre mensagens (claude --resume, codex
// thread/resume, ACP session/load). /agente off volta ao modelo do Pink, que vê a conversa (as mensagens ficam na sessão).
// O transporte é o mesmo dos subagentes externos (examples/extensions/subagent/external.ts, cards 1dfwh7kgf8g/h/j).
import { t } from "./pink-i18n.ts";
import { externalAgents, runExternal } from "../examples/extensions/subagent/external.ts";

const STATUS = "pink-agente";

const fresh = () => ({ messages: [] as any[], stderr: "", exitCode: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 } });

// as ferramentas que o agente usou, uma por linha, e depois a resposta
export function render(result: any): string {
	const lines: string[] = [];
	let answer = "";
	for (const message of result.messages) {
		for (const part of message.content ?? []) {
			if (part.type === "text") answer = part.text;
			else if (part.type === "toolCall") {
				const arg = part.arguments?.command ?? part.arguments?.path ?? part.arguments?.file_path ?? part.arguments?.title ?? "";
				lines.push(`• ${part.name}${arg ? ` ${String(arg).split("\n")[0].slice(0, 120)}` : ""}`);
			}
		}
	}
	const body = [lines.join("\n"), answer].filter(Boolean).join("\n\n");
	if (result.stopReason === "error") return [body, `⚠ ${result.errorMessage}`].filter(Boolean).join("\n\n");
	return body || t("(sem resposta)", "(sin respuesta)", "(no answer)");
}

export default function (pink: any, list: typeof externalAgents = externalAgents, run: typeof runExternal = runExternal) {
	let active: { agent: any; resume: { id?: string }; controller?: AbortController } | undefined;

	const stop = (ctx?: any) => {
		active?.controller?.abort();
		active = undefined;
		ctx?.ui?.setStatus?.(STATUS, undefined);
	};

	const send = async (text: string, ctx: any) => {
		const current = active!;
		const controller = new AbortController();
		current.controller = controller;
		const name = current.agent.name;
		pink.sendMessage({ customType: "pink-agente-pedido", display: true, content: `› ${name}: ${text}`, details: { agent: name } });
		const result = fresh();
		const status = () => {
			const last = result.messages.at(-1)?.content?.find((part: any) => part.type === "toolCall");
			ctx.ui?.setStatus?.(STATUS, `${name} ${t("trabalhando", "trabajando", "working")}${last ? `: ${last.name}` : "…"}`);
		};
		status();
		(globalThis as any).__pinkExternalAsk = ctx.hasUI ? (title: string, body: string) => ctx.ui.confirm(title, body) : undefined;
		try {
			await run(current.agent, text, ctx.cwd, controller.signal, result, status, undefined, undefined, current.resume);
		} catch (error: any) {
			result.stopReason = "error";
			result.errorMessage = controller.signal.aborted ? t("cancelado", "cancelado", "cancelled") : String(error?.message ?? error);
		}
		if (current.controller === controller) current.controller = undefined;
		if (active === current) ctx.ui?.setStatus?.(STATUS, `${t("agente", "agente", "agent")}: ${name}`);
		pink.sendMessage({ customType: "pink-agente", display: true, content: render(result), details: { agent: name, model: result.model, usage: result.usage, error: result.stopReason === "error" } });
	};

	pink.registerCommand("agente", {
		description: t("Conversa direto com um agente instalado (claude, codex, opencode...) com o login dele; /agente off volta ao Pink", "Conversa directo con un agente instalado (claude, codex, opencode...) con su login; /agente off vuelve a Pink", "Talk straight to an installed agent (claude, codex, opencode...) with its own login; /agente off returns to Pink"),
		handler: async (args: string, ctx: any) => {
			const wanted = String(args ?? "").trim().toLowerCase();
			const agents = list();
			if (wanted === "off" || wanted === "parar" || wanted === "stop") {
				const was = active?.agent.name;
				stop(ctx);
				ctx.ui?.notify?.(was ? t(`Voltou ao Pink (${was} desligado).`, `Volviste a Pink (${was} apagado).`, `Back to Pink (${was} off).`) : t("Nenhum agente ligado.", "Ningún agente encendido.", "No agent on."), "info");
				return;
			}
			let name = wanted;
			if (!name) {
				if (!agents.length) return ctx.ui?.notify?.(t("Nenhum agente instalado encontrado (claude, codex, opencode, cline, copilot, qwen, goose, gemini).", "No se encontró ningún agente instalado (claude, codex, opencode, cline, copilot, qwen, goose, gemini).", "No installed agent found (claude, codex, opencode, cline, copilot, qwen, goose, gemini)."), "warning");
				name = ctx.hasUI ? ((await ctx.ui.select(t("Conversar com qual agente?", "¿Con qué agente conversar?", "Talk to which agent?"), agents.map((agent) => agent.name))) ?? "") : "";
				if (!name) return;
			}
			const agent = agents.find((item) => item.name === name);
			if (!agent) return ctx.ui?.notify?.(t(`${name} não está instalado. Disponíveis: ${agents.map((a) => a.name).join(", ") || "nenhum"}.`, `${name} no está instalado. Disponibles: ${agents.map((a) => a.name).join(", ") || "ninguno"}.`, `${name} is not installed. Available: ${agents.map((a) => a.name).join(", ") || "none"}.`), "warning");
			stop(ctx);
			active = { agent, resume: {} };
			ctx.ui?.setStatus?.(STATUS, `${t("agente", "agente", "agent")}: ${name}`);
			ctx.ui?.notify?.(t(`Agora suas mensagens vão para o ${name}, com o login e a cota dele. /agente off volta ao Pink.`, `Ahora tus mensajes van a ${name}, con su login y su cuota. /agente off vuelve a Pink.`, `Your messages now go to ${name}, with its own login and quota. /agente off returns to Pink.`), "info");
		},
	});

	pink.on("input", async (event: any, ctx: any) => {
		if (!active || event.source === "extension" || String(event.text ?? "").trimStart().startsWith("/")) return { action: "continue" };
		if (active.controller) {
			ctx.ui?.notify?.(t(`O ${active.agent.name} ainda está respondendo; espere ou use /agente off.`, `${active.agent.name} todavía está respondiendo; espera o usa /agente off.`, `${active.agent.name} is still answering; wait or use /agente off.`), "warning");
			return { action: "handled" };
		}
		const done = send(String(event.text), ctx);
		if (!ctx.hasUI) await done; // pink -p: a resposta tem de sair antes de o processo acabar
		return { action: "handled" };
	});

	pink.on("session_shutdown", () => stop());
}
