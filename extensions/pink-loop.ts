// /loop e retomada agendada (owner 2026-11-18, card 1dfwh7kfzfe), como no Claude Code:
//   /loop 5m confere o deploy   roda agora e de novo 5 min depois que cada rodada termina (nunca empilha turnos)
//   /loop confere o deploy      sem intervalo: o agente escolhe o ritmo chamando schedule_wakeup ao fim de cada rodada
//   /loop parar  ou  Esc        encerra; /loop sozinho mostra o loop ativo
// Tudo vive em timers desta sessão: fechar, trocar ou recarregar (session_shutdown) cancela; nada fica agendado fora dela.
import { t } from "./pink-i18n.ts";
import { Type } from "typebox";

export const MIN_SECONDS = 60;
export const MAX_FIXED_SECONDS = 24 * 3600;
export const MAX_WAKE_SECONDS = 3600;
// teto de rodadas: uma rodada com erro (provedor fora, cota) não aborta e repetiria para sempre, gastando sem a pessoa por perto
export const MAX_ROUNDS = 50;
// folga para chave por comando, hooks e MCP lentos antes de a execução começar
const START_CHECK_MS = 10000;
const PENDING_RETRY_MS = 5000;
const WIDGET = "pink-loop";
const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600 };

type Loop = { task: string; every?: number; round: number; next?: number; wake?: number; running: boolean; pending: boolean };

export function parseInterval(text: string): number | undefined {
	const match = /^(\d{1,6})(s|m|h)$/i.exec(text);
	return match ? Number(match[1]) * UNITS[match[2].toLowerCase()] : undefined;
}
const human = (seconds: number) =>
	seconds % 3600 === 0 ? `${seconds / 3600}h` : seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
