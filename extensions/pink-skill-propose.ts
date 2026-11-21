// Propor skill a partir do que deu certo (owner 2026-11-19, card 1dfwh7kfzxx), como o Hermes: /skill-nova [assunto] pede ao
// agente um rascunho do procedimento que funcionou nesta sessão e ele chama skill_propose. A ferramenta mostra o SKILL.md
// inteiro e só grava com o ok da pessoa: em <pasta do agente>/skills (vale em todo projeto) ou, em pasta confiável, em
// .pink/skills do projeto. Nunca sobrescreve; sem tela (headless, subagente) não grava. Usar já: /reload (ou nova sessão).
import { t } from "./pink-i18n.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Type } from "typebox";

export const agentDir = (env = process.env) => env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent");
export const MAX_BODY = 32 * 1024;
const MAX_DESCRIPTION = 1024; // limites e regra de nome da base (core/skills.js), senão a base ignora a skill

export function validName(name: string): string | undefined {
	if (!name || name.length > 64) return t("name: de 1 a 64 caracteres", "name: de 1 a 64 caracteres", "name: 1 to 64 characters");
	if (!/^[a-z0-9-]+$/.test(name)) return t("name: só letras minúsculas, números e hífen", "name: solo letras minúsculas, números y guion", "name: only lowercase letters, numbers and hyphens");
	if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) return t("name: sem hífen no começo, no fim ou repetido", "name: sin guion al principio, al final ni repetido", "name: no hyphen at the start, at the end or repeated");
	return undefined;
}

