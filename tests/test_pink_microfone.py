# ruff: noqa: E501
"""Microfone opcional do Pink (owner 2026-11-25): botões na caixa de digitar, fala vira texto ao vivo, pausar/parar/enviar.

O motor real (sherpa-onnx + decibri + Parakeet) é trocado por um falso com a mesma API: o VAD fecha um trecho quando chega
silêncio e o reconhecedor devolve "fala<décimos de segundo>", então a ordem e o tamanho de cada trecho aparecem no texto.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

DRIVER = r"""
const [micUrl, uiUrl, home] = process.argv.slice(1);
const fs = await import("node:fs");
const path = await import("node:path");
const { EventEmitter } = await import("node:events");
const mic = await import(micUrl);
const ui = await import(uiUrl);
const out = {};
const env = { PINK_CODING_AGENT_DIR: home };
const dir = mic.micDir(env);

out.before = mic.installed(env);
const touch = (file) => (fs.mkdirSync(path.dirname(file), { recursive: true }), fs.writeFileSync(file, "x"));
for (const name of mic.ENGINE) touch(path.join(dir, "node_modules", name, "package.json"));
touch(path.join(dir, "node_modules", "decibri", "models", "silero_vad.onnx"));
for (const name of mic.MODEL_FILES) touch(path.join(dir, "model", name));
out.after = mic.installed(env);

// motor falso com a API do sherpa-onnx-node e do decibri
const mics = [];
class Microphone extends EventEmitter { constructor(opts) { super(); this.opts = opts; this.stopped = false; mics.push(this); } stop() { this.stopped = true; } }
class Vad {
  constructor(config) { this.config = config; this.done = []; this.cur = []; this.on = false; }
  acceptWaveform(w) {
    const loud = w.some((x) => Math.abs(x) > 0.3);
    if (loud) { this.on = true; this.cur.push(...w); }
    else if (this.on) this.close();
  }
  close() { this.done.push({ samples: Float32Array.from(this.cur) }); this.cur = []; this.on = false; }
  isDetected() { return this.on; }
  isEmpty() { return this.done.length === 0; }
  front() { return this.done[0]; }
  pop() { this.done.shift(); }
  flush() { if (this.on) this.close(); }
}
let config;
const sherpa = {
  Vad,
  OfflineRecognizer: { createAsync: async (c) => ((config = c), { createStream: () => ({ acceptWaveform(o) { this.n = o.samples.length; } }), decodeAsync: async () => {}, getResult: (s) => ({ text: ` fala${Math.round(s.n / 1600)} ` }) }) },
};
let clock = 10_000;
const m = mic.createMicrofone({ env, load: () => ({ sherpa, decibri: { Microphone } }), now: () => clock, every: () => ({}), stopEvery: () => {} });
const pcm = (seconds, loud) => { const b = Buffer.alloc(Math.round(seconds * 16000) * 2); if (loud) for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(i % 2 ? 20000 : -20000, i * 2); return b; };
const tick = () => new Promise((r) => setTimeout(r, 20));
const texts = [];
let text = "Revise:";
const inputs = [];
const editor = { getText: () => text, setText: (v) => { text = v; texts.push(v); }, handleInput: (d) => inputs.push([d, text]) };
let draws = 0;
const draw = () => draws++;

await m.act("start", editor, draw);
out.started = [m.view().state, mics.length, mics[0].opts, config.modelConfig.modelType, path.basename(config.modelConfig.transducer.encoder)];
mics[0].emit("data", pcm(1, true));
await tick();
out.live = [texts.at(-1), m.view().state];  // ainda falando: o texto ao vivo já aparece
mics[0].emit("data", pcm(0.1, false));
await tick();
out.firstSegment = text;
await m.act("pause", editor, draw);
out.paused = [m.view().state, mics[0].stopped];
mics[0].emit("data", pcm(1, true)); // áudio que chega depois da pausa é ignorado
await tick();
out.ignoredWhilePaused = text;
await m.act("resume", editor, draw);
out.resumed = [m.view().state, mics.length];
mics[1].emit("data", pcm(0.5, true));
await m.act("stop", editor, draw);  // o último trecho ainda aberto vira texto antes de parar
out.stopped = [m.view().state, text, mics[1].stopped, inputs.length];
text = "";
await m.act("start", editor, draw);
mics[2].emit("data", pcm(0.3, true));
await m.act("send", editor, draw);
out.sent = [m.view().state, inputs];
out.draws = draws > 5;

// os botões e onde cada um fica na caixa de digitar
const theme = { fg: (_c, s) => s, bg: (_c, s) => s };
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
out.bars = ["off", "rec", "paused"].map((state) => { const b = mic.micBar(theme, { installed: true, state, seconds: 75 }); return [strip(b.text), b.spans.map((s) => s.action)]; });
out.notInstalled = mic.micBar(theme, { installed: false, state: "off", seconds: 0 }) ?? null;
const bar = mic.micBar(theme, { installed: true, state: "rec", seconds: 5 });
const box = ui.inputBox({ theme, content: ["oi"], width: 100, label: "Build · modelo", mic: bar.text });
const row = strip(box[box.micAt.y]);
out.click = bar.spans.map((s) => [s.action, [...row].slice(box.micAt.x + s.from, box.micAt.x + s.to).join("")]);
out.withoutMic = ui.inputBox({ theme, content: ["oi"], width: 100, label: "Build · modelo" }).micAt ?? null;
const narrow = ui.inputBox({ theme, content: ["oi"], width: 40, label: "Build · modelo-com-nome-bem-comprido", mic: mic.micBar(theme, { installed: true, state: "off", seconds: 0 }).text });
out.narrow = [...strip(narrow[narrow.micAt.y])].slice(narrow.micAt.x, narrow.micAt.x + 7).join("");

