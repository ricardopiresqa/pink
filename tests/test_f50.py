# ruff: noqa: E501
"""F50 — Pink: fork do Pi em que so muda Pi -> Pink e a cor (rosa). Decisoes do owner de 2026-10-08 (1_projetos/thoth/DECISIONS.md).

O fork e o PATCH (`rebrand.json` + `build_pink.py`) sobre o tarball FIXADO do npm; o codigo do Pi nunca e copiado para o repositorio.
Testes unitarios do motor de patch rodam sobre pacotes sinteticos (sem rede). Os de produto constroem o pacote real a partir do tarball em
cache, instalam num prefixo temporario e rodam o `pink` de verdade, contra um provedor FALSO local (nenhuma chamada externa, sem credencial).
"""

from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PINK = ROOT
sys.path[:0] = [str(PINK)]

import build_pink as bp  # noqa: E402

REBRAND = json.loads((PINK / "rebrand.json").read_text(encoding="utf-8"))
UPSTREAM = json.loads((PINK / "upstream.json").read_text(encoding="utf-8"))
SPY = ROOT / "tests" / "f50_netspy.cjs"
FAKE = ROOT / "tests" / "f51_fake_provider.py"
PINK_ACCENT = "#ff6eb4"  # o rosa do pink-cli-preview.html (owner 2026-10-29)
VERSION = REBRAND["package_json"]["set"]["version"]
PATCHED = {item["id"]: item["file"] for item in REBRAND["replacements"]}  # chunk names change with every Pi release: the spec says where each patch lives
MAIN_CHUNK, DEFAULTS_CHUNK = PATCHED["builtin-ui-extension"], PATCHED["privacy-telemetry-off"]


# ================================================================================================ fixtures
@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> dict:
    out = tmp_path_factory.mktemp("pink-build")
    return bp.build(out, PINK / ".cache", pack=True)


@pytest.fixture(scope="module")
def package_dir(built: dict) -> Path:
    return Path(built["package_dir"])


