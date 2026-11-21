# ruff: noqa: E501
"""Card 1dfwh7kfzfe - /loop e retomada agendada (extensions/pink-loop.ts), do pacote construido.

createLoop com relogio e timers injetados (fake): o tempo anda na mao e os timers disparam em ordem; o timer devolve um
handle com unref (como o Node), e a contagem de unref e conferida. Sem rede, sem modelo.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "tests")]

from test_f50 import built, cli, package_dir  # noqa: E402, F401 - fixtures do pacote construido e instalado

DRIVER = r"""
const [moduleUrl] = process.argv.slice(1);
const mod = await import(moduleUrl);
let t = 1000000;
const now = () => t;
let timers = [];
let unrefs = 0;
const setTimer = (fn, ms) => {
  const handle = { unref() { unrefs += 1; } };
  timers.push({ handle, fn, at: t + ms });
  return handle;
};
const clearTimer = (handle) => { timers = timers.filter((x) => x.handle !== handle); };
// anda o relogio e dispara os timers que vencem, em ordem
const advance = (ms) => {
  const end = t + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const next = timers[0];
    if (!next || next.at > end) break;
    timers.shift();
    t = next.at;
    next.fn();
  }
  t = end;
};
const sent = [], widgets = [], notes = [];
let idle = true, pendingMsgs = false;
const pi = {
  sendMessage: (m, o) => { sent.push({ m, o }); },
  registerTool: () => {}, registerCommand: () => {}, on: () => {},
};
const ctx = {
  hasUI: true,
  isIdle: () => idle,
  hasPendingMessages: () => pendingMsgs,
  ui: { setWidget: (k, v) => widgets.push({ k, v }), notify: (text, level) => notes.push({ text, level }) },
};
const loop = mod.createLoop(pi, { now, setTimer, clearTimer });
const start = (args) => loop.start(args, ctx);
const wake = (params) => loop.wakeTool.execute("i", params, undefined, undefined, ctx);
const last = (arr) => arr[arr.length - 1];
const state = () => loop.state() ?? null;
const out = {};

// 1. intervalo fixo: dispara ja; depois de cada rodada, espera o intervalo; nunca empilha
start("5m confere o deploy");
out.a1 = { sent: sent.length, round: loop.state().round, trigger: sent[0].o.triggerTurn === true, repete: sent[0].m.content.includes("Repete a cada 5m") };
loop.settled(false);
out.a2 = loop.state().next - t;
advance(299999);
out.a3 = sent.length;
advance(1);
out.a4 = { sent: sent.length, round: loop.state().round };
loop.settled(false); // rodada 2 termina antes do watchdog de 3 s
advance(300000);
out.a5 = { sent: sent.length, round: loop.state().round };
loop.stop();

// 2. watchdog: rodada que nao comecou (sem modelo ou sem chave) para sozinha em 3 s
const w0 = sent.length;
start("5m p");
advance(10000);
out.wPos = { state: state(), note: last(notes).text, sentDelta: sent.length - w0 };
const w1 = sent.length;
start("5m q");
advance(1000);
loop.settled(false); // terminou antes de 10 s: o watchdog nao mexe
advance(10000);
out.wEarly = { active: state() !== null, next: state() ? state().next - t : null, sentDelta: sent.length - w1 };
loop.stop();
start("5m r");
idle = false; // agente ocupado no momento do watchdog: nao e falha, nao para
advance(10000);
out.wBusy = { active: state() !== null, running: state() ? state().running : null };
idle = true;
loop.settled(false);
loop.stop();

// 2b. teto de rodadas: a 51a rodada para com aviso
const m0 = sent.length;
start("60s m");
for (let i = 0; i < 49; i++) { loop.settled(false); advance(60000); }
out.maxRound = { sentDelta: sent.length - m0, round: loop.state().round, widget: last(widgets).v[0].includes("rodada 50/50") };
loop.settled(false);
advance(60000);
out.maxStop = { state: state(), note: last(notes).text, sentDelta: sent.length - m0 };
loop.stop();

