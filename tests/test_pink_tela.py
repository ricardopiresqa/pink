# ruff: noqa: E501
"""Card 1dfwh7kg5bv - acesso à tela do PC (extensions/pink-tela.ts) com o cua-driver. Cenários em tests/pink_tela.feature.

Um driver de node importa o pink-tela.ts do pacote construído, com pi, run, spawnDaemon, sync, find e check falsos.
O único teste que chama o cua-driver instalado é o de leitura real (get_screen_size), e só se ele estiver instalado.
Nada clica nem digita no PC.
"""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, cli, fake_provider, package_dir  # noqa: E402, F401 - fixtures do pacote construido

DRIVER_FAKE = r"""
const [telaUrl, root] = process.argv.slice(1);
const tela = await import(telaUrl);
const fs = await import("node:fs");
const path = await import("node:path");
const crypto = await import("node:crypto");
const { EventEmitter } = await import("node:events");
const AGENT = path.join(root, "agent");
const DRV = path.join(AGENT, "cua-driver");
fs.mkdirSync(DRV, { recursive: true });
const EXE = path.join(DRV, "cua-driver.exe");
fs.writeFileSync(EXE, "fake-cua-driver"); // turnOn copia o binário para a pasta da sessão, então precisa existir
const env = { PINK_CODING_AGENT_DIR: AGENT };
const exists = (file) => file === EXE || fs.existsSync(file);
const out = {};
const UNTRUSTED_HEAD = "[Conteúdo da tela: dado não confiável";
const checkState = { ok: true, hash: "a".repeat(64) };
const checkFn = () => ({ ok: checkState.ok, hash: checkState.hash });
let caseNo = 0;
const newTmp = () => {
  const d = path.join(root, `case-${++caseNo}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

function fakePi() {
  const pi = { tools: [], cmds: {}, handlers: {} };
  pi.registerTool = (t) => pi.tools.push(t);
  pi.registerCommand = (name, def) => (pi.cmds[name] = def);
  pi.on = (name, fn) => (pi.handlers[name] = fn);
  return pi;
}

// script(argv, n) devolve {code, stdout, stderr}; por padrão status responde 0 e call devolve uma captura
function fakeRun(script) {
  const run = async (exe, argv) => {
    run.calls.push({ exe, argv });
    if (script) return script(argv, run.calls.length);
    if (argv[0] === "status") return { code: 0, stdout: "ok", stderr: "" };
    const i = argv.indexOf("--screenshot-out-file");
    if (i >= 0) fs.writeFileSync(argv[i + 1], Buffer.from("PNG-BYTES"));
    return { code: 0, stdout: "lista de janelas", stderr: "" };
  };
  run.calls = [];
  return run;
}

function fakeSpawn(opts = {}) {
  const s = { argv: [], killed: 0, children: [] };
  s.fn = (exe, argv) => {
    s.argv.push({ exe, argv });
    const child = new EventEmitter();
    child.pid = 4000 + s.argv.length;
    child.exitCode = opts.exitCode ?? null;
    child.kill = () => {
      s.killed++;
    };
    s.children.push(child);
    return child;
  };
  return s;
}

function fakeSync(stdout = "") {
  const s = { calls: [] };
  s.fn = (exe, argv) => {
    s.calls.push({ exe, argv });
    return { stdout };
  };
  return s;
}

// answers: uma resposta por pergunta feita (a última repete)
const ctx = (answers = [true], hasUI = true) => {
  const c = { hasUI, asked: [], notes: [], ui: {} };
  let i = 0;
  c.ui.confirm = async (title, body) => {
    c.asked.push({ title, body });
    return answers[Math.min(i++, answers.length - 1)];
  };
  c.ui.notify = (text, level) => c.notes.push({ text, level });
  return c;
};

// contorno falso: guarda as linhas enviadas e quantas vezes parou (o real abre uma janela no Windows)
function fakeBorder() {
  const b = { lines: [], stops: 0, starts: 0 };
  b.fn = () => {
    b.starts++;
    return { send: (line) => b.lines.push(line), stop: () => b.stops++ };
  };
  return b;
}

function newTela({ dir, run, spawned, sync, find, envOverride = env, existsOverride = exists, borderFake } = {}) {
  const pi = fakePi();
  const d = dir ?? newTmp();
  const sp = spawned ?? fakeSpawn();
  const sy = sync ?? fakeSync();
  const bd = borderFake ?? fakeBorder();
  const t = tela.createTela(pi, { env: envOverride, run: run ?? fakeRun(), spawnDaemon: sp.fn, exists: existsOverride, tmp: d, check: checkFn, find: find ?? (() => undefined), sync: sy.fn, border: bd.fn });
  return { pi, t, sp, sy, dir: d, bd };
}

const exec = (t, action, args, c) => t.execute("id", { action, args }, undefined, undefined, c);
const text = (r) => r.content[0].text;

// (0) registro, funções puras
{
  const { pi } = newTela();
  out.registered = { tool: pi.tools.map((t) => t.name), cmd: !!pi.cmds.tela, shutdown: !!pi.handlers.session_shutdown };
  const agentX = newTmp();
  out.driverPath = {
    ours: tela.driverPath({ PINK_CODING_AGENT_DIR: agentX, PINK_CUA_DRIVER: "C:/outro/cua-driver.exe", LOCALAPPDATA: "C:/L" }, () => true) ?? null,
    expected: path.join(agentX, "cua-driver", "cua-driver.exe"),
    missing: tela.driverPath({ PINK_CODING_AGENT_DIR: agentX }, () => false) ?? null,
    dirDefault: tela.driverDir({}).endsWith(path.join(".pink", "agent", "cua-driver")),
  };
  out.isRead = { read: tela.isRead("list_windows"), act: tela.isRead("click"), unknown: tela.isRead("kill_app") };
  out.isAct = { act: tela.isAct("click"), read: tela.isAct("list_windows"), unknown: tela.isAct("run_script") };
  out.lookup = {
    parsed: tela.lookup(844, () => ({ stdout: '"notepad.exe","844","Console","1","5,000 K","Executando","USER","0:00:00","Sem título"\r\n' })) ?? null,
    noTask: tela.lookup(1, () => ({ stdout: "INFO: nenhuma tarefa em execução com o filtro especificado.\n" })) ?? null,
    invalid: tela.lookup("abc", () => ({ stdout: "" })) ?? null,
    throws: tela.lookup(5, () => {
      throw new Error("sem tasklist");
    }) ?? null,
  };
  out.refuse = {
    long: tela.refuse("type_text", { pid: 1, text: "x".repeat(2001) }) ?? null,
    max: tela.refuse("type_text", { pid: 1, text: "x".repeat(2000) }) ?? null,
    noPid: tela.refuse("type_text", { text: "oi" }) ?? null,
    win: tela.refuse("hotkey", { pid: 1, keys: ["win", "r"] }) ?? null,
    winString: tela.refuse("hotkey", { pid: 1, keys: "meta" }) ?? null,
    winInText: tela.refuse("press_key", { pid: 1, key: "lwin+r" }) ?? null,
    ctrlEsc: tela.refuse("hotkey", { pid: 1, keys: ["ctrl", "esc"] }) ?? null,
    ctrlC: tela.refuse("hotkey", { pid: 1, keys: ["ctrl", "c"] }) ?? null,
    launchExtra: tela.refuse("launch_app", { name: "calc", urls: "http://x", additional_arguments: "/c" }) ?? null,
    launchOk: tela.refuse("launch_app", { name: "calc" }) ?? null,
    launchPathOk: tela.refuse("launch_app", { path: "C:\\Windows\\notepad.exe" }) ?? null,
    launchPathBat: tela.refuse("launch_app", { path: "C:\\x\\run.bat" }) ?? null,
    launchNameColon: tela.refuse("launch_app", { name: "C:\\calc" }) ?? null,
    launchShell: tela.refuse("launch_app", { name: "powershell" }) ?? null,
    launchUrlName: tela.refuse("launch_app", { name: "https://x" }) ?? null,
    readOutFile: tela.refuse("get_window_state", { pid: 1, window_id: 2, screenshot_out_file: "C:\\x.png" }) ?? null,
    readOk: tela.refuse("get_window_state", { pid: 1, window_id: 2, tree_format: "markdown" }) ?? null,
  };
  out.extraArgs = tela.describe("type_text", { pid: 1, text: "oi", extra: true }, undefined);
  out.longTitle = tela.lookup(7, () => ({ stdout: '"app.exe","7","Console","1","1 K","Executando","USER","0:00:00","' + "t".repeat(120) + '"' })) ?? null;
  out.lookupEmptyCell = tela.lookup(8, () => ({ stdout: '"app.exe","8","Console","1","1 K","Executando","USER","0:00:00",""' })) ?? null;
  out.describe = {
    typed: tela.describe("type_text", { text: "linha 1\nlinha 2" }, { image: "notepad.exe", title: "Sem título" }),
    noTitle: tela.describe("click", { x: 1, y: 2 }, { image: "app.exe", title: "N/A" }),
    pidOnly: tela.describe("click", { pid: 844, x: 1, y: 2 }, undefined),
    hotkey: tela.describe("hotkey", { keys: ["ctrl", "s"] }, undefined),
    launch: tela.describe("launch_app", { name: "calc" }, undefined),
  };
}

// (0b) confere com leitura falsa: os cinco arquivos fixados; um trocado ou ausente é nomeado
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
{
  const saved = { ...tela.PINNED };
  const names = Object.keys(saved);
  const files = Object.fromEntries(names.map((n) => [n, Buffer.from(`conteudo-${n}`)]));
  for (const n of names) tela.PINNED[n] = sha(files[n]);
  const read = (p) => {
    const b = files[path.basename(p)];
    if (!b) throw new Error("ausente");
    return b;
  };
  const exe0 = path.join("C:", "x", "cua-driver.exe");
  out.trustAll = tela.trusted(exe0, {}, read);
  files["cua_driver_sdk.dll"] = Buffer.from("trocado");
  out.trustChanged = tela.trusted(exe0, {}, read);
  delete files["cua-cursor-theme.exe"];
  out.trustMissing = tela.trusted(exe0, {}, read);
  Object.assign(tela.PINNED, saved);
}

// (0c) install com fetch e sync falsos: zip com hash errado, HTTP com erro, zip com arquivo trocado, e o caminho certo
const bufOf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const respond = (b, ok = true, status = 200) => async () => ({ ok, status, arrayBuffer: async () => bufOf(b) });
const hasLeftovers = (agentDir) => (fs.existsSync(agentDir) ? fs.readdirSync(agentDir).some((n) => n.startsWith("cua-driver-baixando-")) : false);
{
  const d = newTmp();
  const agentI = path.join(d, "agent");
  const envI = { PINK_CODING_AGENT_DIR: agentI };
  const dest = tela.driverDir(envI);
  const never = () => {
    throw new Error("sync não devia rodar");
  };
  out.installBadHash = { msg: await tela.install({ env: envI, fetcher: respond(Buffer.from("nao-e-o-zip")), sync: never }), destExists: fs.existsSync(dest), leftovers: hasLeftovers(agentI) };
  out.installHttp = { msg: await tela.install({ env: envI, fetcher: respond(Buffer.alloc(0), false, 503), sync: never }), destExists: fs.existsSync(dest), leftovers: hasLeftovers(agentI) };

  const zip = Buffer.from("zip-falso");
  const expanded = Object.fromEntries(Object.keys(tela.PINNED).map((n) => [n, Buffer.from(`bin-${n}`)]));
  const savedR = { ...tela.RELEASE };
  const savedP = { ...tela.PINNED };
  tela.RELEASE.zipSha256 = sha(zip);
  for (const n of Object.keys(expanded)) tela.PINNED[n] = sha(expanded[n]);
  const extract = (files) => (exe, argv, opts) => {
    if (argv.includes("-Command")) {
      fs.mkdirSync(opts.env.PINK_OUT, { recursive: true });
      for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(opts.env.PINK_OUT, n), b);
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const calls = [];
  const installSync = (exe, argv, opts) => {
    calls.push({ argv, zipSeen: opts?.env?.PINK_ZIP ? fs.existsSync(opts.env.PINK_ZIP) : null });
    return extract(expanded)(exe, argv, opts);
  };
  out.installOk = { msg: await tela.install({ env: envI, fetcher: respond(zip), sync: installSync }), filesOk: Object.keys(expanded).every((n) => fs.existsSync(path.join(dest, n))), zipSeen: calls[0]?.zipSeen ?? null, telemetry: calls.some((c) => c.argv[0] === "telemetry" && c.argv[1] === "disable"), leftovers: hasLeftovers(agentI) };

  const agent2 = path.join(d, "agent2");
  const wrong = { ...expanded, "cua-driver.exe": Buffer.from("trocado") };
  out.installWrongFile = { msg: await tela.install({ env: { PINK_CODING_AGENT_DIR: agent2 }, fetcher: respond(zip), sync: extract(wrong) }), destExists: fs.existsSync(tela.driverDir({ PINK_CODING_AGENT_DIR: agent2 })), leftovers: hasLeftovers(agent2) };
  Object.assign(tela.RELEASE, savedR);
  Object.assign(tela.PINNED, savedP);
}

// (0d) /tela instalar: cancelar não instala; com a tela ligada, recusa; confirmar chama o instalador; sem driver, status manda instalar
{
  let installs = 0;
  const installer = async () => {
    installs++;
    return "Tela: cua-driver 0.55.0 instalado em X. Use /tela ligar.";
  };
  const d = newTmp();
  const pi = fakePi();
  const t = tela.createTela(pi, { env: { PINK_CODING_AGENT_DIR: path.join(d, "agent") }, run: fakeRun(), spawnDaemon: fakeSpawn().fn, exists: () => false, tmp: d, check: checkFn, find: () => undefined, sync: fakeSync().fn, installer });
  const cNo = ctx([false]);
  await pi.cmds.tela.handler("instalar", cNo);
  out.installCancel = { installs, notes: cNo.notes.map((n) => n.text), asked: cNo.asked.map((a) => a.title) };
  const cYes = ctx([true]);
  await pi.cmds.tela.handler("instalar", cYes);
  out.installConfirm = { installs, notes: cYes.notes.map((n) => ({ text: n.text, level: n.level })), body: cYes.asked[0]?.body ?? "" };
  out.noDriverStatus = t.status();

  const pi2 = fakePi();
  const tOn = tela.createTela(pi2, { env, run: fakeRun(), spawnDaemon: fakeSpawn().fn, exists, tmp: newTmp(), check: checkFn, find: () => undefined, sync: fakeSync().fn, installer });
  await tOn.turnOn();
  const before = installs;
  const cOn = ctx([true]);
  await pi2.cmds.tela.handler("instalar", cOn);
  out.installWhileOn = { installsBefore: before, installsAfter: installs, level: cOn.notes[0]?.level ?? null, text: cOn.notes[0]?.text ?? "", asked: cOn.asked.length };
  tOn.turnOff();
}

// (1) desligada por padrão
{
  const run = fakeRun();
  const { t } = newTela({ run });
  const c = ctx();
  const r = await exec(t, "list_windows", {}, c);
  out.off = { text: text(r), isError: r.isError, runCalls: run.calls.length, asked: c.asked.length, isOn: t.isOn() };
}

// (2) binário que não confere
{
  const spawned = fakeSpawn();
  const run = fakeRun();
  const { t } = newTela({ run, spawned });
  checkState.ok = false;
  const turn = await t.turnOn();
  checkState.ok = true;
  out.checkFailsOn = { text: turn, spawned: spawned.argv.length, isOn: t.isOn() };

  // ligada: o execute usa a cópia conferida no ligar (não rehasheia); status() ainda reporta o original
  const runOn = fakeRun();
  const on = newTela({ run: runOn });
  await on.t.turnOn();
  const mark = runOn.calls.length;
  checkState.ok = false;
  const r = await exec(on.t, "list_windows", {}, ctx());
  const exe = runOn.calls[mark]?.exe ?? "";
  out.checkFailsExec = { text: text(r), isError: r.isError, runs: runOn.calls.length - mark, execInSession: path.basename(path.dirname(exe)).startsWith("pink-tela-"), status: on.t.status() };
  checkState.ok = true;
  on.t.turnOff();
}

// (3) ação fora da lista, mesmo ligada
{
  const run = fakeRun();
  const { t } = newTela({ run });
  await t.turnOn();
  const mark = run.calls.length;
  const results = {};
  for (const action of ["kill_app", "clipboard_read", "run_script"]) {
    const c = ctx();
    const r = await exec(t, action, {}, c);
    results[action] = { text: text(r), isError: r.isError, asked: c.asked.length };
  }
  out.unknown = { results, runCalls: run.calls.length - mark };
  t.turnOff();
}

// (4) pipe aleatório e arquivo de estado
{
  const dir = newTmp();
  const spawned = fakeSpawn();
  const { t } = newTela({ dir, spawned });
  const before = t.pipe();
  await t.turnOn();
  const first = t.pipe();
  const stateFile = path.join(dir, `pink-tela-${process.pid}.json`);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  t.turnOff();
  await t.turnOn();
  const second = t.pipe();
  t.turnOff();
  out.pipes = { before, first, second, statePipe: state.pipe === first, stateDaemonPid: state.daemonPid, childPid: spawned.children[0].pid, stateDirInside: state.dir.startsWith(dir) };
}

// (5) sobra de daemon: morto é parado; vivo fica
{
  const dir = newTmp();
  const deadPid = 999991;
  const oldDir = path.join(dir, "pink-tela-old");
  fs.mkdirSync(oldDir);
  fs.writeFileSync(path.join(dir, `pink-tela-${deadPid}.json`), JSON.stringify({ pipe: "\\\\.\\pipe\\pink-cua-old", daemonPid: 999992, dir: oldDir }));
  const livePid = process.ppid;
  const liveDir = path.join(dir, "pink-tela-live");
  fs.mkdirSync(liveDir);
  fs.writeFileSync(path.join(dir, `pink-tela-${livePid}.json`), JSON.stringify({ pipe: "\\\\.\\pipe\\pink-cua-live", daemonPid: 1, dir: liveDir }));
  const sy = fakeSync();
  const { t } = newTela({ dir, sync: sy });
  await t.turnOn();
  out.sweep = {
    stopOld: sy.calls.some((c) => c.argv[0] === "stop" && c.argv[2] === "\\\\.\\pipe\\pink-cua-old"),
    stopLive: sy.calls.some((c) => c.argv.includes("\\\\.\\pipe\\pink-cua-live")),
    oldFileGone: !fs.existsSync(path.join(dir, `pink-tela-${deadPid}.json`)),
    oldDirGone: !fs.existsSync(oldDir),
    liveFileKept: fs.existsSync(path.join(dir, `pink-tela-${livePid}.json`)),
    liveDirKept: fs.existsSync(liveDir),
  };
  t.turnOff();
}

// (6a) duas ligações ao mesmo tempo: um daemon só
{
  const spawned = fakeSpawn();
  const { t } = newTela({ spawned });
  const [a, b] = await Promise.all([t.turnOn(), t.turnOn()]);
  out.concurrent = { spawns: spawned.argv.length, first: a, second: b, isOn: t.isOn() };
  t.turnOff();
}

// (6b) daemon que sai durante a subida; evento exit depois de ligada
{
  const spawned = fakeSpawn({ exitCode: 1 });
  const run = fakeRun();
  const { t } = newTela({ spawned, run });
  const turn = await t.turnOn();
  out.exitedBeforeProbe = { text: turn, probes: run.calls.length, isOn: t.isOn(), killed: spawned.killed };
}
{
  const spawned = fakeSpawn();
  const { t } = newTela({ spawned });
  await t.turnOn();
  const wasOn = t.isOn();
  spawned.children[0].emit("exit", 1);
  out.exitEvent = { wasOn, isOn: t.isOn() };
  t.turnOff();
}

// (7) desligar: stop com o pipe, kill, pasta e estado apagados; sessão encerrada também desliga
{
  const dir = newTmp();
  const spawned = fakeSpawn();
  const sy = fakeSync();
  const { t } = newTela({ dir, spawned, sync: sy });
  await t.turnOn();
  const pipe = t.pipe();
  const off = t.turnOff();
  out.turnOff = {
    text: off,
    isOn: t.isOn(),
    pipeAfter: t.pipe(),
    killed: spawned.killed,
    stop: sy.calls.some((c) => c.argv[0] === "stop" && c.argv[2] === pipe),
    stateGone: !fs.existsSync(path.join(dir, `pink-tela-${process.pid}.json`)),
    sessionDirsLeft: fs.readdirSync(dir).filter((n) => n.startsWith("pink-tela-")).length,
  };
}
{
  const spawned = fakeSpawn();
  const { t, pi } = newTela({ spawned });
  await t.turnOn();
  await pi.handlers.session_shutdown();
  out.shutdown = { isOn: t.isOn(), killed: spawned.killed };
}

// probe que nunca responde
{
  const spawned = fakeSpawn();
  const run = fakeRun(() => ({ code: 1, stdout: "", stderr: "" }));
  const { t } = newTela({ spawned, run });
  const turn = await t.turnOn();
  out.neverAnswers = { text: turn, probes: run.calls.length, isOn: t.isOn(), killed: spawned.killed };
}

// (8) leitura: texto marcado como não confiável; captura na pasta da sessão; ação sem captura
{
  const run = fakeRun();
  const dir = newTmp();
  const { t } = newTela({ run, dir });
  await t.turnOn();
  const mark = run.calls.length;
  const r = await exec(t, "list_windows", {}, ctx());
  const call = run.calls[mark];
  const shot = call.argv[6] ?? "";
  out.readResult = {
    text: text(r),
    isError: r.isError,
    untrustedHead: text(r).startsWith(UNTRUSTED_HEAD),
    flag: call.argv[5],
    shotInSession: path.basename(path.dirname(shot)).startsWith("pink-tela-") && shot.startsWith(dir),
    image: r.content[1]?.data ?? null,
    imageType: r.content[1]?.mimeType ?? null,
    shotLeft: fs.existsSync(shot),
    argvHead: call.argv.slice(0, 5),
  };
  const mark2 = run.calls.length;
  const ra = await exec(t, "click", { pid: 1, x: 1, y: 1 }, ctx([true]));
  const ca = run.calls[mark2];
  out.actResult = { text: text(ra), untrusted: text(ra).startsWith("[Conteúdo"), hasShotFlag: ca.argv.includes("--screenshot-out-file"), argvHead: ca.argv.slice(0, 4) };
  t.turnOff();
}

// (9) confirmação: alvo e texto; recusa e aceite
{
  const run = fakeRun();
  const find = (pid) => (pid === 844 ? { image: "notepad.exe", title: "Sem título" } : undefined);
  const { t } = newTela({ run, find });
  await t.turnOn();
  const mark = run.calls.length;
  const no = ctx([false]);
  const rNo = await exec(t, "click", { pid: 844, x: 1, y: 2 }, no);
  const runsAfterNo = run.calls.length - mark;
  const yes = ctx([true]);
  await exec(t, "click", { pid: 844, x: 1, y: 2 }, yes);
  out.confirm = { refused: text(rNo), refusedIsError: rNo.isError, runsAfterNo, title: no.asked[0]?.title, body: no.asked[0]?.body, runsTotal: run.calls.length - mark, acceptedArgvHead: run.calls[mark].argv.slice(0, 4) };
  t.turnOff();
}

// (9b) liberar por programa: "Sim, e não perguntar de novo" vale para aquele programa até desligar; terminal nunca entra
{
  const run = fakeRun();
  const find = (pid) => ({ 844: { image: "msedge.exe", title: "Edge" }, 845: { image: "notepad.exe", title: "x" }, 9: { image: "cmd.exe", title: "C:\\x" } })[pid];
  const { t } = newTela({ run, find });
  await t.turnOn();
  const picks = [];
  const c = ctx([true]);
  c.ui.select = async (title, options) => (picks.push(options), options[picks.length === 1 ? 1 : 0]);
  const m = run.calls.length;
  await exec(t, "click", { pid: 844, x: 1, y: 2 }, c); // escolhe "não perguntar de novo"
  await exec(t, "press_key", { pid: 844, key: "enter" }, c); // liberado: sem pergunta
  await exec(t, "click", { pid: 845, x: 1, y: 2 }, c); // outro programa: pergunta
  await exec(t, "type_text", { pid: 9, text: "dir" }, c); // terminal: confirm duplo, sem a opção
  const afterFour = run.calls.length - m;
  t.turnOff();
  await t.turnOn();
  await exec(t, "click", { pid: 844, x: 1, y: 2 }, c); // desligou: pergunta de novo
  out.allowProgram = { selects: picks.length, firstOptions: picks[0], confirms: c.asked.length, runs: afterFour };
  t.turnOff();
}

// (10) terminal: segunda confirmação
{
  const run = fakeRun();
  const find = (pid) => (pid === 9 ? { image: "cmd.exe", title: "C:\\x" } : undefined);
  const { t } = newTela({ run, find });
  await t.turnOn();
  const m1 = run.calls.length;
  const cYes = ctx([true, true]);
  const rYes = await exec(t, "type_text", { pid: 9, text: "dir" }, cYes);
  const m2 = run.calls.length;
  const cNo = ctx([true, false]);
  const rNo = await exec(t, "type_text", { pid: 9, text: "dir" }, cNo);
  out.shell = { bothYesRuns: m2 - m1, bothYesAsked: cYes.asked.length, secondTitle: cYes.asked[1]?.title, bothYesText: text(rYes), secondNoRuns: run.calls.length - m2, secondNoAsked: cNo.asked.length, secondNoText: text(rNo) };
  t.turnOff();
}

// (11) o que nunca passa
{
  const run = fakeRun();
  const { t } = newTela({ run });
  await t.turnOn();
  const mark = run.calls.length;
  const results = {};
  for (const [key, action, args] of [
    ["longText", "type_text", { pid: 1, text: "x".repeat(2001) }],
    ["winKey", "hotkey", { pid: 1, keys: ["win", "r"] }],
    ["launchUrl", "launch_app", { name: "calc", urls: "http://x" }],
  ]) {
    const c = ctx();
    const r = await exec(t, action, args, c);
    results[key] = { text: text(r), isError: r.isError, asked: c.asked.length };
  }
  out.refusedOn = { results, runCalls: run.calls.length - mark };
  t.turnOff();
}

// (10b) alvo desconhecido também pede a segunda confirmação
{
  const run = fakeRun();
  const { t } = newTela({ run });
  await t.turnOn();
  const m = run.calls.length;
  const c = ctx([true, true]);
  const r = await exec(t, "type_text", { pid: 77, text: "dir" }, c);
  out.unknownTarget = { runs: run.calls.length - m, asked: c.asked.length, title: c.asked[1]?.title ?? null, text: text(r) };
  t.turnOff();
}

// (13) sem interface
{
  const run = fakeRun();
  const { t } = newTela({ run });
  await t.turnOn();
  const mark = run.calls.length;
  const r = await exec(t, "click", { pid: 1, x: 1, y: 1 }, ctx([true], false));
  out.noUi = { text: text(r), isError: r.isError, runCalls: run.calls.length - mark };
  t.turnOff();
}

// (14) /tela sem argumentos e os outros verbos
{
  const { pi } = newTela();
  const c = ctx();
  await pi.cmds.tela.handler(undefined, c);
  await pi.cmds.tela.handler("", c);
  out.cmdUndefined = { count: c.notes.length, text: c.notes[0].text, level: c.notes[0].level };
  const ok = ctx();
  const { pi: piOk } = newTela({ run: fakeRun() });
  await piOk.cmds.tela.handler("ligar", ok);
  await piOk.cmds.tela.handler("desligar", ok);
  out.cmdOnOff = { on: ok.notes[0].text.split("\n")[0], onLevel: ok.notes[0].level, off: ok.notes[1].text, offLevel: ok.notes[1].level };
  const noDrv = ctx();
  const { pi: piNo } = newTela({ envOverride: {}, existsOverride: () => false });
  await piNo.cmds.tela.handler("ligar", noDrv);
  out.cmdNoDriver = { text: noDrv.notes[0].text, level: noDrv.notes[0].level };
  const bad = ctx();
  const { pi: piBad } = newTela({});
  checkState.ok = false;
  await piBad.cmds.tela.handler("ligar", bad);
  checkState.ok = true;
  out.cmdBadHash = { text: bad.notes[0].text, level: bad.notes[0].level };
}

// (15) contorno na cor do tema: janela lida, tela inteira, listas sem contorno, desligar para
{
  const bd = fakeBorder();
  const { t } = newTela({ run: fakeRun(), borderFake: bd });
  const before = bd.starts;
  await t.turnOn();
  const themed = (ansi) => ({ ...ctx(), ui: { ...ctx().ui, theme: { getFgAnsi: () => ansi } } });
  await exec(t, "get_window_state", { pid: 844, window_id: 10725 }, themed("\x1b[38;2;255;45;149m"));
  await exec(t, "get_desktop_state", {}, themed("\x1b[38;5;33m"));
  await exec(t, "list_windows", {}, themed("\x1b[38;2;1;2;3m"));
  await exec(t, "type_text", { pid: 844, text: "oi" }, ctx([true, true]));
  t.turnOff();
  out.border = { startedOnTurnOn: bd.starts - before, lines: bd.lines, stops: bd.stops };
  out.accentHex = {
    truecolor: tela.accentHex({ getFgAnsi: () => "\x1b[38;2;16;32;48m" }),
    idx16: tela.accentHex({ getFgAnsi: () => "\x1b[38;5;9m" }),
    cube: tela.accentHex({ getFgAnsi: () => "\x1b[38;5;33m" }),
    gray: tela.accentHex({ getFgAnsi: () => "\x1b[38;5;244m" }),
    fgOnly: tela.accentHex({ fg: (_c, s) => `\x1b[38;2;200;100;0m${s}\x1b[39m` }),
    none: tela.accentHex(undefined),
    throws: tela.accentHex({ getFgAnsi: () => { throw new Error("x"); } }),
  };
  out.borderTarget = {
    hwnd: tela.borderTarget("click", { pid: 1, window_id: 77 }) ?? null,
    pid: tela.borderTarget("type_text", { pid: 5 }) ?? null,
    desktop: tela.borderTarget("get_desktop_state", {}) ?? null,
    list: tela.borderTarget("list_windows", {}) ?? null,
    bad: tela.borderTarget("click", { window_id: "1; rm", pid: -3 }) ?? null,
  };
  // contorno que falha ao subir não impede a tela de ligar
  const { t: t2 } = newTela({ run: fakeRun(), borderFake: { fn: () => { throw new Error("sem csc"); } } });
  const turn2 = await t2.turnOn();
  const r2 = await exec(t2, "get_desktop_state", {}, ctx());
  out.borderFails = { on: t2.isOn(), isError: r2.isError, turn: turn2.split("\n")[0] };
  t2.turnOff();
}

// (16) card 1dfwh7kg8mn: as ações vão por UMA conexão MCP; o servidor falso conta as chamadas no mesmo processo
{
  const { spawn } = await import("node:child_process");
  const server = path.join(root, "fake-mcp.mjs");
  fs.writeFileSync(server, `
    const rl = (await import("node:readline")).createInterface({ input: process.stdin });
    let calls = 0;
    const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
    rl.on("line", (line) => {
      const m = JSON.parse(line);
      if (m.method === "initialize") return send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-06-18", capabilities: {} } });
      if (m.method !== "tools/call") return;
      calls++;
      const a = m.params.arguments;
      if (m.params.name === "set_value") return send({ jsonrpc: "2.0", id: m.id, result: { isError: calls < 2, content: [{ type: "text", text: "chamada " + calls + " " + a.element_token }] } });
      send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "chamada " + calls + " pid " + a.pid }, { type: "image", data: Buffer.from("PNG-MCP").toString("base64"), mimeType: "image/png" }] } });
    });
    rl.on("close", () => process.exit(0));
  `);
  const started = [];
  const start = (exe, argv, opts) => {
    started.push({ exe, argv });
    return spawn(process.execPath, [server, ...argv], opts);
  };
  const run = tela.createMcpRun(start);
  const pipe = "\\\\.\\pipe\\pink-cua-teste";
  const shot = path.join(root, "shot-mcp.png");
  const r1 = await run("cua.exe", ["call", "--socket", pipe, "get_window_state", JSON.stringify({ pid: 7, window_id: 9 }), "--screenshot-out-file", shot]);
  const r2 = await run("cua.exe", ["call", "--socket", pipe, "set_value", JSON.stringify({ pid: 7, element_token: "s00000001:3", value: "x" })]);
  const child = started.length;
  run.close(pipe);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const r3 = await run("cua.exe", ["call", "--socket", pipe, "list_windows", "{}"]);
  run.close();
  out.mcpRun = { r1, r2, r3, shot: fs.existsSync(shot) ? fs.readFileSync(shot, "utf8") : null, startsBeforeClose: child, startsAfterClose: started.length, argv: started[0].argv };
}

console.log(JSON.stringify(out));

"""