const oneLine = (text: string, max: number) => {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const reply = (text: string, isError = false) => ({ content: [{ type: "text", text }], details: undefined, isError });

export function createLoop(pink: any, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
	let loop: Loop | undefined;
	let timer: any;
	let watchdog: any;
	let ctx: any;
	const later = (fn: () => void, ms: number) => {
		const handle = setTimer(fn, ms);
		handle?.unref?.();
		return handle;
	};
	// ctx de uma sessão sendo desmontada pode lançar: widget e aviso nunca derrubam o loop nem o shutdown
	const ui = (fn: (u: any) => void) => {
		try {
			if (ctx?.hasUI) fn(ctx.ui);
		} catch {
			/* sessão saindo */
		}
	};

	const clockAt = (at: number) => new Date(at).toTimeString().slice(0, 8);
	const show = () => {
		if (!loop) return ui((u) => u.setWidget(WIDGET, undefined));
		const pace = loop.every ? t(`a cada ${human(loop.every)}`, `cada ${human(loop.every)}`, `every ${human(loop.every)}`) : t("ritmo do agente", "ritmo del agente", "agent's pace");
		const when = loop.running ? t("rodando", "ejecutando", "running") : loop.pending ? t("esperando o agente ficar livre", "esperando a que el agente quede libre", "waiting for the agent to be free") : loop.next ? t(`próxima às ${clockAt(loop.next)}`, `próxima a las ${clockAt(loop.next)}`, `next at ${clockAt(loop.next)}`) : "";
		const lines = [`🔁 /loop ${pace} · ${t("rodada", "ronda", "round")} ${loop.round}/${MAX_ROUNDS} · ${when} · ${oneLine(loop.task, 50)}`, t("   /loop parar (ou Esc durante a rodada) para encerrar", "   /loop parar (o Esc durante la ronda) para terminar", "   /loop stop (or Esc during the round) to end")];
		ui((u) => u.setWidget(WIDGET, lines));
	};
	const stop = (why?: string) => {
		if (timer) clearTimer(timer);
		if (watchdog) clearTimer(watchdog);
		timer = watchdog = undefined;
		const had = loop;
		loop = undefined;
		show();
		if (had && why) ui((u) => u.notify(t(`/loop encerrado: ${why}`, `/loop terminado: ${why}`, `/loop ended: ${why}`), "info"));
		return had;
	};
	const fire = () => {
		timer = undefined;
		if (!loop) return;
		loop.next = undefined;
		// turno do usuário ou mensagem na fila: espera o fim (agent_settled) em vez de empilhar
		if (!ctx?.isIdle?.() || ctx?.hasPendingMessages?.()) {
			loop.pending = true;
			// compactação ou fila que não vira execução não emitem agent_settled: tenta de novo sozinho
			timer = later(fire, PENDING_RETRY_MS);
			return show();
		}
		if (loop.round >= MAX_ROUNDS) return void stop(t(`limite de ${MAX_ROUNDS} rodadas; use /loop de novo para continuar`, `límite de ${MAX_ROUNDS} rondas; usa /loop otra vez para continuar`, `limit of ${MAX_ROUNDS} rounds; use /loop again to continue`));
		loop.pending = false;
		loop.running = true;
		loop.wake = undefined;
		loop.round += 1;
		const how = loop.every
			? t(`Repete a cada ${human(loop.every)}; não precisa agendar nada.`, `Se repite cada ${human(loop.every)}; no hace falta programar nada.`, `Repeats every ${human(loop.every)}; nothing to schedule.`)
			: t(`Ao terminar, chame schedule_wakeup com delaySeconds (${MIN_SECONDS} a ${MAX_WAKE_SECONDS}) para a próxima rodada, ou stop:true se a tarefa acabou. Sem essa chamada o loop termina.`, `Al terminar, llama a schedule_wakeup con delaySeconds (${MIN_SECONDS} a ${MAX_WAKE_SECONDS}) para la próxima ronda, o stop:true si la tarea terminó. Sin esa llamada el loop termina.`, `When finished, call schedule_wakeup with delaySeconds (${MIN_SECONDS} to ${MAX_WAKE_SECONDS}) for the next round, or stop:true if the task is done. Without that call the loop ends.`);
		show();
		pink.sendMessage(
			{ customType: "pink-loop", content: t(`Rodada ${loop.round} do /loop. Tarefa: ${loop.task}\n\n${how}`, `Ronda ${loop.round} del /loop. Tarea: ${loop.task}\n\n${how}`, `Round ${loop.round} of /loop. Task: ${loop.task}\n\n${how}`), display: true },
			{ triggerTurn: true },
		);
		// sem modelo ou sem chave o sendMessage não lança nem emite agent_settled: o loop ficaria preso em "rodando"
		const round = loop.round;
		if (watchdog) clearTimer(watchdog);
		watchdog = later(() => {
			watchdog = undefined;
			if (loop?.running && loop.round === round && ctx?.isIdle?.() && !ctx?.hasPendingMessages?.()) stop(t("a rodada não começou (modelo ou chave?)", "la ronda no empezó (¿modelo o clave?)", "the round did not start (model or key?)"));
		}, START_CHECK_MS);
	};
	const schedule = (seconds: number) => {
		if (!loop) return;
		if (timer) clearTimer(timer);
		loop.next = now() + seconds * 1000;
		timer = later(fire, seconds * 1000);
		show();
	};
	const settled = (aborted: boolean) => {
		if (!loop) return;
		if (aborted) return void stop("Esc");
		if (loop.pending) {
			if (timer) clearTimer(timer);
			return fire();
		}
		if (!loop.running) return;
		loop.running = false;
		if (loop.every) return schedule(loop.every);
		if (loop.wake === undefined) return void stop(t("o agente não agendou a próxima rodada", "el agente no programó la próxima ronda", "the agent did not schedule the next round"));
		schedule(loop.wake);
	};
	const start = (args: string, context: any) => {
		ctx = context;
		const text = args.trim();
		if (!text) {
			if (!loop) return context.ui.notify(t("Nenhum /loop ativo. Use /loop 5m <tarefa> ou /loop <tarefa>.", "No hay /loop activo. Usa /loop 5m <tarea> o /loop <tarea>.", "No active /loop. Use /loop 5m <task> or /loop <task>."), "info");
			return show();
		}
		if (/^(parar|stop|cancelar)$/i.test(text)) {
			if (!stop()) return context.ui.notify(t("Nenhum /loop ativo.", "No hay /loop activo.", "No active /loop."), "info");
			return context.ui.notify(t("/loop encerrado.", "/loop terminado.", "/loop ended."), "info");
		}
		if (loop) return context.ui.notify(t("Já há um /loop ativo; use /loop parar antes de começar outro.", "Ya hay un /loop activo; usa /loop parar antes de empezar otro.", "A /loop is already active; use /loop stop before starting another."), "warning");
		const [first, ...rest] = text.split(/\s+/);
		let every: number | undefined;
		let task = text;
		// só "número+unidade" é intervalo; "/loop 3 coisas" é tarefa
		if (/^\d+(\.\d+)?[a-z]+$/i.test(first)) {
			every = parseInterval(first);
			if (every === undefined) return context.ui.notify(t(`Intervalo inválido: ${first}. Use números com s, m ou h (ex.: 90s, 5m, 2h).`, `Intervalo no válido: ${first}. Usa números con s, m o h (ej.: 90s, 5m, 2h).`, `Invalid interval: ${first}. Use numbers with s, m or h (e.g. 90s, 5m, 2h).`), "warning");
			if (every < MIN_SECONDS || every > MAX_FIXED_SECONDS)
				return context.ui.notify(t(`Intervalo fora do limite: de ${human(MIN_SECONDS)} a ${human(MAX_FIXED_SECONDS)}.`, `Intervalo fuera del límite: de ${human(MIN_SECONDS)} a ${human(MAX_FIXED_SECONDS)}.`, `Interval out of range: ${human(MIN_SECONDS)} to ${human(MAX_FIXED_SECONDS)}.`), "warning");
			task = rest.join(" ").trim();
			if (!task) return context.ui.notify(t("Falta a tarefa: /loop 5m <tarefa>.", "Falta la tarea: /loop 5m <tarea>.", "Missing the task: /loop 5m <task>."), "warning");
		}
		loop = { task, every, round: 0, running: false, pending: false };
		fire();
	};
	const wakeTool = {
		name: "schedule_wakeup",
		label: "schedule_wakeup",
		description: `Only inside a /loop without interval: schedule the next round of the loop task in delaySeconds (clamped to ${MIN_SECONDS}-${MAX_WAKE_SECONDS}), or stop:true to end the loop. The timer lives only in this open session.`,
		parameters: Type.Object({
			delaySeconds: Type.Optional(Type.Number({ description: `seconds until the next round, ${MIN_SECONDS}-${MAX_WAKE_SECONDS}` })),
			stop: Type.Optional(Type.Boolean({ description: "true ends the loop" })),
			reason: Type.Optional(Type.String({ description: "one short sentence on why this delay" })),
		}),
		annotations: { readOnlyHint: true },
		async execute(_id: string, params: any) {
			if (!loop) return reply(t("Nenhum /loop ativo nesta sessão: nada para agendar.", "No hay /loop activo en esta sesión: nada que programar.", "No active /loop in this session: nothing to schedule."), true);
			if (loop.every) return reply(t(`Este /loop já repete a cada ${human(loop.every)}; não precisa agendar.`, `Este /loop ya se repite cada ${human(loop.every)}; no hace falta programar.`, `This /loop already repeats every ${human(loop.every)}; no need to schedule.`), true);
			if (params?.stop === true) {
				stop(t("o agente concluiu a tarefa", "el agente terminó la tarea", "the agent finished the task"));
				return reply("/loop encerrado.");
			}
			const asked = Number(params?.delaySeconds);
			if (!Number.isFinite(asked)) return reply(t("Informe delaySeconds ou stop:true.", "Indica delaySeconds o stop:true.", "Provide delaySeconds or stop:true."), true);
			loop.wake = Math.min(MAX_WAKE_SECONDS, Math.max(MIN_SECONDS, Math.round(asked)));
			return reply(`Próxima rodada em ${human(loop.wake)}, depois que esta terminar.`);
		},
	};
	// a sessão vai embora: limpa o widget (ui() aguenta ctx velho) e depois esquece o ctx
	const shutdown = () => {
		stop();
		ctx = undefined;
	};
	return { start, settled, stop, shutdown, wakeTool, state: () => loop };
}

export default function (pink: any) {
	if (process.env.PINK_SUBAGENT) return;
	const loop = createLoop(pink);
	pink.registerTool(loop.wakeTool);
	pink.on("agent_settled", (event: any) => loop.settled(event?.aborted === true));
	pink.on("session_shutdown", () => loop.shutdown());
	pink.registerCommand("loop", {
		description: t("Repete uma tarefa: /loop 5m <tarefa> (intervalo fixo), /loop <tarefa> (o agente escolhe o ritmo), /loop parar", "Repite una tarea: /loop 5m <tarea> (intervalo fijo), /loop <tarea> (el agente elige el ritmo), /loop parar", "Repeats a task: /loop 5m <task> (fixed interval), /loop <task> (the agent picks the pace), /loop stop"),
		getArgumentCompletions: (prefix: string) => ("parar".startsWith(prefix) ? [{ value: "parar", label: "parar" }] : null),
		handler: async (args: string, ctx: any) => loop.start(args ?? "", ctx),
	});
}
