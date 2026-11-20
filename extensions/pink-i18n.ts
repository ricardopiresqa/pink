// Idioma da interface do Pink (owner 2026-11-20, card 1dfwh7kg5cg): segue o idioma do Windows. Português → pt,
// espanhol → es, qualquer outro → en. PINK_LANG força (testes, ou quem preferir). Cada texto da interface vem como
// t("português", "español", "english") no próprio lugar onde é usado: sem arquivo de chaves para manter em sincronia.
import { spawnSync } from "node:child_process";

export type Lang = "pt" | "es" | "en";

export function pick(tag: string | undefined): Lang {
	const base = String(tag ?? "").trim().toLowerCase().split(/[-_.]/)[0];
	return base === "pt" ? "pt" : base === "es" ? "es" : "en";
}

// Windows: o idioma de exibição preferido do usuário fica em HKCU\Control Panel\International\User Profile (Languages,
// o primeiro da lista). Sem ele (ou fora do Windows), LANG/LC_ALL e por fim o locale do processo.
export function detect(env = process.env, platform = process.platform, sync = spawnSync, intl = () => Intl.DateTimeFormat().resolvedOptions().locale): Lang {
	if (env.PINK_LANG) return pick(env.PINK_LANG);
	if (platform === "win32") {
		try {
			const exe = `${env.SystemRoot || "C:\\Windows"}\\System32\\reg.exe`;
			const out = String(sync(exe, ["query", "HKCU\\Control Panel\\International\\User Profile", "/v", "Languages"], { windowsHide: true, timeout: 3000, encoding: "utf8" }).stdout ?? "");
			const first = out.match(/REG_MULTI_SZ\s+([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/)?.[1];
			if (first) return pick(first);
		} catch {
			/* sem registro: segue */
		}
	}
	const posix = env.LC_ALL || env.LC_MESSAGES || env.LANG;
	if (posix && !/^(C|POSIX)(\.|$)/.test(posix)) return pick(posix);
	try {
		return pick(intl());
	} catch {
		return "en";
	}
}

// uma vez por processo; o build e os testes podem trocar com setLang
let current: Lang | undefined;
export const lang = (): Lang => (current ??= detect());
export const setLang = (value: Lang | undefined) => {
	current = value;
};

export function t(pt: string, es: string, en: string): string {
	const which = lang();
	return which === "pt" ? pt : which === "es" ? es : en;
}

// para os patches do motor (rebrand.json), que não importam módulos: globalThis.__pinkT(pt, es, en)
(globalThis as any).__pinkT = t;
(globalThis as any).__pinkLang = lang;
