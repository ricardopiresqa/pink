# ruff: noqa: E501
"""F50b - roda o Pink de verdade num terminal (ConPTY via pywinpty) e le a tela com um emulador (pyte). Nenhuma chamada externa: o provedor e o falso da F51.

Uso (modulo): from f50_tui_probe import run_tui  ->  screens = run_tui(cli_js, home, steps)
`steps` e uma lista de (texto_a_digitar | None | (colunas, linhas), segundos_de_espera); uma tupla redimensiona o terminal.
Devolve a tela (lista de linhas) depois de cada passo.
"""

from __future__ import annotations

import os
import shutil
import sys
import threading
import time
from pathlib import Path

import pyte
import winpty

COLUMNS, ROWS = 100, 30


class TolerantScreen(pyte.Screen):
    """pyte does not accept the private form of the device-status report that the Pi TUI sends; there is no terminal to answer it here."""

    def report_device_status(self, mode, private=False, **_ignored):  # noqa: ANN001, ANN003
        return None

    def report_mode(self, *args, **_ignored):  # noqa: ANN002, ANN003
        return None


def run_tui(cli: Path, home: Path, steps: list[tuple[str | None, float]], *, extra_env: dict[str, str] | None = None, columns: int = COLUMNS, rows: int = 50) -> list[list[str]]:
    node = shutil.which("node")
    assert node, "node not found"
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA"}
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    env.update({"HOME": str(home), "USERPROFILE": str(home), "TERM": "xterm-256color", "COLORTERM": "truecolor", **(extra_env or {})})
    project = home / "work"  # a plain project folder: no .pink inside, so there is no trust prompt
    project.mkdir(exist_ok=True)
    process = winpty.PtyProcess.spawn([node, str(cli)], cwd=str(project), env=env, dimensions=(rows, columns))
    screen = TolerantScreen(columns, rows)
    stream = pyte.Stream(screen)
    captured: list[list[str]] = []

    chunks: list[str] = []
    alive = threading.Event()
    alive.set()

    def reader() -> None:
        while alive.is_set():
            try:
                data = process.read(65536)  # blocks until the terminal prints something
            except (EOFError, OSError):
                return
            if data:
                chunks.append(data)

    threading.Thread(target=reader, daemon=True).start()

    def pump(seconds: float) -> None:
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            while chunks:
                stream.feed(chunks.pop(0))
            time.sleep(0.05)
        while chunks:
            stream.feed(chunks.pop(0))

    try:
        for text, wait in steps:
            if isinstance(text, tuple):  # troca o tamanho do terminal (a moldura do Pink recalcula as colunas)
                screen.resize(text[1], text[0])
                process.setwinsize(text[1], text[0])
            elif text is not None:
                process.write(text)
            pump(wait)
            captured.append([line.rstrip() for line in screen.display])
    finally:
        alive.clear()
        try:
            process.write("\x03\x03")
            time.sleep(0.3)
            process.terminate(force=True)
        except Exception:  # noqa: BLE001 - the terminal may already be gone
            pass
    return captured


if __name__ == "__main__":
    cli_path, home_path = Path(sys.argv[1]), Path(sys.argv[2])
    typed = sys.argv[3] if len(sys.argv) > 3 else None
    plan = [(None, 6.0), ("\r", 8.0)] + ([(typed, 1.0), ("\r", 12.0)] if typed else [])  # the first Enter answers the trust prompt of a new folder
    for index, snapshot in enumerate(run_tui(cli_path, home_path, plan)):
        print(f"===== passo {index} =====")
        print("\n".join(snapshot))
