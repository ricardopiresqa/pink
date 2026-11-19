# ruff: noqa: E501
"""Card 1dfwh7kfzfa - subagentes em segundo plano (extensions/pink-subagent-bg.ts).

O modulo roda de verdade no Node (type stripping), com um ``pi`` falso que registra sendMessage/registerCommand/on, um ``run``
controlavel (cada subagente so termina quando o teste manda) e um ``write`` capturado. Nenhum modelo e chamado.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "tests")]
MODULE = ROOT / "extensions" / "pink-subagent-bg.ts"
MUX = ROOT / "mux" / "pink.mjs"

from test_f50 import built, package_dir  # noqa: E402, F401 - o pacote construido (python build_pink.py)

DRIVER = r"""
const bg = await import(process.argv[1]);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function fresh({ ignoreAbort = false } = {}) {
  const sent = [], commands = {}, handlers = {}, widgets = [], notes = [], writes = [], runs = [];
  const pi = { sendMessage: (message, options) => sent.push({ message, options }), registerCommand: (name, spec) => { commands[name] = spec; }, on: (event, fn) => { handlers[event] = fn; } };
  const ctx = { hasUI: true, ui: { setWidget: (key, value) => widgets.push({ key, value }), notify: (text, level) => notes.push({ text, level }) } };
  let clock = 0;
  const run = (item, signal) => {
    const d = deferred();
    runs.push({ item, signal, d });
    if (!ignoreAbort) signal.addEventListener("abort", () => d.reject(new Error("abortado pelo teste")), { once: true });
    return d.promise;
  };
  const bgx = bg.createBackground(pi, { now: () => clock, write: (text) => writes.push(text) });
  return { sent, commands, handlers, widgets, notes, writes, runs, ctx, bgx, run, advance: (ms) => { clock += ms; } };
}
const last = (list) => list[list.length - 1];
const out = {};

// 1. background devolve o id na hora; o resultado ainda nao chegou
{
  const f = fresh();
  const r = f.bgx.start([{ agent: "scout", task: "ler o repo" }], false, f.run, f.ctx);
  out.immediate = { text: r.text, error: r.error, runs: f.runs.length, jobs: f.bgx.jobs.size, sentBefore: f.sent.length };
}

// 2. resultado por sendMessage: sucesso (triggerTurn/followUp), falha (resolve failed e reject), cancelado (nextTurn)
{
  const f = fresh();
  f.bgx.start([{ agent: "scout", task: "ler" }], false, f.run, f.ctx);
  f.runs[0].d.resolve({ failed: false, text: "pronto:   3 arquivos" });
  await tick();
  out.success = { count: f.sent.length, customType: f.sent[0]?.message.customType, content: f.sent[0]?.message.content, options: f.sent[0]?.options, details: f.sent[0]?.message.details, display: f.sent[0]?.message.display };
}
{
  const f = fresh();
  f.bgx.start([{ agent: "scout", task: "x" }], false, f.run, f.ctx);
  f.runs[0].d.resolve({ failed: true, text: "sem chave" });
  await tick();
  out.failedResolve = { content: f.sent[0]?.message.content, options: f.sent[0]?.options, failed: f.sent[0]?.message.details.failed };
}
{
  const f = fresh();
  f.bgx.start([{ agent: "scout", task: "x" }], false, f.run, f.ctx);
  f.runs[0].d.reject(new Error("boom"));
  await tick();
  out.rejected = { content: f.sent[0]?.message.content, options: f.sent[0]?.options };
}
{
  const f = fresh();
  f.bgx.start([{ agent: "scout", task: "x" }], false, f.run, f.ctx);
  f.bgx.cancel("1");
  await tick();
  out.cancelled = { count: f.sent.length, content: f.sent[0]?.message.content, options: f.sent[0]?.options, cancelled: f.sent[0]?.message.details.cancelled };
}

