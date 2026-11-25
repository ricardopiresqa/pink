# ruff: noqa: E501, F811
"""Lista de comandos (owner 2026-11-25): digitando /resume a lista sumia no "/resu".

A caixa do Pink tirava a última linha do editor achando que era a borda de baixo, mas a lista de sugestões vem depois da
borda: a última sugestão sumia, e com uma só (a partir de "/resu") a lista inteira. Roda o Pink de verdade (ConPTY).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, cli, fake_provider, package_dir  # noqa: E402, F401
from test_pink_questionnaire_tui import write_models  # noqa: E402


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_the_command_list_stays_until_the_end_of_the_word(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    from f50_tui_probe import run_tui

    write_models(tmp_path, fake_provider, "ask-long")
    typed = "/resume"
    screens = run_tui(cli, tmp_path, [(None, 8.0)] + [(ch, 1.2) for ch in typed], columns=110, rows=30)[1:]
    for index, screen in enumerate(screens):
        prefix = typed[: index + 1]
        joined = "\n".join(screen)
        if prefix == "/":
            continue  # só "/" lista todos os comandos: não cabe conferir um por um
        assert "Retoma outra sessão" in joined, f"{prefix}:\n{joined}"  # a sugestão continua até o fim da palavra
    res = "\n".join(screens[3])  # "/res": a última sugestão (ferramentas, pela busca aproximada) era a que sumia
    assert "ferramentas" in res, res
