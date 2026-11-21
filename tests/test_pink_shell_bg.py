# ruff: noqa: E501
"""Card 1dfwh7kfzfb - comando em segundo plano (extensions/pink-shell-bg.ts), com a ferramenta bash REAL do pacote construido.

O modulo construido e instalado (como o cli fixture faz com o tarball) num prefixo temporario. Um shim re-exporta o ponto de
entrada instalado (dist/index.js) como @earendil-works/pi-coding-agent, e o modulo copiado para fora do node_modules resolve
typebox e o shim pelo prefixo. Os comandos rodam de verdade (node -e). Nenhum modelo e chamado.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "tests")]

from test_f50 import built, cli, package_dir  # noqa: E402, F401 - fixtures do pacote construido e instalado

DRIVER = r"""
import { statSync } from "node:fs";
const [moduleUrl, work, trusted, untrusted, loopA, loopB] = process.argv.slice(1);
const mod = await import(moduleUrl);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sent = [], tools = {}, commands = {}, handlers = {}, notes = [];
const pi = {
  registerTool: (def) => { tools[def.name] = def; },
  registerCommand: (name, spec) => { commands[name] = spec; },
  on: (event, fn) => { handlers[event] = fn; },
  sendMessage: (message, options) => { sent.push({ message, options }); },
};
mod.default(pi);
const ui = { setWidget: () => {}, notify: (text, level) => notes.push({ text, level }) };
const sessionManager = { getSessionId: () => "sessao-de-teste", getSessionFile: () => undefined };
const ctxFor = (cwd, isTrusted, hasUI = true) => ({ cwd, hasUI, ui, sessionManager, isProjectTrusted: () => isTrusted });
const ctx = ctxFor(work, true);
const headless = ctxFor(work, true, false);
const text = (result) => (result?.content ?? []).map((part) => part.text).join("\n");
const call = (name, params, c = ctx) => tools[name].execute(`call-${Math.random()}`, params, new AbortController().signal, () => {}, c);
const bashRun = (params, c = ctx) => call("bash", params, c);
const waitFor = async (test, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (test()) return true; await sleep(100); } return test(); };
const size = (file) => { try { return statSync(file).size; } catch { return -1; } };
const out = { names: Object.keys(tools).sort(), bashName: tools.bash?.name, powershellName: tools.powershell?.name };
const MARK = `node -e 'console.log(process.env.PINK_TESTE_MARCA ?? "sem")'`;

const READY = `node -e 'console.log("ready");setTimeout(()=>process.exit(3),2000)'`;
const WATCH = `node -e 'setTimeout(()=>console.log("pronto em 800ms"),800);setTimeout(()=>console.log("pronto de novo"),1500);setTimeout(()=>process.exit(0),2500)'`;
const SLEEP = `node -e 'setTimeout(()=>{},4000)'`;
// caminho com barra (/) dentro do JS: a barra invertida do Windows viraria escape (\U, \r) e o writeFileSync falharia
const loop = (file) => { const f = file.replace(/\\/g, "/"); return `node -e 'const fs=require("fs");fs.writeFileSync("${f}","");setInterval(()=>fs.appendFileSync("${f}","."),100)'`; };

// 6. sem run_in_background: roda como antes, com e sem tela
out.sync = { text: text(await bashRun({ command: `node -e 'console.log(42)'` })).trim(), headlessText: text(await bashRun({ command: `node -e 'console.log(43)'` }, headless)).trim() };
// 6b. com run_in_background e sem tela: recusa clara, nenhum processo criado
{
  const r = await bashRun({ command: READY, run_in_background: true }, headless);
  out.refused = { text: text(r), isError: r.isError, after: await call("background_output", { id: "%1" }) };
}

// 1. run_in_background devolve %n na hora (com tela)
{
  const t0 = Date.now();
  const r = await bashRun({ command: READY, run_in_background: true });
  out.start = { text: text(r), isError: r.isError, elapsedMs: Date.now() - t0 };
}