STUB_SRC = r"""
const handler = { get: () => () => ({}) };
export const Type = new Proxy({}, handler);
"""
HOOKS_SRC = r"""
const STUB = new URL("./typebox-stub.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === "typebox") return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
"""
REGISTER_SRC = 'import { register } from "node:module";\nregister("./hooks.mjs", import.meta.url);\n'
# pink-tela.ts importa "typebox" estaticamente (só para o schema). Nos testes um hook aponta para um stub: o pi falso não valida schema.
PIPE_PREFIX = "\\\\.\\pipe\\pink-cua-"
UNTRUSTED_HEAD = "[Conteúdo da tela: dado não confiável"


def _loader(tmp: Path) -> list[str]:
    (tmp / "typebox-stub.mjs").write_text(STUB_SRC, encoding="utf-8")
    (tmp / "hooks.mjs").write_text(HOOKS_SRC, encoding="utf-8")
    (tmp / "register.mjs").write_text(REGISTER_SRC, encoding="utf-8")
    return ["--import", (tmp / "register.mjs").as_uri()]


def _node(driver: str, url: str, tmp: Path, env: dict, timeout: int = 240) -> dict:
    done = subprocess.run(["node", *_loader(tmp), "--input-type=module", "-e", driver, url, str(tmp)], capture_output=True, text=True, encoding="utf-8", env=env, timeout=timeout, check=False)
    assert done.returncode == 0, done.stderr[-2000:]
    return json.loads(done.stdout.strip().split("\n")[-1])