// mesma lista da memória: recusa a mais é preferível a gravar um segredo numa skill que vai para o prompt
const SECRET = [
	/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/,
	/(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}/,
	/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}/,
	/(?<![A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]{10,}/,
	/(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{30,}/,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/,
	/(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
	/Bearer\s+[A-Za-z0-9._~+/-]{20,}/i,
	/:\/\/[^/\s:@]+:[^/\s@]+@/,
	/(?:api[_-]?key|access[_-]?token|secret|password|passwd|senha|token)["']?\s*[:=]\s*["']?[^\s"']{8,}/i,
];
export const looksSecret = (text: string) => SECRET.some((re) => re.test(text));
// o que a tela esconde ou disfarça e o modelo lê normal: controles (menos \t, \n e \r), bidi, largura zero, separadores de linha
export const HIDDEN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

// description entre aspas duplas de JSON, que também é YAML válido
export const renderSkill = (name: string, description: string, body: string) =>
	`---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`;

// o caminho, resolvido pelo trecho que já existe (links seguidos), fica dentro da pasta do projeto
export function insideReal(cwd: string, target: string): boolean {
	let existing = target;
	while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
	try {
		const relative = path.relative(fs.realpathSync(cwd), fs.realpathSync(existing));
		return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
	} catch {
		return false;
	}
}

export const PREVIEW = 3000;

export type Proposal = { name?: string; description?: string; content?: string; scope?: string };

export function plan(params: Proposal, ctx: any, env = process.env): { error?: string; file?: string; text?: string } {
	const name = String(params?.name ?? "").trim();
	const description = String(params?.description ?? "").trim();
	const body = String(params?.content ?? "").trim();
	const scope = params?.scope === "project" ? "project" : "user";
	const bad = validName(name);
	if (bad) return { error: bad };
	if (!description || description.length > MAX_DESCRIPTION || /[\r\n]/.test(description)) return { error: t(`description: uma linha, até ${MAX_DESCRIPTION} caracteres, dizendo quando usar a skill`, `description: una línea, hasta ${MAX_DESCRIPTION} caracteres, diciendo cuándo usar la skill`, `description: one line, up to ${MAX_DESCRIPTION} characters, saying when to use the skill`) };
	if (!body) return { error: t("content: os passos da skill", "content: los pasos de la skill", "content: the steps of the skill") };
	if (body.length > MAX_BODY) return { error: t(`content: até ${MAX_BODY / 1024} KB`, `content: hasta ${MAX_BODY / 1024} KB`, `content: up to ${MAX_BODY / 1024} KB`) };
	if (HIDDEN.test(description) || HIDDEN.test(body)) return { error: t("a skill tem caractere invisível ou de controle (ANSI, bidi, largura zero): tire e proponha de novo", "la skill tiene un carácter invisible o de control (ANSI, bidi, ancho cero): quítalo y propón de nuevo", "the skill has an invisible or control character (ANSI, bidi, zero width): remove it and propose again") };
	if (looksSecret(`${description}\n${body}`)) return { error: t("a skill parece conter um segredo (chave, token, senha): tire e proponha de novo", "la skill parece contener un secreto (clave, token, contraseña): quítalo y propón de nuevo", "the skill seems to contain a secret (key, token, password): remove it and propose again") };
	let root: string;
	if (scope === "project") {
		if (ctx?.isProjectTrusted?.() !== true) return { error: t("pasta não confiável: skill do projeto não é gravada; proponha com scope user", "carpeta no confiable: la skill del proyecto no se guarda; propón con scope user", "untrusted folder: project skill not saved; propose with scope user") };
		const cwd = ctx?.cwd ?? process.cwd();
		root = path.join(cwd, ".pink", "skills");
		if (!insideReal(cwd, root)) return { error: t(".pink ou .pink/skills aponta para fora do projeto (link): a skill não é gravada", ".pink o .pink/skills apunta fuera del proyecto (enlace): la skill no se guarda", ".pink or .pink/skills points outside the project (link): the skill is not saved") };
	} else root = path.join(agentDir(env), "skills");
	const file = path.join(root, name, "SKILL.md");
	if (fs.existsSync(path.dirname(file))) return { error: t(`já existe uma skill ${name} em ${path.dirname(file)}: escolha outro nome`, `ya existe una skill ${name} en ${path.dirname(file)}: elige otro nombre`, `a skill ${name} already exists in ${path.dirname(file)}: choose another name`) };
	return { file, text: renderSkill(name, description, body) };
}

export function proposeTool(env = process.env) {
	const reply = (text: string, isError = false) => ({ content: [{ type: "text", text }], details: undefined, isError });
	return {
		name: "skill_propose",
		label: "skill_propose",
		description:
			"Propose a reusable skill (SKILL.md) from a procedure that worked in this session. The user sees the full file and must approve before it is written; never overwrites. Use only when the user asked for it (/skill-nova) or agreed to it.",
		parameters: Type.Object({
			name: Type.String({ description: "kebab-case, lowercase a-z, 0-9 and hyphens, up to 64 (also the /name to call it)" }),
			description: Type.String({ description: "one line: what it does and when to use it (the model loads the skill by this)" }),
			content: Type.String({ description: "markdown body: when to use, the steps that worked, checks and pitfalls; no secrets" }),
			scope: Type.Optional(Type.Union([Type.Literal("user"), Type.Literal("project")], { description: "user (default, every project) or project (.pink/skills, trusted folder only)" })),
		}),
		async execute(_id: string, params: any, _signal?: AbortSignal, _onUpdate?: any, ctx?: any) {
			const found = plan(params, ctx, env);
			if (found.error) return reply(found.error, true);
			if (!ctx?.hasUI || typeof ctx?.ui?.confirm !== "function") return reply(t("Sem tela para a pessoa aprovar: a skill não foi gravada. Mostre o rascunho e peça para rodar /skill-nova numa sessão interativa.", "Sin pantalla para que la persona apruebe: la skill no se guardó. Muestra el borrador y pide ejecutar /skill-nova en una sesión interactiva.", "No screen for the person to approve: the skill was not saved. Show the draft and ask to run /skill-nova in an interactive session."), true);
			ctx.ui.notify(t(`Skill proposta (${found.file}):\n\n${found.text}`, `Skill propuesta (${found.file}):\n\n${found.text}`, `Skill proposed (${found.file}):\n\n${found.text}`), "info");
			// o próprio pedido de ok traz o texto: o aviso acima pode rolar ou sumir, e a skill vale em toda sessão futura
			const text = found.text as string;
			const project = params?.scope === "project"; // o mesmo critério do plan: qualquer outro valor é da pessoa
			const shown = text.length > PREVIEW ? `${text.slice(0, PREVIEW)}\n${t(`… mais ${text.length - PREVIEW} caracteres (o arquivo inteiro está no aviso acima)`, `… ${text.length - PREVIEW} caracteres más (el archivo entero está en el aviso de arriba)`, `… ${text.length - PREVIEW} more characters (the whole file is in the notice above)`)}` : text;
			const ok = await ctx.ui.confirm(t(`Gravar a skill ${params.name}?`, `¿Guardar la skill ${params.name}?`, `Save the skill ${params.name}?`), t(`Vai para ${found.file} e a descrição entra no prompt de toda sessão${project ? " deste projeto" : ""}.\n\n${shown}`, `Va a ${found.file} y la descripción entra en el prompt de toda sesión${project ? " de este proyecto" : ""}.\n\n${shown}`, `It goes to ${found.file} and the description enters the prompt of every session${project ? " of this project" : ""}.\n\n${shown}`));
			if (!ok) return reply("A pessoa não aprovou: nada foi gravado. Pergunte o que mudar, se ela quiser.");
			// a pessoa pode demorar no ok: confere de novo que nada virou link para fora do projeto nesse meio tempo
			if (project && !insideReal(ctx?.cwd ?? process.cwd(), path.dirname(found.file as string))) return reply(t(".pink/skills passou a apontar para fora do projeto: nada foi gravado.", ".pink/skills pasó a apuntar fuera del proyecto: no se guardó nada.", ".pink/skills now points outside the project: nothing was saved."), true);
			try {
				fs.mkdirSync(path.dirname(found.file as string), { recursive: true });
				fs.writeFileSync(found.file as string, found.text as string, { flag: "wx" }); // wx: não sobrescreve nem numa corrida
			} catch (error) {
				return reply(t(`Não gravei: ${(error as Error)?.message ?? error}`, `No guardé: ${(error as Error)?.message ?? error}`, `Not saved: ${(error as Error)?.message ?? error}`), true);
			}
			return reply(`Skill gravada em ${found.file}. Para usar já nesta sessão: /reload e depois /${params.name}; nas próximas sessões ela carrega sozinha.`);
		},
	};
}

export const PROPOSE_PROMPT = (topic: string) =>
	[
		`Olhe o que deu certo nesta sessão${topic ? ` sobre: ${topic}` : ""} e transforme o procedimento numa skill reutilizável.`,
		"Escreva só o que foi feito e funcionou (passos, comandos, verificações, armadilhas), sem inventar e sem segredos.",
		"Chame a ferramenta skill_propose com name (kebab-case), description (uma linha: o que faz e quando usar) e content (markdown).",
		"Use scope project só se for específico deste repositório. A pessoa vê o arquivo e aprova antes de gravar; se não houver nada que valha uma skill, diga isso e não chame a ferramenta.",
	].join("\n");

export default function (pink: any) {
	if (process.env.PINK_SUBAGENT) return; // subagente não tem tela para a pessoa aprovar
	pink.registerTool(proposeTool());
	pink.registerCommand("skill-nova", {
		description: t("Propõe uma skill a partir do que deu certo nesta sessão (você vê e aprova antes de gravar): /skill-nova [assunto]", "Propone una skill a partir de lo que funcionó en esta sesión (tú lo ves y apruebas antes de guardar): /skill-nova [asunto]", "Proposes a skill from what worked in this session (you see and approve it before it is saved): /skill-nova [topic]"),
		handler: async (args: string, ctx: any) => {
			const prompt = PROPOSE_PROMPT(String(args ?? "").trim());
			if (ctx?.isIdle?.() === false) pink.sendUserMessage?.(prompt, { deliverAs: "followUp" });
			else pink.sendUserMessage?.(prompt);
		},
	});
}
