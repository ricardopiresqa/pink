# ruff: noqa: E501
"""Card 1dfwh7kfzxt - erros do servidor de linguagem depois de editar (extensions/pink-lsp.ts), do pacote construido.

Driver node (ESM). Enriquecimento, enquadramento, cliente contra um servidor falso (spawnFn injetado, com modo de
publicação e modo de diagnóstico por pedido), pool com lista de servidores por linguagem, e registro da extensão. O
teste real usa o `tsc --lsp --stdio` (TypeScript 7, instalado globalmente) e o pyright-langserver; pula se o binário
não estiver no PATH. Sem modelo, sem rede; diretórios temporários, nunca ~/.pink.
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

KEEP = ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432")

UNIT_DRIVER = r"""
const [lspUrl] = process.argv.slice(1);
const lsp = await import(lspUrl);
const path = await import("node:path");
const { EventEmitter } = await import("node:events");
const out = {};
// o cliente usa timers unref (em produção o pipe do servidor mantém o processo vivo); aqui o filho é falso
const keepAlive = setInterval(() => {}, 1000);
const ROOT = path.resolve("proj");

// ---- 1. enriquecimento do resultado (createLsp com make/read/stat falsos)
async function go(opt, event = {}) {
  const calls = { make: 0, check: 0, read: 0, files: [] };
  const make = () => {
    calls.make++;
    return { check: async (file, text) => { calls.check++; calls.files.push([file, text]); return opt.checkResult; }, isDead: () => false, wasReady: () => true, close() {} };
  };
  const deps = {
    make,
    read: () => { calls.read++; if (opt.readThrows) throw new Error("boom"); return opt.readText ?? "const x = 1;"; },
    stat: () => ({ size: opt.size ?? 10 }),
  };
  const { onResult } = lsp.createLsp(deps);
  const e = { toolName: "write", input: { path: "src/a.ts" }, content: [{ type: "text", text: "Successfully wrote" }], ...event };
  const r = await onResult(e, { cwd: ROOT, isProjectTrusted: () => opt.trusted ?? true });
  return { text: r ? r.content.at(-1).text : null, parts: r ? r.content.length : null, first: r ? r.content[0].text : null, sc: r ? (r.structuredContent ?? null) : null, calls };
}
const d = (message, severity, range) => ({ message, ...(severity === undefined ? {} : { severity }), ...(range === undefined ? {} : { range }) });
const at = (line, character) => ({ start: { line, character } });

const basic = await go({ checkResult: [
  d("Tipo errado", 1, at(0, 4)),
  d("aviso", 2, at(1, 0)),
  d("sem\n  severidade", undefined, at(2, 0)),
  d("info", 3, at(3, 0)),
  d("sem faixa", undefined),
] });
out.basic = { text: basic.text, parts: basic.parts, first: basic.first, checks: basic.calls.check };
const edit = await go({ checkResult: [d("erro", 1, at(0, 0))] }, { toolName: "edit", input: { file_path: "src/a.ts" } });
out.edit = edit.text;
const cap = await go({ checkResult: Array.from({ length: 13 }, (_, i) => d(`e${i}`, 1, at(i, 0))) });
out.cap = cap.text.split("\n");
out.structured = (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { structuredContent: { a: 1 } })).sc;
out.structuredNone = (await go({ checkResult: [d("erro", 1, at(0, 0))] })).sc;
out.none = {
  isError: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { isError: true })).text,
  isErrorChecks: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { isError: true })).calls.check,
  bash: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { toolName: "bash", input: { command: "ls" } })).text,
  read: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { toolName: "read", input: { path: "src/a.ts" } })).text,
  untrusted: (await go({ checkResult: [d("erro", 1, at(0, 0))], trusted: false })).text,
  untrustedMake: (await go({ checkResult: [d("erro", 1, at(0, 0))], trusted: false })).calls.make,
  outsideRel: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { input: { path: "../../fora.ts" } })).text,
  outsideAbs: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { input: { path: path.resolve(ROOT, "..", "fora.ts") } })).text,
  parentFile: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { input: { path: "../x.ts" } })).text,
  unknownExt: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { input: { path: "notas.md" } })).text,
  unknownMake: (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { input: { path: "notas.md" } })).calls.make,
  overMb: (await go({ checkResult: [d("erro", 1, at(0, 0))], size: 1024 * 1024 + 1 })).text,
  overMbChecks: (await go({ checkResult: [d("erro", 1, at(0, 0))], size: 1024 * 1024 + 1 })).calls.check,
  exactlyMb: (await go({ checkResult: [d("erro", 1, at(0, 0))], size: 1024 * 1024 })).text !== null,
  zeroErrors: (await go({ checkResult: [d("aviso", 2, at(0, 0))] })).text,
  zeroErrorsChecks: (await go({ checkResult: [d("aviso", 2, at(0, 0))] })).calls.check,
  checkUndefined: (await go({ checkResult: undefined })).text,
  readThrows: (await go({ checkResult: [d("erro", 1, at(0, 0))], readThrows: true })).text,
};
out.dotFile = (await go({ checkResult: [d("erro", 1, at(0, 0))] }, { input: { path: "..foo.ts" } })).text;