// instalar: hash errado não instala nada; modelo já conferido não baixa de novo
const home2 = path.join(home, "outro");
const env2 = { PINK_CODING_AGENT_DIR: home2 };
const npmCalls = [];
const fakeNpm = (cmd, args, opts) => { npmCalls.push([cmd, args.join(" ")]); for (const name of mic.ENGINE) touch(path.join(opts.cwd, "node_modules", name, "package.json")); touch(path.join(opts.cwd, "node_modules", "decibri", "models", "silero_vad.onnx")); return { status: 0 }; };
const body = { ok: true, status: 200, body: (async function* () { yield new Uint8Array([1, 2, 3]); })() };
out.badHash = await mic.install({ env: env2, fetcher: async () => body, sync: fakeNpm });
out.badHashInstalled = mic.installed(env2);
const md = path.join(mic.micDir(env2), "model");
for (const name of mic.MODEL_FILES) touch(path.join(md, name));
fs.writeFileSync(path.join(md, ".sha256"), mic.MODEL.sha256);
let fetched = 0;
out.reuse = await mic.install({ env: env2, fetcher: async () => (fetched++, body), sync: fakeNpm });
out.reuseFetched = fetched;
out.npm = npmCalls[0];
out.lockWritten = JSON.parse(fs.readFileSync(path.join(mic.micDir(env2), "package-lock.json"), "utf8")).packages["node_modules/sherpa-onnx-node"].integrity.startsWith("sha512-");
out.leftovers = fs.readdirSync(mic.micDir(env2)).filter((n) => n.startsWith("baixando-"));
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def facts(tmp_path_factory: pytest.TempPathFactory) -> dict:
    home = tmp_path_factory.mktemp("mic")
    done = subprocess.run(["node", "--input-type=module", "-e", DRIVER, (ROOT / "extensions" / "pink-microfone.ts").as_uri(), (ROOT / "extensions" / "pink-ui.ts").as_uri(), str(home)], capture_output=True, text=True, encoding="utf-8", timeout=120, check=False)
    assert done.returncode == 0, done.stderr[-2000:]
    return json.loads(done.stdout.strip().splitlines()[-1])


def test_the_button_only_exists_after_installing(facts: dict) -> None:
    assert facts["before"] is False and facts["after"] is True
    assert facts["notInstalled"] is None  # sem instalar, nenhum botão na caixa


def test_speech_shows_live_then_becomes_text_in_order(facts: dict) -> None:
    assert facts["started"] == ["rec", 1, {"sampleRate": 16000, "channels": 1}, "nemo_transducer", "encoder.int8.onnx"]
    assert facts["live"] == ["Revise: fala10", "rec"]  # o texto aparece enquanto a pessoa ainda fala
    assert facts["firstSegment"] == "Revise: fala10"  # o trecho fechado pelo silêncio fica, depois do que já estava na caixa


def test_pause_ignores_audio_and_resume_opens_the_microphone_again(facts: dict) -> None:
    assert facts["paused"] == ["paused", True]
    assert facts["ignoredWhilePaused"] == "Revise: fala10"
    assert facts["resumed"] == ["rec", 2]


def test_stop_keeps_the_text_in_the_box_and_send_submits_it(facts: dict) -> None:
    state, text, closed, submits = facts["stopped"]
    assert state == "off" and text == "Revise: fala10 fala5" and closed and submits == 0  # parar não envia
    assert facts["sent"] == ["off", [["\r", "fala3"]]]  # enviar espera o último trecho e manda
    assert facts["draws"]


def test_buttons_and_click_columns_match_what_is_drawn(facts: dict) -> None:
    assert facts["bars"] == [["◉ falar", ["start"]], ["● 1:15  ‖ pausar  ■ parar  ➤ enviar", ["pause", "stop", "send"]], ["◌ 1:15  ▶ continuar  ■ parar  ➤ enviar", ["resume", "stop", "send"]]]
    assert facts["click"] == [["pause", "‖ pausar"], ["stop", "■ parar"], ["send", "➤ enviar"]]  # a coluna do clique cai em cima do botão
    assert facts["withoutMic"] is None
    assert facts["narrow"] == "◉ falar"  # caixa estreita: o rótulo vai para a linha dele e o botão continua clicável


def test_install_checks_the_model_hash_and_reuses_a_verified_model(facts: dict) -> None:
    assert "não bate com o SHA-256" in facts["badHash"] and facts["badHashInstalled"] is False
    assert facts["reuse"].startswith("Microfone instalado") and facts["reuseFetched"] == 0
    assert facts["npm"] == ["npm", "ci --ignore-scripts --omit=dev --no-audit --no-fund"]  # só o lock do Pink, sem scripts
    assert facts["lockWritten"] and facts["leftovers"] == []
