// Sessão inteira num agente instalado (owner 2026-11-23, card 1dfwh7kgf8k), como o OpenBot faz: com /agente claude (ou
// codex, opencode, cline...), o que a pessoa digita vai para o programa oficial do agente, com o login, a cota e o
// histórico dele, e a resposta aparece no Pink. A conversa continua entre mensagens (claude --resume, codex
// thread/resume, ACP session/load). /agente off volta ao modelo do Pink, que vê a conversa (as mensagens ficam na sessão).
// O transporte é o mesmo dos subagentes externos (examples/extensions/subagent/external.ts, cards 1dfwh7kgf8g/h/j).
import { t } from "./pink-i18n.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { externalAgents, listModels, pinkExtras, runExternal } from "../examples/extensions/subagent/external.ts";
import { bulleted, runLabel, shortModel, streamedTokens, thinkingLabel, toolSummary, userLines } from "./pink-ui.ts";

// o Pink junto (card 1dfwh7kgfjx): MCPs do mcp.json, AGENTS.md e skills do Pink, mais o próprio Pink como MCP
const readJson = (file: string) => {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return undefined;
	}
};
export function gatherExtras(pink: any, dir = process.env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent")) {
	let rules = "";
	try {
		rules = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
	} catch {
		/* sem regras globais */
	}
	let skills: any[] = [];
	try {
		skills = (pink.getCommands?.() ?? []).filter((command: any) => command.source === "skill" && String(command.name).startsWith("skill:")).map((command: any) => ({ name: command.name.slice(6), description: command.description, path: command.sourceInfo?.path }));
	} catch {
		/* sem skills */
	}
	const server = { command: process.execPath, args: [path.join(path.dirname(fileURLToPath(import.meta.url)), "pink-mcp-server.mjs")] };
	return pinkExtras({ mcp: readJson(path.join(dir, "mcp.json"))?.mcpServers ?? {}, rules, skills, server });
}

const STATUS = "pink-agente";
const WIDGET = "pink-agente-trabalhando";
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const fresh = () => ({ messages: [] as any[], stderr: "", exitCode: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 } });

// nomes e argumentos de cada agente (Claude: Read/file_path, Glob...) viram os do Pink, para a linha sair igual à nativa
const NAMES: Record<string, string> = { multiedit: "edit", glob: "find", notebookedit: "edit" };
export function pinkTool(part: any, cwd = "") {
	const raw = String(part?.name ?? "tool");
	const name = NAMES[raw.toLowerCase()] ?? raw.toLowerCase();
	const args = { ...(part?.arguments ?? {}) };
	const file = args.path ?? args.file_path ?? args.filePath ?? args.notebook_path;
	if (file) args.path = cwd && path.isAbsolute(String(file)) ? path.relative(cwd, String(file)) || "." : String(file);
	const line = toolSummary(name, args);
	return line === name && args.title ? String(args.title) : line;
}

// os passos da resposta, na ordem: pensou, ferramentas e textos (o desenho usa; o modelo do Pink lê o texto puro)
export function steps(result: any, cwd = "") {
	const out: any[] = [];
	for (const message of result.messages) {
		for (const part of message.content ?? []) {
			if (part.type === "text" && part.text?.trim()) out.push({ kind: "text", text: part.text });
			else if (part.type === "thinking") out.push({ kind: "thinking", ms: part.ms >= 100 ? part.ms : 0 }); // o pensamento chega de uma vez: tempo quase 0 não diz nada
			else if (part.type === "toolCall") out.push({ kind: "tool", line: pinkTool(part, cwd) });
		}
	}
	return out;
}

export function render(result: any, cwd = ""): string {
	const all = steps(result, cwd);
	const tools = all.filter((step) => step.kind === "tool").map((step) => `→ ${step.line}`);
	const answer = all.filter((step) => step.kind === "text").at(-1)?.text ?? "";
	const body = [tools.join("\n"), answer].filter(Boolean).join("\n\n");
	if (result.stopReason === "error") return [body, `⚠ ${result.errorMessage}`].filter(Boolean).join("\n\n");
	return body || t("(sem resposta)", "(sin respuesta)", "(no answer)");
}

const outputOf = (result: any) => result.usage?.output || result.messages.reduce((sum: number, message: any) => sum + streamedTokens(message), 0);

const label = (agent: any) => (agent.model ? `${agent.name} · ${agent.model}` : agent.name);

const loadTui = () => Promise.all([import("@earendil-works/pi-tui"), import("@earendil-works/pi-coding-agent")]);