// ---- 2. enquadramento
const { encode, createDecoder, normUri } = lsp;
const a = { jsonrpc: "2.0", id: 1, result: "é ok" };
const b = { jsonrpc: "2.0", method: "x", params: { n: 2 } };
const enc = encode(a);
const headerEnd = enc.indexOf("\r\n\r\n") + 4;
out.frame = { header: enc.subarray(0, headerEnd).toString("ascii"), bodyBytes: enc.length - headerEnd, bodyMatches: enc.length - headerEnd === Buffer.byteLength(JSON.stringify(a), "utf8") };
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
{
  const got = [];
  const ok = createDecoder((m) => got.push(m))(Buffer.concat([encode(a), encode(b)]));
  out.twoInOneChunk = { ok, count: got.length, equal: same(got, [a, b]) };
}
{
  const got = [];
  const dec = createDecoder((m) => got.push(m));
  for (const byte of Buffer.concat([encode(a), encode(b)])) dec(Buffer.from([byte]));
  out.splitChunks = { count: got.length, equal: same(got, [a, b]) };
}
{
  const got = [];
  const dec = createDecoder((m) => got.push(m));
  const cut = Math.floor(encode(a).length / 2);
  const bytes = Buffer.concat([encode(a), encode(b)]);
  dec(bytes.subarray(0, cut));
  dec(bytes.subarray(cut));
  out.midSplit = { equal: same(got, [a, b]) };
}
{
  const got = [];
  const dec = createDecoder((m) => got.push(m));
  dec(Buffer.from("X-Foo: 1\r\n\r\n"));
  dec(encode(a));
  out.badHeader = { equal: same(got, [a]) };
}
{
  const got = [];
  const dec = createDecoder((m) => got.push(m));
  const ok = dec(Buffer.from("Content-Length: 5\r\n\r\n{bad}"));
  dec(encode(b));
  out.badJson = { ok, equal: same(got, [b]) };
}
out.partialHeader = createDecoder(() => {})(Buffer.from("Content-Length: 12\r\n"));
out.oversizedHeader = createDecoder(() => {})(Buffer.from("Content-Length: 33554433\r\n\r\n"));
out.oversizedBuffer = createDecoder(() => {})(Buffer.alloc(32 * 1024 * 1024 + 1));
out.norm = {
  winSameAsSent: normUri("file:///c%3A/Proj/a.ts", "win32") === normUri("file:///C:/Proj/a.ts", "win32"),
  winBackslash: normUri("C:\\Proj\\a.ts", "win32"),
  linuxKeepsCase: normUri("file:///C:/Proj/a.ts", "linux") === "file:///C:/Proj/a.ts",
};