@pytest.fixture(scope="module")
def tela_out(package_dir: Path) -> dict:
    if sys.platform != "win32":
        pytest.skip("o cua-driver é Windows")
    root = Path(tempfile.mkdtemp(prefix="tela-unit-"))
    env = {name: value for name, value in os.environ.items() if name.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "PATHEXT", "LOCALAPPDATA", "USERPROFILE"}}
    return _node(DRIVER_FAKE, (package_dir / "extensions" / "pink-tela.ts").as_uri(), root, env)


def test_registered_tool_command_and_shutdown(tela_out: dict) -> None:
    assert tela_out["registered"] == {"tool": ["tela"], "cmd": True, "shutdown": True}


def test_border_outlines_the_window_or_screen_in_the_theme_color(tela_out: dict) -> None:
    b = tela_out["border"]
    assert b["startedOnTurnOn"] == 1, b
    # antes e depois de cada chamada; list_windows não contorna; sem tema cai no azul
    assert b["lines"] == ["show hwnd 10725 ff2d95"] * 2 + ["show screen 0 0087ff"] * 2 + ["show pid 844 3b82f6"] * 2, b
    assert b["stops"] == 1, b


def test_accent_hex_reads_the_theme_ansi(tela_out: dict) -> None:
    assert tela_out["accentHex"] == {"truecolor": "102030", "idx16": "ff0000", "cube": "0087ff", "gray": "808080", "fgOnly": "c86400", "none": "3b82f6", "throws": "3b82f6"}