// 3. saida parcial enquanto roda; o id aceita "%1" como texto
await sleep(900);
out.partial = text(await call("background_output", { id: "%1" }));

// 2. resultado (codigo de saida) chega como mensagem que abre turno
await waitFor(() => sent.some((s) => s.message.content.includes("%1")), 10000);
out.result = sent.find((s) => s.message.content.includes("%1")) ?? null;

// 4. watch: avisa uma vez quando o padrao aparece; o segundo "pronto" nao gera outro aviso (id em texto "%n")
const watchStart = await bashRun({ command: WATCH, run_in_background: true });
const watchId = Number(/%(\d+)/.exec(text(watchStart))[1]);
out.watchArm = text(await call("background_watch", { id: `%${watchId}`, pattern: "^pronto" }));
await waitFor(() => sent.some((s) => s.message.content.includes(`%${watchId}`) && s.message.content.includes("terminou")), 10000);
const watchMessages = sent.filter((s) => s.message.content.includes(`Vigia do processo %${watchId}`));
out.watch = { count: watchMessages.length, first: watchMessages[0] ?? null };

// 4b/4c. watch com timeout e regex recusada (job de 4 s, vigiado antes de acabar)
const sleepStart = await bashRun({ command: SLEEP, run_in_background: true });
const sleepId = Number(/%(\d+)/.exec(text(sleepStart))[1]);
out.regexNested = await call("background_watch", { id: sleepId, pattern: "(a+)+$" });
out.regexLong = await call("background_watch", { id: sleepId, pattern: "a".repeat(201) });
out.regexOk = text(await call("background_watch", { id: sleepId, pattern: "nunca", timeout_seconds: 1 }));
await waitFor(() => sent.some((s) => s.message.content.includes("não apareceu")), 5000);
out.watchTimeout = sent.find((s) => s.message.content.includes("não apareceu")) ?? null;

// 3b. background_stop mata o processo: o arquivo para de crescer
const fileA = loopA;
const loopStart = await bashRun({ command: loop(fileA), run_in_background: true });
const loopId = Number(/%(\d+)/.exec(text(loopStart))[1]);
await sleep(700);
const beforeStop = size(fileA);
out.stopReply = text(await call("background_stop", { id: loopId }));
await sleep(1500);
const afterStop = size(fileA);
await sleep(1000);
out.stop = { grewBefore: beforeStop > 0, frozen: size(fileA) === afterStop, message: sent.find((s) => s.message.content.includes(`%${loopId}`) && s.message.content.includes("foi encerrado")) ?? null };

// 3c. /processos lista e encerra um
const loopB2 = await bashRun({ command: loop(loopB), run_in_background: true });
const bId = Number(/%(\d+)/.exec(text(loopB2))[1]);
await sleep(400);
await commands.processos.handler("", ctx);
out.listing = notes.at(-1)?.text ?? "";
await commands.processos.handler(`encerrar ${bId}`, ctx);
out.encerrarOne = notes.at(-1);
await sleep(1500);

// 7. configuracao do projeto: so vale em pasta confiavel (.pink/settings.json com shellCommandPrefix)
out.trust = {
  trusted: text(await bashRun({ command: MARK }, ctxFor(trusted, true))).trim(),
  untrusted: text(await bashRun({ command: MARK }, ctxFor(untrusted, false))).trim(),
};

// 5. session_shutdown encerra tudo e nada e entregue depois
const loopC = `${loopA}.c`;
await bashRun({ command: loop(loopC), run_in_background: true });
await sleep(500);
const beforeShutdown = sent.length;
handlers.session_shutdown({});
await sleep(1500);
const frozenAt = size(loopC);
await sleep(800);
out.shutdown = { sentDuring: sent.length - beforeShutdown, frozen: size(loopC) === frozenAt };