// ---- 3. cliente contra um servidor falso
// modo: good (publica no didSave) | stale (publica uma versão anterior antes) | slow | error | initerr | throw | exit
//       | pull (diagnostico por pedido, sem publicar) | pullslow (pedido demora 300 ms) | pullerr (pedido falha; publica)
const spawned = [];
const taskkills = [];
const children = [];
let mode = "good";
function makeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.killed = 0;
  child.ended = false;
  child.sent = [];
  child.docVersion = new Map();
  child.docText = new Map();
  child.stdout = new EventEmitter();
  let acc = Buffer.alloc(0);
  const reply = (msg) => {
    const body = Buffer.from(JSON.stringify(msg), "utf8");
    child.stdout.emit("data", Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]));
  };
  const diag = (message) => [{ range: { start: { line: 0, character: 0 } }, severity: 1, message }];
  const pullMode = mode.startsWith("pull");
  const onMessage = (msg) => {
    if (msg.method === "initialize") {
      if (mode === "slow") return;
      setImmediate(() => {
        if (mode === "initerr") return reply({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "falhou" } });
        reply({ jsonrpc: "2.0", id: msg.id, result: { capabilities: pullMode ? { diagnosticProvider: { interFileDependencies: false } } : {} } });
        reply({ jsonrpc: "2.0", id: 90, method: "workspace/configuration", params: { items: [{ section: "a" }, { section: "b" }] } });
        if (mode === "exit") setImmediate(() => child.emit("exit", 1));
      });
    }
    if (msg.method === "textDocument/didOpen" || msg.method === "textDocument/didChange") {
      child.docVersion.set(msg.params.textDocument.uri, msg.params.textDocument.version);
      // didOpen traz o texto em textDocument.text; didChange em contentChanges
      child.docText.set(msg.params.textDocument.uri, String(msg.params.textDocument.text ?? msg.params.contentChanges?.[0]?.text ?? ""));
    }
    if (msg.method === "textDocument/diagnostic") {
      const uri = msg.params.textDocument.uri;
      setTimeout(() => {
        if (mode === "pullerr") return reply({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "x" } });
        const text = child.docText.get(uri) ?? "";
        reply({ jsonrpc: "2.0", id: msg.id, result: { kind: "full", items: text.includes("BAD") ? diag("erro") : [] } });
      }, mode === "pullslow" ? 300 : 0);
    }
    if (msg.method === "textDocument/didSave" && (!pullMode || mode === "pullerr")) {
      const uri = msg.params.textDocument.uri;
      const version = child.docVersion.get(uri);
      const text = String(msg.params.text ?? "");
      setImmediate(() => {
        if (mode === "stale") reply({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri, version: version - 1, diagnostics: diag("STALE") } });
        reply({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri, version, diagnostics: text.includes("BAD") ? diag("erro") : [] } });
      });
    }
  };
  let buffer = Buffer.alloc(0);
  child.stdin = {
    write(buf) {
      if (mode === "throw") throw new Error("EPIPE");
      buffer = Buffer.concat([buffer, Buffer.from(buf)]);
      for (;;) {
        const end = buffer.indexOf("\r\n\r\n");
        if (end < 0) break;
        const len = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, end).toString("ascii"))[1]);
        if (buffer.length < end + 4 + len) break;
        const msg = JSON.parse(buffer.subarray(end + 4, end + 4 + len).toString("utf8"));
        buffer = buffer.subarray(end + 4 + len);
        child.sent.push(msg);
        onMessage(msg);
      }
      return true;
    },
    end() { child.ended = true; },
    on() {},
  };
  child.kill = () => { child.killed++; };
  if (mode === "error") setImmediate(() => child.emit("error", new Error("spawn ENOENT")));
  children.push(child);
  return child;
}
const spawnFn = (command, args, opts) => {
  spawned.push({ command, args, shell: opts?.shell ?? false, env: opts?.env?.NoDefaultCurrentDirectoryInExePath ?? null });
  if (command === "taskkill") {
    taskkills.push(args);
    return { on() { return this; } };
  }
  return makeChild();
};
// o cliente recebe um servidor já escolhido da lista (tsc --lsp --stdio é o primeiro)
const srv = { id: "typescript", languageId: lsp.SERVERS[0].languageId, command: "tsc", args: ["--lsp", "--stdio"] };
const file = path.resolve("proj", "src", "a.ts");
const methodsOf = (c) => c.sent.map((m) => m.method).filter(Boolean);

