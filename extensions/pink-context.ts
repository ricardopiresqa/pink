// /context detalhado (owner 2026-11-18, card 1dfwh7kfzfg), como no Claude Code: o que ocupa o contexto do modelo, em tokens
// e em percentual da janela: prompt de sistema, ferramentas, AGENTS.md, memória, skills, conversa e espaço livre.
// O total vem do núcleo (getContextUsage, medido na última resposta); as partes são estimadas.
// shortcut: estimativa por caracteres/4, como o estimateTokens do núcleo; trocar por tokenizador do modelo se a diferença importar

import { t } from "./pink-i18n.ts";
export const estimate = (text: unknown) => Math.ceil(String(text ?? "").length / 4);
const IMAGE_TOKENS = 1200; // como o núcleo: imagem conta fixo, não o base64

export function estimateContent(content: unknown): number {
	if (typeof content === "string") return estimate(content);
	if (!Array.isArray(content)) return estimate(JSON.stringify(content ?? ""));
	return content.reduce((sum, part: any) => {
		if (part?.type === "image") return sum + IMAGE_TOKENS;
		if (typeof part?.text === "string") return sum + estimate(part.text);
		if (typeof part?.thinking === "string") return sum + estimate(part.thinking);
		return sum + estimate(JSON.stringify(part?.arguments ?? part ?? ""));
	}, 0);
}

// só o que ainda está no contexto: depois de uma compactação, o resumo mais as mensagens a partir de firstKeptEntryId
export function conversationEstimate(branch: any[]): number {
	let start = 0;
	let summary = 0;
	let compactionAt = -1;
	for (let i = branch.length - 1; i >= 0; i--) {
		if (branch[i]?.type === "compaction") {
			compactionAt = i;
			break;
		}
	}
	if (compactionAt >= 0) {
		const entry = branch[compactionAt];
		summary = estimate(entry.summary);
		const kept = branch.findIndex((item) => item?.id === entry.firstKeptEntryId);
		start = kept >= 0 ? kept : compactionAt + 1;
	}
	return branch.slice(start).reduce((sum, entry) => sum + (entry?.type === "message" ? estimateContent(entry.message?.content) : 0), summary);
}

type Part = { label: string; tokens: number };
type Input = {
	system: string;
	contextFiles?: { path: string; content: string }[];
	sections?: Record<string, string>;
	skills?: { name?: string; description?: string }[];
	tools?: { name?: string; description?: string; parameters?: unknown }[];
	usageTokens?: number | null;
	window?: number;
	conversationEstimate?: number;
};

export function breakdown(input: Input) {
	const systemTotal = estimate(input.system);
	const agents = (input.contextFiles ?? []).reduce((sum, file) => sum + estimate(file.content), 0);
	const memory = estimate(input.sections?.pink_memory ?? "");
	const skills = (input.skills ?? []).reduce((sum, skill) => sum + estimate(`${skill.name ?? ""} ${skill.description ?? ""}`) + 10, 0);
	// as partes já contadas saem do prompt de sistema (nunca negativo: a estimativa pode passar do total)
	const system = Math.max(0, systemTotal - agents - memory - skills);
	const tools = (input.tools ?? []).reduce((sum, tool) => sum + estimate(JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters })), 0);
	const fixed = systemTotal + tools;
	const measured = typeof input.usageTokens === "number" && input.usageTokens >= 0;
	const conversation = measured ? Math.max(0, (input.usageTokens as number) - fixed) : Math.max(0, input.conversationEstimate ?? 0);
	const used = measured ? Math.max(input.usageTokens as number, fixed) : fixed + conversation;
	const window = input.window && input.window > 0 ? input.window : 0;
	const parts: Part[] = [
		{ label: t("Prompt de sistema", "Prompt de sistema", "System prompt"), tokens: system },
		{ label: t("Ferramentas", "Herramientas", "Tools"), tokens: tools },
		{ label: t("AGENTS.md e instruções", "AGENTS.md e instrucciones", "AGENTS.md and instructions"), tokens: agents },
		{ label: t("Memória do projeto", "Memoria del proyecto", "Project memory"), tokens: memory },
		{ label: t("Skills (lista)", "Skills (lista)", "Skills (list)"), tokens: skills },
		{ label: t("Conversa", "Conversación", "Conversation"), tokens: conversation },
	];
	return { parts, used, window, free: window ? Math.max(0, window - used) : undefined, measured };
}

const thousands = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "-");

export function render(result: ReturnType<typeof breakdown>) {
	const { parts, used, window, free, measured } = result;
	const freeLabel = t("Espaço livre", "Espacio libre", "Free space");
	const width = Math.max(...parts.map((part) => part.label.length), freeLabel.length);
	const row = (label: string, tokens: number) => `${label.padEnd(width)}  ${thousands(tokens).padStart(6)}  ${pct(tokens, window).padStart(6)}`;
	const lines = [
		window ? t(`Contexto: ${thousands(used)} de ${thousands(window)} tokens (${pct(used, window)})`, `Contexto: ${thousands(used)} de ${thousands(window)} tokens (${pct(used, window)})`, `Context: ${thousands(used)} of ${thousands(window)} tokens (${pct(used, window)})`) : t(`Contexto: ${thousands(used)} tokens (janela do modelo desconhecida)`, `Contexto: ${thousands(used)} tokens (ventana del modelo desconocida)`, `Context: ${thousands(used)} tokens (model window unknown)`),
		...parts.map((part) => row(part.label, part.tokens)),
	];
	if (free !== undefined) lines.push(row(freeLabel, free));
	lines.push(measured ? t("Total medido na última resposta; as partes são estimadas.", "Total medido en la última respuesta; las partes son estimadas.", "Total measured on the last response; the parts are estimated.") : t("Sem medição ainda (sessão nova ou recém-compactada): tudo estimado.", "Aún sin medición (sesión nueva o recién compactada): todo estimado.", "No measurement yet (new or just-compacted session): all estimated."));
	return lines.join("\n");
}

export default function (pink: any) {
	if (process.env.PINK_SUBAGENT) return;
	pink.registerCommand("context", {
		description: t("Mostra o que ocupa o contexto: prompt, ferramentas, AGENTS.md, memória, skills, conversa e espaço livre", "Muestra lo que ocupa el contexto: prompt, herramientas, AGENTS.md, memoria, skills, conversación y espacio libre", "Shows what fills the context: prompt, tools, AGENTS.md, memory, skills, conversation and free space"),
		handler: async (_args: string, ctx: any) => {
			const options = ctx.getSystemPromptOptions?.() ?? {};
			const active = new Set<string>(pink.getActiveTools?.() ?? []);
			const usage = ctx.getContextUsage?.();
			const branch = ctx.sessionManager?.getBranch?.() ?? [];
			const result = breakdown({
				system: ctx.getSystemPrompt?.() ?? "",
				contextFiles: options.contextFiles,
				sections: options.sections,
				skills: options.skills,
				tools: (pink.getAllTools?.() ?? []).filter((tool: any) => active.has(tool.name)),
				usageTokens: usage?.tokens,
				window: usage?.contextWindow ?? ctx.model?.contextWindow,
				conversationEstimate: conversationEstimate(branch),
			});
			ctx.ui.notify(render(result), "info");
		},
	});
}
