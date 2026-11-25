// Microfone opcional (owner 2026-11-25): o botão "◉ falar" na caixa de digitar grava, a fala vira texto ao vivo na caixa,
// e "‖ pausar", "■ parar" (o texto fica na caixa) e "➤ enviar" (manda ao agente). Mesmo modelo do OpenBot: NVIDIA Parakeet
// TDT 0.6B v3 int8 (CC-BY-4.0), rodando local com o sherpa-onnx; o áudio nunca sai da máquina.
// Nada vem instalado: /microfone instalar (com o ok da pessoa) põe em ~/.pink/agent/microfone o motor (sherpa-onnx-node e
// decibri, pelo npm ci do lock que vem com o Pink, conferido pelo sha512 de cada pacote) e o modelo (GitHub oficial do
// sherpa-onnx, conferido pelo SHA-256). O VAD (Silero) é o que vem dentro do decibri.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Choice, choose, completeFrom, t } from "./pink-i18n.ts";

export const MODEL = {
	name: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
	url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
	sha256: "1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9",
	bytes: 487211443,
};
export const MODEL_FILES = ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"];
export const ENGINE = ["sherpa-onnx-node", "decibri"];
export const SAMPLE_RATE = 16000;
const WINDOW = 512; // o Silero VAD lê janelas de 512 amostras a 16 kHz
const PARTIAL_MS = 1200; // de quanto em quanto tempo a fala em curso é transcrita de novo (o texto "ao vivo")
export const SIZE_MB = 530; // motor (~42 MB) + modelo (~465 MB), para a pergunta de instalar

export const micDir = (env = process.env) => path.join(env.PINK_CODING_AGENT_DIR || path.join(os.homedir(), ".pink", "agent"), "microfone");
const modelDir = (env = process.env) => path.join(micDir(env), "model");
const vadModel = (env = process.env) => path.join(micDir(env), "node_modules", "decibri", "models", "silero_vad.onnx");

export function installed(env = process.env, exists = fs.existsSync): boolean {
	const dir = micDir(env);
	return ENGINE.every((name) => exists(path.join(dir, "node_modules", name, "package.json"))) && MODEL_FILES.every((name) => exists(path.join(modelDir(env), name))) && exists(vadModel(env));
}

const lockFile = () => path.join(path.dirname(fileURLToPath(import.meta.url)), "pink-microfone-lock.json");

type Fetch = (url: string, init?: any) => Promise<any>;
type Sync = typeof spawnSync;

// o modelo baixado vai para o disco enquanto o hash é calculado (são ~465 MB: nada de guardar tudo na memória)
async function download(url: string, file: string, fetcher: Fetch, progress?: (percent: number) => void): Promise<string> {
	const response = await fetcher(url, { redirect: "follow", signal: AbortSignal.timeout(30 * 60_000) });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const hash = crypto.createHash("sha256");
	const out = fs.createWriteStream(file);
	let got = 0;
	let shown = -1;
	try {
		for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
			got += chunk.length;
			if (got > MODEL.bytes * 1.05) throw new Error(t("o download é maior que o esperado", "la descarga es más grande de lo esperado", "the download is larger than expected"));
			hash.update(chunk);
			if (!out.write(chunk)) await new Promise((done) => out.once("drain", done));
			const percent = Math.floor((got / MODEL.bytes) * 10) * 10;
			if (percent !== shown) progress?.((shown = percent));
		}
	} finally {
		await new Promise((done) => out.end(done));
	}
	return hash.digest("hex");
}