mode = "good";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  const r1 = await client.check(file, "BAD");
  const r2 = await client.check(file, "fine");
  const c = children.at(-1);
  out.good = {
    r1: r1?.map((x) => x.message) ?? null,
    r2: r2 ?? null,
    methods: methodsOf(c),
    versions: c.sent.filter((m) => m.method === "textDocument/didOpen" || m.method === "textDocument/didChange").map((m) => [m.method, m.params.textDocument.version]),
    languageId: c.sent.find((m) => m.method === "textDocument/didOpen")?.params.textDocument.languageId ?? null,
    configReply: c.sent.find((m) => m.id === 90) ?? null,
    spawn: spawned.at(-1),
    wasReady: client.wasReady(),
  };
  client.close();
}
mode = "stale";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  const r1 = await client.check(file, "ok");
  const r2 = await client.check(file, "BAD");
  out.stale = { r1: r1 ?? null, r2: r2?.map((x) => x.message) ?? null };
  client.close();
}
mode = "pull";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  const r1 = await client.check(file, "BAD");
  const r2 = await client.check(file, "fine");
  const c = children.at(-1);
  out.pull = { r1: r1?.map((x) => x.message) ?? null, r2: r2 ?? null, methods: methodsOf(c) };
  client.close();
}
mode = "pullslow";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  await client.check(file, "ok", { budget: 4000 });
  const [a1, a2] = await Promise.all([
    client.check(file, "BAD", { budget: 4000 }),
    new Promise((resolve) => setTimeout(resolve, 50)).then(() => client.check(file, "fine", { budget: 4000 })),
  ]);
  out.pullVersion = { older: a1 ?? null, newer: a2 ?? null };
  client.close();
}
mode = "pullerr";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  const r = await client.check(file, "BAD", { budget: 4000 });
  out.pullFallback = r?.map((x) => x.message) ?? null;
  client.close();
}
mode = "slow";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  let t0 = Date.now();
  const first = await client.check(file, "x", { budget: 300 });
  const firstMs = Date.now() - t0;
  t0 = Date.now();
  const second = await client.check(file, "x", { budget: 300 });
  out.slow = { first: first ?? null, firstMs, second: second ?? null, secondMs: Date.now() - t0, wasReady: client.wasReady() };
  client.close();
}
{
  // sem orçamento explícito, a primeira edição espera 12 s pelo servidor a frio
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  const t0 = Date.now();
  const r = await client.check(file, "x");
  out.slowDefault = { r: r ?? null, ms: Date.now() - t0 };
  client.close();
}
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100);
  const t0 = Date.now();
  const r = await client.check(file, "x", { budget: 5000, signal: controller.signal });
  out.aborted = { r: r ?? null, ms: Date.now() - t0 };
  client.close();
}
mode = "error";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  let threw = false;
  let r;
  try { r = await client.check(file, "x", { budget: 300 }); } catch { threw = true; }
  await new Promise((resolve) => setImmediate(resolve));
  out.absent = { threw, r: r ?? null, dead: client.isDead() };
}
mode = "initerr";
{
  const before = children.length;
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  const r = await client.check(file, "x", { budget: 1000 });
  out.initErr = { r: r ?? null, dead: client.isDead(), killed: children[before].killed, wasReady: client.wasReady() };
}
mode = "throw";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  let threw = false;
  let r;
  try { r = await client.check(file, "x", { budget: 300 }); } catch { threw = true; }
  out.writeThrows = { threw, r: r ?? null, dead: client.isDead() };
}
mode = "exit";
{
  const before = children.length;
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  let threw = false;
  let r;
  const t0 = Date.now();
  try { r = await client.check(file, "x", { budget: 500 }); } catch { threw = true; }
  out.exitMid = { threw, r: r ?? null, dead: client.isDead(), ms: Date.now() - t0, killed: children[before].killed };
}
mode = "good";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  await client.check(file, "BAD");
  const c = children.at(-1);
  client.close();
  const methods = methodsOf(c);
  out.closeLinux = { methods, shutdownIdx: methods.indexOf("shutdown"), exitIdx: methods.indexOf("exit"), ended: c.ended, killed: c.killed, taskkill: taskkills.length, dead: client.isDead() };
}
{
  const before = taskkills.length;
  const client = lsp.createClient({ ...srv }, ROOT, { spawnFn, platform: "win32" });
  await client.check(file, "BAD");
  const c = children.at(-1);
  const spawnRec = spawned.at(-1);
  client.close();
  out.closeWin = { command: spawnRec.command, args: spawnRec.args, shell: spawnRec.shell, env: spawnRec.env, taskkill: taskkills.slice(before), killed: c.killed, ended: c.ended };
}
// LRU: o 21o arquivo aberto manda didClose do mais antigo
mode = "good";
{
  const client = lsp.createClient(srv, ROOT, { spawnFn, platform: "linux" });
  for (let i = 0; i < 21; i++) await client.check(path.resolve("proj", "src", `f${i}.ts`), "fine", { budget: 4000 });
  const c = children.at(-1);
  const closed = c.sent.filter((m) => m.method === "textDocument/didClose").map((m) => m.params.textDocument.uri);
  out.lru = { closed: closed.length, first: closed[0] ?? null, expected: path.resolve("proj", "src", "f0.ts") };
  client.close();
}