// 1b. ocupado (turno do usuario ou mensagem na fila): fica pendente; a nova tentativa sai sozinha a cada 5 s
const nb = sent.length;
start("5m b");
loop.settled(false);
idle = false;
advance(300000);
out.b1 = { sentDelta: sent.length - nb, pending: loop.state().pending, widget: last(widgets).v[0].includes("esperando o agente ficar livre") };
advance(600000);
out.b2 = sent.length - nb;
idle = true;
advance(5000); // a tentativa seguinte dispara sem agent_settled
out.b3 = { sentDelta: sent.length - nb, round: loop.state().round, pending: loop.state().pending };
loop.settled(false);
pendingMsgs = true;
advance(300000);
out.b4 = { sentDelta: sent.length - nb, pending: loop.state().pending };
pendingMsgs = false;
loop.settled(false); // agent_settled com a pendente: dispara na hora
out.b5 = { sentDelta: sent.length - nb, round: loop.state().round };
loop.settled(false);

// 3a. Esc (agent_settled aborted) encerra e nada mais dispara
const e0 = sent.length;
loop.settled(true);
out.esc = { state: state(), note: last(notes).text };
advance(3600000);
out.escSentDelta = sent.length - e0;

// 3b. /loop parar encerra e nada mais dispara
const n0 = sent.length;
start("5m y");
start("parar");
out.parar = { state: state(), note: last(notes).text, sentDelta: sent.length - n0 };
advance(600000);
out.pararAfter = sent.length - n0;

// 3c. shutdown: ctx e descartado, timer limpo, nada dispara depois
start("5m z");
const n1 = sent.length;
loop.shutdown();
out.shutdownWidget = last(widgets).v === undefined;
advance(600000);
out.shutdown = { state: state(), sentDelta: sent.length - n1 };

// 3d. shutdown com uma interface que lanca: nao quebra nem o disparo nem o shutdown
const bad = { hasUI: true, isIdle: () => true, hasPendingMessages: () => false, ui: { setWidget() { throw new Error("sessão saindo"); }, notify() { throw new Error("sessão saindo"); } } };
const loopB = mod.createLoop(pi, { now, setTimer, clearTimer });
const b0 = sent.length;
let threwStart = false, threwShut = false;
try { loopB.start("5m bad", bad); loopB.settled(false); advance(300000); } catch (e) { threwStart = true; }
out.badUi = { threw: threwStart, sentDelta: sent.length - b0, state: loopB.state() ? "ativo" : null };
try { loopB.shutdown(); } catch (e) { threwShut = true; }
const b1 = sent.length;
advance(600000);
out.badShutdown = { threw: threwShut, state: loopB.state() ? "ativo" : null, sentAfter: sent.length - b1 };

// 3e. timer sem handle (setTimer devolve undefined): nao lanca
const loopN = mod.createLoop(pi, { now, setTimer: () => undefined, clearTimer: () => {} });
const nn = sent.length;
let threwN = false;
try { loopN.start("5m n", ctx); loopN.settled(false); } catch (e) { threwN = true; }
out.noHandle = { threw: threwN, sentDelta: sent.length - nn, state: loopN.state() ? "ativo" : null };
loopN.stop();
out.unrefCalled = unrefs > 0;

// 4. intervalos invalidos sao recusados; limites 60s e 24h aceitos; "3 coisas" e tarefa, nao intervalo
out.parse = { m: mod.parseInterval("5M"), x: mod.parseInterval("5x") ?? null, frac: mod.parseInterval("1.5m") ?? null };
const tries = {};
for (const a of ["5x tarefa", "30s tarefa", "25h tarefa", "5m", "0m tarefa", "1.5m tarefa", "3coisas tarefa", "60s tarefa", "24h tarefa"]) {
  const before = notes.length;
  start(a);
  tries[a] = { note: notes.length > before ? last(notes).text : "", started: loop.state() !== undefined };
  if (loop.state()) loop.stop();
}
out.tries = tries;
const d0 = sent.length;
start("3 coisas checar");
out.dynamic = { task: loop.state().task, every: loop.state().every ?? null, sentDelta: sent.length - d0 };
loop.stop();
start("parar");
out.noneToStop = last(notes).text;

// 4b. segundo /loop enquanto um esta ativo: recusado, o primeiro segue
start("5m a");
start("5m b");
out.second = { note: last(notes).text, task: loop.state().task };
start("parar");

// 5. schedule_wakeup: sem loop e em loop fixo, erro; no modo sem intervalo, clamp 60-3600
out.wakeNoLoop = (await wake({ delaySeconds: 60 })).isError;
start("5m fixo");
out.wakeFixed = (await wake({ delaySeconds: 60 })).isError;
start("parar");