@pytest.fixture(scope="module")
def cli(built: dict, tmp_path_factory: pytest.TempPathFactory) -> Path:
    npm = shutil.which("npm")
    assert npm, "npm not found"
    prefix = tmp_path_factory.mktemp("pink-prefix")
    done = subprocess.run([npm, "install", "--prefix", str(prefix), "--no-audit", "--no-fund", built["tarball"]], capture_output=True, text=True, timeout=600, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0, done.stderr[-400:]
    path = prefix / "node_modules" / "@thoth" / "pink" / "dist" / "bundle" / "cli.js"
    assert path.is_file()
    return path


@pytest.fixture(scope="module")
def fake_provider():
    process = subprocess.Popen([sys.executable, "-X", "utf8", str(FAKE)], stdout=subprocess.PIPE, text=True)
    port = json.loads(process.stdout.readline())["port"]
    yield port
    process.kill()
    process.wait(timeout=10)


def pink_env(home: Path, **extra: str) -> dict[str, str]:
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA"}
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    env.update({"HOME": str(home), "USERPROFILE": str(home), "NO_COLOR": "1", **extra})
    return env


def run_pink(cli: Path, home: Path, *args: str, timeout: int = 120, **extra: str) -> subprocess.CompletedProcess:
    node = shutil.which("node")
    assert node, "node not found"
    return subprocess.run([node, str(cli), *args], env=pink_env(home, **extra), cwd=home, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False, stdin=subprocess.DEVNULL)


def write_models(home: Path, port: int) -> None:
    target = home / ".pink" / "agent"
    target.mkdir(parents=True, exist_ok=True)
    (target / "models.json").write_text(json.dumps({"providers": {"fake": {"baseUrl": f"http://127.0.0.1:{port}/v1", "api": "openai-completions", "apiKey": "fake-key-0123456789", "models": [{"id": "ok"}]}}}), encoding="utf-8")


def synthetic(tmp_path: Path) -> Path:
    root = tmp_path / "package"
    (root / "dist" / "bundle").mkdir(parents=True)
    (root / "package.json").write_text(json.dumps({"name": "@earendil-works/pi-coding-agent", "version": "1.0.0", "bin": {"pi": "dist/bundle/cli.js"}, "files": ["dist"]}), encoding="utf-8")
    (root / "dist" / "bundle" / "a.js").write_text('const x="Update pi now";const e=process.env.PI_HOME,o=process.env.OPI_X,k="PI_lower",z=PI_UPPER;\n', encoding="utf-8")
    return root


# ================================================================================================ the pin and the licence
def test_the_pinned_upstream_has_a_sha512_integrity_a_licence_and_a_version_the_rebrand_extends() -> None:
    assert UPSTREAM["integrity"].startswith("sha512-") and len(UPSTREAM["integrity"]) > 80
    assert UPSTREAM["license"] == "MIT" and UPSTREAM["package"] == "@earendil-works/pi-coding-agent"
    assert VERSION.startswith(UPSTREAM["version"] + "-pink.")  # a Pink build says which Pi it is built on
    assert REBRAND["package_json"]["set"]["thoth"]["fork_of"] == f"{UPSTREAM['package']}@{UPSTREAM['version']}"


def test_the_pi_licence_and_the_notice_travel_with_the_fork() -> None:
    assert "MIT License" in (PINK / "LICENSE-PI.txt").read_text(encoding="utf-8")
    notice = (PINK / "NOTICE.md").read_text(encoding="utf-8")
    assert "Pi" in notice and "MIT" in notice and UPSTREAM["version"] in notice


def test_the_fork_is_the_patch_and_the_pi_code_is_not_in_the_repository() -> None:
    tracked_or_present = [path for path in PINK.rglob("*") if path.is_file() and not {".cache", "out", "tests", ".git", "node_modules"} & set(path.relative_to(PINK).parts)]
    own_code = [path for path in tracked_or_present if path.suffix in {".js", ".mjs", ".ts"}]
    assert sorted(path.relative_to(PINK).as_posix() for path in own_code) == ["extensions/pink-hooks.ts", "extensions/pink-natives.ts", "extensions/pink-permissions.ts", "extensions/pink-ui.ts", "mux/pink.mjs", "theme/make_themes.mjs"]  # Pink's own interface, the natives (card 1dfwh7kffk2), the multi-session sidebar (card 1dfwh7kffcu) and the theme converter; nothing of Pi's
    assert "earendil" not in (PINK / "extensions" / "pink-ui.ts").read_text(encoding="utf-8").replace("@earendil-works/pi-coding-agent", "").replace("@earendil-works/pi-tui", "")  # it imports the engine, it does not copy it
    assert (PINK / "build_pink.py").is_file() and (PINK / "rebrand.json").is_file()


# ================================================================================================ the patch engine (synthetic packages, no network)
def test_a_replacement_applies_exactly_the_expected_number_of_times(tmp_path: Path) -> None:
    root = synthetic(tmp_path)
    report = bp.apply_replacements(root, [{"id": "t", "file": "dist/bundle/a.js", "find": "Update pi now", "replace": "Update pink now", "count": 1}])
    assert report == [{"id": "t", "file": "dist/bundle/a.js", "count": 1}]
    assert "Update pink now" in (root / "dist" / "bundle" / "a.js").read_text(encoding="utf-8")


@pytest.mark.parametrize("count", [0, 2])
def test_a_replacement_that_applies_a_different_number_of_times_fails_loudly_and_names_it(tmp_path: Path, count: int) -> None:
    root = synthetic(tmp_path)
    with pytest.raises(bp.PatchError, match=r"t: expected \d+ replacement"):
        bp.apply_replacements(root, [{"id": "t", "file": "dist/bundle/a.js", "find": "Update pi now", "replace": "x", "count": count}])


def test_a_replacement_in_a_missing_file_fails_loudly(tmp_path: Path) -> None:
    with pytest.raises(bp.PatchError, match="file not found"):
        bp.apply_replacements(synthetic(tmp_path), [{"id": "t", "file": "dist/bundle/none.js", "find": "a", "replace": "b", "count": 1}])


def test_a_regex_replacement_is_counted_too(tmp_path: Path) -> None:
    root = synthetic(tmp_path)
    assert bp.apply_replacements(root, [{"id": "r", "file": "dist/bundle/a.js", "regex": True, "find": "Update pi(?![\\w-])", "replace": "Update pink", "count": 1}])[0]["count"] == 1
    with pytest.raises(bp.PatchError):
        bp.apply_replacements(root, [{"id": "r", "file": "dist/bundle/a.js", "regex": True, "find": "Update pi(?![\\w-])", "replace": "x", "count": 1}])  # already applied: now 0


def test_the_env_rename_touches_only_PI_followed_by_an_uppercase_letter_and_not_part_of_another_name(tmp_path: Path) -> None:
    root = synthetic(tmp_path)
    rule = REBRAND["env_rename"] | {"files": ["dist/bundle/*.js"], "exclude": [], "min_count": 2}
    assert bp.apply_env_rename(root, rule)["count"] == 2
    text = (root / "dist" / "bundle" / "a.js").read_text(encoding="utf-8")
    assert "process.env.PINK_HOME" in text and "PINK_UPPER" in text and "OPI_X" in text and "PI_lower" in text  # OPI_X and PI_lower stay


def test_the_env_rename_respects_the_excluded_files_and_fails_when_it_renames_too_little(tmp_path: Path) -> None:
    root = synthetic(tmp_path)
    rule = REBRAND["env_rename"] | {"files": ["dist/bundle/*.js"], "exclude": ["dist/bundle/a.js"], "min_count": 1}
    with pytest.raises(bp.PatchError, match="expected at least 1 renames, applied 0"):
        bp.apply_env_rename(root, rule)
    assert "PI_HOME" in (root / "dist" / "bundle" / "a.js").read_text(encoding="utf-8")


def test_package_json_gets_the_pink_identity_and_the_extra_files(tmp_path: Path) -> None:
    root = synthetic(tmp_path)
    report = bp.apply_package_json(root, REBRAND["package_json"])
    data = json.loads((root / "package.json").read_text(encoding="utf-8"))
    assert report["name"] == "@thoth/pink" and data["bin"] == {"pink": "dist/mux/pink.mjs"}  # o multiplexador abre a lateral e chama dist/bundle/cli.js
    assert data["piConfig"] == {"name": "pink", "configDir": ".pink"} and {"LICENSE-PI.txt", "NOTICE.md", "dist"} <= set(data["files"])
    bp.apply_package_json(root, REBRAND["package_json"])  # twice: no duplicated entries
    assert json.loads((root / "package.json").read_text(encoding="utf-8"))["files"].count("NOTICE.md") == 1


def test_adding_a_file_never_silently_overwrites_an_upstream_file(tmp_path: Path) -> None:
    root = synthetic(tmp_path)
    (root / "NOTICE.md").write_text("upstream", encoding="utf-8")
    with pytest.raises(bp.PatchError, match="already exists"):
        bp.add_files(root, [{"from": "NOTICE.md", "to": "NOTICE.md"}], PINK)
    with pytest.raises(bp.PatchError, match="missing source"):
        bp.add_files(root, [{"from": "nope.md", "to": "x.md"}], PINK)
    bp.add_files(root, [{"from": "NOTICE.md", "to": "NOTICE.md", "overwrite": True}], PINK)
    assert (root / "NOTICE.md").read_text(encoding="utf-8") == (PINK / "NOTICE.md").read_text(encoding="utf-8")


def test_a_tarball_whose_hash_is_not_the_pinned_one_is_refused_and_removed(tmp_path: Path) -> None:
    cache = tmp_path / "cache"
    cache.mkdir()
    name = f"{UPSTREAM['package'].lstrip('@').replace('/', '-')}-{UPSTREAM['version']}.tgz"
    (cache / name).write_bytes(b"not the real tarball")
    with pytest.raises(bp.PatchError, match="integrity mismatch"):
        bp.fetch_upstream(UPSTREAM, cache)
    assert not (cache / name).exists()


def test_a_tarball_with_a_path_that_escapes_the_package_is_refused(tmp_path: Path) -> None:
    tarball = tmp_path / "evil.tgz"
    with tarfile.open(tarball, "w:gz") as archive:
        info = tarfile.TarInfo("package/../evil.txt")
        info.size = 1
        archive.addfile(info, io.BytesIO(b"x"))
    with pytest.raises(bp.PatchError, match="unsafe tar member"):
        bp.extract(tarball, tmp_path / "out")
    assert not (tmp_path / "evil.txt").exists()


# ================================================================================================ the rebrand specification
def test_every_replacement_has_a_unique_id_and_a_positive_count() -> None:
    ids = [item["id"] for item in REBRAND["replacements"]]
    assert len(ids) == len(set(ids)) and all(item["count"] >= 1 for item in REBRAND["replacements"])


def test_the_privacy_patches_are_in_the_spec() -> None:
    ids = {item["id"] for item in REBRAND["replacements"]}
    assert {"privacy-telemetry-off", "privacy-version-url", "privacy-installer-url", "privacy-report-url"} <= ids
    urls = " ".join(item["replace"] for item in REBRAND["replacements"] if item["id"].startswith("privacy-"))
    assert "pi.dev" not in urls and "pink.invalid" in urls  # a reserved TLD: the call cannot reach anyone


def test_what_is_left_as_upstream_is_declared() -> None:
    assert len(REBRAND["left_as_upstream"]) >= 5 and any("protocol" in item for item in REBRAND["left_as_upstream"])


# ================================================================================================ the built package
def test_the_built_package_is_pink_and_carries_the_licences(built: dict, package_dir: Path) -> None:
    data = json.loads((package_dir / "package.json").read_text(encoding="utf-8"))
    assert data["name"] == "@thoth/pink" and data["version"] == VERSION and data["bin"] == {"pink": "dist/mux/pink.mjs"}
    assert data["piConfig"] == {"name": "pink", "configDir": ".pink"}
    assert (package_dir / "LICENSE-PI.txt").is_file() and (package_dir / "NOTICE.md").is_file()
    assert built["tarball_integrity"].startswith("sha512-") and built["upstream_integrity"] == UPSTREAM["integrity"]


def test_the_pink_theme_has_exactly_the_keys_the_upstream_dark_theme_has_and_every_colour_resolves(package_dir: Path) -> None:
    pink = json.loads((PINK / "theme" / "pink.json").read_text(encoding="utf-8"))
    dark = json.loads((package_dir / "dist" / "modes" / "interactive" / "theme" / "dark.json").read_text(encoding="utf-8"))
    assert set(pink["colors"]) == set(dark["colors"]) and pink["name"] == "pink"
    assert pink["vars"]["pink"] == PINK_ACCENT and pink["colors"]["accent"] == "pink"
    for key, value in pink["colors"].items():
        assert value == "" or isinstance(value, int) or value in pink["vars"] or re.fullmatch(r"#[0-9a-fA-F]{6}", str(value)), (key, value)


def test_the_bundle_no_longer_reads_PI_environment_variables_outside_the_excluded_libraries(package_dir: Path) -> None:
    excluded = {(package_dir / item).resolve() for item in REBRAND["env_rename"]["exclude"]}
    offenders = [path.name for path in (package_dir / "dist" / "bundle").rglob("*.js") if path.resolve() not in excluded and re.search(r"process\.env\.PI_[A-Z]", path.read_text(encoding="utf-8", errors="replace"))]
    assert offenders == []


def test_telemetry_is_off_by_default_and_the_pi_dev_endpoints_are_unreachable_in_the_bundle(package_dir: Path) -> None:
    defaults = (package_dir / DEFAULTS_CHUNK).read_text(encoding="utf-8")
    assert "enableInstallTelemetry:!1" in defaults and "enableInstallTelemetry:!0" not in defaults
    text = (package_dir / MAIN_CHUNK).read_text(encoding="utf-8")
    assert "https://pi.dev/api" not in text and "https://pink.invalid/api/latest-version" in text


# ================================================================================================ the real thing: install and run
def test_the_installed_pink_reports_its_version_and_its_help_never_says_pi(cli: Path, tmp_path: Path) -> None:
    assert run_pink(cli, tmp_path, "--version").stdout.strip().endswith(VERSION)
    helped = run_pink(cli, tmp_path, "--help").stdout
    assert helped.startswith("pink - ") and "pink install" in helped
    without_declared_links = re.sub(r"https://pi\.dev/\S*", "", helped)  # /share viewer: declared in rebrand.json left_as_upstream
    assert re.findall(r"(?<![\w-])[Pp]i(?![\w-])", without_declared_links) == []
    assert "pi.dev" not in helped and "PINK_SHARE_VIEWER_URL" in helped  # owner 2026-11-15: o /share abre o gist no GitHub


def test_pink_answers_through_a_provider_and_keeps_its_files_in_dot_pink_never_dot_pi(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    write_models(tmp_path, fake_provider)
    done = run_pink(cli, tmp_path, "-p", "ping", "--provider", "fake", "--model", "ok")
    assert done.returncode == 0 and "pong" in done.stdout
    assert (tmp_path / ".pink" / "agent").is_dir() and not (tmp_path / ".pi").exists()


def test_the_only_network_connection_is_the_one_to_the_chosen_provider(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    write_models(tmp_path, fake_provider)
    log = tmp_path / "spy.log"
    run_pink(cli, tmp_path, "-p", "ping", "--provider", "fake", "--model", "ok", "--no-session", NODE_OPTIONS=f"--require {SPY.as_posix()}", PINK_NETSPY_LOG=str(log))
    seen = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert seen and {(item["host"], item["port"]) for item in seen} == {("127.0.0.1", fake_provider)}  # as ferramentas opcionais vêm desligadas: nem a sonda do Headroom


def test_the_update_command_cannot_reach_the_pi_servers(cli: Path, tmp_path: Path) -> None:
    log = tmp_path / "spy.log"
    done = run_pink(cli, tmp_path, "update", "self", timeout=240, NODE_OPTIONS=f"--require {SPY.as_posix()}", PINK_NETSPY_LOG=str(log))
    hosts = {json.loads(line)["host"] for line in log.read_text(encoding="utf-8").splitlines() if line.strip()} if log.exists() else set()
    assert not any("pi.dev" in host for host in hosts) and "pi.dev" not in done.stdout + done.stderr


def test_the_default_theme_is_pink_in_what_the_user_sees(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    write_models(tmp_path, fake_provider)
    run_pink(cli, tmp_path, "-p", "ping", "--provider", "fake", "--model", "ok")
    sessions = sorted((tmp_path / ".pink" / "agent" / "sessions").rglob("*.jsonl"))
    assert sessions
    html = tmp_path / "out.html"
    run_pink(cli, tmp_path, "--export", str(sessions[0]), str(html))
    assert PINK_ACCENT in html.read_text(encoding="utf-8", errors="replace")


def test_pink_does_not_read_the_pi_config_directory(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    (tmp_path / ".pi" / "agent").mkdir(parents=True)
    (tmp_path / ".pi" / "agent" / "models.json").write_text(json.dumps({"providers": {"fake": {"baseUrl": f"http://127.0.0.1:{fake_provider}/v1", "api": "openai-completions", "apiKey": "k-0123456789", "models": [{"id": "ok"}]}}}), encoding="utf-8")
    done = run_pink(cli, tmp_path, "-p", "ping", "--provider", "fake", "--model", "ok", "--no-session")
    assert "pong" not in done.stdout  # the provider only exists in ~/.pi: Pink must not see it


def test_the_build_works_with_relative_output_and_cache_paths_relative_output(built: dict, tmp_path: Path) -> None:
    """npm pack runs inside the extracted package: a relative --out used to point there and the build failed with an empty message."""
    cache = tmp_path / "cache"
    cache.mkdir()
    shutil.copy(PINK / ".cache" / f"{UPSTREAM['package'].lstrip('@').replace('/', '-')}-{UPSTREAM['version']}.tgz", cache)
    done = subprocess.run([sys.executable, "-X", "utf8", str(PINK / "build_pink.py"), "--out", "rel-out", "--cache", "cache"], cwd=tmp_path, capture_output=True, text=True, timeout=600, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0, done.stderr[-300:]
    assert json.loads(done.stdout)["status"] == "BUILT" and list((tmp_path / "rel-out").glob("thoth-pink-*.tgz"))


# ================================================================================================ the OpenCode-like interface (F50b)
UI_FILE = PINK / "extensions" / "pink-ui.ts"
UI_DRIVER = ROOT / "tests" / "f50_ui_driver.mjs"
TUI_PROBE = ROOT / "tests" / "f50_tui_probe.py"


@pytest.fixture(scope="module")
def ui_facts() -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    done = subprocess.run([node, str(UI_DRIVER), str(UI_FILE)], capture_output=True, text=True, encoding="utf-8", timeout=120, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0, done.stderr[-400:]
    first, second = done.stdout.strip().splitlines()[-2:]  # o driver imprime os fatos e, por último, os da pink.3
    return {**json.loads(first), **json.loads(second)}


def test_the_big_logo_fits_every_width_and_degrades_to_plain_text_on_a_very_narrow_terminal(ui_facts: dict) -> None:
    for width, facts in ui_facts["logoWidths"].items():
        assert facts["max"] <= int(width), (width, facts)
    assert ui_facts["logoWidths"]["20"]["rows"] == 1 and ui_facts["logoWidths"]["20"]["first"] == "PINK"
    assert ui_facts["logoWidths"]["100"]["rows"] == 6 and ui_facts["logoWidths"]["100"]["first"].startswith("██")


def test_the_home_header_sits_in_the_vertical_middle_and_moves_with_the_terminal_height(ui_facts: dict) -> None:
    header = ui_facts["header"]
    assert header["topBlank50"] > header["topBlank24"] >= 1 and header["rows50"] > header["rows24"]


def test_the_input_box_is_exactly_as_wide_as_asked_with_a_pink_bar_on_every_line_and_never_overflows(ui_facts: dict) -> None:
    assert set(ui_facts["box"]["widths"]) == {40} and ui_facts["box"]["starts"] == ["▌"] * 6 and ui_facts["box"]["hasContent"]  # barra rosa cheia à esquerda (pink.3, como o OpenCode)
    assert set(ui_facts["boxTight"]["widths"]) == {20}  # an 80-column line inside a 20-column box is cut, not wrapped past the edge
    # rótulo + dicas não cabem em 40 colunas: o rótulo ganha a linha dele e as dicas não são cortadas (owner 2026-11-15)
    assert ui_facts["boxStyled"] == {"bar": True, "panel": True} and ui_facts["box"]["label"] == "thoth  provider"
    assert "Enter enviar" in ui_facts["box"]["last"]
    wide = ui_facts["boxWide"]  # cabendo, rótulo à esquerda e dicas à direita na mesma linha
    assert wide["lines"] == 4 and wide["last"].startswith("Build · thoth (automatico, gratuito)") and wide["last"].endswith("ver pensamento")
    inline = ui_facts["boxInline"]  # com espaço, o rótulo vai à direita da primeira linha e as dicas reais ficam na última
    assert set(inline["widths"]) == {60} and inline["first"].startswith("▌ abc") and inline["first"].endswith("Build · thoth ")
    assert inline["last"].rstrip().endswith("Enter enviar · shift+tab pensar · ctrl+t ver pensamento")


def test_cutting_a_styled_line_keeps_its_colour_and_counts_only_visible_columns(ui_facts: dict) -> None:
    assert ui_facts["fit"] == {"visible": 6, "cut": 3, "keepsSgr": True, "short": "ab"}
    assert ui_facts["footerWidth"] == 50 and ui_facts["footerLong"] == 20 and ui_facts["footer"].startswith(" ~/p (main)") and ui_facts["footer"].rstrip().endswith("pink 1.0")


def test_the_home_screen_leaves_for_the_session_view_on_the_first_prompt(ui_facts: dict) -> None:
    state = ui_facts["state"]
    assert state["homeHeaderLines"] > 10 and state["hasLogo"] and state["afterAgentStart"] == 0 and state["homeFlag"] is False and state["redrawn"] >= 1
    assert ui_facts["leavesOnInput"] is True


def test_the_home_input_is_centered_and_has_hints_while_the_session_input_is_full_width_without_them(ui_facts: dict) -> None:
    home, session = ui_facts["editorHome"], ui_facts["editorSession"]
    assert home["boxWidth"] == 78 and home["margin"] == 21 and home["hints"] and home["cursorKept"] and home["borderGone"] and home["paddedToTheBottom"]
    assert session["startsHome"] is False and session["headerLines"] == 0 and session["margin"] == 0 and session["boxWidth"] == 120 and session["hints"] is False
    # sob a caixa: o nome do modelo; o provedor só quando é outro; o pensamento só quando ligado (owner 2026-10-13: "thoth  thoth  off" confundia)
    label = next(part for part in ui_facts["label"].split("  ") if "thoth" in part).strip()  # rótulo e dicas na mesma linha
    assert label.endswith("thoth") and "off" not in label
    assert ui_facts["labels"] == {"same": "thoth", "other": "Claude X · anthropic · pensamento alto", "none": "sem modelo"}
    assert ui_facts["boxKeepsBackground"] is True  # owner 2026-10-13: a faixa do texto ficava preta
    assert set(ui_facts["cursorBoxWidths"]) == {30}  # owner 2026-10-13: sobrava um espaço preto no fim da faixa do texto
    assert ui_facts["fitKeepsMarker"] is True


def test_the_side_columns_show_what_pink_really_knows(ui_facts: dict) -> None:
    """Owner 2026-10-29 (86e3x0ckk): SESSÕES à esquerda e CONTEXTO/PLANO/ALTERAÇÕES/SESSÃO à direita, só com dado real."""
    stats = ui_facts["stats"]
    assert stats["title"] == "Revisão independente final F-006 R1" and stats["cost"] == 0.75
    assert stats["models"] == [{"model": "gpt-x", "input": 8200100, "output": 165050, "cache": 0}]
    assert ui_facts["tokens"] == ["811.1K", "8.2M", "999"]
    assert ui_facts["project"] == {"root": "thoth", "nested": "sub", "outside": "", "prefixOnly": "", "broken": ""}
    left, right = ui_facts["leftColumn"], ui_facts["rightColumn"]
    assert left["rows"] == 20 and left["widths"] == [32] and right["rows"] == 30 and right["widths"] == [36]  # colunas de largura fixa, na altura toda
    assert "SESSÕES" in left["text"] and "▌ Revisar autenticação" in left["text"] and "+ Nova sessão /new" in left["text"] and "5 ativas" in left["last"]
    assert "FERRAMENTAS" not in left["short"]  # baixa demais: as ferramentas saem antes das sessões
    for text in ("CONTEXTO", "46k tokens · 36% de 128k", "PLANO  1/3", "✓ Revisar middleware", "◐ Escrever teste", "○ Validar regressão",
                 "ALTERAÇÕES  2", "● editado", "● novo", "SESSÃO", "734.8K entrada │ 36.7K saída", "projeto thoth"):
        assert text in right["text"], text
    assert "$" not in right["text"] and "$0.12 gasto" in right["empty"] and "ainda sem medida" in right["empty"]  # custo só quando existe
    assert right["cut"] == 5  # altura pequena: corta embaixo, nunca passa da coluna
    assert ui_facts["changes"] == [{"path": "tests/auth.test.ts", "status": "novo"}, {"path": "src/a.ts", "status": "editado"}]


def test_the_frame_picks_the_columns_by_width_and_the_bars_by_height(ui_facts: dict) -> None:
    """Owner 2026-10-29: adaptativo como os painéis do OBS. >=150 três colunas, 115-149 sem sessões, <115 só a conversa."""
    columns = ui_facts["frame"]["columns"]
    assert columns["170"] == columns["150"] == {"left": True, "right": True}
    assert columns["149"] == columns["130"] == columns["115"] == {"left": False, "right": True}
    assert columns["114"] == columns["90"] == {"left": False, "right": False}
    assert ui_facts["frame"]["home"] == ui_facts["frame"]["off"] == {"left": False, "right": False}  # tela inicial e /lateral
    assert ui_facts["frame"]["barRows"] == [1, 1, 2, 2] and ui_facts["topBarLow"] == 1
    top = ui_facts["topBar"]
    assert all(top[w]["width"] == int(w) for w in top)
    assert "pink 9.9" in top["180"]["text"] and "~/studio" in top["180"]["text"] and "feature/x" in top["180"]["text"] and "THOTH · PLANO" in top["180"]["text"] and "36% · 46k / 128k" in top["180"]["text"]
    assert "%" not in top["110"]["text"] and "feature/x" in top["110"]["text"]  # estreito: some o medidor
    assert "feature/x" not in top["70"]["text"] and "THOTH · PLANO" in top["70"]["text"]  # mais estreito: some a branch
    assert "%" not in ui_facts["topBarNoContext"]  # contexto ainda não medido: o medidor não aparece
    bottom = ui_facts["bottomBar"]
    assert bottom["180"]["width"] == 180 and bottom["60"]["width"] == 60 and "ctrl+p comandos │ ctrl+c limpar │ /hotkeys ajuda" in bottom["180"]["text"] and "feature/x" not in bottom["60"]["text"]
    assert ui_facts["frameInstalled"] == {"left160": False, "top": True, "topLines": [160, 160]} and ui_facts["frameAfterTalk"] == {"left160": True}


def test_messages_are_labelled_and_the_empty_box_shows_the_placeholder(ui_facts: dict) -> None:
    assert ui_facts["messageLabels"] == {"user": "**Você**\n\noi", "assistant": "oi"}
    # rodapé da resposta como o do OpenCode (pink.3): modelo curto, tempo e velocidade só quando medidos
    assert ui_facts["footers"] == {"full": "Pink · claude-sonnet-4-5 · 20.5s · 45.6 tok/s", "plan": "Pink · Plano · thoth · 4.1s", "fast": "Pink · thoth · 0.0s", "history": "Pink · thoth"}


def test_the_sessions_column_tells_same_named_sessions_apart_and_titles_itself(ui_facts: dict) -> None:
    assert ui_facts["relative"] == ["14:32", "ontem", "3d", "20/10", ""]
    assert ui_facts["leftTimes"]["widths"] == [32] and ui_facts["leftTimes"]["rows"][0].rstrip(" │").endswith("14:32 ●") and ui_facts["leftTimes"]["rows"][1].rstrip(" │").endswith("ontem")
    assert ui_facts["autoTitle"] == ["revise a autenticação antes de implementar", "", 50]  # a 1ª com mais de 3 palavras; comando não conta


def test_deleting_a_session_moves_it_to_the_trash_and_never_the_current_one(ui_facts: dict) -> None:
    trash = ui_facts["trash"]
    assert trash["current"] is False and "atual" in trash["reason"] and trash["bKept"] is True  # a atual não sai (mesmo com outra caixa no caminho)
    assert trash["moved"] is True and trash["aGone"] is True and trash["trash"] == ["7-a.jsonl", "a.jsonl"]  # nada é excluído; repetido ganha prefixo
    assert ui_facts["placeholder"] == {"empty": True, "typing": False}


def test_leaving_pink_prints_the_logo_and_the_session_like_opencode(ui_facts: dict) -> None:
    """Owner 2026-10-13: ao sair, o logo do Pink e o resumo da sessão; sem conversa, só o logo e o comando para continuar."""
    assert ui_facts["exitBanner"] == {"logo": True, "session": True, "tokens": True, "resume": True, "english": False}
    assert ui_facts["exitBannerBare"] == {"tokens": False, "session": False, "resume": True}


def test_the_thinking_click_and_the_clean_exit_are_in_the_spec() -> None:
    ids = {item["id"] for item in REBRAND["replacements"]}
    # Pi 1.x toggles each thinking block on click by itself: Pink only adds the "▾ Pensamento" title over an open block
    assert {"thinking-collapsed-by-default", "thinking-header-when-shown",
            "clean-exit-by-default", "clean-exit-by-default-module", "scrollbar-hidden-by-default",
            "scrollbar-hidden-by-default-module", "frame-layout", "assistant-footer", "user-bar", "thinking-label", "home-does-not-scroll", "exit-banner"} <= ids


def test_the_footer_shows_the_folder_the_context_and_the_pink_version(ui_facts: dict) -> None:
    footer = ui_facts["footerInstalled"]
    assert footer["width"] == 100 and "demo" in footer["text"] and "ctx 12%/128k" in footer["text"] and footer["text"].endswith("pink 9.9")
    assert ui_facts["footerFramed"] == []  # na tela cheia, quem desenha o rodapé é a moldura
    assert ui_facts["printMode"]["subscribed"] == "session_start"  # print and RPC modes get no TUI: the extension checks the mode when the session starts


def test_the_package_ships_the_interface_and_loads_it_by_default(package_dir: Path) -> None:
    assert (package_dir / "extensions" / "pink-ui.ts").is_file() and "extensions" in json.loads((package_dir / "package.json").read_text(encoding="utf-8"))["files"]
    chunk = (package_dir / MAIN_CHUNK).read_text(encoding="utf-8")
    assert 'path5.join(getPackageDir(),"extensions","pink-ui.ts")' in chunk and "PINK_NO_BUILTIN_UI" in chunk and "(resolveCliPaths(cwd,parsed.extensions)??[])" in chunk
    assert "this.changelogMarkdown=void 0" in chunk and "quietStartup:!0" in (package_dir / DEFAULTS_CHUNK).read_text(encoding="utf-8")  # no Pi release notes, quiet start


# ================================================================================================ the OpenCode functions (owner 2026-10-28)
def test_the_opencode_commands_are_registered_and_the_palette_lists_them_in_portuguese(ui_facts: dict) -> None:
    oc = ui_facts["opencode"]
    assert oc["commands"] == ["build", "delete-session", "details", "help", "init", "lateral", "plan", "redo", "session-open", "sessions", "themes", "todos", "undo"]
    assert oc["events"][-1] == "session_start" and {"agent_start", "tool_call", "before_agent_start"} <= set(oc["events"])
    assert oc["palette"] == {"first": "/new  Nova sessão", "hasUndo": True, "extra": "/minha  Do usuário", "undoOnce": 1}


def test_ctrl_p_opens_the_palette_and_tab_on_an_empty_box_switches_the_agent(ui_facts: dict) -> None:
    assert ui_facts["keys"] == ["palette", "agent", "editor:tab", "editor:x", "set:/new", "editor:\r"]  # with text, tab is the editor's (completion); ctrl+n types /new


def test_the_plan_agent_reads_asks_before_bash_and_blocks_edits(ui_facts: dict) -> None:
    oc = ui_facts["opencode"]
    assert oc["plan"] == ["allow", "allow", "allow", "ask", "block", "block", "block", "allow"]  # read grep todowrite bash edit write mcp(unknown) mcp(read-only)
    assert oc["agentLabel"] == "Plano · thoth" and ui_facts["labels"]["same"] == "thoth"  # the agent shows under the box, before the model


def test_the_todo_list_keeps_the_latest_write_and_renders_its_progress(ui_facts: dict) -> None:
    oc = ui_facts["opencode"]
    assert oc["todos"] == [{"content": "a", "status": "completed"}, {"content": "b", "status": "pending"}]
    assert oc["todoLines"] == ["Tarefas 1/2", "  ✓ a", "  ◐ b"] and oc["fromBranch"] == [{"content": "new", "status": "completed"}]


def test_undo_restores_the_files_byte_for_byte_and_redo_brings_the_change_back_without_touching_the_users_git(ui_facts: dict) -> None:
    oc = ui_facts["opencode"]
    assert oc["lastUser"] == "3" and oc["nameStatus"] == [{"status": "M", "path": "a.txt"}, {"status": "A", "path": "dir/c d.txt"}, {"status": "D", "path": "b.txt"}]
    assert ui_facts["undo"] == {"snapshot": True, "changed": 3, "a": "one\n", "b": "keep\n", "c": None, "u": "untracked before\n", "ignored": "ignored\n", "userIndexUntouched": True, "objectsUntouched": True}
    assert ui_facts["redo"] == {"a": "two\n", "b": None, "c": "created by the agent\n"} and ui_facts["outsideGit"] is True


def test_the_model_cycle_moved_to_f2_so_ctrl_p_is_the_palette_and_exports_are_pink(package_dir: Path) -> None:
    chunk = (package_dir / MAIN_CHUNK).read_text(encoding="utf-8")
    assert '"app.model.cycleForward":{defaultKeys:"f2",' in chunk and '"app.model.cycleBackward":{defaultKeys:"shift+f2",' in chunk
    assert 'generateHtml(sessionData,opts.themeName??"pink")' in chunk


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty); the layout functions above run everywhere")
def test_in_a_real_terminal_the_home_screen_then_the_session_view_look_like_opencode(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    sys.path[:0] = [str(TUI_PROBE.parent)]
    from f50_tui_probe import run_tui

    write_models(tmp_path, fake_provider)
    (tmp_path / ".pink" / "agent" / "settings.json").write_text(json.dumps({"defaultProvider": "fake", "defaultModel": "ok"}), encoding="utf-8")
    screens = run_tui(cli, tmp_path, [(None, 6.0), ("\r", 8.0), ("oi pink", 1.0), ("\r", 12.0)], rows=40)
    home, session = "\n".join(screens[1]), "\n".join(screens[3])
    assert "██████╗ ██╗███╗" in home and "▌" in home and "comandos" in home and f"pink {VERSION}" in home  # logo, input box, hints, top bar
    assert "earendil" not in home.lower() and "changelog" not in home.lower() and "What's new" not in home  # nothing from Pi's release notes
    logo_row = next(i for i, line in enumerate(screens[1]) if "██████╗ ██╗███╗" in line)
    assert 5 <= logo_row <= 25 and all(line.index("█") > 20 for line in screens[1] if "██████╗" in line)  # roughly centered, in the upper-middle
    assert "██████╗ ██╗███╗" not in session and "oi pink" in session and "pong" in session  # the logo left, the conversation is there
    bar_rows = [i for i, line in enumerate(screens[3]) if "Peça a próxima etapa" in line]
    assert bar_rows and min(bar_rows) > len(screens[3]) // 2  # the input box now sits at the bottom


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty)")
def test_in_a_real_terminal_the_frame_shows_three_two_or_one_column_by_width(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    """Owner 2026-10-29 (86e3x0ckk): a largura do terminal decide as colunas, e o redimensionamento recalcula na hora."""
    sys.path[:0] = [str(TUI_PROBE.parent)]
    from f50_tui_probe import run_tui

    write_models(tmp_path, fake_provider)
    (tmp_path / ".pink" / "agent" / "settings.json").write_text(json.dumps({"defaultProvider": "fake", "defaultModel": "ok"}), encoding="utf-8")
    steps = [(None, 6.0), ("\r", 6.0), ("oi pink", 1.0), ("\r", 10.0), ((170, 40), 3.0), ((130, 40), 3.0), ((100, 30), 3.0), ((170, 16), 3.0)]
    wide, middle, narrow, low = ("\n".join(screen) for screen in run_tui(cli, tmp_path, steps, columns=170, rows=40)[4:])
    assert "SESSÕES" in wide and "CONTEXTO" in wide and "pong" in wide and "Você" in wide and "Pink · ok · " in wide and "THOTH · BUILD" in wide and "▌" in wide
    assert "SESSÕES" not in middle and "CONTEXTO" in middle and "pong" in middle
    assert "SESSÕES" not in narrow and "CONTEXTO" not in narrow and "pong" in narrow and "ctrl+p comandos" in narrow
    assert "SESSÕES" in low and "pong" in low and len(low.splitlines()) <= 16  # altura pequena: a moldura encolhe, não quebra


@pytest.mark.skipif(sys.platform != "win32", reason="the terminal test uses ConPTY (pywinpty)")
def test_in_a_real_terminal_the_model_asks_with_options_and_gets_the_choice(cli: Path, fake_provider: int, tmp_path: Path) -> None:
    """Owner 2026-11-17 (card 1dfwh7kfmqn): pergunta com opções nativa, como AskUserQuestion/request_user_input/question."""
    sys.path[:0] = [str(TUI_PROBE.parent)]
    from f50_tui_probe import run_tui

    target = tmp_path / ".pink" / "agent"
    target.mkdir(parents=True, exist_ok=True)
    (target / "models.json").write_text(json.dumps({"providers": {"fake": {"baseUrl": f"http://127.0.0.1:{fake_provider}/v1", "api": "openai-completions", "apiKey": "fake-key-0123456789", "models": [{"id": "ask"}]}}}), encoding="utf-8")
    (target / "settings.json").write_text(json.dumps({"defaultProvider": "fake", "defaultModel": "ask"}), encoding="utf-8")
    screens = run_tui(cli, tmp_path, [(None, 6.0), ("\r", 6.0), ("pergunte", 1.0), ("\r", 10.0), ("\x1b[B", 2.0), ("\r", 10.0)], columns=120, rows=40)
    asking, answered = "\n".join(screens[3]), "\n".join(screens[5])
    assert "Publicar agora?" in asking and "1. Sim, publicar" in asking and "2. Não, depois" in asking and "3. Escrever outra resposta." in asking
    assert "↑↓ navegar • Enter escolher • Esc cancelar" in asking  # a tela em português
    assert "eco:" in answered and "user selected: 2. Não, depois" in answered  # a escolha (seta para baixo + Enter) volta ao modelo


def test_permissions_confirm_destructive_commands_protect_secrets_and_follow_the_rules(ui_facts: dict, package_dir: Path) -> None:
    """Owner 2026-11-17 (card 1dfwh7kfmqp): allow/ask/deny como o Claude Code; sem tela, o que pede confirmação é recusado."""
    p = ui_facts["permissions"]
    h = p["headless"]
    assert "não há tela" in h["rm"]["reason"] and "não há tela" in h["ps"]["reason"] and h["ls"] == "ok" and h["src"] == "ok" and h["readEnv"] == "ok"
    assert "protegido" in h["env"]["reason"] and "protegido" in h["git"]["reason"]
    r = p["rules"]
    assert r["allowed"] == "ok" and "deny bash(curl*)" in r["curl"]["reason"] and "deny read(.env*)" in r["readEnv"]["reason"] and "ask bash(git push*)" in r["push"]["reason"]
    assert p["untrustedEnv"]["block"] is True  # regra do projeto só vale em pasta confiável
    assert p["ui"] == {"firstUi": "ok", "secondUi": "ok", "asked": 1, "options": ["Permitir uma vez", "Permitir nesta sessão", "Negar"]}
    assert p["bad"] == 1 and p["command"] == ["permissoes"]
    chunk = (package_dir / MAIN_CHUNK).read_text(encoding="utf-8")
    assert 'resolvedExtensionPaths=[path5.join(getPackageDir(),"extensions","pink-permissions.ts"),path5.join(getPackageDir(),"extensions","pink-hooks.ts"),...process.env.PINK_NO_BUILTIN_UI' in chunk  # primeiro: vê o comando antes do RTK reescrever
    assert (package_dir / "extensions" / "pink-permissions.ts").is_file()
    e = p["edges"]  # achados do Argus
    assert e["allowCompound"] != "ok" and e["denyCompound"]["block"] and e["denyNewline"]["block"] and e["denySudoPath"]["block"]
    assert e["otherTool"]["block"] and e["mcpName"]["block"] and e["rmFR"]["block"] and e["gitC"]["block"] and e["gitFu"]["block"] and e["plusRef"]["block"]
    assert e["rdQS"]["block"] and e["ruffFormat"] == "ok" and e["fooEnv"] == "ok" and e["atEnv"]["block"] and e["brokenHeadless"]["block"]
    assert e["afterRtk"]["block"] and "deny bash(git push*)" in e["afterRtk"]["reason"]
    assert all(e[k]["block"] for k in ("sudoLs", "bashC", "envRm", "quotedRm", "varRm", "xargsRm", "cmdRd", "wrappedCurl", "sudoAllowed"))  # 2ª revisão do Argus
    assert e["allowRedirect"] == "ok"
    assert e["ownHooks"]["block"] and e["ownRules"]["block"] and "próprias regras" in e["agentHooks"]["reason"]  # 3ª revisão do Argus (H1)


def test_hooks_run_commands_like_claude_code_block_feed_back_and_respect_trust(ui_facts: dict, package_dir: Path) -> None:
    """Owner 2026-11-17 (card 1dfwh7kfmqq): PreToolUse/PostToolUse/SessionStart/Stop num hooks.json; o do projeto só em pasta confiável."""
    k = ui_facts["hooks"]
    assert k["blockExit2"] == {"block": True, "reason": "Bloqueado por hook: nao pode"} and k["passBash"] == "ok"
    assert k["blockJson"]["reason"] == "Bloqueado por hook: json diz nao"
    assert k["timeoutRead"] == "ok" and k["timeoutNote"] and k["timeoutMs"] < 8000  # timeout por hook mata e não bloqueia
    assert k["untrustedGrep"] == "ok" and k["trustedGrep"]["block"]
    assert k["post"]["content"][-1]["text"] == "[hook PostToolUse] lint achou 2"
    assert k["context"]["message"]["content"] == "contexto do hook" and k["contextOnce"] == "ok" and k["stop"]
    assert k["newFormat"]["reason"] == "Bloqueado por hook: formato novo" and k["childEvents"] == ["tool_call", "tool_result"]  # Argus: formato novo do Claude Code; subagente só hooks de ferramenta
    chunk = (package_dir / MAIN_CHUNK).read_text(encoding="utf-8")
    assert '"pink-permissions.ts"),path5.join(getPackageDir(),"extensions","pink-hooks.ts"),' in chunk and (package_dir / "extensions" / "pink-hooks.ts").is_file()


def test_tools_and_thinking_collapse_to_one_grey_line_and_expand_to_the_pi_view(ui_facts: dict) -> None:
    """Owner 2026-10-29 (pink.3): uma linha por bloco, como o OpenCode; ctrl+o / ctrl+t expandem para a visão do Pi (com o diff)."""
    c = ui_facts["pink3"]["compact"]
    assert c["shell"] == "self" and c["running"] == " → Editou src/x.ts …" and c["callAfter"] == []
    assert c["done"] == " → Editou src/x.ts +2 −1 · 1.2s" and c["error"] == " → Editou src/x.ts +2 −1 · erro"
    assert c["expanded"] == ["BASE CALL", "BASE DIFF"] and c["noBase"] == [" a", " b"]
    assert c["summaries"][:2] == ["Leu a.ts", "Escreveu b.ts · 3 linhas"] and c["summaries"][2].startswith("Rodou: npm test -- --watch=false") and c["summaries"][2].endswith("…")
    assert c["summaries"][3:] == ['Buscou "TODO"', "Listou .", "Plano · 1/2", "mcp_x"]
    assert ui_facts["pink3"]["thinking"] == ["+ Pensou · 6.3s", "+ Pensou"]


def test_a_stale_context_after_switching_sessions_draws_nothing_instead_of_crashing(ui_facts: dict) -> None:
    """Achado na captura da pink.3: o clique trocava a sessão e o Pink caía com 'ctx is stale'."""
    assert ui_facts["pink3"]["stale"] == {"empty": [], "passThrough": "x", "ok": 42}


def test_pink_answers_in_the_users_language_with_brazilian_portuguese_as_the_default(ui_facts: dict) -> None:
    lang = ui_facts["pink3"]["language"]
    assert lang["build"].startswith("BASE") and "português do Brasil" in lang["build"] and "idioma em que o usuário escreve" in lang["build"] and lang["plan"] is True
    assert "modelo claude-sonnet-4-5, thoth" in ui_facts["pink3"]["rightModels"] and "$" not in ui_facts["pink3"]["rightModels"]


def test_the_thoth_section_shows_approvals_card_and_the_free_source_and_degrades_without_thoth(ui_facts: dict) -> None:
    """Card 86e3px66t: a lateral mostra o que vem do Thoth; sem Thoth diz "Thoth indisponível" e o Pink segue. Nenhum segredo na tela."""
    thoth = ui_facts["thoth"]
    full = thoth["full"]
    assert full["approvals"] == {"count": 1, "top": "execute task · thoth"}  # a vencida e a aprovada não contam
    assert full["card"]["id"] == "86e3px66t" and "delegations" not in full  # card 1dfwh7kf9vt: a ponte de delegação saiu
    assert full["free"] == "zen · big-pickle"  # a última chamada que teve provedor
    for text in ("THOTH", "aprovações           1 aguardando", "card                    86e3px66t", "thoth free       zen · big-pickle"):
        assert text in thoth["text"], text
    assert thoth["widths"] == [36] and thoth["leaks"] is False  # nem o token nem o código de escape chegam à tela
    assert thoth["down"] == {"ok": False} and "Thoth indisponível" in thoth["downText"] and "PLANO" in thoth["downText"]
    assert thoth["partial"] == {"card": None, "ok": True} and "nenhum em andamento" in thoth["partialText"] and "aprovações                      —" in thoth["partialText"]
    assert "consultando…" in thoth["loading"] and thoth["absent"] is False


def test_the_quota_section_shows_claude_and_codex_five_hours_and_week(ui_facts: dict) -> None:
    """Owner 2026-11-15: contadores de cota do Claude e do Codex na coluna da direita, como no painel local (5 h e semana)."""
    plan = ui_facts["plan"]
    snap = plan["snap"]
    assert snap["ok"] is True and snap["claude"]["h5"]["pct"] == 43 and snap["claude"]["week"]["pct"] == 95
    assert snap["codex"]["h5"] == {"pct": 0}  # a janela já virou: zera, como no painel
    assert snap["codex"]["week"]["pct"] == 100  # estourado aparece cheio
    for text in ("COTA", "Claude", "Codex", "5 h", "semana", "43% · volta", "95%"):
        assert text in plan["text"], text
    assert plan["widths"] == [36]
    assert plan["noClaude"] == {"ok": True, "claude": None} and "thoth-client uso ativar" in plan["noClaudeText"]
    assert plan["none"] == {"ok": False} and plan["absent"] is False and plan["loading"] is True
    assert plan["read"] is True and plan["broken"] == "rejeitou"


def test_the_themes_of_opencode_claude_and_codex_ship_with_the_same_keys_as_pink(package_dir: Path) -> None:
    """Owner 2026-11-15: os temas do OpenCode, do Claude Code e do Codex no /themes do Pink."""
    pink = json.loads((PINK / "theme" / "pink.json").read_text(encoding="utf-8"))
    extra = json.loads((package_dir / "dist" / "modes" / "interactive" / "theme" / "extra-themes.json").read_text(encoding="utf-8"))
    assert len([n for n in extra if n.startswith("opencode-")]) >= 25 and {"claude-dark", "claude-light", "codex-catppuccin-mocha"} <= set(extra)
    for name, theme in extra.items():
        assert theme["name"] == name and theme["appearance"] in ("dark", "light") and "/" not in name
        assert set(theme["colors"]) == set(pink["colors"]), name
        assert all(re.fullmatch(r"#[0-9a-f]{6}", value) for value in theme["colors"].values()), name
    chunk = (package_dir / "dist" / "bundle" / "chunks" / "chunk-T726RZZU.js").read_text(encoding="utf-8")
    assert 'path4.join(themesDir,"extra-themes.json")' in chunk


def test_the_docs_say_pink_without_breaking_pinks_own_files_links_or_examples(package_dir: Path) -> None:
    """Owner 2026-11-15 ("remova todas as referências ao Pi"); achados do Argus: README/PINK.md intactos, links viram texto."""
    assert (package_dir / "README.md").read_text(encoding="utf-8") == (PINK / "README.md").read_text(encoding="utf-8")
    assert (package_dir / "docs" / "PINK.md").read_text(encoding="utf-8") == (PINK / "docs" / "PINK.md").read_text(encoding="utf-8")
    docs = {p.name: p.read_text(encoding="utf-8") for p in (package_dir / "docs").glob("*.md") if p.name not in ("PINK.md", "containerization.md")}
    everything = "\n".join(docs.values())
    assert "](docs/)" not in everything and "pi.dev" not in everything.replace("https://pi.dev/oauth", "") and "github.com/earendil-works/pi" not in everything
    # rodada 3: Radius e /bug sumiram de toda a documentação (`mcp__radius__*` é só um nome de servidor de exemplo)
    assert "Radius" not in everything and "/bug" not in everything and '"radius"`' not in docs["settings.md"]
    assert not re.search(r"(?i)\bpi-(specific|generated|managed)\b", everything) and "pink.invalid" not in docs["mcp.md"]
    assert "#configure-pi)" not in everything
    # exemplos que o modelo pode repetir continuam válidos (rodada 2 do Argus)
    assert "the Pink package docs" not in everything and "](the " not in everything
    assert "npm install -g @thoth/pink" in docs["quickstart.md"] and "curl -fsSL" not in docs["quickstart.md"]
    assert not re.search(r'"\$schema":\s*"(?!https?://)', everything)
    assert "https://pi.dev/oauth/client.json" in docs["mcp.md"]  # o client ID real do login de MCP (left_as_upstream)
    assert not re.search(r"(?<![\w])PI_[A-Z*]", everything) and "/bug" not in docs["sessions.md"]
    assert "pink mcp add" in docs["mcp.md"] and "~/.pink/agent/mcp.json" in docs["mcp.md"]
    assert "pi.on(" in everything and "pink.on(" not in everything  # o objeto da API de extensões continua `pi`


def test_ponytail_rtk_headroom_and_graphify_come_with_pink_and_fail_open(ui_facts: dict) -> None:
    """Owner 2026-11-15 ("ponytail, rtk, headroom e graphify, todas nativas"; card 1dfwh7kffk2)."""
    n = ui_facts["natives"]
    # tudo ligado no pink-tools.json, pasta confiável
    assert n["trusted"]["report"] == {"ponytail": True, "rtk": True, "headroom": True, "graphify": True}
    servers = n["trusted"]["servers"]
    assert servers["headroom"] == {"url": "http://127.0.0.1:8789/mcp"}
    assert servers["graphify"]["command"].replace("\\", "/").endswith("pink-fake-bin/graphify-mcp.exe") and servers["graphify"]["args"][0] == "--graph" and servers["graphify"]["args"][1].endswith("graph.json")
    # graphify só depois da confiança, e sai numa pasta não confiável (Argus: grafo de repositório qualquer vira contexto)
    assert n["beforeTrust"] == ["headroom"] and n["untrusted"] == ["headroom"] and n["untrustedReport"] is False
    assert n["commands"] == ["ferramentas", "ponytail"] and n["loaded"].replace("\\", "/").endswith("@dietrichgebert/ponytail/pi-extension/index.js")
    assert n["skills"]["skillPaths"][0].replace("\\", "/").endswith("@dietrichgebert/ponytail/skills") and n["quiet"] == "1"
    # RTK: 0 e 3 reescrevem, 1 mantém, 2 bloqueia com a mensagem da regra, já com rtk não mexe, só o bash
    assert n["rtk"] == {"git": "rtk git status", "advisory": "rtk pytest -q", "plain": "echo hi", "already": "rtk ls", "denied": {"blocked": "RTK: denied by rule"}, "powershell": "git status"}
    assert n["failOpen"] == "git status" and n["rtkOff"] == "git status"
    # quem instala o Pink: tudo desligado, nada carregado nem registrado, um aviso do /ferramentas na TUI
    assert n["fresh"] == {"report": {"ponytail": False, "rtk": False, "headroom": False, "graphify": False}, "servers": [], "loads": 1}
    assert n["notes"] == ["O Pink tem ferramentas opcionais (Ponytail, RTK, Headroom, graphify): /ferramentas"] and n["freshTool"] == "git status"
    # o /ferramentas liga na hora o RTK e o graphify; a escolha vai para <pasta do agente>/pink-tools.json
    assert n["afterMenuTool"] == "rtk git status" and n["freshAfter"] == ["graphify"]
    assert n["saved"]["file"].replace("\\", "/").endswith("pink-fake-agent/pink-tools.json") and n["saved"]["choices"] == {"ponytail": True, "rtk": False, "headroom": False, "graphify": False}
    # outro programa na 8789 não vira o Headroom; .cmd no Windows não conta (o spawn sem shell não abre); PATH com aspas
    assert n["otherHeadroom"] is False and n["cmdShim"] is None and n["quoted"] is True and n["posix"].replace("\\", "/") == "/opt/bin/rtk"
    assert n["found"].replace("\\", "/").endswith("pink-fake-pkg/node_modules/@dietrichgebert/ponytail") and n["lost"] is None
    # a pink-ui não força mais o prompt: a seção do Ponytail chega ao provedor junto com a do idioma
    assert ui_facts["prompt"] == {"forced": False, "sections": ["pink_language", "ponytail"], "language": True}
    # revisão 2 do Argus: rtk e graphify pelo caminho absoluto, PATH relativo ignorado (um rtk.exe plantado no projeto não roda)
    a = n["argus2"]
    assert [p.replace("\\", "/") for p in a["execs"]] == [a["execs"][0].replace("\\", "/")] and a["execs"][0].replace("\\", "/").endswith("pink-fake-bin/rtk.exe")
    assert a["relativePath"].replace("\\", "/").endswith("pink-fake-bin/rtk.exe") and a["onlyRelative"] is None
    # Headroom desligado antes de a sonda voltar não registra; desliga e liga pelo menu; fora do ar avisa
    assert a["raceServers"] == [] and a["raceReport"] is False
    assert a["toggledOff"] == [] and a["toggledOn"] == ["headroom"]
    assert a["downServers"] == [] and a["downNotes"][0][0] == "warning" and "fora do ar" in a["downNotes"][0][1]
    # Esc sai do menu na primeira volta; erro ao salvar aparece e a escolha vale na sessão
    assert a["escRows"] == [5] and a["failNotes"][0][0] == "error" and "disco cheio" in a["failNotes"][0][1] and a["failTool"] == "rtk git status"


def test_pink_reads_only_its_own_skills_and_ships_the_natives(package_dir: Path) -> None:
    """Owner 2026-11-15 ("2 sim": sem as pastas .agents/skills compartilhadas com o Codex)."""
    chunk = (package_dir / "dist" / "bundle" / "chunks" / "chunk-MM3LKT73.js").read_text(encoding="utf-8")
    assert 'collectAutoSkillEntries(userAgentsSkillsDir,"agents")' not in chunk and "projectAgentsSkillDirs=[]" in chunk
    trust = (package_dir / "dist" / "bundle" / "chunks" / "chunk-INGZIYBC.js").read_text(encoding="utf-8")
    start = trust.index("function hasTrustRequiringProjectResources")
    checker = trust[start:trust.index("var ProjectTrustStore", start)]
    assert 'join(currentDir,".agents","skills")' not in checker and checker.endswith("return!0;return!1}")  # só as pastas .pink pedem confiança
    assert 'path5.join(getPackageDir(),"extensions","pink-natives.ts")' in chunk and (package_dir / "extensions" / "pink-natives.ts").is_file()
    manifest = json.loads((package_dir / "package.json").read_text(encoding="utf-8"))
    assert manifest["dependencies"]["@dietrichgebert/ponytail"] == "5.3.3"  # versão fixa (MIT)
    assert "~/.agents/skills/` and `.agents/skills/` (other agents use them)" in (package_dir / "docs" / "skills.md").read_text(encoding="utf-8")


def test_subagents_are_native_the_pi_example_loaded_always(package_dir: Path) -> None:
    """Owner 2026-11-16 (card 1dfwh7kfm3u): subagente nativo, como Claude Code/OpenCode/Codex, sem copiar o código do Pi."""
    chunk = (package_dir / "dist" / "bundle" / "chunks" / "chunk-MM3LKT73.js").read_text(encoding="utf-8")
    loader = 'path5.join(getPackageDir(),"examples","extensions","subagent","index.ts")'
    assert loader + ',path5.join(getPackageDir(),"examples","extensions","questionnaire.ts"),' in chunk  # card 1dfwh7kfmqn: pergunta com opções
    questionnaire = (package_dir / "examples" / "extensions" / "questionnaire.ts").read_text(encoding="utf-8")
    assert 'if (ctx.mode !== "tui")' in questionnaire and 'label: "Escrever outra resposta."' in questionnaire  # sem tela não trava; tela em português
    assert chunk.count(loader) == 1 and '"pink-natives.ts")],' + loader in chunk  # depois do ternário: fora do interruptor da interface
    example = package_dir / "examples" / "extensions" / "subagent"
    index, agents = (example / "index.ts").read_text(encoding="utf-8"), (example / "agents.ts").read_text(encoding="utf-8")
    assert 'new Map<string, AgentConfig>([["general", { name: "general"' in agents  # o general existe sem nenhum .md
    assert "if (process.env.PINK_SUBAGENT) return;" in index and 'env: { ...process.env, PINK_SUBAGENT: "1" },' in index  # sem aninhar
    assert 'params.agentScope ?? (trusted ? "both" : "user")' in index and 'args.agentScope ?? "auto"' in index
    gate = index[index.index('(agentScope === "project" || agentScope === "both") &&'):index.index("const requestedAgentNames")]
    assert not re.search(r"confirmProjectAgents\s*(&&|\|\|)", gate) and "!trusted" in gate  # Argus: fora de pasta confiável o modelo não pula a confirmação
    assert "const ok = ctx.hasUI && await ctx.ui.confirm(" in index  # sem tela, agente do projeto em pasta não confiável é recusado
    assert 'return { command: "pink", args };' in index  # o filho é o Pink, não o Pi


# atribuição MIT (NOTICE, licença, linha de fork do README, repository do package.json) e o nosso mapa de nomes
PI_ATTRIBUTION = {"NOTICE.md", "LICENSE-PI.txt", "README.md", "package.json", "npm-shrinkwrap.json", "CHANGELOG.md", "docs/PINK.md"}
THIRD_PARTY_LIB = "dist/bundle/chunks/lib-4AVRLBHM.js"  # realce de código: a constante matemática PI, não o produto


def test_the_package_no_longer_says_pi_outside_the_declared_exceptions(package_dir: Path) -> None:
    """Owner 2026-11-15 ("faça uma auditoria rígida e mude tudo para Pink"; card 1dfwh7kffk5)."""
    product = re.compile(r"(?<![\w{$])Pi(?![\w}$])")
    site = re.compile(r"pi\.dev(?!/oauth)")
    env = re.compile(r"(?<![\w$])PI_(?=[A-Z*])")
    # pi minúsculo como palavra em texto (não pi. pi( pi) pi, pi: pi= nem `pi` sozinho entre crases): docs, exemplos .md e
    # os textos (literais) do bundle; o objeto pi da API e os ids internos são as exceções do NOTICE
    word = re.compile(r"(?<![\w.\-/@$(\"'`#{\[])pi(?![\w.\-/@$():,=\[\]`'\"}])|(?<![\w.$`])pi's\b|\"pi\"(?=, \"--)|(?<=[`\"'])pi(?= [\w-])")
    api_text = re.compile(r"Do not use a captured pi or command ctx|fi<fl&&pi<pl;fi\+\+,pi\+\+")
    literal = re.compile(r'"(?:[^"\\\n]|\\.){2,400}"|`(?:[^`\\]|\\.){2,800}`')
    found: dict[str, list[str]] = {"Pi": [], "pi.dev": [], "PI_": [], "pi": []}
    names = []
    for path in package_dir.rglob("*"):
        rel = path.relative_to(package_dir).as_posix()
        if re.search(r"(?<![a-z])pi(?![a-z])", path.name.lower()):
            names.append(rel)
        if not path.is_file() or rel in PI_ATTRIBUTION or rel == THIRD_PARTY_LIB or path.suffix in {".map", ".wasm", ".png", ".node"}:
            continue
        # de terceiros: a letra grega Π numa tabela de símbolos e a categoria Unicode Pi (Initial_Punctuation)
        text = re.sub(r'Pi:"\\u03A0"|Initial_Punctuation Pi\b', "", path.read_text(encoding="utf-8", errors="replace"))
        bundle, sdk = rel.startswith("dist/bundle/"), rel.startswith("dist/") and not rel.startswith("dist/bundle/")
        checks = [("Pi", product), ("pi.dev", site)] + ([] if sdk else [("PI_", env)])  # o SDK lê PI_* (exceção do NOTICE)
        for kind, rx in checks:
            if rx.search(text):
                found[kind].append(rel)
        if path.suffix == ".md" or bundle:
            spans = [m.group(0) for m in literal.finditer(text)] if bundle else [text]
            if any(word.search(api_text.sub("", span)) for span in spans):
                found["pi"].append(rel)
    # nomes de módulo que o código importa (pi-manifest lê a chave `pi` do package.json): renomear não muda nada visível
    internal = re.compile(r"LICENSE-PI\.txt|dist/(?:core/pi-manifest|utils/pi-user-agent|modes/interactive/components/pi-logo)\.(?:js|d\.ts)(?:\.map)?|dist/bundle/chunks/pi-messages-\w+\.js")
    assert [n for n in names if not internal.fullmatch(n)] == [] and found == {"Pi": [], "pi.dev": [], "PI_": [], "pi": []}, (names, found)
    # o SDK importa das dependências só nomes que elas exportam: nada renomeado para PINK_ (revisão 1 do Argus)
    broken = [p.relative_to(package_dir).as_posix() for p in (package_dir / "dist").rglob("*.js")
              if "bundle" not in p.parts and re.search(r"import \{[^}]*\bPINK_\w*[^}]*\} from \"@earendil-works/", p.read_text(encoding="utf-8"))]
    assert broken == []
    # revisão 2 do Argus: `pi` entre crases como comando ou nome também conta, nos docs e nos textos/comentários dos
    # exemplos; ficam só a chave `pi` do package.json e o objeto `pi` da API (exceções do NOTICE)
    quoted = re.compile(r"`pi`")
    allowed = re.compile(r"`pi` key|`pi` manifest|methods on `pi`")
    leftovers = []
    for path in sorted([*(package_dir / "docs").rglob("*.md"), *(package_dir / "examples").rglob("*")]):
        rel = path.relative_to(package_dir).as_posix()
        if not path.is_file() or rel in PI_ATTRIBUTION or path.suffix not in {".md", ".ts", ".js", ".mjs"}:
            continue
        text = path.read_text(encoding="utf-8")
        spans = text.splitlines() if path.suffix == ".md" else [m.group(0) for m in literal.finditer(text)] + [line for line in text.splitlines() if line.strip().startswith(("//", "*", "/*"))]
        leftovers += [f"{rel}: {span.strip()[:120]}" for span in spans if (word.search(allowed.sub("", span)) or quoted.search(allowed.sub("", span)))]
    assert leftovers == [], leftovers
    doc = lambda name: (package_dir / "docs" / name).read_text(encoding="utf-8")  # noqa: E731
    assert "registers as `pink`" in doc("mcp.md") and "Run `pink` from" in doc("usage.md") and "running `pink` opens" in doc("cli-integration.md")
    assert "`AI_AGENT=pink`" in doc("environment-variables.md") and "`pink update pink`" in doc("cli.md") and "update pi`" not in doc("cli.md")
    assert "Default: `pink`." in (package_dir / "dist" / "core" / "mcp-servers.d.ts").read_text(encoding="utf-8")
    assert 'command: "pink"' in (package_dir / "examples" / "extensions" / "subagent" / "index.ts").read_text(encoding="utf-8")
    # o README do pacote só fala do Pi na linha de fork e na de licença
    readme = [line for line in (package_dir / "README.md").read_text(encoding="utf-8").splitlines() if "fork do" not in line and not line.startswith("Licença:")]
    assert not [line for line in readme if product.search(line)]
    system_prompt = "".join(p.read_text(encoding="utf-8") for p in (package_dir / "dist" / "bundle" / "chunks").glob("chunk-MM3LKT73.js"))
    assert "You can inspect PINK_* environment variables" in system_prompt and 'new McpClient({name:"pink",' in (package_dir / "dist" / "bundle" / "chunks" / "chunk-EGE5YVUM.js").read_text(encoding="utf-8")
    # arquivos que tinham o nome do Pi ou não servem ao Pink; o changelog é o do Pink
    docs = package_dir / "docs"
    assert (docs / "how-pink-works.md").is_file() and not (docs / "containerization.md").exists()
    assert "containerization.md" not in (docs / "docs.json").read_text(encoding="utf-8") and '"how-pink-works.md"' in (docs / "docs.json").read_text(encoding="utf-8")
    assert (package_dir / "CHANGELOG.md").read_text(encoding="utf-8").startswith("# Changelog do Pink")
    # o modelo e a pessoa leem pink; instalar é o pacote do Pink; o import das extensões segue o nome do módulo
    quickstart = (docs / "quickstart.md").read_text(encoding="utf-8")
    assert "npm install -g @thoth/pink" in quickstart and "nix profile" not in quickstart and "-g --ignore-scripts @earendil-works" not in quickstart
    assert "operating inside pink, a coding agent harness" in (package_dir / "dist" / "core" / "system-prompt.js").read_text(encoding="utf-8")
    assert "Earendil, the upstream developers," in (package_dir / "dist" / "modes" / "interactive" / "bug-report.js").read_text(encoding="utf-8")
    assert 'from "@earendil-works/pi-coding-agent"' in (docs / "extensions.md").read_text(encoding="utf-8")


def test_build_moves_removes_and_renames_only_inside_comments(tmp_path: Path) -> None:
    (tmp_path / "a.js").write_text('// pi does it\nconst pi = load(); pi.on("x"); // pi\n * pi here\n', encoding="utf-8")
    (tmp_path / "old.md").write_text("x", encoding="utf-8")
    (tmp_path / "gone.md").write_text("x", encoding="utf-8")
    rule = {"id": "c", "files": ["*.js"], "regex": r"(?<![\w.])pi(?![\w.])", "replace": "pink", "min_count": 2, "comments_only": True}
    assert bp.apply_env_rename(tmp_path, rule)["count"] == 2
    assert (tmp_path / "a.js").read_text(encoding="utf-8") == '// pink does it\nconst pi = load(); pi.on("x"); // pi\n * pink here\n'
    spec = {"package_json": {"set": {}}, "add_files": [], "replacements": [], "env_rename": {"regex": "x^", "files": [], "replace": "", "min_count": 0},
            "move_files": [{"from": "old.md", "to": "new.md"}], "remove_files": ["gone.md"]}
    (tmp_path / "package.json").write_text('{"name": "p", "version": "1", "bin": {}}', encoding="utf-8")
    bp.apply_spec(tmp_path, spec)
    assert (tmp_path / "new.md").is_file() and not (tmp_path / "old.md").exists() and not (tmp_path / "gone.md").exists()
    with pytest.raises(bp.PatchError, match="remove_files"):
        bp.apply_spec(tmp_path, spec | {"move_files": []})
    # mover: origem que sumiu ou destino que já existe falham
    with pytest.raises(bp.PatchError, match="move_files"):
        bp.apply_spec(tmp_path, spec | {"remove_files": []})
    (tmp_path / "x.md").write_text("x", encoding="utf-8")
    with pytest.raises(bp.PatchError, match="move_files"):
        bp.apply_spec(tmp_path, spec | {"move_files": [{"from": "x.md", "to": "new.md"}], "remove_files": []})
    # exclusão por padrão (o bundle fica fora das regras amplas)
    (tmp_path / "bundle").mkdir()
    (tmp_path / "bundle" / "b.js").write_text("// pi", encoding="utf-8")
    assert bp.apply_env_rename(tmp_path, rule | {"files": ["**/*.js"], "exclude": ["bundle/**/*"], "min_count": 0})["files"] == []


def test_each_request_shows_its_time_and_output_tokens_like_claude_code(ui_facts: dict) -> None:
    """Owner 2026-11-15 ("6m 44s · ↓ 6.4k tokens"; card 1dfwh7kffjy): soma de todos os passos do pedido."""
    run = ui_facts["run"]
    assert run["live"] == {"ms": 30000, "output": 2400}  # passo terminado + o que está saindo agora
    assert run["end"] == {"ms": 404000, "output": 6400} and run["last"] == 2
    assert run["labels"] == ["0", "999", "1k", "6.4k", "6.4k", "999.9k", "1M", "1.2M"]
    assert run["times"] == ["0s", "0s", "59s", "6m 44s", "1h 2m 5s"]
    assert run["footer"] == "Pink · thoth · 6m 44s · ↓ 6.4k tokens"
    assert run["planFooter"] == "Pink · Plano · thoth · 5s · ↓ 10 tokens"
    assert run["estimate"] == 153  # (400 + 200 + len('{"path":"a"}')) / 4: o provedor só manda usage.output no fim do passo
    assert run["retry"] == {"kept": True, "late": True, "ok": True}
    wiring = ui_facts["wiring"]
    assert wiring["live"] == "Trabalhando · 0s · ↓ 1k tokens"  # estimativa ao vivo, não o 1 token parcial do provedor
    assert wiring["cleared"] is None  # setWorkingMessage() volta ao texto padrão
    assert wiring["final"] == 2000  # 1200 + 300 (erro) + 500 (nova tentativa); o toolResult não conta
    assert wiring["fresh"] == 7 and wiring["timerStopped"] is True


def test_the_slash_commands_are_described_in_portuguese_and_changelog_is_gone(package_dir: Path) -> None:
    """Owner 2026-11-15 ("3 sim, traduza"; card 1dfwh7kffjw): o /changelog mostrava as notas do Pi."""
    chunk = (package_dir / "dist" / "bundle" / "chunks" / "chunk-MM3LKT73.js").read_text(encoding="utf-8")
    start = chunk.index("BUILTIN_SLASH_COMMANDS=[")
    builtin = chunk[start:chunk.index("];", start)]
    names = re.findall(r'name:"([\w-]+)"', builtin)
    assert len(names) == 22 and "changelog" not in names and "bug" not in names
    described = dict(re.findall(r'name:"([\w-]+)",description:["`]([^"`]*)["`]', builtin))
    # texto exato (Argus: lista de verbos não pega descrição nova do upstream); conferido contra o que cada comando faz
    assert described == {
        "settings": "Abre as configurações", "model": "Escolhe o modelo", "tree": "Navega pela árvore da sessão (troca de ramo)",
        "thinking": "Define o nível de pensamento", "scoped-models": "Escolhe os modelos do ciclo do F2",
        "export": "Exporta a sessão (HTML, ou informe o caminho .html/.jsonl)", "import": "Importa e retoma uma sessão de um arquivo JSONL",
        "share": "Compartilha a sessão num gist secreto do GitHub (quem tiver o link vê)", "copy": "Copia a última resposta do agente",
        "name": "Dá um nome à sessão", "session": "Mostra os dados e números da sessão", "hotkeys": "Mostra todos os atalhos de teclado",
        "fork": "Cria uma sessão nova a partir de uma mensagem anterior", "clone": "Duplica a sessão até aqui numa sessão nova",
        "trust": "Decide se confia neste projeto (vale nas próximas sessões)", "login": "Entra num provedor (login)",
        "logout": "Sai de um provedor (logout)", "new": "Começa uma sessão nova", "compact": "Compacta o contexto da sessão agora",
        "resume": "Retoma outra sessão", "reload": "Recarrega atalhos, extensões, skills, prompts, temas e arquivos de contexto", "quit": "Sai do ${APP_NAME}",
    }
    assert 'text==="/changelog"' not in chunk and "this.changelogMarkdown=this." not in chunk  # o aviso "Use /changelog" fica inalcançável
    assert 'registerCommand("mcp",{description:"Servidores MCP' in chunk and 'registerCommand("llama",{description:"Modelos do roteador' in chunk
    assert "Ctrl+P cycling" not in chunk
    assert "/changelog" not in (package_dir / "docs" / "slash-commands.md").read_text(encoding="utf-8")


def test_the_claude_quota_comes_from_the_pink_login_without_claude_code_open(ui_facts: dict) -> None:
    """Owner 2026-11-15: a cota do Claude segue o uso feito dentro do Pink (login de assinatura), sem o Claude Code aberto."""
    own = ui_facts["own"]
    assert own["windows"]["h5"]["pct"] == 37 and own["windows"]["week"]["pct"] == 61 and own["windows"]["h5"]["resets"] > 0
    assert own["expired"] == {"h5": {"pct": 0}} and own["bad"] is None
    assert own["oauth"] == "leu" and own["apiKey"] == "nada" and own["none"] == "nada" and own["failed"] == "nada"
    # só o token de assinatura vai à Anthropic; chave de API nunca é enviada para o endpoint de uso
    assert own["calls"] == [{"url": "https://api.anthropic.com/api/oauth/usage", "auth": "Bearer sk-ant-oat", "beta": "oauth-2025-04-20"}]


def test_the_mcp_section_folds_and_unfolds_with_the_full_list(ui_facts: dict) -> None:
    """Owner 2026-11-15: como no OpenCode, a lateral lista os MCPs da sessão; clique no título abre e fecha."""
    mcp = ui_facts["mcp"]
    assert "▸ MCP" in mcp["titleRow"] and "2/5 conectados" in mcp["titleRow"]  # a linha do clique é o título
    assert "rag-thoth" not in mcp["closed"]
    for text in ("▾ MCP", "rag-thoth", "6 tools", "playwright", "board", "failed", "off", "disabled", "needs sign-in"):
        assert text in mcp["open"], text
    assert "\u001b[2J" not in mcp["open"] and mcp["widths"] == [36]
    assert "pink mcp add" in mcp["empty"] and mcp["absent"] is False