export default function (pink: any, list: typeof externalAgents = externalAgents, run: typeof runExternal = runExternal, models: typeof listModels = listModels, extras: () => any = () => gatherExtras(pink), load: () => Promise<any[]> = loadTui) {
	let active: { agent: any; resume: { id?: string }; controller?: AbortController } | undefined;
	let ticker: ReturnType<typeof setInterval> | undefined;
	let lastUi: any;

	// "⠴ Trabalhando · 2s · ↓ 0 tokens" acima da caixa, com o mesmo Loader do Pink: o dele só aparece quando o modelo do Pink
	// responde, e este ocupa o mesmo lugar
	let loader: any;
	const idle = () => {
		if (ticker) clearInterval(ticker);
		ticker = undefined;
		loader?.stop?.();
		loader = undefined;
		lastUi?.setWidget?.(WIDGET, undefined);
	};
	const busy = (ui: any, output: () => number) => {
		idle();
		lastUi = ui;
		if (!ui?.setWidget) return;
		const started = Date.now();
		const message = () => `${t("Trabalhando", "Trabajando", "Working")} · ${runLabel({ ms: Date.now() - started, output: output() })}`;
		if (tui?.Loader) {
			ui.setWidget(WIDGET, (screen: any, theme: any) => (loader = new tui.Loader(screen, (s: string) => theme.fg("accent", s), (s: string) => theme.fg("muted", s), message())), { placement: "aboveEditor" });
			ticker = setInterval(() => loader?.setMessage?.(message()), 1000);
		} else {
			let frame = 0;
			const draw = () => ui.setWidget(WIDGET, ["", ` ${FRAMES[frame++ % FRAMES.length]} ${message()}`], { placement: "aboveEditor" });
			draw();
			ticker = setInterval(draw, 120);
		}
		ticker.unref?.();
	};

	const stop = (ctx?: any) => {
		active?.controller?.abort();
		active = undefined;
		idle();
		(globalThis as any).__pinkExternalAgent = undefined; // o rótulo da caixa volta a "Build · modelo" (pink-ui)
		ctx?.ui?.setStatus?.(STATUS, undefined);
	};

	// mensagens desenhadas como as do Pink: "> oi", "+ Pensou · 0.4s", "→ Rodou: ...", "● resposta" e o rodapé
	// "opencode · big-pickle · 7s · ↓ 49 tokens" (mesmas funções do pink-ui)
	let tui: any;
	let coding: any;
	void load().then(([a, b]) => {
		tui = a;
		coding = b;
	}).catch(() => undefined);
	const textOf = (message: any) => (typeof message.content === "string" ? message.content : (message.content ?? []).map((part: any) => part.text ?? "").join(""));
	const bold = (theme: any, text: string) => (theme.bold ? theme.bold(text) : text);
	pink.registerMessageRenderer?.("pink-agente-pedido", (message: any, options: any, theme: any) => {
		if (!tui || !coding?.getMarkdownTheme) return undefined;
		const md = new tui.Markdown(String(message.details?.text ?? textOf(message)), options.outputPad, 0, coding.getMarkdownTheme(), { color: (s: string) => theme.fg("userMessageText", s), bgColor: (s: string) => theme.bg("userMessageBg", s) });
		return { render: (width: number) => userLines(md.render(Math.max(1, width - 1)), theme.fg("muted", ">")), invalidate: () => md.invalidate?.() };
	});
	pink.registerMessageRenderer?.("pink-agente", (message: any, options: any, theme: any) => {
		if (!tui || !coding?.getMarkdownTheme) return undefined;
		const details = message.details ?? {};
		const pad = options.outputPad ?? 1;
		const box = new tui.Container();
		const list = Array.isArray(details.steps) ? details.steps : [{ kind: "text", text: textOf(message) }];
		// o Pink já põe uma linha em branco antes de cada mensagem: entre o pedido e a resposta fica só ela, como no Claude Code
		for (const [index, step] of list.entries()) {
			if (index) box.addChild(new tui.Spacer(1));
			if (step.kind === "thinking") box.addChild(new tui.Text(theme.fg("thinkingText", thinkingLabel(step.ms)), pad, 0));
			else if (step.kind === "tool") box.addChild(new tui.Text(theme.fg("muted", `→ ${step.line}`), pad, 0));
			else box.addChild(bulleted(new tui.Markdown(String(step.text).trim(), pad, 0, coding.getMarkdownTheme())));
		}
		if (details.error) box.addChild(new tui.Spacer(1)), box.addChild(new tui.Text(theme.fg("error", `⚠ ${details.error}`), pad, 0));
		const footer = [bold(theme, theme.fg("accent", details.agent ?? t("agente", "agente", "agent")))];
		if (details.model) footer.push(theme.fg("text", shortModel(details.model)));
		if (details.ms !== undefined) footer.push(theme.fg("muted", runLabel({ ms: details.ms, output: details.output ?? 0 })));
		box.addChild(new tui.Spacer(1));
		box.addChild(new tui.Text(footer.join(theme.fg("dim", " · ")), pad, 0));
		return box;
	});

	const send = async (text: string, ctx: any) => {
		const current = active!;
		const controller = new AbortController();
		current.controller = controller;
		const name = current.agent.name;
		pink.sendMessage({ customType: "pink-agente-pedido", display: true, content: `› ${name}: ${text}`, details: { agent: name, text } });
		const result = fresh();
		const started = Date.now();
		const lastTool = () => result.messages.at(-1)?.content?.find((part: any) => part.type === "toolCall")?.name;
		const status = () => {
			const last = lastTool();
			ctx.ui?.setStatus?.(STATUS, `${name} ${t("trabalhando", "trabajando", "working")}${last ? `: ${last}` : "…"}`);
		};
		status();
		if (ctx.hasUI) busy(ctx.ui, () => outputOf(result));
		(globalThis as any).__pinkExternalAsk = ctx.hasUI ? (title: string, body: string) => ctx.ui.confirm(title, body) : undefined;
		try {
			await run(current.agent, text, ctx.cwd, controller.signal, result, status, undefined, undefined, current.resume);
		} catch (error: any) {
			result.stopReason = "error";
			result.errorMessage = controller.signal.aborted ? t("cancelado", "cancelado", "cancelled") : String(error?.message ?? error);
		}
		if (current.controller === controller) current.controller = undefined;
		if (active === current || !active) idle();
		if (active === current) {
			ctx.ui?.setStatus?.(STATUS, `${t("agente", "agente", "agent")}: ${label(current.agent)}`);
			// a caixa passa a mostrar o modelo que o agente usou de fato, em vez de "modelo padrão"
			if (!current.agent.model && result.model && result.model !== name) (globalThis as any).__pinkExternalAgent = { name, model: result.model };
		}
		const error = result.stopReason === "error" ? String(result.errorMessage ?? t("erro", "error", "error")) : undefined;
		pink.sendMessage({ customType: "pink-agente", display: true, content: render(result, ctx.cwd), details: { agent: name, model: result.model, usage: result.usage, error, steps: steps(result, ctx.cwd), ms: Date.now() - started, output: outputOf(result) } });
	};

	// "/agente " lista as opções, como os outros comandos: off e os agentes; "/agente codex " lista os modelos dele
	const modelCache = new Map<string, Promise<any[]>>();
	const completions = async (prefix: string) => {
		const text = String(prefix ?? "").replace(/^\s+/, "");
		const space = text.indexOf(" ");
		const agents = list();
		if (space < 0) {
			const items = [
				...(active ? [{ value: "off", label: "off", description: t(`volta ao Pink (desliga o ${active.agent.name})`, `vuelve a Pink (apaga ${active.agent.name})`, `back to Pink (turns ${active.agent.name} off)`) }] : []),
				...agents.map((agent) => ({ value: agent.name, label: agent.name, description: t(`conversar com o ${agent.name}, com o login dele`, `conversar con ${agent.name}, con su login`, `talk to ${agent.name}, with its own login`) })),
			];
			const hits = items.filter((item) => item.value.startsWith(text.toLowerCase()));
			return hits.length ? hits : null;
		}
		const agent = agents.find((item) => item.name === text.slice(0, space).toLowerCase());
		if (!agent) return null;
		const wanted = text.slice(space + 1).trim();
		if (!modelCache.has(agent.name)) modelCache.set(agent.name, models(agent, process.cwd()).catch(() => (modelCache.delete(agent.name), [])));
		const choices = await modelCache.get(agent.name)!;
		const hits = choices.filter((choice) => choice.id.startsWith(wanted) || String(choice.label).toLowerCase().startsWith(wanted.toLowerCase())).map((choice) => ({ value: `${agent.name} ${choice.id}`, label: choice.id, description: `${choice.label !== choice.id ? choice.label : ""}${choice.current ? ` (${t("padrão", "predeterminado", "default")})` : ""}`.trim() || undefined }));
		return hits.length ? hits : null;
	};

	pink.registerCommand("agente", {
		description: t("Conversa direto com um agente instalado (claude, codex, opencode...) com o login dele; /agente off volta ao Pink", "Conversa directo con un agente instalado (claude, codex, opencode...) con su login; /agente off vuelve a Pink", "Talk straight to an installed agent (claude, codex, opencode...) with its own login; /agente off returns to Pink"),
		getArgumentCompletions: completions,
		handler: async (args: string, ctx: any) => {
			const [first = "", ...rest] = String(args ?? "").trim().split(/\s+/);
			const wanted = first.toLowerCase();
			let model = rest.join(" ");
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
				// com um agente ligado, o primeiro item volta ao modelo/provedor do Pink (o mesmo que /agente off)
				const back = active ? t(`Voltar ao Pink (desliga o ${active.agent.name})`, `Volver a Pink (apaga ${active.agent.name})`, `Back to Pink (turns ${active.agent.name} off)`) : undefined;
				name = ctx.hasUI ? ((await ctx.ui.select(t("Conversar com qual agente?", "¿Con qué agente conversar?", "Talk to which agent?"), [...(back ? [back] : []), ...agents.map((agent) => agent.name)])) ?? "") : "";
				if (!name) return;
				if (name === back) {
					const was = active?.agent.name;
					stop(ctx);
					return ctx.ui?.notify?.(t(`Voltou ao Pink (${was} desligado).`, `Volviste a Pink (${was} apagado).`, `Back to Pink (${was} off).`), "info");
				}
			}
			const agent = agents.find((item) => item.name === name);
			if (!agent) return ctx.ui?.notify?.(t(`${name} não está instalado. Disponíveis: ${agents.map((a) => a.name).join(", ") || "nenhum"}.`, `${name} no está instalado. Disponibles: ${agents.map((a) => a.name).join(", ") || "ninguno"}.`, `${name} is not installed. Available: ${agents.map((a) => a.name).join(", ") || "none"}.`), "warning");
			if (model && !/^[\w./:@-]+$/.test(model)) return ctx.ui?.notify?.(t(`Nome de modelo inválido: ${model}`, `Nombre de modelo no válido: ${model}`, `Invalid model name: ${model}`), "warning");
			if (!model && ctx.hasUI) {
				// menu com os modelos que o agente informa; o primeiro item mantém o padrão dele
				ctx.ui?.setStatus?.(STATUS, t(`${name}: buscando modelos…`, `${name}: buscando modelos…`, `${name}: fetching models…`));
				let choices: Awaited<ReturnType<typeof listModels>> = [];
				try {
					choices = await models(agent, ctx.cwd);
				} catch (error: any) {
					ctx.ui?.notify?.(t(`Não deu para listar os modelos do ${name} (${error?.message ?? error}); fica o padrão dele.`, `No se pudieron listar los modelos de ${name} (${error?.message ?? error}); queda su predeterminado.`, `Could not list ${name}'s models (${error?.message ?? error}); keeping its default.`), "warning");
				}
				ctx.ui?.setStatus?.(STATUS, active ? `${t("agente", "agente", "agent")}: ${label(active.agent)}` : undefined);
				if (choices.length) {
					const current = choices.find((choice) => choice.current);
					const keep = t(`Padrão do ${name}${current ? ` (${current.label})` : ""}`, `Predeterminado de ${name}${current ? ` (${current.label})` : ""}`, `${name} default${current ? ` (${current.label})` : ""}`);
					const shown = choices.map((choice) => (choice.label === choice.id ? choice.id : `${choice.label} — ${choice.id}`));
					const picked = await ctx.ui.select(t(`Modelo do ${name}`, `Modelo de ${name}`, `${name} model`), [keep, ...shown]);
					if (picked === undefined) return;
					if (picked !== keep) model = choices[shown.indexOf(picked)]?.id ?? "";
				}
			}
			stop(ctx);
			active = { agent: { ...agent, ...(model ? { model } : {}), extras: extras() }, resume: {} };
			(globalThis as any).__pinkExternalAgent = { name: active.agent.name, model: active.agent.model }; // rótulo da caixa (pink-ui)
			ctx.ui?.setStatus?.(STATUS, `${t("agente", "agente", "agent")}: ${label(active.agent)}`);
			ctx.ui?.notify?.(t(`Agora suas mensagens vão para o ${label(active.agent)}, com o login e a cota dele. /agente off volta ao Pink.`, `Ahora tus mensajes van a ${label(active.agent)}, con su login y su cuota. /agente off vuelve a Pink.`, `Your messages now go to ${label(active.agent)}, with its own login and quota. /agente off returns to Pink.`), "info");
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
