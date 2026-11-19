// Comando em segundo plano (owner 2026-11-18, card 1dfwh7kfzfb), como o run_in_background do Claude Code: o bash e o
// powershell ganham run_in_background; com ele a ferramenta devolve na hora um id, a conversa segue livre e o resultado
// entra como mensagem (que abre um turno) quando o comando termina. background_output lê a saída parcial,
// background_stop encerra e background_watch avisa quando um padrão aparece na saída (servidor "ready", erro no build).
// A ferramenta continua se chamando bash/powershell e a execução é a original (createBashToolDefinition), então
// permissões, hooks, RTK e modo plano valem igual. Ao fechar, trocar ou recarregar a sessão os processos são encerrados.
// Sem tela (pink -p, subagente) o processo acabaria antes do resultado: o comando espera como antes.
import { createBashToolDefinition, createPowerShellToolDefinition, SettingsManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const MAX_JOBS = 8;
const OUTPUT_CAP = 50 * 1024;
const WIDGET = "pink-shell-jobs";
const LINE_CAP = 2000;

// o padrão vem do modelo (ou de texto injetado na saída) e roda na linha principal: sem limite um (a+)+$ trava o Pink
// inteiro (Argus M2). shortcut: barra só quantificador aninhado e padrão longo, não todo regex lento; RE2 se virar problema
export function safeRegex(pattern: string): RegExp | string {
	if (pattern.length > 200) return "padrão longo demais (máximo 200 caracteres)";
	if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/.test(pattern)) return "quantificador aninhado como (a+)+ pode travar o Pink; simplifique o padrão";
	try {
		return new RegExp(pattern);
	} catch (error: any) {
		return `padrão inválido: ${error?.message ?? error}`;
	}
}

type Watch = { regex: RegExp; pattern: string; timer?: ReturnType<typeof setTimeout> };
type Job = { id: number; shell: string; command: string; started: number; controller: AbortController; output: string; watches: Watch[] };

