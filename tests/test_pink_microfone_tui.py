# ruff: noqa: E501, F811
"""Microfone (owner 2026-11-25): o botão na caixa de digitar do Pink de verdade, clicado com bytes SGR do mouse.

Roda o pacote construído num terminal ConPTY (como test_pink_questionnaire_tui). O "microfone instalado" é uma pasta falsa em
~/.pink/agent/microfone: pacotes sherpa-onnx-node e decibri de mentira (mesma API) que o require real do Pink carrega; o
microfone falso "fala" 1,5 s e depois fica em silêncio, e o reconhecedor devolve "fala<décimos de segundo>".
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, cli, fake_provider, package_dir  # noqa: E402, F401 - fixtures do pacote construido e do provedor falso
from test_pink_questionnaire_tui import write_models  # noqa: E402

SHERPA = r"""
class Vad {
  constructor() { this.done = []; this.cur = []; this.on = false; }
  acceptWaveform(w) { const loud = w.some((x) => Math.abs(x) > 0.3); if (loud) { this.on = true; for (const x of w) this.cur.push(x); } else if (this.on) this.close(); }
  close() { this.done.push({ samples: Float32Array.from(this.cur) }); this.cur = []; this.on = false; }
  isDetected() { return this.on; } isEmpty() { return this.done.length === 0; } front() { return this.done[0]; } pop() { this.done.shift(); } flush() { if (this.on) this.close(); }
}
const OfflineRecognizer = { createAsync: async () => ({ createStream: () => ({ acceptWaveform(o) { this.n = o.samples.length; } }), decodeAsync: async () => {}, getResult: (s) => ({ text: "fala" + Math.round(s.n / 1600) }) }) };
module.exports = { Vad, OfflineRecognizer };
"""

DECIBRI = r"""
const { EventEmitter } = require("node:events");
class Microphone extends EventEmitter {
  constructor() {
    super();
    let sent = 0;
    this.timer = setInterval(() => {
      const b = Buffer.alloc(3200);
      if (sent < 15) for (let i = 0; i < 1600; i++) b.writeInt16LE(i % 2 ? 20000 : -20000, i * 2);
      sent++;
      this.emit("data", b);
    }, 100);
  }
  stop() { clearInterval(this.timer); }
}
module.exports = { Microphone };
"""


def fake_microphone(home: Path) -> None:
    base = home / ".pink" / "agent" / "microfone"
    for name, code in (("sherpa-onnx-node", SHERPA), ("decibri", DECIBRI)):
        pkg = base / "node_modules" / name
        pkg.mkdir(parents=True, exist_ok=True)
        (pkg / "package.json").write_text(json.dumps({"name": name, "main": "index.js"}), encoding="utf-8")
        (pkg / "index.js").write_text(code, encoding="utf-8")
    (base / "node_modules" / "decibri" / "models").mkdir(parents=True, exist_ok=True)
    (base / "node_modules" / "decibri" / "models" / "silero_vad.onnx").write_text("x", encoding="utf-8")
    (base / "model").mkdir(parents=True, exist_ok=True)
    for name in ("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"):
        (base / "model" / name).write_text("x", encoding="utf-8")
    (base / "package.json").write_text(json.dumps({"name": "pink-microfone", "private": True}), encoding="utf-8")


def run(cli_path: Path, home: Path, port: int, steps: list) -> list[list[str]]:
    from f50_tui_probe import run_tui

    fake_microphone(home)
    write_models(home, port, "ask-long")
    return run_tui(cli_path, home, steps, columns=110, rows=30)


def where(screen: list[str], text: str) -> tuple[int, int]:
    for row, line in enumerate(screen):
        col = line.find(text)
        if col >= 0:
            return row, col
    raise AssertionError(f"{text!r} nao esta na tela:\n" + "\n".join(screen))


def click(row: int, col: int, wait: float) -> list:
    x, y = col + 2, row + 1  # SGR começa em 1; +1 para cair dentro do botão, não na borda
    return [(f"\x1b[<0;{x};{y}M", 0.05), (f"\x1b[<0;{x};{y}m", wait)]


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_clicking_talk_records_live_text_and_stop_keeps_it_in_the_box(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    first = run(cli, tmp_path / "a", fake_provider, [(None, 8.0)])[0]
    talk = where(first, "◉ falar")
    # clica em falar e captura enquanto "fala" (o texto ao vivo) e depois do silêncio (o trecho fechado)
    recording = run(cli, tmp_path / "b", fake_provider, [(None, 8.0), *click(*talk, 0.8)])[-1]
    joined = "\n".join(recording)
    assert "‖ pausar" in joined and "■ parar" in joined and "➤ enviar" in joined, joined
    assert "● 0:0" in joined, joined  # o relógio da gravação
    stop = where(recording, "■ parar")
    after = run(cli, tmp_path / "c", fake_provider, [(None, 8.0), *click(*talk, 3.0), *click(*stop, 2.0)])
    during, done = "\n".join(after[-3]), "\n".join(after[-1])
    assert "fala15" in during, during  # 1,5 s de fala viraram texto na caixa
    assert "◉ falar" in done and "‖ pausar" not in done, done  # parou: volta o botão de falar
    assert "fala15" in done, done  # e o texto continua na caixa, sem enviar
