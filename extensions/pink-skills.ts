// Skills por /nome (owner 2026-11-18, card 1dfwh7kfzff), como no Claude Code. A base 1.4 já faz o resto e é
// reaproveitada: lê SKILL.md de ~/.pink/agent/skills e de <projeto>/.pink/skills (só em pasta confiável), põe nome e
// descrição no prompt para o modelo carregar pelo assunto e expande /skill:nome. Esta extensão só acrescenta:
//   /nome args   vira /skill:nome args quando há uma skill com esse nome
//   /skills      lista as skills com descrição e origem
// O evento input roda depois dos comandos de extensão e antes da expansão de skills e templates (agent-session.prompt);
// os comandos nativos (/model, /new...) são tratados pela interface antes de chegar aqui. Template com o mesmo nome vence.

import { t } from "./pink-i18n.ts";
const NAME = /^\/([a-z0-9][a-z0-9._-]*)(?=\s|$)/i;

type Command = { name: string; description?: string; source: string; sourceInfo?: { scope?: string; path?: string } };

export function skillsOf(commands: Command[]) {
	return commands
		.filter((command) => command.source === "skill" && command.name.startsWith("skill:"))
		.map((command) => ({ name: command.name.slice(6), description: command.description ?? "", scope: command.sourceInfo?.scope ?? "", path: command.sourceInfo?.path ?? "" }));
}

// devolve o texto reescrito, ou undefined para seguir o caminho normal
export function rewrite(text: string, commands: Command[]): string | undefined {
	const match = NAME.exec(text);
	if (!match) return undefined;
	const name = match[1];
	// o nome já é de um template ou de um comando: não sequestra
	if (commands.some((command) => command.source !== "skill" && command.name.toLowerCase() === name.toLowerCase())) return undefined;
	const skill = skillsOf(commands).find((item) => item.name.toLowerCase() === name.toLowerCase());
	if (!skill) return undefined;
	// a base separa nome e argumentos pelo primeiro espaço: quebra de linha ou tab logo após o nome viraria parte dele
	const rest = text.slice(match[0].length).replace(/^\s+/, "");
	return `/skill:${skill.name}${rest ? ` ${rest}` : ""}`;
}

const SCOPE: Record<string, string> = { user: t("usuário", "usuario", "user"), project: t("projeto", "proyecto", "project") };

export default function (pi: any) {
	if (process.env.PINK_SUBAGENT) return;
	const commands = (): Command[] => {
		try {
			return pi.getCommands() ?? [];
		} catch {
			return [];
		}
	};
	// só o que a pessoa digitou (interface ou rpc): texto mandado por outra extensão nunca chama skill por este atalho.
	// shortcut: /nome não segue a configuração enableSkillCommands (a base expande /skill:nome de qualquer jeito)
	pi.on("input", (event: any) => {
		if (typeof event?.text !== "string" || event.source === "extension" || !NAME.test(event.text)) return { action: "continue" };
		const text = rewrite(event.text, commands());
		return text === undefined ? { action: "continue" } : { action: "transform", text };
	});
	pi.registerCommand("skills", {
		description: t("Lista as skills (SKILL.md) desta sessão; chame uma com /nome", "Lista las skills (SKILL.md) de esta sesión; llama una con /nombre", "Lists this session's skills (SKILL.md); call one with /name"),
		handler: async (_args: string, ctx: any) => {
			const skills = skillsOf(commands());
			if (!skills.length) {
				const off = ctx?.isProjectTrusted?.() === false ? t(" As skills do projeto só carregam em pasta confiável.", " Las skills del proyecto solo se cargan en una carpeta de confianza.", " Project skills only load in a trusted folder.") : "";
				return ctx.ui.notify(t(`Nenhuma skill. Crie <pasta>/SKILL.md em ~/.pink/agent/skills ou em .pink/skills do projeto.${off}`, `Ninguna skill. Crea <carpeta>/SKILL.md en ~/.pink/agent/skills o en .pink/skills del proyecto.${off}`, `No skills. Create <folder>/SKILL.md in ~/.pink/agent/skills or in the project's .pink/skills.${off}`), "info");
			}
			const lines = skills.map((skill) => `/${skill.name} (${SCOPE[skill.scope] ?? (skill.scope || t("pacote", "paquete", "package"))}) · ${skill.description}`);
			ctx.ui.notify(`Skills:\n${lines.join("\n")}`, "info");
		},
	});
}