// 3. widget com as linhas e /subagentes que lista e cancela
{
  const f = fresh();
  f.bgx.start([{ agent: "scout", task: "ler o repo inteiro" }], false, f.run, f.ctx);
  out.widget = { line: last(f.widgets).value?.[0] ?? null, key: last(f.widgets).key };
  const cmd = f.commands.subagentes;
  f.advance(65000);  // o relogio da lista (comando) le o tempo na hora; o widget e redesenhado pelo temporizador
  await cmd.handler("", f.ctx);
  out.listing = last(f.notes).text;
  out.completions = cmd.getArgumentCompletions("cancelar ").map((c) => c.value);
  await cmd.handler("cancelar 1", f.ctx);
  out.cancelNote = last(f.notes);
  await tick();
  out.afterCancelWidget = last(f.widgets).value ?? null;
  out.sentAfterCancel = f.sent.length;
}
{
  const f = fresh();
  await f.commands.subagentes.handler("", f.ctx);
  out.emptyListing = last(f.notes).text;
  f.bgx.start([{ agent: "a", task: "1" }, { agent: "b", task: "2" }], false, f.run, f.ctx);
  await f.commands.subagentes.handler("cancelar todos", f.ctx);
  await tick();
  out.cancelAll = { notes: f.notes.map((n) => n.text), sent: f.sent.map((s) => s.message.content.split("\n")[0]), aborted: f.runs.map((r) => r.signal.aborted) };
  await f.commands.subagentes.handler("cancelar", f.ctx);
  out.badCancel = last(f.notes).level;
}

// 4. session_shutdown aborta tudo e nada e entregue depois (nem o que ignora o abort)
{
  const f = fresh({ ignoreAbort: true });
  f.bgx.start([{ agent: "a", task: "1" }, { agent: "b", task: "2" }], false, f.run, f.ctx);
  f.handlers.session_shutdown({});
  f.runs[0].d.resolve({ failed: false, text: "tardio" });
  f.runs[1].d.reject(new Error("abortado"));
  await tick();
  out.shutdown = { aborted: f.runs.map((r) => r.signal.aborted), sent: f.sent.length, jobs: f.bgx.jobs.size, lastWidget: last(f.widgets).value ?? null, lastWrite: last(f.writes) };
}

// 5. limite de 4 e chain recusado
{
  const f = fresh();
  const four = f.bgx.start([1, 2, 3, 4].map((n) => ({ agent: "a", task: `t${n}` })), false, f.run, f.ctx);
  const fifth = f.bgx.start([{ agent: "a", task: "5" }], false, f.run, f.ctx);
  out.limit = { four: four.error, fourJobs: f.bgx.jobs.size, fifthError: fifth.error, fifthText: fifth.text, runs: f.runs.length };
  f.runs[0].d.resolve({ failed: false, text: "ok" });
  await tick();
  const again = f.bgx.start([{ agent: "a", task: "6" }], false, f.run, f.ctx);
  out.limitFreed = { error: again.error, jobs: f.bgx.jobs.size };
  const over = f.bgx.start([{ agent: "a", task: "7" }, { agent: "a", task: "8" }, { agent: "a", task: "9" }], false, f.run, f.ctx);
  out.limitMany = { error: over.error, runs: f.runs.length };
}
{
  const f = fresh();
  const chain = f.bgx.start([{ agent: "a", task: "1" }], true, f.run, f.ctx);
  out.chain = { error: chain.error, text: chain.text, runs: f.runs.length };
}

// 6. contagem para o mux (OSC 9;pink-subagents=N) acompanha entrar e sair
{
  const f = fresh();
  f.bgx.start([{ agent: "a", task: "1" }, { agent: "b", task: "2" }], false, f.run, f.ctx);
  const afterStart = last(f.writes);
  f.runs[0].d.resolve({ failed: false, text: "ok" });
  await tick();
  out.osc = { afterStart, afterFinish: last(f.writes), all: f.writes };
}

