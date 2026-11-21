# ruff: noqa: E501
"""Idioma da interface do Pink (card 1dfwh7kg5cg): Windows pt/es, senão en; PINK_LANG força. Cenários em tests/pink_i18n.feature.

Unitário: pick() e detect() de extensions/pink-i18n.ts com env, platform, sync e intl falsos (driver de node).
Terminal: o Pink de verdade num ConPTY, headless (95x30), com PINK_LANG=es e PINK_LANG=en. Se o texto sair em
português onde devia ser es/en, isso é achado: o teste não é ajustado para passar.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, cli, fake_provider, package_dir  # noqa: E402, F401 - fixtures do pacote construido e do provedor falso

MODELS = ["ask", "ask-tabs"]
UNIT_DRIVER = r"""
const [i18nUrl] = process.argv.slice(1);
const i18n = await import(i18nUrl);
const out = {};
const regOut = (langs) => `\r\n    Languages    REG_MULTI_SZ    ${langs}\r\n`;
const okSync = (stdout) => () => ({ stdout });
const failSync = () => {
  throw new Error("reg.exe indisponível");
};
const noIntl = () => {
  throw new Error("sem Intl");
};
out.pick = {
  ptBR: i18n.pick("pt-BR"), esMX: i18n.pick("es-MX"), enUS: i18n.pick("en-US"), frFR: i18n.pick("fr-FR"), empty: i18n.pick(""), undef: i18n.pick(undefined), underscore: i18n.pick("pt_PT"), upper: i18n.pick("ES"),
};
out.detect = {
  regPt: i18n.detect({}, "win32", okSync(regOut("pt-BR")), noIntl),
  regEs: i18n.detect({}, "win32", okSync(regOut("es-MX")), noIntl),
  regFr: i18n.detect({}, "win32", okSync(regOut("fr-FR")), noIntl),
  regFirstWins: i18n.detect({}, "win32", okSync(regOut("es-ES\\0pt-BR")), noIntl),
  pinkLangWins: i18n.detect({ PINK_LANG: "es" }, "win32", okSync(regOut("pt-BR")), noIntl),
  pinkLangEnOverPt: i18n.detect({ PINK_LANG: "en" }, "win32", okSync(regOut("pt-BR")), () => "pt-BR"),
  regFailLangEs: i18n.detect({ LANG: "es_MX.UTF-8" }, "win32", failSync, () => "pt-BR"),
  regFailNoLangIntlPt: i18n.detect({}, "win32", failSync, () => "pt-BR"),
  regFailNoLangIntlEn: i18n.detect({}, "win32", failSync, () => "fr-FR"),
  regFailIntlThrows: i18n.detect({}, "win32", failSync, noIntl),
  regEmptyStdoutFallsToLang: i18n.detect({ LANG: "pt_BR.UTF-8" }, "win32", okSync(""), () => "fr-FR"),
  posixLc: i18n.detect({ LC_ALL: "es_ES.UTF-8", LANG: "pt_BR" }, "linux", () => { throw new Error("nao deve rodar"); }, noIntl),
  posixCIsSkipped: i18n.detect({ LANG: "C" }, "linux", () => ({}), () => "pt-BR"),
  linuxIntl: i18n.detect({}, "linux", () => ({}), () => "es-AR"),
};
console.log(JSON.stringify(out));
"""

# "Enviar" também é espanhol, então não entra aqui: só marcas que são só de português
PT_ONLY = ("Peça a próxima etapa", "Começa uma sessão nova")


def write_models(home: Path, port: int, model: str) -> None:
    target = home / ".pink" / "agent"
    target.mkdir(parents=True, exist_ok=True)
    (target / "models.json").write_text(json.dumps({"providers": {"fake": {"baseUrl": f"http://127.0.0.1:{port}/v1", "api": "openai-completions", "apiKey": "fake-key-0123456789", "models": [{"id": m} for m in MODELS]}}}), encoding="utf-8")
    (target / "settings.json").write_text(json.dumps({"defaultProvider": "fake", "defaultModel": model}), encoding="utf-8")


def tui(cli_path: Path, home: Path, port: int, lang: str, steps: list, model: str = "ask") -> list[list[str]]:
    sys.path[:0] = [str(Path(__file__).resolve().parent)]
    from f50_tui_probe import run_tui

    write_models(home, port, model)
    return run_tui(cli_path, home, steps, columns=95, rows=30, extra_env={"PINK_LANG": lang})


def text(screen: list[str]) -> str:
    return "\n".join(screen)


@pytest.fixture(scope="module")
def unit(package_dir: Path) -> dict:
    root = Path(tempfile.mkdtemp(prefix="i18n-unit-"))
    url = (package_dir / "extensions" / "pink-i18n.ts").as_uri()
    env = {name: value for name, value in os.environ.items() if name.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "PATHEXT"}}
    env["HOME"] = str(root)
    done = subprocess.run(["node", "--input-type=module", "-e", UNIT_DRIVER, url], capture_output=True, text=True, encoding="utf-8", env=env, timeout=120, check=False)
    assert done.returncode == 0, done.stderr[-1500:]
    return json.loads(done.stdout.strip().split("\n")[-1])


# ---------------------------------------------------------------- unitário
def test_pick_maps_pt_es_and_everything_else_to_en(unit: dict) -> None:
    p = unit["pick"]
    assert p["ptBR"] == "pt" and p["esMX"] == "es" and p["enUS"] == "en" and p["frFR"] == "en"
    assert p["empty"] == "en" and p["undef"] == "en"
    assert p["underscore"] == "pt" and p["upper"] == "es"


def test_detect_uses_the_windows_language_first(unit: dict) -> None:
    d = unit["detect"]
    assert d["regPt"] == "pt" and d["regEs"] == "es" and d["regFr"] == "en"
    assert d["regFirstWins"] == "es", "o primeiro idioma da lista do Windows vence"


def test_pink_lang_wins_over_windows(unit: dict) -> None:
    d = unit["detect"]
    assert d["pinkLangWins"] == "es" and d["pinkLangEnOverPt"] == "en"


def test_a_reg_exe_failure_falls_back_to_lang_then_intl(unit: dict) -> None:
    d = unit["detect"]
    assert d["regFailLangEs"] == "es", "LANG vem depois do registro"
    assert d["regFailNoLangIntlPt"] == "pt" and d["regFailNoLangIntlEn"] == "en"
    assert d["regFailIntlThrows"] == "en", "sem nada, cai em en"
    assert d["regEmptyStdoutFallsToLang"] == "pt", "registro vazio também cai no LANG"


def test_posix_and_linux_fallbacks(unit: dict) -> None:
    d = unit["detect"]
    assert d["posixLc"] == "es", "LC_ALL vence LANG"
    assert d["posixCIsSkipped"] == "pt", "LANG=C não conta: segue para o Intl"
    assert d["linuxIntl"] == "es"


# ---------------------------------------------------------------- terminal (ConPTY, headless 95x30)
@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_es_the_slash_menu_descriptions_and_home_are_in_spanish(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screens = tui(cli, tmp_path, fake_provider, "es", [(None, 6.0), ("\r", 6.0), ("/", 2.0), ("n", 2.0)])
    slash = text(screens[-1])
    assert "Empieza una sesión nueva" in slash, slash  # /new, descrição patchada com __pinkT
    assert not any(p in slash for p in PT_ONLY), slash
    assert "ctrl+p comandos" in slash and "ctrl+p commands" not in slash, slash  # rodapé da tela em espanhol


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_en_the_slash_menu_descriptions_and_home_are_in_english(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screens = tui(cli, tmp_path, fake_provider, "en", [(None, 6.0), ("\r", 6.0), ("/", 2.0), ("n", 2.0)])
    slash = text(screens[-1])
    assert "Start a new session" in slash, slash
    assert "Começa uma sessão nova" not in slash and "Empieza una sesión nueva" not in slash, slash
    assert not any(p in slash for p in PT_ONLY), slash
    assert "ctrl+p commands" in slash, slash  # rodapé da tela em inglês


@pytest.mark.skipif(sys.platform != "win32", reason="o terminal de teste usa ConPTY (pywinpty)")
def test_en_the_questionnaire_says_type_something_and_submit(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    screens = tui(cli, tmp_path, fake_provider, "en", [(None, 6.0), ("\r", 6.0), ("oi", 1.0), ("\r", 12.0)], model="ask-tabs")
    screen = text(screens[-1])
    assert "Type something." in screen, screen
    assert "Submit" in screen, screen
    assert "Enviar" not in screen and "Escrever outra resposta." not in screen, screen


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