def test_border_target_only_takes_integer_ids(tela_out: dict) -> None:
    assert tela_out["borderTarget"] == {"hwnd": "hwnd 77", "pid": "pid 5", "desktop": "screen 0", "list": None, "bad": None}


def test_border_failure_does_not_block_the_screen(tela_out: dict) -> None:
    r = tela_out["borderFails"]
    assert r["on"] is True and r["isError"] is False, r


def test_actions_share_one_mcp_connection_so_the_read_is_remembered(tela_out: dict) -> None:
    """Card 1dfwh7kg8mn: com um `call` por ação o daemon esquecia a leitura e clicar/preencher falhava."""
    m = tela_out["mcpRun"]
    assert m["argv"][:2] == ["mcp", "--socket"] and m["startsBeforeClose"] == 1  # leitura e ação no mesmo processo
    assert m["r1"] == {"code": 0, "stdout": "chamada 1 pid 7", "stderr": ""} and m["shot"] == "PNG-MCP"  # captura vem da resposta MCP
    assert m["r2"]["stdout"] == "chamada 2 s00000001:3" and m["r2"]["code"] == 0  # o servidor viu a 2a chamada na mesma conexão
    assert m["startsAfterClose"] == 2 and m["r3"]["stdout"].startswith("chamada 1")  # desligar fecha; a próxima abre conexão nova