// ---- 4. pool e lista de servidores por linguagem
{
  let clock = 1000000;
  const made = [];
  // cliente falso: por padrao iniciou (wasReady true) e responde []
  const fake = (server, root) => {
    const c = { id: server.id, command: server.command, root, closed: 0, dead: false, ready: true, isDead() { return this.dead; }, wasReady() { return this.ready; }, check: async () => [], close() { this.closed++; } };
    made.push(c);
    return c;
  };
  const { onResult, closeAll, clients } = lsp.createLsp({ make: fake, read: () => "x", stat: () => ({ size: 1 }), now: () => clock });
  const ev = (p) => ({ toolName: "write", input: { path: p }, content: [] });
  const ctx = (cwd) => ({ cwd, isProjectTrusted: () => true });
  await onResult(ev("a.ts"), ctx("/proj"));
  await onResult(ev("b.ts"), ctx("/proj"));
  const afterReuse = made.length;
  await onResult(ev("c.ts"), ctx("/PROJ"));
  const afterCase = made.length;
  await onResult(ev("x.py"), ctx("/proj"));
  await onResult(ev("a.ts"), ctx("/other"));
  const beforeDead = made.length;
  made[0].dead = true;
  await onResult(ev("a.ts"), ctx("/proj"));
  const deadNoRetry = made.length;
  clock += 61000;
  await onResult(ev("a.ts"), ctx("/proj"));
  const afterRetry = made.length;
  closeAll();
  out.pool = { afterReuse, afterCase, beforeDead, deadNoRetry, afterRetry, closed: made.map((c) => c.closed), size: clients.size, servers: made.map((c) => c.id) };
}
{
  // o primeiro da lista sai sem iniciar: o proximo assume na mesma edicao
  let clock = 1000000;
  const made = [];
  const make = (server) => {
    const first = server.command === "tsc";
    const c = { command: server.command, dead: false, ready: false, isDead() { return this.dead; }, wasReady() { return this.ready; }, check: async () => { if (first) { c.dead = true; return undefined; } return [{ message: "tipo", severity: 1, range: { start: { line: 0, character: 6 } } }]; }, close() {} };
    made.push(c);
    return c;
  };
  const { onResult } = lsp.createLsp({ make, read: () => "x", stat: () => ({ size: 1 }), now: () => clock });
  const ev = { toolName: "write", input: { path: "a.ts" }, content: [] };
  const ctx = { cwd: "/proj", isProjectTrusted: () => true };
  const r = await onResult(ev, ctx);
  out.fallback = { commands: made.map((c) => c.command), text: r?.content.at(-1).text ?? null };
}
{
  // os dois falham sem iniciar: a partir da segunda edicao nada e tentado por 60 s, depois volta do primeiro
  let clock = 1000000;
  const made = [];
  const make = (server) => {
    const c = { command: server.command, dead: false, ready: false, isDead() { return this.dead; }, wasReady() { return this.ready; }, check: async () => { c.dead = true; return undefined; }, close() {} };
    made.push(c);
    return c;
  };
  const { onResult } = lsp.createLsp({ make, read: () => "x", stat: () => ({ size: 1 }), now: () => clock });
  const ev = { toolName: "write", input: { path: "a.ts" }, content: [] };
  const ctx = { cwd: "/proj", isProjectTrusted: () => true };
  await onResult(ev, ctx);
  await onResult(ev, ctx);
  const afterBoth = made.length;
  const retryTooSoon = await onResult(ev, ctx);
  clock += 61000;
  await onResult(ev, ctx);
  out.bothFail = { afterBoth, retryTooSoon: retryTooSoon ?? null, afterRetry: made.length, lastTwo: made.slice(-2).map((c) => c.command) };
}
{
  // ja iniciou e depois morreu: nada de lista, espera 60 s
  let clock = 1000000;
  const made = [];
  const make = (server) => {
    const c = { command: server.command, dead: false, ready: true, isDead() { return this.dead; }, wasReady() { return this.ready; }, check: async () => [{ message: "x", severity: 1, range: { start: { line: 0, character: 0 } } }], close() {} };
    made.push(c);
    return c;
  };
  const { onResult } = lsp.createLsp({ make, read: () => "x", stat: () => ({ size: 1 }), now: () => clock });
  const ev = { toolName: "write", input: { path: "a.ts" }, content: [] };
  const ctx = { cwd: "/proj", isProjectTrusted: () => true };
  await onResult(ev, ctx);
  made[0].dead = true;
  await onResult(ev, ctx);
  const afterDeath = made.length;
  clock += 61000;
  await onResult(ev, ctx);
  out.diedReady = { afterDeath, afterRetry: made.length, commands: made.map((c) => c.command) };
}

