# ruff: noqa: E501
"""Card 1dfwh7kg4g2 - diff aberto sob edit/write e painel de segundo plano abaixo da caixa. Cenários em tests/pink_diff_panel.feature.

Unitário: diffBlock e writeDiff (funções puras de extensions/pink-ui.ts) num driver de node.
Terminal: o Pink de verdade num ConPTY (como test_pink_questionnaire_tui), com o provedor falso da F51.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, cli, fake_provider, package_dir  # noqa: E402, F401 - fixtures do pacote construido e do provedor falso

MODELS = ["edit-diff", "write-big", "read-line", "bg-shell", "bg-agent", "bg-both", "write-ctrl", "write-5000"]
OPEN = [(None, 6.0), ("\r", 6.0), ("cenario", 1.0), ("\r", 15.0)]  # confiar na pasta, digitar, enviar e esperar o roteiro

UNIT_DRIVER = r"""
const [uiUrl] = process.argv.slice(1);
const ui = await import(uiUrl);
const out = {};
const theme = { fg: (c, t) => `[${c}]${t}`, bg: (c, t) => `{${c}}${t}` };
const diff = "-2 linha dois\n+2 linha 2 alterada\n 1 linha um";
out.diffBlock = ui.diffBlock({ theme, diff, width: 60 });
out.capped = ui.diffBlock({ theme, diff: Array.from({ length: 50 }, (_, i) => `+${i + 1} l${i + 1}`).join("\n"), width: 60, max: 40 });
out.wrapped = ui.diffBlock({ theme, diff: "+1 " + "x".repeat(100), width: 40 });
out.writeDiff = ui.writeDiff("a\nb\n");
out.writeNone = ui.writeDiff(undefined);
out.ctrl = ui.diffBlock({ theme, diff: "+1 ok\x1b[31mred\rZ q\u0000n", width: 60 });
const plain = { fg: (c, t) => t, bg: (c, t) => t };
out.cjk = ui.diffBlock({ theme: plain, diff: "+1 " + "漢".repeat(30) + "😀".repeat(10), width: 20 });
out.big = ui.writeDiff(Array.from({ length: 5000 }, (_, i) => `l${i + 1}`).join("\n") + "\n", 40);
console.log(JSON.stringify(out));
"""


def write_models(home: Path, port: int, model: str) -> None:
    target = home / ".pink" / "agent"
    target.mkdir(parents=True, exist_ok=True)
    (target / "models.json").write_text(json.dumps({"providers": {"fake": {"baseUrl": f"http://127.0.0.1:{port}/v1", "api": "openai-completions", "apiKey": "fake-key-0123456789", "models": [{"id": m} for m in MODELS]}}}), encoding="utf-8")
    (target / "settings.json").write_text(json.dumps({"defaultProvider": "fake", "defaultModel": model}), encoding="utf-8")


def tui(cli_path: Path, home: Path, port: int, model: str, steps: list, rows: int = 30) -> list[list[str]]:
    sys.path[:0] = [str(Path(__file__).resolve().parent)]
    from f50_tui_probe import run_tui

    write_models(home, port, model)
    return run_tui(cli_path, home, steps, columns=95, rows=rows)


def text(screen: list[str]) -> str:
    return "\n".join(screen)


@pytest.fixture(scope="module")
def unit_out(package_dir: Path) -> dict:
    if sys.platform != "win32":
        pytest.skip("o terminal de teste é Windows")
    ui_url = (package_dir / "extensions" / "pink-ui.ts").as_uri()
    home = Path(tempfile.mkdtemp(prefix="diffpanel-unit-"))
    env = {name: value for name, value in os.environ.items() if name.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "PATHEXT"}}
    env.update({"HOME": str(home), "USERPROFILE": str(home)})
    done = subprocess.run(["node", "--input-type=module", "-e", UNIT_DRIVER, ui_url], capture_output=True, text=True, encoding="utf-8", env=env, timeout=180, check=False)
    assert done.returncode == 0, done.stderr[-1500:]
    return json.loads(done.stdout.strip().split("\n")[-1])


# ---------------------------------------------------------------------------------------------------- (unitário)
def test_unit_the_removed_line_is_red_and_the_added_line_is_green_with_numbers(unit_out: dict) -> None:
    removed, added, context = unit_out["diffBlock"][0], unit_out["diffBlock"][1], unit_out["diffBlock"][2]
    assert "{toolErrorBg}" in removed and "linha dois" in removed and "-" in removed and removed.strip().startswith("[dim]") is False
    assert "{toolSuccessBg}" in added and "linha 2 alterada" in added and "2" in added
    assert "{toolErrorBg}" not in context and "linha um" in context  # contexto: sem fundo


def test_unit_past_max_lines_the_rest_becomes_a_count_line(unit_out: dict) -> None:
    capped = unit_out["capped"]
    assert len(capped) == 41 and "… +10 linhas (ctrl+o)" in capped[-1]  # 40 linhas e a contagem


def test_unit_a_long_line_wraps_with_the_number_column_kept(unit_out: dict) -> None:
    assert len(unit_out["wrapped"]) == 3  # 100 caracteres numa largura de 40 (espaço útil 36)


def test_unit_writediff_numbers_every_line_and_drops_the_last_newline(unit_out: dict) -> None:
    assert unit_out["writeDiff"] == "+1 a\n+2 b" and unit_out["writeNone"] == ""


def test_unit_control_characters_become_a_dot_and_never_reach_the_screen(unit_out: dict) -> None:
    joined = "\n".join(unit_out["ctrl"])
    for raw in ("\x1b", "\r", " ", "\x00"):
        assert raw not in joined, repr(raw)  # ESC, retorno de carro, separador de linha e NUL viram "·"
    assert "·" in joined and "Z" in joined and "q" in joined


def test_unit_wide_characters_count_two_columns_and_never_exceed_the_width(unit_out: dict) -> None:
    def columns(line: str) -> int:
        return sum(2 if ord(ch) >= 0x2E80 else 1 for ch in line)

    lines = unit_out["cjk"]
    assert len(lines) > 1 and all(columns(line) <= 20 for line in lines), lines  # 30 kanjis (2 colunas cada) cabem em 20


def test_unit_writediff_of_5000_lines_builds_only_40_and_counts_the_rest(unit_out: dict) -> None:
    rows = unit_out["big"].split("\n")
    assert len(rows) == 41 and rows[0] == "+1 l1" and "+4960" in rows[-1] and "(ctrl+o)" in rows[-1], rows[-1]


# ---------------------------------------------------------------------------------------------------- (a) (b) (c) no terminal
@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_a_an_edit_shows_the_diff_open_with_numbers_and_no_ctrl_o(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screen = text(tui(cli, tmp_path, fake_provider, "edit-diff", OPEN + [(None, 12.0)])[-1])
    assert "linha dois" in screen and "linha 2 alterada" in screen, screen
    assert "ctrl+o" not in screen, screen  # o diff de uma edição vem aberto, sem pedir ctrl+o


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_b_a_big_write_is_cut_at_40_lines_with_a_count(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screen = text(tui(cli, tmp_path, fake_provider, "write-big", OPEN + [(None, 12.0)])[-1])
    assert "linha 40" in screen and "linha 41" not in screen, screen
    assert "… +20 linhas (ctrl+o)" in screen, screen


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_c_read_grep_and_bash_stay_on_one_line(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screen = text(tui(cli, tmp_path, fake_provider, "read-line", OPEN + [(None, 12.0)])[-1])
    rows = screen.split("\n")
    # desde 22/11 (card 1dfwh7kg7r1) ferramentas seguidas viram uma linha de resumo, como no Claude Code
    assert any("Rodou 2 comandos, leu 1 arquivo, buscou 1 padrão" in row for row in rows), screen
    # o "· 1 falhou" é o grep, que devolve erro nesta build (causa não diagnosticada); read e bash passam
    assert screen.count("oi-pink") <= 1, screen  # a saída do bash não abre
    assert not any(re.match(r"^\s*\d+ [+-] ", row) for row in screen), screen  # nenhuma linha de diff com número


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_d_and_e_a_subagent_and_a_shell_sit_below_the_box_with_time_and_tokens_and_leave_when_done(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    open_bg = [(None, 6.0), ("\r", 6.0), ("cenario", 1.0), ("\r", 3.0)]  # a espera curta: o comando de 20 s tem de estar rodando na 1ª captura
    screens = tui(cli, tmp_path, fake_provider, "bg-both", open_bg + [(None, 3.0), (None, 26.0)])
    running, done = text(screens[4]), text(screens[5])
    rows = screens[4]
    box = max(index for index, row in enumerate(rows) if "Build" in row)  # a linha de status da caixa (abaixo dela, o painel)
    below = [row for row in rows[box + 1:] if row.strip()]
    assert any("agent" in row or "scout" in row for row in below) and any("↓" in row for row in below), running  # subagente com tokens, abaixo da caixa
    assert any("sleep" in row or "Rodou" in row or "fim-bg" in row or "%1" in row for row in below), running  # comando em segundo plano, abaixo da caixa
    assert any(" tokens" in row or "tokens" in row for row in below) and any(":" in row for row in below), running  # tempo (m:ss) e tokens
    assert "Build" in running and "ctrl+p comandos" in running, running  # e em 95x30 a caixa e o rodapé continuam na tela (e)
    assert not any("⚙" in row or ("↓" in row and "agent" in row) for row in done.split("\n")), done  # terminaram: as linhas do painel sumiram (a mensagem de conclusão no chat pode citar o comando)


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_control_characters_in_a_write_do_not_break_the_screen(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screen = text(tui(cli, tmp_path, fake_provider, "write-ctrl", OPEN + [(None, 12.0)])[-1])
    assert "vermelho" in screen and "fim" in screen, screen  # o conteúdo continua legível
    assert "Build" in screen and "ctrl+p comandos" in screen, screen  # a caixa e o rodapé no lugar
    assert "·" in screen, screen


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_a_line_of_wide_characters_fits_the_screen(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screen = text(tui(cli, tmp_path, fake_provider, "write-ctrl", OPEN + [(None, 12.0)])[-1])
    assert screen.count("漢") == 60 and screen.count("😀") == 30, screen  # todos os caracteres largos aparecem, sem sumir por estouro


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_a_write_of_5000_lines_shows_40_and_4960_more(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screen = text(tui(cli, tmp_path, fake_provider, "write-5000", OPEN + [(None, 14.0)])[-1])
    assert "… +4960 linhas (ctrl+o)" in screen, screen
    assert not any(re.search(r"\bl41\b", row) for row in screen.split("\n")), screen  # a linha 41 não aparece