def test_border_helper_source_ships_and_compiles(package_dir: Path, tmp_path: Path) -> None:
    if sys.platform != "win32":
        pytest.skip("contorno é Windows")
    src = package_dir / "extensions" / "pink-tela-borda.cs"
    assert src.is_file()
    csc = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe"
    exe = tmp_path / "borda.exe"
    done = subprocess.run([str(csc), "/nologo", f"/out:{exe}", str(src)], capture_output=True, text=True, check=False)
    assert done.returncode == 0 and exe.is_file(), done.stdout[-1500:]
    # recebe comandos (com lixo antes, como um BOM) e sai quando a entrada fecha
    proc = subprocess.Popen([str(exe)], stdin=subprocess.PIPE, creationflags=0x08000000)
    assert proc.stdin is not None
    proc.stdin.write(b"\xef\xbb\xbfshow screen 0 ff2d95\nhide\n")
    proc.stdin.close()
    assert proc.wait(timeout=10) == 0


def test_pure_helpers(tela_out: dict) -> None:
    assert tela_out["isRead"] == {"read": True, "act": False, "unknown": False}
    assert tela_out["isAct"] == {"act": True, "read": False, "unknown": False}


def test_driver_path_is_only_pinks_own_folder(tela_out: dict) -> None:
    d = tela_out["driverPath"]
    assert d["ours"] == d["expected"], d  # PINK_CUA_DRIVER e o caminho do OpenBot são ignorados
    assert d["missing"] is None and d["dirDefault"] is True