// 7. sem tela (ctx.hasUI falso) o modulo nao escreve widget nem falha: o branch do subagente e quem decide (ver o pacote)
{
  const f = fresh();
  const quiet = { hasUI: false, ui: {} };
  let threw = null;
  try { f.bgx.start([{ agent: "a", task: "1" }], false, f.run, quiet); f.runs[0].d.resolve({ failed: false, text: "ok" }); await tick(); } catch (error) { threw = String(error); }
  out.noUi = { threw, sent: f.sent.length };
}

console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def facts() -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    done = subprocess.run([node, "--input-type=module", "-e", DRIVER, MODULE.as_uri()], capture_output=True, text=True, encoding="utf-8", timeout=120, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0, done.stderr[-800:]
    return json.loads(done.stdout)


def test_1_background_returns_the_id_at_once_and_the_result_has_not_come(facts: dict) -> None:
    got = facts["immediate"]
    assert got["error"] is False and "#1 (scout)" in got["text"] and "Iniciado em segundo plano" in got["text"]
    assert got["runs"] == 1 and got["jobs"] == 1 and got["sentBefore"] == 0  # o subagente roda; nada entregue ainda


def test_2_the_result_arrives_as_a_message_that_starts_a_turn(facts: dict) -> None:
    ok = facts["success"]
    assert ok["count"] == 1 and ok["customType"] == "subagent-result" and ok["display"] is True
    assert ok["options"] == {"triggerTurn": True, "deliverAs": "followUp"}
    assert ok["content"].startswith("Subagente em segundo plano #1 (scout) terminou.") and "pronto:   3 arquivos" in ok["content"]
    assert ok["details"] == {"id": 1, "agent": "scout", "failed": False, "cancelled": False}
    assert facts["failedResolve"]["options"] == {"triggerTurn": True, "deliverAs": "followUp"} and "falhou" in facts["failedResolve"]["content"] and facts["failedResolve"]["failed"] is True
    assert "boom" in facts["rejected"]["content"] and "falhou" in facts["rejected"]["content"]
    cancelled = facts["cancelled"]
    assert cancelled["count"] == 1 and "foi cancelado" in cancelled["content"] and cancelled["cancelled"] is True
    assert cancelled["options"] == {"deliverAs": "nextTurn"}  # cancelado: nao abre turno sozinho


def test_3_the_widget_lists_the_running_job_and_the_command_lists_and_cancels(facts: dict) -> None:
    assert facts["widget"]["key"] == "pink-subagents"
    assert facts["widget"]["line"] == "⏳ #1 scout · 0:00 · ler o repo inteiro"  # linha do widget: id, agente, tarefa
    assert "#1 scout · 1:05" in facts["listing"]  # a lista do comando mostra o tempo decorrido
    assert facts["completions"] == ["cancelar todos", "cancelar 1"]
    assert facts["cancelNote"] == {"text": "Cancelando 1 subagente(s).", "level": "info"}
    assert facts["afterCancelWidget"] is None and facts["sentAfterCancel"] == 1  # some do widget; o aviso de cancelado vai como nextTurn
    assert facts["emptyListing"] == "Nenhum subagente em segundo plano."
    assert facts["cancelAll"]["aborted"] == [True, True] and len(facts["cancelAll"]["sent"]) == 2
    assert facts["badCancel"] == "warning"


def test_4_session_shutdown_aborts_everything_and_nothing_is_delivered_after(facts: dict) -> None:
    shut = facts["shutdown"]
    assert shut["aborted"] == [True, True]  # os dois abortados
    assert shut["sent"] == 0  # nem o que ignora o abort, que resolveu depois: nada entregue
    assert shut["jobs"] == 0 and shut["lastWidget"] is None and shut["lastWrite"] == "\x1b]9;pink-subagents=0\x07"


def test_5_the_limit_is_four_and_chain_is_refused(facts: dict) -> None:
    lim = facts["limit"]
    assert lim["four"] is False and lim["fourJobs"] == 4 and lim["runs"] == 4
    assert lim["fifthError"] is True and "Limite de 4" in lim["fifthText"] and "rodando: 4" in lim["fifthText"]
    assert facts["limitFreed"] == {"error": False, "jobs": 4}  # um terminou, cabe outro
    assert facts["limitMany"]["error"] is True and facts["limitMany"]["runs"] == 5  # 3 pedidos com 4 rodando: recusado inteiro, nenhum a mais
    assert facts["chain"]["error"] is True and "chain" in facts["chain"]["text"] and facts["chain"]["runs"] == 0


def test_6_the_mux_gets_the_count_on_every_change(facts: dict) -> None:
    osc = facts["osc"]
    assert osc["afterStart"] == "\x1b]9;pink-subagents=2\x07" and osc["afterFinish"] == "\x1b]9;pink-subagents=1\x07"


def test_7_without_a_screen_the_module_does_not_break(facts: dict) -> None:
    assert facts["noUi"]["threw"] is None  # o branch do subagente exige ctx.hasUI antes de chamar o modulo; aqui so nao quebra


def test_the_mux_shows_the_count_of_background_subagents_and_reads_the_signal() -> None:
    """Criterio 6: subagentsSignal le o OSC e a lateral mostra "· N em 2º plano" so enquanto a sessao esta viva."""
    node = shutil.which("node")
    assert node
    driver = r"""
const m = await import(process.argv[1]);
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const sidebar = (extra) => m.sidebar({ sessions: [{ title: "", working: false, attention: false, exited: false, ...extra }], active: 0, width: 36, rows: 14 }).lines.map(strip);
const shown = (lines) => lines.find((line) => line.includes("em 2º plano") || line.includes("pronta")) ?? "";
console.log(JSON.stringify({
  signal: [m.backgroundSignal("pink-subagents=3"), m.backgroundSignal("pink-jobs=0"), m.backgroundSignal("pink-subagents=x"), m.backgroundSignal("pink-session=/a.jsonl")],
  two: shown(sidebar({ subagents: 2 })),
  sum: shown(sidebar({ subagents: 2, jobs: 1 })),
  none: shown(sidebar({ subagents: 0, jobs: 0 })),
  exited: shown(sidebar({ subagents: 2, jobs: 1, exited: true })),
}));
"""
    done = subprocess.run([node, "--input-type=module", "-e", driver, MUX.as_uri()], capture_output=True, text=True, encoding="utf-8", timeout=60, check=False, stdin=subprocess.DEVNULL)
    assert done.returncode == 0, done.stderr[-600:]
    facts = json.loads(done.stdout)
    assert facts["signal"] == [{"kind": "subagents", "count": 3}, {"kind": "jobs", "count": 0}, None, None]  # so contagem numerica; outro OSC nao conta
    assert "· 2 em 2º plano" in facts["two"]  # criterio 6
    assert "· 3 em 2º plano" in facts["sum"]  # subagentes e comandos somados
    assert "em 2º plano" not in facts["none"]
    assert "em 2º plano" not in facts["exited"]


def test_the_built_package_carries_the_background_patches_and_the_ui_branch(package_dir: Path) -> None:
    """Criterio 7: o pacote tem o modulo copiado e o branch de segundo plano so vale com tela (ctx.hasUI)."""
    built = package_dir / "examples" / "extensions" / "subagent"
    assert (built / "background.ts").read_text(encoding="utf-8") == MODULE.read_text(encoding="utf-8")
    index = (built / "index.ts").read_text(encoding="utf-8")
    assert 'import { createBackground } from "./background.ts"' in index
    assert "params.background && ctx.hasUI" in index  # sem tela, o branch nao roda e a espera e a de antes
    assert "if (params.chain && params.chain.length > 0) {" in index  # o caminho de espera continua depois do branch
    assert "const background = createBackground(pi);" in index
    types = (package_dir / "dist" / "core" / "extensions" / "types.d.ts").read_text(encoding="utf-8")
    assert "hasUI: boolean;" in types  # o campo que o branch le existe na API do Pi