export async function install({ env = process.env, fetcher = globalThis.fetch as unknown as Fetch, sync = spawnSync as Sync, progress = undefined as ((text: string) => void) | undefined } = {}): Promise<string> {
	const dir = micDir(env);
	const fail = (why: string) => t(`Microfone: ${why}; não instalei nada.`, `Micrófono: ${why}; no instalé nada.`, `Microphone: ${why}; nothing was installed.`);
	fs.mkdirSync(dir, { recursive: true });
	for (const old of fs.readdirSync(dir)) if (old.startsWith("baixando-")) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
	const work = fs.mkdtempSync(path.join(dir, "baixando-"));
	try {
		// 1) o motor: package.json + package-lock.json do Pink e npm ci (sem scripts de instalação)
		const { package: pkg, lock } = JSON.parse(fs.readFileSync(lockFile(), "utf8"));
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
		fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lock, null, 2));
		progress?.(t("Microfone: instalando o motor (sherpa-onnx e decibri)…", "Micrófono: instalando el motor (sherpa-onnx y decibri)…", "Microphone: installing the engine (sherpa-onnx and decibri)…"));
		// argumentos fixos; no Windows o npm é um .cmd, que só roda pelo shell
		const npm = sync("npm", ["ci", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"], { cwd: dir, shell: process.platform === "win32", windowsHide: true, timeout: 10 * 60_000, encoding: "utf8" });
		if (npm.status !== 0) return fail(t(`o npm ci falhou (${String(npm.stderr || npm.error?.message || "").trim().slice(-200)})`, `npm ci falló (${String(npm.stderr || npm.error?.message || "").trim().slice(-200)})`, `npm ci failed (${String(npm.stderr || npm.error?.message || "").trim().slice(-200)})`));
		// 2) o modelo: baixado uma vez; reinstalar só o motor não baixa de novo
		const marker = path.join(modelDir(env), ".sha256");
		const have = fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === MODEL.sha256 && MODEL_FILES.every((name) => fs.existsSync(path.join(modelDir(env), name)));
		if (!have) {
			const archive = path.join(work, "model.tar.bz2");
			const sum = await download(MODEL.url, archive, fetcher, (percent) => progress?.(t(`Microfone: baixando o modelo Parakeet… ${percent}%`, `Micrófono: descargando el modelo Parakeet… ${percent}%`, `Microphone: downloading the Parakeet model… ${percent}%`)));
			if (sum !== MODEL.sha256) return fail(t("o modelo baixado não bate com o SHA-256 conferido", "el modelo descargado no coincide con el SHA-256 verificado", "the downloaded model does not match the verified SHA-256"));
			progress?.(t("Microfone: extraindo o modelo…", "Micrófono: extrayendo el modelo…", "Microphone: extracting the model…"));
			const tar = sync("tar", ["-xjf", archive, "-C", work], { windowsHide: true, timeout: 10 * 60_000 });
			const extracted = path.join(work, MODEL.name);
			if (tar.status !== 0 || !MODEL_FILES.every((name) => fs.existsSync(path.join(extracted, name)))) return fail(t("não consegui extrair o modelo", "no pude extraer el modelo", "could not extract the model"));
			fs.rmSync(modelDir(env), { recursive: true, force: true });
			fs.renameSync(extracted, modelDir(env));
			fs.writeFileSync(marker, MODEL.sha256);
		}
		if (!installed(env)) return fail(t("a pasta ficou incompleta", "la carpeta quedó incompleta", "the folder is incomplete"));
		return t(`Microfone instalado em ${dir}. O botão "◉ falar" aparece na caixa de digitar (tela cheia).`, `Micrófono instalado en ${dir}. El botón "◉ hablar" aparece en la caja de texto (pantalla completa).`, `Microphone installed in ${dir}. The "◉ talk" button shows in the input box (fullscreen).`);
	} catch (error: any) {
		return fail(String(error?.message ?? error).slice(0, 200));
	} finally {
		fs.rmSync(work, { recursive: true, force: true });
	}
}

// PCM Int16 little-endian (o que o decibri entrega) para Float32 entre -1 e 1 (o que o sherpa-onnx lê)
export function toFloat(chunk: Uint8Array): Float32Array {
	const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
	const out = new Float32Array(Math.floor(chunk.byteLength / 2));
	for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
	return out;
}