def test_trusted_checks_every_pinned_file_with_a_fake_read(tela_out: dict) -> None:
    assert tela_out["trustAll"]["ok"] is True
    assert tela_out["trustChanged"]["ok"] is False and tela_out["trustChanged"]["hash"].startswith("cua_driver_sdk.dll: "), tela_out["trustChanged"]
    assert tela_out["trustMissing"]["ok"] is False and tela_out["trustMissing"]["hash"].startswith("cua-cursor-theme.exe: ausente"), tela_out["trustMissing"]


def test_install_with_a_bad_zip_hash_writes_nothing(tela_out: dict) -> None:
    r = tela_out["installBadHash"]
    assert "não bate com o SHA-256 conferido; não instalei nada" in r["msg"], r
    assert r["destExists"] is False and r["leftovers"] is False


def test_install_with_an_http_error_writes_nothing(tela_out: dict) -> None:
    r = tela_out["installHttp"]
    assert r["msg"] == "Tela: o download falhou (HTTP 503)." and r["destExists"] is False and r["leftovers"] is False


def test_install_with_a_wrong_file_inside_the_zip_writes_nothing(tela_out: dict) -> None:
    r = tela_out["installWrongFile"]
    assert "cua-driver.exe dentro do zip não bate com o hash fixado" in r["msg"], r
    assert r["destExists"] is False and r["leftovers"] is False


def test_install_with_the_right_zip_copies_the_pinned_files_and_disables_telemetry(tela_out: dict) -> None:
    r = tela_out["installOk"]
    assert r["msg"].startswith("Tela: cua-driver 0.55.0 instalado em"), r
    assert r["filesOk"] is True and r["zipSeen"] is True and r["telemetry"] is True and r["leftovers"] is False, r


def test_status_without_the_driver_says_to_install(tela_out: dict) -> None:
    assert "Rode /tela instalar" in tela_out["noDriverStatus"], tela_out["noDriverStatus"]


def test_tela_instalar_cancelled_does_not_install(tela_out: dict) -> None:
    c = tela_out["installCancel"]
    assert c["installs"] == 0 and c["notes"] == ["Instalação cancelada."] and c["asked"] == ["Baixar o cua-driver do Pink?"], c


def test_tela_instalar_confirmed_installs_and_says_so(tela_out: dict) -> None:
    c = tela_out["installConfirm"]
    last = c["notes"][-1]  # antes do resultado vem a nota "Baixando o cua-driver…"
    assert c["installs"] == 1 and last["level"] == "info" and last["text"].startswith("Tela: cua-driver 0.55.0 instalado"), c
    assert "https://github.com/trycua/cua/releases/download/" in c["body"] and "31 MB" in c["body"]