const oneLine = (text: string, max: number) => {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const clock = (ms: number) => {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const textOf = (result: any) => (result?.content ?? []).filter((part: any) => part?.type === "text").map((part: any) => part.text).join("\n");
const cap = (text: string) => (text.length > OUTPUT_CAP ? `[…]\n${text.slice(-OUTPUT_CAP)}` : text);
// a lateral SESSÕES do mux (pink/mux) soma esta contagem à dos subagentes; fora do mux não escreve nada
const muxWrite = (text: string) => {
	if (process.env.PINK_MUX_CHILD === "1" && process.stdout.isTTY) process.stdout.write(text);
};

export const BACKGROUND_GUIDELINE =
	"Set run_in_background: true for commands that run long or never end (dev servers, watchers, long builds or test suites): you get an id at once and the result arrives later as a message. Do not poll or sleep waiting for it; use background_watch to be told when a line appears (for example a server's ready line), background_output to peek and background_stop to end it. To wait for a pattern in a log file, run a background command that ends when it appears (bash: tail -n0 -F file | grep -m1 'pattern'; PowerShell: Get-Content file -Wait -Tail 0 | Select-String 'pattern' | Select-Object -First 1).";

export function createShellJobs(pi: any, { now = Date.now, write = muxWrite } = {}) {
	const jobs = new Map<number, Job>();
	let next = 1;
	let closed = false;
	let shown = 0;
	let ui: any;
	let timer: ReturnType<typeof setInterval> | undefined;

	const lines = () => [...jobs.values()].map((job) => `⚙ %${job.id} ${job.shell} · ${clock(now() - job.started)} · ${oneLine(job.command, 60)}`);
	const refresh = () => {
		try {
			ui?.setWidget(WIDGET, jobs.size && !closed ? [...lines(), "   /processos para listar ou encerrar"] : undefined);
		} catch {
			/* tela já fechada */
		}
		const count = closed ? 0 : jobs.size;
		if (count !== shown) {
			shown = count; // só quando muda: o relógio redesenha a cada segundo, o aviso ao mux não
			try {
				write(`\x1b]9;pink-jobs=${count}\x07`);
			} catch {
				/* terminal fechado */
			}
		}
		if (jobs.size && !closed && !timer) {
			timer = setInterval(refresh, 1000);
			timer.unref?.();
		} else if ((!jobs.size || closed) && timer) {
			clearInterval(timer);
			timer = undefined;
		}
	};
	const deliver = (content: string, details: any, turn: boolean) => {
		if (closed) return; // sessão encerrada: nada é entregue
		pi.sendMessage({ customType: "background-shell", display: true, content, details }, turn ? { triggerTurn: true, deliverAs: "followUp" } : { deliverAs: "nextTurn" });
	};
	const clearWatches = (job: Job) => {
		for (const watch of job.watches) if (watch.timer) clearTimeout(watch.timer);
		job.watches = [];
	};
	const checkWatches = (job: Job) => {
		if (!job.watches.length) return;
		const outputLines = job.output.split(/\r?\n/).map((item) => item.slice(0, LINE_CAP));
		for (const watch of [...job.watches]) {
			const line = outputLines.find((item) => watch.regex.test(item));
			if (line === undefined) continue;
			if (watch.timer) clearTimeout(watch.timer);
			job.watches.splice(job.watches.indexOf(watch), 1);
			deliver(`Vigia do processo %${job.id}: apareceu /${watch.pattern}/.\n\n${oneLine(line, 500)}`, { id: job.id, pattern: watch.pattern, matched: true }, true);
		}
	};
	const finish = (job: Job, text: string, failed: boolean) => {
		if (!jobs.delete(job.id) || closed) return;
		clearWatches(job);
		refresh();
		const cancelled = job.controller.signal.aborted;
		const verb = cancelled ? "foi encerrado" : failed ? "terminou com erro" : "terminou";
		deliver(`Processo em segundo plano %${job.id} (${job.shell}: ${oneLine(job.command, 120)}) ${verb}.\n\n${cap(text) || "(sem saída)"}`, { id: job.id, failed, cancelled }, !cancelled);
	};

	function start(shell: string, tool: any, toolCallId: string, params: any, ctx: any): { text: string; error: boolean } {
		if (jobs.size >= MAX_JOBS) return { text: `Limite de ${MAX_JOBS} processos em segundo plano. Encerre um com background_stop ou rode sem run_in_background.`, error: true };
		ui = ctx.ui;
		const job: Job = { id: next++, shell, command: String(params.command ?? ""), started: now(), controller: new AbortController(), output: "", watches: [] };
		jobs.set(job.id, job);
		const onUpdate = (partial: any) => {
			const text = textOf(partial);
			if (!text || !jobs.has(job.id)) return;
			job.output = text;
			checkWatches(job);
		};
		Promise.resolve()
			.then(() => tool.execute(toolCallId, params, job.controller.signal, onUpdate, ctx))
			.then(
				(result: any) => {
					job.output = textOf(result) || job.output;
					checkWatches(job); // padrão que só apareceu no fim
					finish(job, job.output, Boolean(result?.isError));
				},
				(error: any) => finish(job, String(error?.message ?? error), true),
			)
			.catch(() => {}); // erro ao entregar não pode derrubar o Pink
		refresh();
		return {
			text: `Rodando em segundo plano como %${job.id}. O resultado chega sozinho quando terminar; não espere nem consulte em laço. Saída parcial: background_output id=${job.id}; vigiar uma linha: background_watch; encerrar: background_stop.`,
			error: false,
		};
	}

	const find = (id: unknown) => jobs.get(Number(String(id ?? "").replace(/^%/, "")));
	const reply = (value: string, isError = false) => ({ content: [{ type: "text", text: value }], details: undefined, isError });

	pi.registerTool({
		name: "background_output",
		label: "background_output",
		description: "Read the latest output (tail) of a command started with run_in_background, while it is still running.",
		parameters: Type.Object({ id: Type.Union([Type.Number(), Type.String()], { description: "Job id returned when the command started (%n)" }) }),
		async execute(_id: string, params: any) {
			const job = find(params.id);
			if (!job) return reply(`Nenhum processo %${params.id} rodando (se já terminou, o resultado veio como mensagem).`, true);
			return reply(`%${job.id} rodando há ${clock(now() - job.started)}.\n\n${cap(job.output) || "(sem saída ainda)"}`);
		},
	});
	pi.registerTool({
		name: "background_stop",
		label: "background_stop",
		description: "Stop a command started with run_in_background (kills its process tree).",
		parameters: Type.Object({ id: Type.Union([Type.Number(), Type.String()], { description: "Job id (%n)" }) }),
		async execute(_id: string, params: any) {
			const job = find(params.id);
			if (!job) return reply(`Nenhum processo %${params.id} rodando.`, true);
			job.controller.abort();
			return reply(`Encerrando %${job.id}.`);
		},
	});
	pi.registerTool({
		name: "background_watch",
		label: "background_watch",
		description: "Be told, with a message that starts a turn, when a line matching a regular expression appears in the output of a background command (e.g. a dev server's ready line). Fires once; optional timeout.",
		parameters: Type.Object({
			id: Type.Union([Type.Number(), Type.String()], { description: "Job id (%n)" }),
			pattern: Type.String({ description: "JavaScript regular expression tested against each output line" }),
			timeout_seconds: Type.Optional(Type.Number({ description: "Give up after this many seconds (a message says so)" })),
		}),
		async execute(_id: string, params: any) {
			const job = find(params.id);
			if (!job) return reply(`Nenhum processo %${params.id} rodando.`, true);
			const regex = safeRegex(String(params.pattern));
			if (typeof regex === "string") return reply(`Não vigiei: ${regex}.`, true);
			const watch: Watch = { regex, pattern: String(params.pattern) };
			const seconds = Number(params.timeout_seconds);
			if (seconds > 0) {
				watch.timer = setTimeout(() => {
					const index = job.watches.indexOf(watch);
					if (index < 0) return;
					job.watches.splice(index, 1);
					deliver(`Vigia do processo %${job.id}: /${watch.pattern}/ não apareceu em ${seconds} s.`, { id: job.id, pattern: watch.pattern, matched: false }, true);
				}, seconds * 1000);
				watch.timer.unref?.();
			}
			job.watches.push(watch);
			checkWatches(job); // já apareceu antes de vigiar: avisa já
			return reply(`Vigiando /${watch.pattern}/ em %${job.id}. O aviso chega como mensagem; siga com outra coisa. Se o processo acabar antes, a vigia acaba junto e vale a mensagem de término.`);
		},
	});

	pi.registerCommand("processos", {
		description: "Comandos em segundo plano: lista; 'encerrar <n>' ou 'encerrar todos'",
		getArgumentCompletions: (prefix: string) =>
			["encerrar todos", ...[...jobs.keys()].map((id) => `encerrar ${id}`)].filter((item) => item.startsWith(prefix)).map((value) => ({ value, label: value })),
		handler: async (args: string, ctx: any) => {
			const [verb, target] = args.trim().split(/\s+/);
			if (verb === "encerrar") {
				const targets = target === "todos" ? [...jobs.values()] : ([find(target)].filter(Boolean) as Job[]);
				for (const job of targets) job.controller.abort();
				ctx.ui.notify(targets.length ? `Encerrando ${targets.length} processo(s).` : "Use /processos encerrar <n> ou /processos encerrar todos.", targets.length ? "info" : "warning");
				return;
			}
			ctx.ui.notify(jobs.size ? lines().join("\n") : "Nenhum processo em segundo plano.", "info");
		},
	});

	pi.on("session_shutdown", () => {
		closed = true;
		for (const job of jobs.values()) {
			clearWatches(job);
			job.controller.abort();
		}
		jobs.clear();
		refresh();
	});

	return { start, jobs };
}

// o bash e o powershell com run_in_background; a execução é sempre a ferramenta original, criada como o Pink a cria
export function withBackground(base: any, make: (cwd: string, trusted: boolean) => any, shell: string, jobs: ReturnType<typeof createShellJobs>) {
	return {
		...base,
		parameters: Type.Object({
			...base.parameters.properties,
			run_in_background: Type.Optional(Type.Boolean({ description: "Run in the background: returns at once with an id; the result arrives later as a message. For long or endless commands." })),
		}),
		promptGuidelines: [...(base.promptGuidelines ?? []), BACKGROUND_GUIDELINE],
		async execute(toolCallId: string, params: any, signal: AbortSignal, onUpdate: any, ctx: any) {
			const { run_in_background, ...rest } = params ?? {};
			const tool = make(ctx?.cwd ?? process.cwd(), Boolean(ctx?.isProjectTrusted?.()));
			if (!run_in_background) return tool.execute(toolCallId, rest, signal, onUpdate, ctx);
			// sem tela (pink -p) não há quem receba o aviso depois: recusa em vez de rodar na frente um servidor que nunca acaba
			if (!ctx?.hasUI)
				return { content: [{ type: "text", text: "run_in_background só funciona na sessão interativa. Rode sem ele apenas se o comando terminar sozinho." }], details: undefined, isError: true };
			const started = jobs.start(shell, tool, toolCallId, rest, ctx);
			return { content: [{ type: "text", text: started.text }], details: undefined, isError: started.error };
		},
	};
}

export default function (pi: any) {
	if (process.env.PINK_SUBAGENT) return; // subagente roda sem tela: fica com o bash original
	const jobs = createShellJobs(pi);
	// as mesmas opções que o Pink passa ao bash embutido (prefixo e caminho do shell). O settings do projeto só vale em
	// pasta confiável, como na sessão (Argus A1: shellPath de repositório estranho trocaria o executável de todo comando);
	// lido uma vez por pasta e confiança, como a sessão faz ao abrir
	const cache = new Map<string, { commandPrefix?: string; shellPath?: string }>();
	const settings = (cwd: string, trusted: boolean) => {
		const key = `${trusted}\u0000${cwd}`;
		if (!cache.has(key)) {
			try {
				const manager = SettingsManager.create(cwd, undefined, { projectTrusted: trusted });
				cache.set(key, { commandPrefix: manager.getShellCommandPrefix(), shellPath: manager.getShellPath() });
			} catch {
				cache.set(key, {}); // settings ilegível: o shell padrão, como o Pink sem settings
			}
		}
		return cache.get(key);
	};
	const bash = (cwd: string, trusted: boolean) => createBashToolDefinition(cwd, settings(cwd, trusted));
	const powershell = (cwd: string) => createPowerShellToolDefinition(cwd);
	pi.registerTool(withBackground(bash(process.cwd(), false), bash, "bash", jobs));
	pi.registerTool(withBackground(powershell(process.cwd()), powershell, "powershell", jobs));
}