export const joinText = (...parts: string[]) => parts.map((part) => part.trim()).filter(Boolean).join(" ");

type Engine = { sherpa: any; decibri: any };
export const loadEngine = (env = process.env): Engine => {
	const req = createRequire(path.join(micDir(env), "package.json"));
	return { sherpa: req("sherpa-onnx-node"), decibri: req("decibri") };
};

export type Editor = { getText(): string; setText(text: string): void; handleInput(data: string): void };
export type MicState = "off" | "loading" | "rec" | "paused" | "finishing";

export function createMicrofone({ env = process.env, load = loadEngine, now = Date.now, every = setInterval as (fn: () => void, ms: number) => any, stopEvery = clearInterval as (id: any) => void } = {}) {
	let state: MicState = "off";
	let error = "";
	let recognizer: Promise<any> | undefined;
	let engine: Engine | undefined;
	let mic: any, vad: any, timer: any;
	let editor: Editor | undefined;
	let redraw = () => {};
	let base = "", committed = "", partial = "";
	let pending = new Float32Array(0);
	let speech: Float32Array[] = [];
	let queue: Promise<void> = Promise.resolve();
	let decoding = false;
	let startedAt = 0, elapsed = 0, lastPartial = 0;

	const show = () => {
		editor?.setText(joinText(base, committed, partial));
		redraw();
	};
	const recognizerFor = (e: Engine) =>
		(recognizer ??= e.sherpa.OfflineRecognizer.createAsync({
			featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
			modelConfig: {
				transducer: { encoder: path.join(modelDir(env), "encoder.int8.onnx"), decoder: path.join(modelDir(env), "decoder.int8.onnx"), joiner: path.join(modelDir(env), "joiner.int8.onnx") },
				tokens: path.join(modelDir(env), "tokens.txt"),
				numThreads: Math.max(1, Math.min(4, (os.cpus?.().length ?? 2) - 1)),
				provider: "cpu",
				modelType: "nemo_transducer",
				debug: 0,
			},
		}));
	const decode = async (samples: Float32Array) => {
		const rec = await recognizerFor(engine!);
		const stream = rec.createStream();
		stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
		await rec.decodeAsync(stream);
		return String(rec.getResult(stream)?.text ?? "").trim();
	};
	// trechos fechados pelo VAD viram texto definitivo, um de cada vez e na ordem da fala
	const drain = () => {
		while (vad && !vad.isEmpty()) {
			const samples = Float32Array.from(vad.front(false).samples);
			vad.pop();
			speech = [];
			queue = queue.then(async () => {
				const text = await decode(samples);
				committed = joinText(committed, text);
				partial = "";
				show();
			});
		}
	};
	// a fala em curso, transcrita de novo a cada PARTIAL_MS: é o texto que aparece enquanto a pessoa ainda fala
	const livePreview = () => {
		if (decoding || state !== "rec" || !vad?.isDetected?.() || now() - lastPartial < PARTIAL_MS) return;
		const total = speech.reduce((sum, part) => sum + part.length, 0);
		if (total < SAMPLE_RATE / 2) return;
		lastPartial = now();
		const joined = new Float32Array(total);
		let at = 0;
		for (const part of speech) joined.set(part, (at += part.length) - part.length);
		decoding = true;
		decode(joined)
			.then((text) => {
				if (state === "rec" || state === "paused") (partial = text), show();
			})
			.catch(() => {})
			.finally(() => (decoding = false));
	};
	const feed = (chunk: Uint8Array) => {
		if (state !== "rec") return;
		const samples = toFloat(chunk);
		const all = new Float32Array(pending.length + samples.length);
		all.set(pending);
		all.set(samples, pending.length);
		let at = 0;
		for (; at + WINDOW <= all.length; at += WINDOW) {
			const window = all.subarray(at, at + WINDOW);
			vad.acceptWaveform(window);
			if (vad.isDetected()) speech.push(Float32Array.from(window));
		}
		pending = all.slice(at);
		drain();
		livePreview();
	};
	const fault = (why: string) => {
		error = why;
		close();
		state = "off";
		redraw();
	};
	const openMic = () => {
		mic = new engine!.decibri.Microphone({ sampleRate: SAMPLE_RATE, channels: 1 });
		mic.on("data", feed);
		mic.on("error", (e: any) => fault(t(`o microfone falhou (${e?.message ?? e})`, `el micrófono falló (${e?.message ?? e})`, `the microphone failed (${e?.message ?? e})`)));
	};
	const close = () => {
		try {
			mic?.stop?.();
		} catch {}
		mic = undefined;
		if (timer) stopEvery(timer), (timer = undefined);
	};
	const seconds = () => Math.floor((elapsed + (state === "rec" ? now() - startedAt : 0)) / 1000);

	async function start(target: Editor, draw: () => void) {
		if (state !== "off") return;
		if (!installed(env)) return void (error = t("o microfone não está instalado (/microfone instalar)", "el micrófono no está instalado (/microfone instalar)", "the microphone is not installed (/microfone instalar)"));
		editor = target;
		redraw = draw;
		error = "";
		state = "loading";
		redraw();
		try {
			engine ??= load(env);
			await recognizerFor(engine);
			vad = new engine.sherpa.Vad({ sileroVad: { model: vadModel(env), threshold: 0.5, minSilenceDuration: 0.5, minSpeechDuration: 0.25, windowSize: WINDOW, maxSpeechDuration: 20 }, sampleRate: SAMPLE_RATE, numThreads: 1, debug: 0 }, 60);
		} catch (e: any) {
			recognizer = undefined;
			return fault(t(`não consegui carregar o modelo (${String(e?.message ?? e).slice(0, 160)})`, `no pude cargar el modelo (${String(e?.message ?? e).slice(0, 160)})`, `could not load the model (${String(e?.message ?? e).slice(0, 160)})`));
		}
		base = editor.getText();
		committed = partial = "";
		pending = new Float32Array(0);
		speech = [];
		elapsed = 0;
		startedAt = now();
		state = "rec";
		try {
			openMic();
		} catch (e: any) {
			return fault(t(`não consegui abrir o microfone (${e?.message ?? e})`, `no pude abrir el micrófono (${e?.message ?? e})`, `could not open the microphone (${e?.message ?? e})`));
		}
		timer = every(() => redraw(), 1000);
		timer?.unref?.();
		redraw();
	}
	function pause() {
		if (state !== "rec") return;
		elapsed += now() - startedAt;
		state = "paused";
		close();
		redraw();
	}
	function resume() {
		if (state !== "paused" || !engine) return;
		startedAt = now();
		state = "rec";
		openMic();
		timer = every(() => redraw(), 1000);
		timer?.unref?.();
		redraw();
	}
	// para de gravar e espera o último trecho virar texto; o texto fica na caixa
	async function stop() {
		if (state !== "rec" && state !== "paused") return;
		if (state === "rec") elapsed += now() - startedAt;
		state = "finishing";
		close();
		redraw();
		if (vad) {
			if (pending.length) vad.acceptWaveform(pending), (pending = new Float32Array(0));
			vad.flush();
			drain();
		}
		await queue.catch(() => {});
		partial = "";
		show();
		vad = undefined;
		state = "off";
		redraw();
	}
	async function send() {
		await stop();
		if (editor && editor.getText().trim()) editor.handleInput("\r");
	}
	async function act(action: string, target: Editor, draw: () => void) {
		if (action === "start") return start(target, draw);
		if (action === "pause") return pause();
		if (action === "resume") return resume();
		if (action === "stop") return stop();
		if (action === "send") return send();
	}
	const view = () => ({ installed: installed(env), state, seconds: seconds(), error });
	return { act, view, start, pause, resume, stop, send, shutdown: () => (close(), (state = "off")) };
}