def test_tela_instalar_while_on_is_refused(tela_out: dict) -> None:
    w = tela_out["installWhileOn"]
    assert w["installsBefore"] == w["installsAfter"] and w["asked"] == 0, w
    assert w["level"] == "warning" and "Desligue a tela" in w["text"], w
    assert tela_out["lookup"]["parsed"] == {"image": "notepad.exe", "title": "Sem título"}
    assert tela_out["lookup"]["noTask"] is None and tela_out["lookup"]["invalid"] is None and tela_out["lookup"]["throws"] is None


def test_refuse_rules(tela_out: dict) -> None:
    refuse = tela_out["refuse"]
    assert "Texto longo" in refuse["long"] and refuse["max"] is None
    assert "pid" in refuse["noPid"]  # teclado sem alvo conhecido é recusado
    assert "A tecla Windows" in refuse["win"] and refuse["winString"] is not None and refuse["winInText"] is not None
    assert "Ctrl+Esc" in refuse["ctrlEsc"]
    assert refuse["ctrlC"] is None and refuse["launchOk"] is None and refuse["launchPathOk"] is None
    assert "urls" in refuse["launchExtra"] and "additional_arguments" in refuse["launchExtra"]
    for key in ("launchPathBat", "launchNameColon", "launchShell", "launchUrlName"):
        assert refuse[key] is not None, key
    assert "terminal" in refuse["launchShell"]
    # leitura sem confirmação não grava arquivo (Argus 10: get_window_state aceita screenshot_out_file)
    assert "screenshot_out_file" in refuse["readOutFile"] and refuse["readOk"] is None


def test_allow_a_program_until_the_screen_is_turned_off(tela_out: dict) -> None:
    """Owner 2026-11-24: confirmar cada tecla cansava; libera por programa, terminal segue perguntando."""
    a = tela_out["allowProgram"]
    assert a["firstOptions"] == ["Sim", "Sim, e não perguntar de novo para o msedge.exe (até /tela desligar)", "Não"]
    assert a["selects"] == 3  # 1º clique no Edge, o Bloco de Notas e o Edge depois de desligar; a tecla no Edge não perguntou
    assert a["confirms"] == 2 and a["runs"] == 4  # o terminal pediu as duas confirmações de sempre; as 4 ações rodaram


def test_lookup_title_is_cut_to_80_and_empty_cells_are_kept(tela_out: dict) -> None:
    assert len(tela_out["longTitle"]["title"]) == 80 and tela_out["longTitle"]["image"] == "app.exe"
    assert tela_out["lookupEmptyCell"] == {"image": "app.exe", "title": ""}


def test_describe_appends_the_other_args(tela_out: dict) -> None:
    assert tela_out["extraArgs"].endswith('(\n{"extra":true})') or '{"extra":true}' in tela_out["extraArgs"]


def test_describe_shows_the_whole_text_and_the_target(tela_out: dict) -> None:
    d = tela_out["describe"]
    assert d["typed"].startswith("O agente pediu, depois de ler a tela:\n")
    assert "linha 1\nlinha 2" in d["typed"] and 'em notepad.exe ("Sem título")' in d["typed"]
    assert d["noTitle"].endswith("no ponto (1, 2) da janela em app.exe")  # título N/A não aparece
    assert "no processo 844" in d["pidOnly"] and d["hotkey"].endswith("Apertar o atalho ctrl+s")
    assert d["launch"].endswith("Abrir o programa calc")


def test_1_off_by_default(tela_out: dict) -> None:
    off = tela_out["off"]
    assert off["isError"] is True and "desligada" in off["text"], off
    assert off["runCalls"] == 0 and off["asked"] == 0 and off["isOn"] is False


def test_2_a_binary_that_does_not_match_is_refused_on_turn_on(tela_out: dict) -> None:
    on = tela_out["checkFailsOn"]
    assert on["spawned"] == 0 and on["isOn"] is False
    assert "não é a versão conferida" in on["text"], on


def test_2_once_on_execute_uses_the_copy_and_status_reports_the_change(tela_out: dict) -> None:
    ex = tela_out["checkFailsExec"]
    assert ex["isError"] is False and ex["runs"] == 1 and ex["execInSession"] is True, ex  # sem rehash no execute
    assert "não é a versão conferida" in ex["status"]


def test_3_unknown_actions_are_refused_even_when_on(tela_out: dict) -> None:
    unknown = tela_out["unknown"]
    for action in ("kill_app", "clipboard_read", "run_script"):
        result = unknown["results"][action]
        assert result["isError"] is True and "não está disponível" in result["text"], (action, result)
        assert result["asked"] == 0
    assert unknown["runCalls"] == 0


def test_4_pipe_is_random_and_the_state_file_is_written(tela_out: dict) -> None:
    pipes = tela_out["pipes"]
    assert pipes["before"] == "" and pipes["first"].startswith(PIPE_PREFIX) and pipes["second"].startswith(PIPE_PREFIX)
    uuid_part = pipes["first"][len(PIPE_PREFIX):]
    assert len(uuid_part) == 36 and all(ch in "0123456789abcdef-" for ch in uuid_part), uuid_part
    assert pipes["first"] != pipes["second"]
    assert pipes["statePipe"] is True and pipes["stateDaemonPid"] == pipes["childPid"] and pipes["stateDirInside"] is True


def test_5_a_dead_owner_is_swept_and_a_live_owner_is_kept(tela_out: dict) -> None:
    sweep = tela_out["sweep"]
    assert sweep["stopOld"] is True and sweep["oldFileGone"] is True and sweep["oldDirGone"] is True
    assert sweep["stopLive"] is False and sweep["liveFileKept"] is True and sweep["liveDirKept"] is True


def test_6_two_turn_ons_at_once_start_one_daemon(tela_out: dict) -> None:
    c = tela_out["concurrent"]
    assert c["spawns"] == 1 and c["isOn"] is True
    assert "Tela ligada" in c["first"] and "Tela desligada" in c["second"], c


def test_6_a_daemon_that_exits_during_start_leaves_the_screen_off(tela_out: dict) -> None:
    ex = tela_out["exitedBeforeProbe"]
    assert "Não consegui subir" in ex["text"] and ex["probes"] == 0 and ex["isOn"] is False and ex["killed"] == 1, ex


def test_6_the_exit_event_turns_the_screen_off(tela_out: dict) -> None:
    assert tela_out["exitEvent"] == {"wasOn": True, "isOn": False}


def test_6_a_daemon_that_never_answers_is_killed_and_reported(tela_out: dict) -> None:
    never = tela_out["neverAnswers"]
    assert never["probes"] == 25 and never["isOn"] is False and never["killed"] == 1, never
    assert "Não consegui subir" in never["text"]


def test_7_turn_off_stops_the_daemon_and_removes_the_session(tela_out: dict) -> None:
    off = tela_out["turnOff"]
    assert off["text"] == "Tela desligada." and off["isOn"] is False and off["pipeAfter"] == ""
    assert off["killed"] == 1 and off["stop"] is True and off["stateGone"] is True and off["sessionDirsLeft"] == 0