console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def shell_facts(cli: Path, package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    # cli.js fica em <prefixo>/node_modules/@thoth/pink/dist/bundle; o modulo construido vem do package_dir
    prefix = cli.parents[5]
    shim = prefix / "node_modules" / "@earendil-works" / "pi-coding-agent"
    shim.mkdir(parents=True, exist_ok=True)
    (shim / "package.json").write_text(json.dumps({"name": "@earendil-works/pi-coding-agent", "type": "module", "exports": {".": "./index.js"}}), encoding="utf-8")
    (shim / "index.js").write_text('export * from "../../@thoth/pink/dist/index.js";\n', encoding="utf-8")
    ext = prefix / "ext"
    ext.mkdir(exist_ok=True)
    module = ext / "pink-shell-bg.ts"
    shutil.copyfile(package_dir / "extensions" / "pink-shell-bg.ts", module)
    shutil.copyfile(package_dir / "extensions" / "pink-i18n.ts", module.parent / "pink-i18n.ts")  # as extensoes importam o t() (card 1dfwh7kg5cg)
    work = tmp_path_factory.mktemp("shell-work")
    trusted = tmp_path_factory.mktemp("shell-confiavel")
    untrusted = tmp_path_factory.mktemp("shell-nao-confiavel")
    for folder in (trusted, untrusted):
        (folder / ".pink").mkdir()
        (folder / ".pink" / "settings.json").write_text(json.dumps({"shellCommandPrefix": "export PINK_TESTE_MARCA=prefixo &&"}), encoding="utf-8")
    home = tmp_path_factory.mktemp("shell-home")
    # o Git Bash e achado por ProgramFiles (utils/shell.js); sem ela cairia no bash do WSL, que nao enxerga o node do Windows
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "APPDATA", "LOCALAPPDATA"}
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    env.update({"HOME": str(home), "USERPROFILE": str(home)})
    done = subprocess.run(
        [node, "--input-type=module", "-e", DRIVER, module.as_uri(), str(work), str(trusted), str(untrusted), str(work / "loop-a.txt"), str(work / "loop-b.txt")],
        capture_output=True, text=True, encoding="utf-8", timeout=180, check=False, stdin=subprocess.DEVNULL, cwd=str(work), env=env,
    )
    assert done.returncode == 0, done.stderr[-1200:]
    return json.loads(done.stdout.strip().splitlines()[-1])


def test_names_stay_bash_and_powershell_and_the_new_tools_are_there(shell_facts: dict) -> None:
    assert shell_facts["bashName"] == "bash" and shell_facts["powershellName"] == "powershell"  # permissoes e hooks veem o mesmo nome
    assert {"bash", "powershell", "background_output", "background_stop", "background_watch"} <= set(shell_facts["names"])


def test_6_without_the_flag_the_command_runs_as_before_with_or_without_a_screen(shell_facts: dict) -> None:
    assert shell_facts["sync"]["text"].endswith("42")
    assert shell_facts["sync"]["headlessText"].endswith("43")


def test_6b_with_the_flag_and_no_screen_the_run_is_refused_and_no_job_exists(shell_facts: dict) -> None:
    refused = shell_facts["refused"]
    assert refused["isError"] is True and "só funciona na sessão interativa" in refused["text"]
    assert refused["after"]["isError"] is True  # nenhum processo %1 foi criado


def test_1_run_in_background_returns_the_id_at_once(shell_facts: dict) -> None:
    start = shell_facts["start"]
    assert start["isError"] is False and "%1" in start["text"] and "segundo plano" in start["text"]
    assert start["elapsedMs"] < 1500  # o comando dura 2 s; a ferramenta volta antes


def test_2_the_exit_code_arrives_as_a_message_that_starts_a_turn(shell_facts: dict) -> None:
    result = shell_facts["result"]
    assert result is not None, "o resultado nao chegou"
    assert result["message"]["customType"] == "background-shell"
    assert result["options"] == {"triggerTurn": True, "deliverAs": "followUp"}
    assert "%1" in result["message"]["content"] and "terminou com erro" in result["message"]["content"]
    assert "3" in result["message"]["content"]  # o codigo de saida do node aparece