// os botões da caixa de digitar: texto já colorido e, para o clique, a coluna de cada um (de `from` até antes de `to`)
export function micBar(theme: any, view: { installed: boolean; state: MicState; seconds: number }) {
	if (!view.installed) return undefined;
	const clock = `${Math.floor(view.seconds / 60)}:${String(view.seconds % 60).padStart(2, "0")}`;
	const items: [string, string, string | undefined][] =
		view.state === "off"
			? [["accent", t("◉ falar", "◉ hablar", "◉ talk"), "start"]]
			: view.state === "loading"
				? [["dim", t("◌ carregando…", "◌ cargando…", "◌ loading…"), undefined]]
				: view.state === "finishing"
					? [["dim", t("◌ transcrevendo…", "◌ transcribiendo…", "◌ transcribing…"), undefined]]
					: [
							view.state === "rec" ? ["error", `● ${clock}`, undefined] : ["muted", `◌ ${clock}`, undefined],
							view.state === "rec" ? ["text", t("‖ pausar", "‖ pausar", "‖ pause"), "pause"] : ["text", t("▶ continuar", "▶ seguir", "▶ resume"), "resume"],
							["text", t("■ parar", "■ parar", "■ stop"), "stop"],
							["accent", t("➤ enviar", "➤ enviar", "➤ send"), "send"],
						];
	let text = "";
	let col = 0;
	const spans: { from: number; to: number; action: string }[] = [];
	for (const [color, label, action] of items) {
		if (text) (text += "  "), (col += 2);
		text += theme.fg(color, label);
		if (action) spans.push({ from: col, to: col + [...label].length, action });
		col += [...label].length;
	}
	return { text, spans };
}