def test_7_closing_the_session_turns_the_screen_off(tela_out: dict) -> None:
    assert tela_out["shutdown"] == {"isOn": False, "killed": 1}


def test_8_a_read_is_marked_untrusted_and_its_capture_stays_in_the_session(tela_out: dict) -> None:
    r = tela_out["readResult"]
    assert r["isError"] is False and r["untrustedHead"] is True, r
    assert r["flag"] == "--screenshot-out-file" and r["shotInSession"] is True
    assert r["shotLeft"] is False and r["image"] == base64.b64encode(b"PNG-BYTES").decode()  # o que o fake escreveu
    assert r["imageType"] == "image/png"
    assert r["argvHead"][:4] == ["call", "--socket", r["argvHead"][2], "list_windows"] and r["argvHead"][2].startswith(PIPE_PREFIX)


def test_8_an_act_has_no_capture_flag_and_no_untrusted_head(tela_out: dict) -> None:
    a = tela_out["actResult"]
    assert a["untrusted"] is False and a["hasShotFlag"] is False and a["argvHead"][3] == "click"


def test_9_a_click_asks_with_the_target_and_a_refusal_runs_nothing(tela_out: dict) -> None:
    c = tela_out["confirm"]
    assert c["refusedIsError"] is True and "recusou" in c["refused"]
    assert c["runsAfterNo"] == 0 and c["title"] == "O agente quer agir na sua tela"
    assert 'em notepad.exe ("Sem título")' in c["body"] and "Clicar no ponto (1, 2)" in c["body"]


def test_9_b_an_accepted_click_runs_call_with_the_pipe(tela_out: dict) -> None:
    c = tela_out["confirm"]
    assert c["runsTotal"] == 1 and c["acceptedArgvHead"][:2] == ["call", "--socket"] and c["acceptedArgvHead"][2].startswith(PIPE_PREFIX)
    assert c["acceptedArgvHead"][3] == "click"


def test_10_typing_into_a_terminal_asks_twice(tela_out: dict) -> None:
    s = tela_out["shell"]
    assert s["bothYesRuns"] == 1 and s["bothYesAsked"] == 2 and "TERMINAL" in s["secondTitle"], s
    assert s["secondNoRuns"] == 0 and s["secondNoAsked"] == 2 and "recusou digitar no terminal" in s["secondNoText"]


def test_10_an_unknown_target_also_asks_twice(tela_out: dict) -> None:
    u = tela_out["unknownTarget"]
    assert u["runs"] == 1 and u["asked"] == 2 and "TERMINAL" in (u["title"] or ""), u


def test_11_what_never_passes_is_refused_without_asking(tela_out: dict) -> None:
    results = tela_out["refusedOn"]["results"]
    assert "Texto longo" in results["longText"]["text"] and "A tecla Windows" in results["winKey"]["text"] and "urls" in results["launchUrl"]["text"]
    for key, result in results.items():
        assert result["isError"] is True and result["asked"] == 0, (key, result)
    assert tela_out["refusedOn"]["runCalls"] == 0


def test_13_without_a_ui_an_action_is_refused(tela_out: dict) -> None:
    no_ui = tela_out["noUi"]
    assert no_ui["isError"] is True and "não há tela" in no_ui["text"] and no_ui["runCalls"] == 0


def test_14_the_tela_command_handles_missing_args_and_notifies(tela_out: dict) -> None:
    assert tela_out["cmdUndefined"]["count"] == 2 and tela_out["cmdUndefined"]["level"] == "info"
    assert tela_out["cmdOnOff"]["on"].startswith("Tela ligada")
    assert tela_out["cmdOnOff"]["onLevel"] == "info" and tela_out["cmdOnOff"]["off"] == "Tela desligada." and tela_out["cmdOnOff"]["offLevel"] == "info"
    assert tela_out["cmdNoDriver"]["level"] == "error" and tela_out["cmdNoDriver"]["text"].startswith("Tela: o cua-driver do Pink não está instalado")
    assert tela_out["cmdBadHash"]["level"] == "error" and "não é a versão conferida" in tela_out["cmdBadHash"]["text"]


REAL_SRC = r"""
const [telaUrl, root] = process.argv.slice(1);
const tela = await import(telaUrl);
const fs = await import("node:fs");
const path = await import("node:path");
const agent = path.join(root, "agent");
const env = { PINK_CODING_AGENT_DIR: agent }; // isolado: nunca toca a instalação do dono
const msg = await tela.install({ env });
const t = tela.createTela({ registerTool() {}, registerCommand() {}, on() {} }, { env, tmp: root });
const on = msg.includes("instalado") ? await t.turnOn() : "(sem instalação)";
const r = on.startsWith("Tela ligada") ? await t.execute("smoke", { action: "get_screen_size", args: {} }, undefined, undefined, { hasUI: false, ui: { confirm: async () => false } }) : { content: [{ text: "" }], isError: true };
const stopped = t.turnOff();
const leftovers = fs.readdirSync(root).filter((n) => n.startsWith("pink-tela-") || n.startsWith("cua-driver-baixando-"));
console.log(JSON.stringify({ msg, on: on.split("\n")[0], text: r.content[0].text, isError: r.isError, stopped, isOn: t.isOn(), leftovers }));
"""

OWNER_EXE = Path.home() / ".pink" / "agent" / "cua-driver" / "cua-driver.exe"


@pytest.mark.skipif(os.environ.get("PINK_TELA_REAL") != "1", reason="baixa 31 MB do GitHub; rode com PINK_TELA_REAL=1 (aprovado pelo dono)")
def test_15_real_install_turn_on_read_screen_size_turn_off(package_dir: Path) -> None:
    """Instala a versão fixa de verdade numa pasta temporária, liga, lê o tamanho da tela (só leitura) e desliga.
    Não toca na instalação do dono (~/.pink/agent/cua-driver), que só é comparada antes e depois."""
    root = Path(tempfile.mkdtemp(prefix="tela-real-"))
    owner_before = (OWNER_EXE.stat().st_size, OWNER_EXE.stat().st_mtime_ns) if OWNER_EXE.exists() else None
    result = _node(REAL_SRC, (package_dir / "extensions" / "pink-tela.ts").as_uri(), root, dict(os.environ), timeout=900)
    owner_after = (OWNER_EXE.stat().st_size, OWNER_EXE.stat().st_mtime_ns) if OWNER_EXE.exists() else None
    assert result["msg"].startswith("Tela: cua-driver 0.55.0 instalado em"), result["msg"]
    assert result["on"].startswith("Tela ligada"), result
    assert result["isError"] is False and re.search(r"\b(1440|2560|1080|1920|2160|3840)\b", result["text"]), result["text"]
    assert result["isOn"] is False and result["leftovers"] == [], result
    assert owner_before == owner_after  # a instalação do dono ficou intacta
    assert "Tela: " not in result["text"]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