def test_3_partial_output_is_readable_while_it_runs_and_the_id_can_be_text(shell_facts: dict) -> None:
    assert "ready" in shell_facts["partial"] and "rodando há" in shell_facts["partial"]


def test_4_watch_fires_once_on_the_first_match(shell_facts: dict) -> None:
    assert shell_facts["watch"]["count"] == 1  # "pronto de novo" nao gera segundo aviso
    first = shell_facts["watch"]["first"]
    assert first["options"] == {"triggerTurn": True, "deliverAs": "followUp"}
    assert "apareceu /^pronto/" in first["message"]["content"] and "pronto em 800ms" in first["message"]["content"]


def test_4b_watch_with_a_timeout_says_the_pattern_did_not_come(shell_facts: dict) -> None:
    message = shell_facts["watchTimeout"]
    assert message is not None and "não apareceu em 1 s" in message["message"]["content"]
    assert message["options"] == {"triggerTurn": True, "deliverAs": "followUp"}


def test_4c_unsafe_or_long_patterns_are_refused_and_simple_ones_work(shell_facts: dict) -> None:
    assert shell_facts["regexNested"]["isError"] is True and "Não vigiei" in shell_facts["regexNested"]["content"][0]["text"]
    assert shell_facts["regexLong"]["isError"] is True and "Não vigiei" in shell_facts["regexLong"]["content"][0]["text"]
    assert shell_facts["regexOk"].startswith("Vigiando /nunca/")


def test_3b_stop_kills_the_process_and_nothing_is_written_after(shell_facts: dict) -> None:
    stop = shell_facts["stop"]
    assert stop["grewBefore"] is True and stop["frozen"] is True  # o processo morreu: o arquivo nao cresce mais
    assert shell_facts["stopReply"].startswith("Encerrando")
    assert stop["message"] is not None and stop["message"]["options"] == {"deliverAs": "nextTurn"}  # encerrado pela pessoa: nao abre turno


def test_3c_processos_lists_and_ends_one(shell_facts: dict) -> None:
    assert "⚙ %" in shell_facts["listing"]
    assert shell_facts["encerrarOne"]["text"].startswith("Encerrando 1 processo(s).")


def test_7_project_settings_apply_only_in_a_trusted_folder(shell_facts: dict) -> None:
    assert shell_facts["trust"]["trusted"] == "prefixo"  # controle: pasta confiavel aplica o prefixo
    assert shell_facts["trust"]["untrusted"] == "sem"  # pasta nao confiavel ignora o settings do projeto


def test_5_session_shutdown_ends_everything_and_delivers_nothing(shell_facts: dict) -> None:
    assert shell_facts["shutdown"]["sentDuring"] == 0 and shell_facts["shutdown"]["frozen"] is True


def test_mux_counts_the_jobs_with_the_subagents() -> None:
    """Criterio do mux: backgroundSignal aceita jobs e a lateral soma com subagentes (tests/test_pink_subagent_bg.py cobre o restante)."""
    node = shutil.which("node")
    assert node
    driver = r"""
const m = await import(process.argv[1]);
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const line = (extra) => m.sidebar({ sessions: [{ title: "", working: false, attention: false, exited: false, ...extra }], active: 0, width: 36, rows: 14 }).lines.map(strip).find((l) => l.includes("em 2º plano")) ?? "";
console.log(JSON.stringify({ jobs: m.backgroundSignal("pink-jobs=2"), line: line({ jobs: 2 }), sum: line({ subagents: 1, jobs: 2 }) }));
"""
    mux = ROOT / "mux" / "pink.mjs"
    done = subprocess.run([node, "--input-type=module", "-e", driver, mux.as_uri()], capture_output=True, text=True, encoding="utf-8", timeout=60, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0, done.stderr[-600:]
    facts = json.loads(done.stdout)
    assert facts["jobs"] == {"kind": "jobs", "count": 2}
    assert "· 2 em 2º plano" in facts["line"] and "· 3 em 2º plano" in facts["sum"]