const MIC_CHOICES = (): Choice[] => [
	{ value: "status", description: t("está instalado? onde?", "¿está instalado? ¿dónde?", "is it installed? where?") },
	{ value: "falar", description: t("começa a gravar; o texto vai para a caixa", "empieza a grabar; el texto va a la caja", "starts recording; the text goes to the box") },
	{ value: "parar", description: t("para de gravar e deixa o texto na caixa", "deja de grabar y deja el texto en la caja", "stops recording and leaves the text in the box") },
	{ value: "instalar", description: t(`baixa ~${SIZE_MB} MB, uma vez`, `descarga ~${SIZE_MB} MB, una vez`, `downloads ~${SIZE_MB} MB, once`) },
];

export default function (pink: any) {
	const microfone = createMicrofone();
	Reflect.set(globalThis, "__pinkMicrofone", microfone);
	pink.registerCommand("microfone", {
		description: t("Microfone para ditar (opcional): falar, parar, instalar ou status", "Micrófono para dictar (opcional): falar, parar, instalar o status", "Microphone for dictation (optional): falar (talk), parar (stop), instalar (install) or status"),
		getArgumentCompletions: completeFrom(MIC_CHOICES),
		handler: async (args: string, ctx: any) => {
			let verb: string | undefined = String(args ?? "").trim().split(/\s+/)[0];
			if (!verb && (verb = await choose(ctx, "/microfone", MIC_CHOICES())) === undefined) return;
			if (verb === "falar" || verb === "talk") {
				// pelo comando também (o botão "◉ falar" só aparece na tela cheia); a caixa de digitar se registra ao desenhar
				const target = (globalThis as any).__pinkMicTarget;
				if (!target?.editor) return ctx.ui.notify(t("A caixa de digitar do Pink não está aberta.", "La caja de texto de Pink no está abierta.", "Pink's input box is not open."), "warning");
				await microfone.act("start", target.editor, target.redraw);
				const why = microfone.view().error;
				return ctx.ui.notify(why ? t(`Microfone: ${why}`, `Micrófono: ${why}`, `Microphone: ${why}`) : t("Gravando: fale. /microfone parar deixa o texto na caixa.", "Grabando: habla. /microfone parar deja el texto en la caja.", "Recording: speak. /microfone parar leaves the text in the box."), why ? "error" : "info");
			}
			if (verb === "parar" || verb === "stop") {
				if (microfone.view().state === "off") return ctx.ui.notify(t("O microfone não está gravando.", "El micrófono no está grabando.", "The microphone is not recording."), "info");
				await microfone.stop();
				return ctx.ui.notify(t("Gravação parada; o texto ficou na caixa.", "Grabación detenida; el texto quedó en la caja.", "Recording stopped; the text stayed in the box."), "info");
			}
			if (verb === "instalar" || verb === "install") {
				if (microfone.view().state !== "off") return ctx.ui.notify(t("Pare a gravação antes de reinstalar.", "Detén la grabación antes de reinstalar.", "Stop recording before reinstalling."), "warning");
				const ok = await ctx.ui.confirm(
					t("Instalar o microfone do Pink?", "¿Instalar el micrófono de Pink?", "Install Pink's microphone?"),
					t(
						`Baixa ~${SIZE_MB} MB, uma vez, para ${micDir()}:\n• motor: sherpa-onnx-node 2.0.1 e decibri 5.8.0 (Apache-2.0), pelo npm, conferidos pelo sha512\n• modelo: NVIDIA Parakeet TDT 0.6B v3 int8 (CC-BY-4.0), do GitHub do sherpa-onnx, conferido pelo SHA-256 ${MODEL.sha256.slice(0, 16)}…\nA transcrição roda nesta máquina; o áudio não sai dela.`,
						`Descarga ~${SIZE_MB} MB, una vez, en ${micDir()}:\n• motor: sherpa-onnx-node 2.0.1 y decibri 5.8.0 (Apache-2.0), por npm, verificados por sha512\n• modelo: NVIDIA Parakeet TDT 0.6B v3 int8 (CC-BY-4.0), del GitHub de sherpa-onnx, verificado por el SHA-256 ${MODEL.sha256.slice(0, 16)}…\nLa transcripción corre en esta máquina; el audio no sale de ella.`,
						`Downloads ~${SIZE_MB} MB, once, to ${micDir()}:\n• engine: sherpa-onnx-node 2.0.1 and decibri 5.8.0 (Apache-2.0), via npm, verified by sha512\n• model: NVIDIA Parakeet TDT 0.6B v3 int8 (CC-BY-4.0), from sherpa-onnx's GitHub, verified by SHA-256 ${MODEL.sha256.slice(0, 16)}…\nTranscription runs on this machine; the audio never leaves it.`,
					),
				);
				if (!ok) return ctx.ui.notify(t("Instalação cancelada.", "Instalación cancelada.", "Installation cancelled."), "info");
				const done = await install({ progress: (text) => ctx.ui.notify(text, "info") });
				return ctx.ui.notify(done, installed() ? "info" : "error");
			}
			const view = microfone.view();
			ctx.ui.notify(
				view.installed
					? t(`Microfone instalado em ${micDir()}. Clique em "◉ falar" na caixa de digitar (tela cheia).${view.error ? ` Último erro: ${view.error}` : ""}`, `Micrófono instalado en ${micDir()}. Haz clic en "◉ hablar" en la caja de texto (pantalla completa).${view.error ? ` Último error: ${view.error}` : ""}`, `Microphone installed in ${micDir()}. Click "◉ talk" in the input box (fullscreen).${view.error ? ` Last error: ${view.error}` : ""}`)
					: t("Microfone não instalado. Rode /microfone instalar (~530 MB, uma vez).", "Micrófono no instalado. Ejecuta /microfone instalar (~530 MB, una vez).", "Microphone not installed. Run /microfone instalar (~530 MB, once)."),
				"info",
			);
		},
	});
	pink.on("session_shutdown", () => microfone.shutdown());
}