start("confere o deploy");
out.c1 = { round: loop.state().round, mentionsWake: last(sent).m.content.includes("schedule_wakeup"), every: loop.state().every ?? null };
out.c10 = (await wake({ delaySeconds: 10 })).content[0].text; // sobe para 60 s
loop.settled(false);
out.c10next = loop.state().next - t;
advance(60000);
out.c2round = loop.state().round;
out.c99999 = (await wake({ delaySeconds: 99999 })).content[0].text; // desce para 3600 s
loop.settled(false);
out.c99999next = loop.state().next - t;
advance(3600000);
out.c3round = loop.state().round;
out.cNeg = (await wake({ delaySeconds: -5 })).content[0].text; // sobe para 60 s
loop.settled(false);
out.cNegNext = loop.state().next - t;
advance(60000);
out.c4round = loop.state().round;
out.wakeNoDelay = (await wake({})).isError;
out.wakeNaN = (await wake({ delaySeconds: "abc" })).isError;
out.stillActive = loop.state() !== undefined;
out.c120 = (await wake({ delaySeconds: 120 })).content[0].text;
loop.settled(false);
out.c120next = loop.state().next - t;
advance(120000);
out.c5round = loop.state().round;
const n2 = sent.length;
out.wakeStop = (await wake({ stop: true })).content[0].text;
out.stopState = state();
out.stopNote = last(notes).text;
loop.settled(false);
advance(3600000);
out.stopSentDelta = sent.length - n2;

// 5b. rodada sem schedule_wakeup encerra o loop
const n3 = sent.length;
start("sem agendar");
loop.settled(false);
out.noWake = { sentDelta: sent.length - n3, state: state(), note: last(notes).text };
advance(3600000);
out.noWakeAfter = sent.length - n3;

// 6. widget: mostra o loop ativo e a proxima hora; limpa ao encerrar
start("5m confere o deploy");
out.w1 = last(widgets).v[0];
out.wKey = last(widgets).k;
loop.settled(false);
out.w2 = last(widgets).v[0];
out.wLines = last(widgets).v[1];
start("parar");
out.wClear = last(widgets).v === undefined;
start("confere");
out.wAgent = last(widgets).v[0].includes("ritmo do agente");
loop.stop();
out.wClearAgain = last(widgets).v === undefined;

// 7. registro do pacote: ferramenta, eventos e comando; subagente nao registra nada
const reg = { tools: [], handlers: [], cmds: [] };
const pi2 = { registerTool: (d) => reg.tools.push(d.name), on: (e) => reg.handlers.push(e), registerCommand: (n) => reg.cmds.push(n), sendMessage: () => {} };
mod.default(pi2);
out.wiring = reg;
process.env.PINK_SUBAGENT = "1";
const reg2 = { tools: [], handlers: [], cmds: [] };
mod.default({ registerTool: (d) => reg2.tools.push(d.name), on: (e) => reg2.handlers.push(e), registerCommand: (n) => reg2.cmds.push(n), sendMessage: () => {} });
delete process.env.PINK_SUBAGENT;
out.subagentWiring = reg2;