// ---- 5. registro: PINK_SUBAGENT e PINK_NO_LSP=1 nao registram nada
{
  const regs = [];
  const pi = { on: (event) => regs.push(event) };
  process.env.PINK_SUBAGENT = "1";
  lsp.default(pi);
  delete process.env.PINK_SUBAGENT;
  process.env.PINK_NO_LSP = "1";
  lsp.default(pi);
  delete process.env.PINK_NO_LSP;
  out.noReg = regs.length;
  lsp.default(pi);
  out.reg = regs;
}
clearInterval(keepAlive);
console.log(JSON.stringify(out));
"""

REAL_DRIVER = r"""
const [lspUrl, dir] = process.argv.slice(1);
const lsp = await import(lspUrl);
const { onResult, closeAll } = lsp.createLsp();
const ctx = { cwd: dir, isProjectTrusted: () => true };
const ev = (p) => ({ toolName: "write", input: { path: p }, content: [{ type: "text", text: "ok" }] });
const t0 = Date.now();
const rTs = await onResult(ev("bad.ts"), ctx);
const tsMs = Date.now() - t0;
const t1 = Date.now();
const rPy = await onResult(ev("bad.py"), ctx);
const pyMs = Date.now() - t1;
closeAll();
console.log(JSON.stringify({ ts: rTs ? rTs.content.at(-1).text : null, py: rPy ? rPy.content.at(-1).text : null, tsMs, pyMs }));
"""


def _env(home: Path) -> dict:
    env = {k: v for k, v in os.environ.items() if k.upper() in KEEP}
    env.update(HOME=str(home), USERPROFILE=str(home), PINK_CODING_AGENT_DIR=str(home / "agent"))
    return env


def _node(driver: str, args: list[str], home: Path, timeout: int = 240) -> dict:
    proc = subprocess.run(["node", "--input-type=module", "-e", driver, *args], capture_output=True, text=True, encoding="utf-8", env=_env(home), timeout=timeout)
    assert proc.returncode == 0, proc.stderr[-2000:]
    return json.loads(proc.stdout.strip().splitlines()[-1])


@pytest.fixture(scope="module")
def lsp_out(package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    home = tmp_path_factory.mktemp("lsp-home")
    return _node(UNIT_DRIVER, [(package_dir / "extensions" / "pink-lsp.ts").as_uri()], home, timeout=400)


# ================================================================================================ 1. enriquecimento
def test_errors_are_appended_as_path_line_column_with_severity_1_or_missing_only(lsp_out: dict) -> None:
    b = lsp_out["basic"]
    assert b["text"].splitlines() == [
        "Erros do servidor de linguagem depois desta mudança (3):",
        "  src/a.ts:1:5 Tipo errado",
        "  src/a.ts:3:1 sem severidade",
        "  src/a.ts:1:1 sem faixa",
    ]  # aviso (2) e info (3) ficam de fora; posição 1-based; quebra de linha da mensagem vira espaço
    assert b["parts"] == 2 and b["first"] == "Successfully wrote"  # o conteúdo original fica, a nota é um item a mais
    assert b["checks"] == 1


def test_edit_with_file_path_is_enriched_too(lsp_out: dict) -> None:
    assert lsp_out["edit"] and "src/a.ts:1:1 erro" in lsp_out["edit"]


def test_structured_content_of_the_result_is_carried_over(lsp_out: dict) -> None:
    assert lsp_out["structured"] == {"a": 1} and lsp_out["structuredNone"] is None


def test_at_most_ten_errors_then_the_count_of_the_rest(lsp_out: dict) -> None:
    lines = lsp_out["cap"]
    assert lines[0] == "Erros do servidor de linguagem depois desta mudança (13):"
    assert len([line for line in lines if line.startswith("  src/a.ts:")]) == 10
    assert lines[-1] == "  … mais 3"


@pytest.mark.parametrize("key", ["isError", "bash", "read", "untrusted", "outsideRel", "outsideAbs", "parentFile", "unknownExt", "overMb", "zeroErrors", "checkUndefined", "readThrows"])
def test_nothing_is_appended_for_the_listed_cases(lsp_out: dict, key: str) -> None:
    assert lsp_out["none"][key] is None


def test_a_file_named_with_two_dots_inside_the_project_is_accepted(lsp_out: dict) -> None:
    assert lsp_out["dotFile"] and "..foo.ts:1:1 erro" in lsp_out["dotFile"]  # "../x.ts" sai; "..foo.ts" fica


def test_an_error_result_or_another_tool_never_calls_the_check(lsp_out: dict) -> None:
    n = lsp_out["none"]
    assert n["isErrorChecks"] == 0 and n["overMbChecks"] == 0 and n["zeroErrorsChecks"] == 1  # zero erros: o check roda, a nota nao sai
    assert n["untrustedMake"] == 0 and n["unknownMake"] == 0  # sem pasta confiavel ou extensao sem servidor, nem cliente


def test_a_file_of_exactly_one_megabyte_is_still_checked(lsp_out: dict) -> None:
    assert lsp_out["none"]["exactlyMb"] is True


# ================================================================================================ 2. enquadramento
def test_encode_writes_a_content_length_in_bytes_and_the_body(lsp_out: dict) -> None:
    f = lsp_out["frame"]
    assert f["header"].startswith("Content-Length: ") and f["header"].endswith("\r\n\r\n")
    assert f["bodyMatches"] is True  # "é" conta dois bytes no UTF-8


def test_two_messages_in_one_chunk_come_out_in_order(lsp_out: dict) -> None:
    assert lsp_out["twoInOneChunk"] == {"ok": True, "count": 2, "equal": True}


def test_split_chunks_byte_by_byte_round_trip(lsp_out: dict) -> None:
    assert lsp_out["splitChunks"] == {"count": 2, "equal": True}
    assert lsp_out["midSplit"] == {"equal": True}


def test_a_bad_header_is_skipped_and_the_next_message_arrives(lsp_out: dict) -> None:
    assert lsp_out["badHeader"] == {"equal": True}


def test_invalid_json_is_ignored_without_breaking_the_stream(lsp_out: dict) -> None:
    assert lsp_out["badJson"] == {"ok": True, "equal": True}


def test_an_oversized_message_or_buffer_returns_false(lsp_out: dict) -> None:
    assert lsp_out["partialHeader"] is True  # cabecalho incompleto espera mais bytes
    assert lsp_out["oversizedHeader"] is False and lsp_out["oversizedBuffer"] is False


def test_uri_matching_is_case_and_encoding_insensitive_on_windows(lsp_out: dict) -> None:
    n = lsp_out["norm"]
    assert n["winSameAsSent"] is True  # o servidor manda file:///c%3A/... e o cliente enviou file:///C:/...
    assert n["winBackslash"] == "c:/proj/a.ts" and n["linuxKeepsCase"] is True


# ================================================================================================ 3. cliente com servidor falso
def test_the_client_answers_initialize_and_the_configuration_request(lsp_out: dict) -> None:
    g = lsp_out["good"]
    assert g["methods"][:3] == ["initialize", "initialized", "textDocument/didOpen"]
    assert g["configReply"] == {"jsonrpc": "2.0", "id": 90, "result": [None, None]}  # workspace/configuration responde vazio
    assert g["languageId"] == "typescript" and g["wasReady"] is True


def test_diagnostics_come_back_and_the_first_check_opens_and_the_next_changes(lsp_out: dict) -> None:
    g = lsp_out["good"]
    assert g["r1"] == ["erro"] and g["r2"] == []  # publicado pelo servidor; segunda rodada limpa
    assert [v for m, v in g["versions"] if m == "textDocument/didOpen"] == [1]
    changes = [v for m, v in g["versions"] if m == "textDocument/didChange"]
    assert changes and changes[0] == 2 and changes == sorted(changes) and len(set(changes)) == len(changes)  # versao cresce
    assert g["spawn"]["command"] == "tsc" and g["spawn"]["args"] == ["--lsp", "--stdio"] and not g["spawn"]["shell"]


def test_pull_diagnostics_come_from_the_request_when_the_server_offers_them(lsp_out: dict) -> None:
    p = lsp_out["pull"]
    assert p["r1"] == ["erro"] and p["r2"] == []  # resposta do textDocument/diagnostic
    assert "textDocument/diagnostic" in p["methods"]


def test_a_pull_answer_for_an_older_version_is_dropped(lsp_out: dict) -> None:
    v = lsp_out["pullVersion"]
    assert v["older"] is None and v["newer"] == []  # a edicao antiga saiu depois de outra mais nova


def test_a_pull_error_falls_back_to_the_published_diagnostics(lsp_out: dict) -> None:
    assert lsp_out["pullFallback"] == ["erro"]  # o pedido falhou; o servidor publicou, e a publicacao entra


def test_a_publish_from_an_older_version_is_ignored(lsp_out: dict) -> None:
    s = lsp_out["stale"]
    assert s["r1"] == [] and s["r2"] == ["erro"]  # o "STALE" da versao anterior nunca entra


def test_a_slow_server_gives_undefined_and_later_checks_do_not_wait_again(lsp_out: dict) -> None:
    s = lsp_out["slow"]
    assert s["first"] is None and s["firstMs"] < 2000
    assert s["second"] is None and s["secondMs"] < 300  # so a primeira espera a inicializacao
    assert s["wasReady"] is False


def test_the_first_check_waits_twelve_seconds_for_a_cold_server_by_default(lsp_out: dict) -> None:
    s = lsp_out["slowDefault"]
    assert s["r"] is None and 11000 <= s["ms"] <= 14000  # FIRST_BUDGET_MS


def test_an_abort_signal_returns_early(lsp_out: dict) -> None:
    assert lsp_out["aborted"]["r"] is None and lsp_out["aborted"]["ms"] < 2000


def test_an_absent_server_gives_undefined_without_throwing(lsp_out: dict) -> None:
    assert lsp_out["absent"] == {"threw": False, "r": None, "dead": True}


def test_a_failed_initialize_kills_the_client(lsp_out: dict) -> None:
    assert lsp_out["initErr"] == {"r": None, "dead": True, "killed": 1, "wasReady": False}


def test_a_write_that_throws_gives_undefined_without_throwing(lsp_out: dict) -> None:
    assert lsp_out["writeThrows"] == {"threw": False, "r": None, "dead": True}


def test_an_exit_mid_session_gives_undefined_and_sends_no_kill(lsp_out: dict) -> None:
    e = lsp_out["exitMid"]
    assert e["threw"] is False and e["r"] is None and e["dead"] is True and e["ms"] < 3000 and e["killed"] == 0


def test_close_sends_shutdown_then_exit_ends_stdin_and_kills_on_linux(lsp_out: dict) -> None:
    c = lsp_out["closeLinux"]
    assert c["shutdownIdx"] >= 0 and c["exitIdx"] > c["shutdownIdx"]
    assert c["ended"] is True and c["killed"] == 1 and c["taskkill"] == 0 and c["dead"] is True


def test_close_runs_taskkill_tree_on_windows_with_one_command_string(lsp_out: dict) -> None:
    w = lsp_out["closeWin"]
    assert w["command"] == "tsc --lsp --stdio" and w["args"] == []  # uma string, shell
    assert w["shell"] is True and w["env"] == "1"  # sem procurar o .cmd na pasta do projeto
    assert w["taskkill"] == [["/pid", "4242", "/T", "/F"]] and w["killed"] == 0 and w["ended"] is True


def test_the_twenty_first_open_file_sends_didclose_for_the_oldest(lsp_out: dict) -> None:
    lru = lsp_out["lru"]
    assert lru["closed"] == 1 and lru["first"] == Path(lru["expected"]).as_uri()  # didClose leva a URI


# ================================================================================================ 4. pool e lista de servidores
def test_one_client_per_server_and_root_is_reused_and_closed_at_the_end(lsp_out: dict) -> None:
    p = lsp_out["pool"]
    assert p["afterReuse"] == 1  # dois arquivos ts na mesma raiz: um cliente
    assert p["afterCase"] == 1  # caixa diferente da raiz: mesma chave
    assert p["beforeDead"] == 3  # ts /proj, python /proj, ts /other


def test_a_dead_client_that_was_ready_waits_sixty_seconds_before_a_new_one(lsp_out: dict) -> None:
    p = lsp_out["pool"]
    assert p["deadNoRetry"] == 3  # morto: nada novo antes de 60 s
    assert p["afterRetry"] == 4  # depois de 60 s, recria
    assert p["closed"] == [0, 1, 1, 1] and p["size"] == 0  # o morto saiu sem close; os vivos fecharam no closeAll


def test_a_candidate_that_never_starts_hands_over_to_the_next_in_the_same_edit(lsp_out: dict) -> None:
    f = lsp_out["fallback"]
    assert f["commands"] == ["tsc", "typescript-language-server"]
    assert f["text"] and "a.ts:1:7 tipo" in f["text"]


def test_when_the_last_candidate_fails_nothing_is_tried_for_sixty_seconds(lsp_out: dict) -> None:
    b = lsp_out["bothFail"]
    assert b["afterBoth"] == 2 and b["retryTooSoon"] is None  # tsc e o segundo falharam; nada novo antes de 60 s
    assert b["afterRetry"] == 4 and b["lastTwo"] == ["tsc", "typescript-language-server"]  # depois, a mesma edicao tenta a lista de novo


def test_a_client_that_was_ready_and_then_died_sets_the_sixty_second_wait(lsp_out: dict) -> None:
    d = lsp_out["diedReady"]
    assert d["afterDeath"] == 1 and d["afterRetry"] == 2  # sem lista: o proximo so depois de 60 s


# ================================================================================================ 5. registro
def test_subagent_and_pink_no_lsp_register_nothing(lsp_out: dict) -> None:
    assert lsp_out["noReg"] == 0


def test_the_default_export_registers_tool_result_and_shutdown(lsp_out: dict) -> None:
    assert lsp_out["reg"] == ["tool_result", "session_shutdown"]


# ================================================================================================ real: servidores instalados
requires_ts = pytest.mark.skipif(shutil.which("tsc") is None, reason="tsc (TypeScript 7, com --lsp) nao instalado")
requires_py = pytest.mark.skipif(shutil.which("pyright-langserver") is None, reason="pyright-langserver nao instalado")


@pytest.fixture(scope="module")
def real_out(package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict | None:
    if shutil.which("tsc") is None and shutil.which("pyright-langserver") is None:
        return None
    home = tmp_path_factory.mktemp("lsp-real-home")
    project = tmp_path_factory.mktemp("lsp-project")
    (project / "bad.ts").write_text("const n: number = \"x\";\n", encoding="utf-8")
    (project / "bad.py").write_text("x: int = \"a\"\n", encoding="utf-8")
    return _node(REAL_DRIVER, [(package_dir / "extensions" / "pink-lsp.ts").as_uri(), str(project)], home, timeout=300)


@requires_ts
def test_real_typescript_server_reports_the_type_error(real_out: dict | None) -> None:
    assert real_out is not None
    assert real_out["ts"] and "bad.ts:1:7" in real_out["ts"] and "not assignable" in real_out["ts"]  # tsc --lsp (pull)


@requires_py
def test_real_pyright_server_reports_the_error(real_out: dict | None) -> None:
    assert real_out is not None
    assert real_out["py"] and "bad.py:1:" in real_out["py"]
