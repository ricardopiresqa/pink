// Agentes instalados na máquina como subagentes do Pink (owner 2026-11-23, card 1dfwh7kgf8g), como o OpenBot faz: o Pink
// roda o programa oficial no modo para outros programas e lê o que ele escreve. Login, cota e histórico são os do próprio
// programa; o Pink não lê credencial nenhuma. Agora só o Claude Code (claude -p --output-format stream-json); Codex e ACP
// vêm nos cards seguintes.
// Copiado para examples/extensions/subagent/external.ts pelo build (rebrand.json); agents.ts e index.ts o importam.
import fs from "node:fs";
import path from "node:path";

export interface ExternalAgent {
	name: string;
	description: string;
	systemPrompt: string;
	source: "builtin";
	filePath: string;
	external: "claude";
	command: string;
}

// shortcut: só o executável nativo (claude.exe do instalador oficial); o claude.cmd do npm precisaria de shell no Windows
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = fs.existsSync, platform = process.platform): string | undefined {
	const file = platform === "win32" ? `${name}.exe` : name;
	for (const dir of (env.PATH ?? env.Path ?? "").split(path.delimiter)) {
		if (!dir) continue;
		const full = path.join(dir.replace(/^"|"$/g, ""), file);
		if (exists(full)) return full;
	}
	return undefined;
}

export function externalAgents(env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = fs.existsSync, platform = process.platform): ExternalAgent[] {
	const claude = findOnPath("claude", env, exists, platform);
	return claude
		? [
				{
					name: "claude",
					description: "Claude Code installed on this machine: it runs with the person's own Claude login and quota, with its own tools and context. Use it when the person asks for Claude or for a second opinion from another model.",
					systemPrompt: "",
					source: "builtin",
					filePath: claude,
					external: "claude",
					command: claude,
				},
			]
		: [];
}

// "--" antes da tarefa: uma tarefa que começa com "-" não vira opção do claude
export function externalInvocation(agent: { command: string }, task: string): { command: string; args: string[] } {
	return { command: agent.command, args: ["-p", "--output-format", "stream-json", "--verbose", "--", task] };
}

const NEEDS_LOGIN = /log ?in|auth|api key|credential|unauthori[sz]ed|401/i;

// um evento do stream-json do Claude vira mensagens no formato do subagente do Pink (texto e ferramentas na tela,
// uso e erro no resultado)
export function applyExternalEvent(event: any, result: any, emit: () => void): void {
	if (event?.type === "system" && event.subtype === "init") {
		if (typeof event.model === "string") result.model = event.model;
		return;
	}
	if (event?.type === "assistant" && Array.isArray(event.message?.content)) {
		const content = event.message.content
			.map((part: any) =>
				part?.type === "text" && typeof part.text === "string"
					? { type: "text", text: part.text }
					: part?.type === "tool_use"
						? { type: "toolCall", id: String(part.id ?? ""), name: String(part.name ?? "tool"), arguments: part.input && typeof part.input === "object" ? part.input : {} }
						: undefined,
			)
			.filter(Boolean);
		if (!content.length) return;
		result.messages.push({ role: "assistant", content, model: result.model, stopReason: "toolUse" });
		emit();
		return;
	}
	if (event?.type === "result") {
		const usage = event.usage ?? {};
		result.usage.input += (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
		result.usage.output += usage.output_tokens || 0;
		result.usage.cacheRead += usage.cache_read_input_tokens || 0;
		result.usage.turns += event.num_turns || 0; // o custo fica 0: no plano do Claude o total_cost_usd é estimativa, não cobrança
		const text = typeof event.result === "string" ? event.result : "";
		if (event.is_error) {
			result.stopReason = "error";
			result.errorMessage = (text || String(event.subtype ?? "error")) + (NEEDS_LOGIN.test(text) ? "\n\nAbra o claude no terminal e faça login; o Pink usa o login dele." : "");
		} else {
			result.stopReason = "stop";
			const last = [...result.messages].reverse().find((msg: any) => msg.role === "assistant");
			const lastText = last?.content?.find((part: any) => part.type === "text")?.text;
			// a resposta final é o "result"; só entra de novo se ainda não for o último texto da tela
			if (text && lastText !== text) result.messages.push({ role: "assistant", content: [{ type: "text", text }], model: result.model, stopReason: "stop" });
		}
		emit();
	}
}