console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def loop_facts(cli: Path, package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    node = shutil.which("node")
    assert node, "node not found"
    prefix = cli.parents[5]
    ext = prefix / "ext"
    ext.mkdir(exist_ok=True)
    module = ext / "pink-loop.ts"
    shutil.copyfile(package_dir / "extensions" / "pink-loop.ts", module)
    shutil.copyfile(package_dir / "extensions" / "pink-i18n.ts", module.parent / "pink-i18n.ts")  # as extensoes importam o t() (card 1dfwh7kg5cg)
    home = tmp_path_factory.mktemp("loop-home")
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA"}
    env = {name: value for name, value in os.environ.items() if name.upper() in keep}
    env.update({"HOME": str(home), "USERPROFILE": str(home)})
    done = subprocess.run(
        [node, "--input-type=module", "-e", DRIVER, module.as_uri()],
        capture_output=True, text=True, encoding="utf-8", timeout=300, check=False, stdin=subprocess.DEVNULL, cwd=str(home), env=env,
    )
    assert done.returncode == 0, done.stderr[-1200:]
    return json.loads(done.stdout.strip().splitlines()[-1])


MIN, HOUR = 60_000, 3_600_000


def test_1_fixed_interval_fires_now_and_again_after_each_round_settles(loop_facts: dict) -> None:
    assert loop_facts["a1"] == {"sent": 1, "round": 1, "trigger": True, "repete": True}  # dispara ja, com turno
    assert loop_facts["a2"] == 5 * MIN  # 5 min depois que a rodada termina
    assert loop_facts["a3"] == 1  # 1 ms antes: nada
    assert loop_facts["a4"] == {"sent": 2, "round": 2}  # no minuto 5 em ponto
    assert loop_facts["a5"] == {"sent": 3, "round": 3}  # cada rodada so dispara depois que a anterior terminou


def test_2_watchdog_stops_a_round_that_never_started_and_ignores_busy_or_settled_rounds(loop_facts: dict) -> None:
    pos = loop_facts["wPos"]
    assert pos["state"] is None and pos["sentDelta"] == 1
    assert "a rodada não começou (modelo ou chave?)" in pos["note"]  # 3 s sem comecar: encerra com aviso
    early = loop_facts["wEarly"]
    assert early["active"] is True and early["next"] == 290000 and early["sentDelta"] == 1  # terminou antes: segue
    busy = loop_facts["wBusy"]
    assert busy["active"] is True and busy["running"] is True  # agente ocupado no watchdog: nao encerra


def test_2b_round_cap_is_50_and_the_51st_stops_with_a_notice(loop_facts: dict) -> None:
    cap = loop_facts["maxRound"]
    assert cap == {"sentDelta": 50, "round": 50, "widget": True}  # 50 rodadas disparadas
    stop = loop_facts["maxStop"]
    assert stop["state"] is None and stop["sentDelta"] == 50  # a 51a nao sai
    assert "limite de 50 rodadas" in stop["note"]


def test_1b_busy_or_queued_go_pending_retry_every_5s_and_fire_on_settle(loop_facts: dict) -> None:
    assert loop_facts["b1"] == {"sentDelta": 1, "pending": True, "widget": True}  # ocupado: nao dispara, espera
    assert loop_facts["b2"] == 1  # a nova tentativa a cada 5 s, sem disparo enquanto ocupado
    assert loop_facts["b3"] == {"sentDelta": 2, "round": 2, "pending": False}  # tentativa dispara sem agent_settled
    assert loop_facts["b4"] == {"sentDelta": 2, "pending": True}  # mensagem na fila: pendente de novo
    assert loop_facts["b5"] == {"sentDelta": 3, "round": 3}  # agent_settled com a fila livre dispara na hora


def test_3_esc_parar_and_shutdown_clear_the_timer(loop_facts: dict) -> None:
    assert loop_facts["esc"]["state"] is None and "Esc" in loop_facts["esc"]["note"]
    assert loop_facts["escSentDelta"] == 0  # Esc: nenhum disparo depois
    assert loop_facts["parar"]["state"] is None and loop_facts["parar"]["note"] == "/loop encerrado."
    assert loop_facts["parar"]["sentDelta"] == 1 and loop_facts["pararAfter"] == 1  # so o disparo inicial
    assert loop_facts["shutdownWidget"] is True  # shutdown limpa o widget antes de soltar o ctx
    assert loop_facts["shutdown"] == {"state": None, "sentDelta": 0}  # shutdown: timer limpo, nada depois


def test_3d_shutdown_survives_a_throwing_ui_and_a_missing_timer_handle(loop_facts: dict) -> None:
    bad = loop_facts["badUi"]
    assert bad["threw"] is False and bad["sentDelta"] == 2 and bad["state"] == "ativo"  # rodada 1 ao iniciar e rodada 2 em 5 min, sem lancar  # a interface que lanca nao derruba o loop
    shut = loop_facts["badShutdown"]
    assert shut == {"threw": False, "state": None, "sentAfter": 0}  # shutdown nao lanca e nao deixa disparo
    none = loop_facts["noHandle"]
    assert none == {"threw": False, "sentDelta": 1, "state": "ativo"}  # timer sem handle: nao lanca
    assert loop_facts["unrefCalled"] is True  # o timer do loop e marcado com unref


def test_4_invalid_intervals_are_refused_with_the_new_example_and_limits_are_inclusive(loop_facts: dict) -> None:
    assert loop_facts["parse"] == {"m": 300, "x": None, "frac": None}  # 5M aceito; 5x e 1.5m nao
    tries = loop_facts["tries"]
    assert "Intervalo inválido" in tries["5x tarefa"]["note"] and "90s" in tries["5x tarefa"]["note"]
    assert tries["5x tarefa"]["started"] is False
    assert "fora do limite" in tries["30s tarefa"]["note"] and tries["30s tarefa"]["started"] is False
    assert "fora do limite" in tries["25h tarefa"]["note"] and tries["25h tarefa"]["started"] is False
    assert "Falta a tarefa" in tries["5m"]["note"] and tries["5m"]["started"] is False
    assert "fora do limite" in tries["0m tarefa"]["note"] and tries["0m tarefa"]["started"] is False
    assert "Intervalo inválido" in tries["1.5m tarefa"]["note"] and tries["1.5m tarefa"]["started"] is False
    assert "Intervalo inválido" in tries["3coisas tarefa"]["note"] and tries["3coisas tarefa"]["started"] is False  # digito colado: intervalo
    assert tries["60s tarefa"]["started"] is True and tries["24h tarefa"]["started"] is True  # limites aceitos
    assert "Nenhum /loop ativo" in loop_facts["noneToStop"]


def test_4c_a_leading_number_with_a_space_is_a_task_not_an_interval(loop_facts: dict) -> None:
    dyn = loop_facts["dynamic"]
    assert dyn == {"task": "3 coisas checar", "every": None, "sentDelta": 1}  # "3 coisas checar" inicia loop sem intervalo


def test_4b_a_second_loop_while_one_is_active_is_refused(loop_facts: dict) -> None:
    assert "Já há um /loop ativo" in loop_facts["second"]["note"]
    assert loop_facts["second"]["task"] == "a"  # o primeiro segue


def test_5_schedule_wakeup_errors_and_clamps_to_60s_3600s(loop_facts: dict) -> None:
    assert loop_facts["wakeNoLoop"] is True  # sem loop: erro
    assert loop_facts["wakeFixed"] is True  # loop de intervalo fixo: erro
    assert loop_facts["c1"] == {"round": 1, "mentionsWake": True, "every": None}
    assert "1m" in loop_facts["c10"] and loop_facts["c10next"] == MIN  # 10 s sobe para 60 s
    assert loop_facts["c2round"] == 2
    assert "1h" in loop_facts["c99999"] and loop_facts["c99999next"] == HOUR  # 99999 desce para 3600 s
    assert loop_facts["c3round"] == 3
    assert "1m" in loop_facts["cNeg"] and loop_facts["cNegNext"] == MIN  # negativo sobe para 60 s
    assert loop_facts["c4round"] == 4
    assert loop_facts["wakeNoDelay"] is True and loop_facts["wakeNaN"] is True  # sem numero: erro
    assert loop_facts["stillActive"] is True  # o erro nao derruba o loop
    assert loop_facts["c120next"] == 2 * MIN and loop_facts["c5round"] == 5
    assert loop_facts["wakeStop"] == "/loop encerrado." and loop_facts["stopState"] is None
    assert "concluiu a tarefa" in loop_facts["stopNote"]
    assert loop_facts["stopSentDelta"] == 0  # stop:true: nada mais dispara


def test_5b_a_round_without_schedule_wakeup_ends_the_loop(loop_facts: dict) -> None:
    assert loop_facts["noWake"]["sentDelta"] == 1 and loop_facts["noWake"]["state"] is None
    assert "não agendou" in loop_facts["noWake"]["note"]
    assert loop_facts["noWakeAfter"] == 1  # so a rodada que foi disparada


def test_6_widget_shows_the_round_cap_the_next_time_and_is_cleared_on_stop(loop_facts: dict) -> None:
    assert loop_facts["w1"].startswith("🔁 /loop a cada 5m · rodada 1/50 · rodando")
    assert loop_facts["wKey"] == "pink-loop"
    assert re.search(r"próxima às \d{2}:\d{2}:\d{2}", loop_facts["w2"]) is not None
    assert loop_facts["wLines"] == "   /loop parar (ou Esc durante a rodada) para encerrar"
    assert loop_facts["wClear"] is True  # parar limpa
    assert loop_facts["wAgent"] is True  # sem intervalo: "ritmo do agente"
    assert loop_facts["wClearAgain"] is True


def test_7_package_wiring_and_subagent_registers_nothing(loop_facts: dict) -> None:
    wiring = loop_facts["wiring"]
    assert wiring["tools"] == ["schedule_wakeup"]
    assert set(wiring["handlers"]) == {"agent_settled", "session_shutdown"}
    assert wiring["cmds"] == ["loop"]
    assert loop_facts["subagentWiring"] == {"tools": [], "handlers": [], "cmds": []}
