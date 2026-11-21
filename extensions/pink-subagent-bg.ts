// Subagentes em segundo plano (owner 2026-11-18, card 1dfwh7kfzfa), como no Claude Code: com background:true a ferramenta
// subagent devolve na hora um id, a conversa segue livre e o resultado chega depois como mensagem que abre um novo turno.
// Uma linha acima do campo de texto mostra quem está rodando; /subagentes lista e cancela. Ao fechar, trocar ou recarregar
// a sessão (session_shutdown) os filhos são abortados e nada é entregue: o resultado nunca cai em outra conversa.
// Copiado para examples/extensions/subagent/background.ts pelo build (rebrand.json); o index.ts do subagente o importa.

import { t } from "./pink-i18n.ts";
export const MAX_BACKGROUND = 4;
const OUTPUT_CAP = 50 * 1024;
const WIDGET = "pink-subagents";

type Item = { agent: string; task: string; cwd?: string };
type Outcome = { failed: boolean; text: string };
type Job = { id: number; agent: string; task: string; started: number; controller: AbortController; tokens: number };
type Run = (item: Item, signal: AbortSignal, onTokens: (output: number) => void) => Promise<Outcome>;
const tokens = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`);

const oneLine = (text: string, max: number) => {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const clock = (ms: number) => {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
// a lateral SESSÕES do mux (pink/mux) lê a contagem deste aviso; fora do mux não escreve nada
const muxWrite = (text: string) => {
	if (process.env.PINK_MUX_CHILD === "1" && process.stdout.isTTY) process.stdout.write(text);
};

export function createBackground(pi: any, { now = Date.now, write = muxWrite } = {}) {
	const jobs = new Map<number, Job>();
	let next = 1;
	let closed = false;
	let ui: any;
	let timer: ReturnType<typeof setInterval> | undefined;
	let shown = 0;

	const lines = () => [
		...[...jobs.values()].map((job) => `⏳ #${job.id} ${job.agent} · ${oneLine(job.task, 60)} · ${clock(now() - job.started)} · ↓ ${tokens(job.tokens)} tokens`),
		t("   /subagentes para listar ou cancelar", "   /subagentes para listar o cancelar", "   /subagentes to list or cancel"),
	];
	const refresh = () => {
		try {
			// embaixo da caixa de texto, como o painel do Claude Code (owner 2026-11-20, card 1dfwh7kg4g2)
			ui?.setWidget(WIDGET, jobs.size && !closed ? lines() : undefined, { placement: "belowEditor" });
		} catch {
			/* tela já fechada */
		}
		const count = closed ? 0 : jobs.size;
		if (count !== shown) {
			shown = count; // só quando muda: o relógio redesenha a cada segundo, o aviso ao mux não
			try {
				write(`\x1b]9;pink-subagents=${count}\x07`);
			} catch {
				/* terminal fechado */
			}
		}
		if (jobs.size && !closed && !timer) {
			timer = setInterval(refresh, 1000); // o relógio de cada linha
			timer.unref?.();
		} else if ((!jobs.size || closed) && timer) {
			clearInterval(timer);
			timer = undefined;
		}
	};

	const finish = (job: Job, outcome: Outcome) => {
		if (!jobs.delete(job.id) || closed) return; // sessão encerrada: nada é entregue
		refresh();
		const cancelled = job.controller.signal.aborted;
		const verb = cancelled ? t("foi cancelado", "fue cancelado", "was cancelled") : outcome.failed ? t("falhou", "falló", "failed") : t("terminou", "terminó", "finished");
		const body = outcome.text.length > OUTPUT_CAP ? `${outcome.text.slice(0, OUTPUT_CAP)}\n\n${t(`[saída cortada em ${OUTPUT_CAP} caracteres]`, `[salida cortada en ${OUTPUT_CAP} caracteres]`, `[output cut at ${OUTPUT_CAP} characters]`)}` : outcome.text;
		pi.sendMessage(
			{
				customType: "subagent-result",
				display: true,
				content: `${t("Subagente em segundo plano", "Subagente en segundo plano", "Background subagent")} #${job.id} (${job.agent}) ${verb}.\n\n${body || t("(sem saída)", "(sin salida)", "(no output)")}`,
				details: { id: job.id, agent: job.agent, failed: outcome.failed, cancelled },
			},
			// cancelado pela pessoa: o modelo fica sabendo no próximo turno, sem abrir um sozinho
			cancelled ? { deliverAs: "nextTurn" } : { triggerTurn: true, deliverAs: "followUp" },
		);
	};

	function start(items: Item[], chain: boolean, run: Run, ctx: any): { text: string; error: boolean } {
		if (chain) return { text: t("background não vale no modo chain (cada passo depende do anterior). Use single ou tasks.", "background no sirve en modo chain (cada paso depende del anterior). Usa single o tasks.", "background does not work in chain mode (each step depends on the previous one). Use single or tasks."), error: true };
		if (jobs.size + items.length > MAX_BACKGROUND)
			return { text: t(`Limite de ${MAX_BACKGROUND} subagentes em segundo plano (rodando: ${jobs.size}). Espere um terminar ou rode sem background.`, `Límite de ${MAX_BACKGROUND} subagentes en segundo plano (en ejecución: ${jobs.size}). Espera a que uno termine o ejecuta sin background.`, `Limit of ${MAX_BACKGROUND} background subagents (running: ${jobs.size}). Wait for one to finish or run without background.`), error: true };
		ui = ctx.ui;
		const started = items.map((item) => {
			const job: Job = { id: next++, agent: item.agent, task: item.task, started: now(), controller: new AbortController(), tokens: 0 };
			jobs.set(job.id, job);
			run(item, job.controller.signal, (output) => {
				job.tokens = Math.max(job.tokens, Number(output) || 0); // o relógio de 1 s redesenha
			})
				.then(
					(outcome) => finish(job, outcome),
					(error) => finish(job, { failed: true, text: String(error?.message ?? error) }),
				)
				.catch(() => {}); // erro ao entregar não pode derrubar o Pink (unhandledRejection)
			return job;
		});
		refresh();
		const ids = started.map((job) => `#${job.id} (${job.agent})`).join(", ");
		return {
			text: `Iniciado em segundo plano: ${ids}. O resultado chega sozinho como mensagem quando terminar; siga com outra coisa, não espere nem consulte.`,
			error: false,
		};
	}

	function cancel(which: string): number {
		const targets = which === "todos" || which === "all" ? [...jobs.values()] : [jobs.get(Number(which.replace(/^#/, "")))].filter(Boolean) as Job[];
		for (const job of targets) job.controller.abort();
		return targets.length;
	}

	pi.registerCommand("subagentes", {
		description: t("Subagentes em segundo plano: lista; 'cancelar <n>' ou 'cancelar todos'", "Subagentes en segundo plano: lista; 'cancelar <n>' o 'cancelar todos'", "Background subagents: list; 'cancel <n>' or 'cancel all'"),
		getArgumentCompletions: (prefix: string) =>
			["cancelar todos", ...[...jobs.keys()].map((id) => `cancelar ${id}`)].filter((item) => item.startsWith(prefix)).map((value) => ({ value, label: value })),
		handler: async (args: string, ctx: any) => {
			const [verb, target] = args.trim().split(/\s+/);
			if (verb === "cancelar" || verb === "cancel") {
				const count = target ? cancel(target) : 0;
				ctx.ui.notify(count ? t(`Cancelando ${count} subagente(s).`, `Cancelando ${count} subagente(s).`, `Cancelling ${count} subagent(s).`) : t("Use /subagentes cancelar <n> ou /subagentes cancelar todos.", "Usa /subagentes cancelar <n> o /subagentes cancelar todos.", "Use /subagentes cancel <n> or /subagentes cancel all."), count ? "info" : "warning");
				return;
			}
			ctx.ui.notify(jobs.size ? lines().slice(0, -1).join("\n") : t("Nenhum subagente em segundo plano.", "No hay subagentes en segundo plano.", "No background subagents."), "info");
		},
	});

	pi.on("session_shutdown", () => {
		closed = true;
		for (const job of jobs.values()) job.controller.abort();
		jobs.clear();
		refresh();
	});

	return { start, cancel, jobs };
}
