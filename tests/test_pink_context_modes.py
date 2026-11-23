# ruff: noqa: E501
"""Card 1dfwh7kfzfg - /context, modos de permissão (alt+m, /modo) e confirmação no modo "pergunta tudo"
(extensions/pink-context.ts, pink-ui.ts e pink-permissions.ts), do pacote construido.

Três drivers em node (ESM, sem rede e sem modelo). Cada caso de modo e de permissão reimporta o pink-ui com um
query novo (módulo novo, PINK novo) e limpa os globals ao fim do caso. Diretório de agente temporário, nunca ~/.pink.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "tests")]

from test_f50 import built, cli, package_dir  # noqa: E402, F401 - fixtures do pacote construido e instalado

KEEP = ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432")

CONTEXT_DRIVER = r"""
const [ctxUrl] = process.argv.slice(1);
const cx = await import(ctxUrl);
const out = {};
const msg = (id, text) => ({ type: "message", id, message: { content: text } });
out.estimate = [cx.estimate("abcd"), cx.estimate("abcde"), cx.estimate(undefined)];
out.content = {
  str: cx.estimateContent("abcdefgh"),
  parts: cx.estimateContent([{ type: "text", text: "abcd" }, { type: "thinking", thinking: "abcdefgh" }]),
  image: cx.estimateContent([{ type: "image", data: "x".repeat(100000) }]),
  imagePlusText: cx.estimateContent([{ type: "image", data: "abc" }, { type: "text", text: "abcd" }]),
};
out.conv = {
  none: cx.conversationEstimate([msg("a", "abcd"), { type: "model_change", id: "m" }, msg("b", "abcdefgh")]),
  compacted: cx.conversationEstimate([msg("a", "x".repeat(400)), msg("b", "x".repeat(40)), { type: "compaction", id: "c", summary: "x".repeat(80), firstKeptEntryId: "b" }, msg("c", "x".repeat(8))]),
  missingId: cx.conversationEstimate([msg("a", "x".repeat(400)), msg("b", "x".repeat(40)), { type: "compaction", id: "c", summary: "x".repeat(80), firstKeptEntryId: "zzz" }, msg("c", "x".repeat(8))]),
  lastWins: cx.conversationEstimate([msg("a", "x".repeat(400)), { type: "compaction", id: "c1", summary: "x".repeat(40), firstKeptEntryId: "a" }, msg("b", "x".repeat(40)), { type: "compaction", id: "c2", summary: "x".repeat(80), firstKeptEntryId: "zzz" }, msg("c", "x".repeat(8))]),
};
const base = { system: "s".repeat(400), contextFiles: [{ path: "AGENTS.md", content: "a".repeat(80) }], sections: { pink_memory: "m".repeat(40) }, skills: [{ name: "loop", description: "d".repeat(12) }], tools: [{ name: "read", description: "r", parameters: {} }] };
const sum = (b) => b.parts.reduce((s, p) => s + p.tokens, 0);
const unmeasured = cx.breakdown({ ...base, conversationEstimate: 0 });
out.unmeasured = { labels: unmeasured.parts.map((p) => p.label), tokens: unmeasured.parts.map((p) => p.tokens), used: unmeasured.used, sum: sum(unmeasured), measured: unmeasured.measured, free: unmeasured.free, window: unmeasured.window };
const measured = cx.breakdown({ ...base, usageTokens: 500, window: 1000 });
out.measured = { used: measured.used, sum: sum(measured), free: measured.free, window: measured.window, measured: measured.measured, conv: measured.parts[5].tokens };
const clamp = cx.breakdown({ ...base, usageTokens: 5 });
out.clamp = { used: clamp.used, sum: sum(clamp), conv: clamp.parts[5].tokens };
out.render = cx.render(measured);
out.renderUnknown = cx.render(cx.breakdown({ ...base, conversationEstimate: 0 }));
const cmds = {};
const pi = { registerCommand: (n, o) => { cmds[n] = o; }, getActiveTools: () => ["read"], getAllTools: () => [{ name: "read", description: "lê", parameters: {} }, { name: "bash", description: "roda", parameters: {} }] };
cx.default(pi);
const notes = [];
const ctx = { getSystemPrompt: () => "s".repeat(400), getSystemPromptOptions: () => ({ contextFiles: [{ path: "AGENTS.md", content: "a".repeat(80) }] }), getContextUsage: () => ({ tokens: 500, contextWindow: 1000, percent: 50 }), sessionManager: { getBranch: () => [msg("a", "x".repeat(8))] }, ui: { notify: (t, l) => notes.push({ t, l }) } };
await cmds.context.handler("", ctx);
out.command = { names: Object.keys(cmds), desc: cmds.context.description, text: notes[0].t, level: notes[0].l, expectedRead: cx.estimate(JSON.stringify({ name: "read", description: "lê", parameters: {} })) };
const subCmds = [];
process.env.PINK_SUBAGENT = "1";
cx.default({ registerCommand: (n) => subCmds.push(n), getActiveTools: () => [], getAllTools: () => [] });
delete process.env.PINK_SUBAGENT;
out.subagent = subCmds;
console.log(JSON.stringify(out));
"""

MODES_DRIVER = r"""
const [uiUrl] = process.argv.slice(1);
const ui = await import(uiUrl);
const out = {};
const cmds = {}, shortcuts = {}, notes = [];
const pi = { registerCommand: (n, o) => { cmds[n] = o; }, registerShortcut: (k, o) => { shortcuts[k] = o; }, on: () => {}, getAllTools: () => [], getActiveTools: () => [] };
ui.default(pi);
const ctx = { hasUI: true, mode: "print", cwd: process.cwd(), ui: { notify: (t, l) => notes.push({ t, l }) } };
const theme = { fg: (_c, t) => t };
const { PINK } = ui;
const mirror = () => globalThis.__pinkPermissionMode;
out.defaults = { perm: PINK.permission, agent: PINK.agent, mirror: mirror() };
out.modes = Object.keys(ui.MODES);
ui.setMode(ctx, "ask");
const seq = [ui.currentMode()];
for (let i = 0; i < 3; i++) { shortcuts["alt+m"].handler(ctx); seq.push(ui.currentMode()); }
out.cycle = seq;
out.nextMode = [ui.nextMode("ask"), ui.nextMode("edits"), ui.nextMode("plan")];
ui.setMode(ctx, "plan");
out.plan = { agent: PINK.agent, current: ui.currentMode(), mirror: mirror() };
ui.setMode(ctx, "ask");
out.askAfterPlan = { agent: PINK.agent, perm: PINK.permission, current: ui.currentMode(), mirror: mirror() };
ui.setMode(ctx, "edits");
out.edits = { mirror: mirror(), saved: globalThis.__pinkPermissionSaved };
ui.setMode(ctx, "nada");
out.unknownSetMode = { perm: PINK.permission, agent: PINK.agent };
await cmds.modo.handler("perguntar", ctx);
out.modo1 = ui.currentMode();
await cmds.modo.handler("", ctx);
out.modo2 = ui.currentMode();
await cmds.modo.handler("plano", ctx);
out.modo3 = ui.currentMode();
notes.length = 0;
await cmds.modo.handler("xyz", ctx);
out.modoBad = { mode: ui.currentMode(), warn: notes.at(-1) ?? null };
await cmds.modo.handler("", ctx);
out.modo4 = ui.currentMode();
out.modoDesc = cmds.modo.description;
out.label = ui.modelLabel({ theme, model: { name: "m", id: "m" }, thinking: "off", agent: "build", permission: "ask" });
out.labelEdits = ui.modelLabel({ theme, model: { name: "m", id: "m" }, thinking: "off", agent: "build", permission: "edits" });
out.labelExternal = ui.modelLabel({ theme, model: { name: "m", id: "m" }, thinking: "off", agent: "build", external: { name: "opencode", model: "opencode/deepseek" } });
out.labelExternalDefault = ui.modelLabel({ theme, model: { name: "m", id: "m" }, thinking: "off", agent: "build", external: { name: "claude" } });
globalThis.__pinkExternalAgent = { name: "codex", model: "gpt-6-sol" };
out.labelGlobal = ui.modelLabel({ theme, model: { name: "m", id: "m" }, thinking: "off", agent: "build" });
globalThis.__pinkExternalAgent = undefined;
out.labelBack = ui.modelLabel({ theme, model: { name: "m", id: "m" }, thinking: "off", agent: "build" });
out.hints = ui.hintsLine({ theme, width: 200 });
out.shortcuts = Object.keys(shortcuts);
out.altDesc = shortcuts["alt+m"].description;
ui.setMode(ctx, "edits");
await cmds.plan.handler("", ctx);
out.tabPlan = PINK.agent;
await cmds.build.handler("", ctx);
out.tabBuild = PINK.agent;
ui.setMode(ctx, "ask");
const fresh = await import(uiUrl + "?fresh=ask");
out.freshAsk = fresh.PINK.permission;
delete globalThis.__pinkPermissionSaved;
const fresh2 = await import(uiUrl + "?fresh=none");
out.freshNone = fresh2.PINK.permission;
delete globalThis.__pinkPermissionSaved;
delete globalThis.__pinkPermissionMode;
out.leftover = { saved: typeof globalThis.__pinkPermissionSaved, mirror: typeof globalThis.__pinkPermissionMode };
console.log(JSON.stringify(out));
"""

PERMISSIONS_DRIVER = r"""
const [pmUrl, uiUrl, base] = process.argv.slice(1);
const fs = await import("node:fs");
const path = await import("node:path");
const pm = await import(pmUrl);
const out = {};
const workDir = path.join(base, "work");
const agentDir = path.join(base, "agent");
fs.mkdirSync(workDir, { recursive: true });
fs.mkdirSync(agentDir, { recursive: true });
const env = { PINK_CODING_AGENT_DIR: agentDir };
const TOOLS = [
  { name: "read" }, { name: "grep" },
  { name: "lookup", annotations: { readOnlyHint: true } },
  { name: "mcp__x__y", annotations: { readOnlyHint: true } },
  { name: "write" }, { name: "bash" },
];
const piTools = { getAllTools: () => TOOLS };
out.readsOnly = {
  read: pm.readsOnly(piTools, "read"),
  grep: pm.readsOnly(piTools, "grep"),
  lookup: pm.readsOnly(piTools, "lookup"),
  mcp: pm.readsOnly(piTools, "mcp__x__y"),
  write: pm.readsOnly(piTools, "write"),
};
async function scenario(name, { hasUI = true, mode = "ask", rules = {}, answers = [], calls }) {
  const mod = await import(uiUrl + "?case=" + name);
  mod.setMode({ ui: { notify() {} } }, mode);
  fs.writeFileSync(path.join(agentDir, "permissions.json"), JSON.stringify(rules));
  const pi = { handlers: {}, on: (event, handler) => { pi.handlers[event] = handler; }, getAllTools: () => TOOLS, registerCommand: () => {} };
  pm.permissions(pi, { env });
  const queue = [...answers];
  const selects = [];
  const ctx = { cwd: workDir, hasUI, mode: "print", isProjectTrusted: () => false, ui: { notify() {}, select: async (title, options) => { selects.push({ title, options }); return queue.shift(); } } };
  const results = [];
  for (const [toolName, input] of calls) {
    const r = await pi.handlers.tool_call({ toolName, input }, ctx);
    results.push(r === undefined ? "allow" : r.block ? r.reason : "???");
  }
  delete globalThis.__pinkPermissionSaved;
  delete globalThis.__pinkPermissionMode;
  return { results, selects: selects.length, titles: selects.map((s) => s.title), options: selects[0]?.options ?? null };
}
out.askReads = await scenario("askReads", { calls: [["read", { path: "a.md" }], ["grep", { path: "a.md" }], ["lookup", {}], ["mcp__x__y", {}]], answers: ["Permitir uma vez"] });
out.askWrites = await scenario("askWrites", { calls: [["write", { path: "notes.md" }]], answers: ["Negar"] });
out.askSession = await scenario("askSession", { calls: [["write", { path: "a.md" }], ["write", { path: "a.md" }], ["write", { path: "b.md" }]], answers: ["Permitir nesta sessão", "Permitir uma vez"] });
out.askDeny = await scenario("askDeny", { rules: { deny: ["write(blocked.md)"] }, calls: [["write", { path: "blocked.md" }]], answers: [] });
out.askNoUI = await scenario("askNoUI", { hasUI: false, calls: [["write", { path: "notes.md" }]], answers: [] });
out.editsUnchanged = await scenario("editsUnchanged", { mode: "edits", rules: { ask: ["bash(npm publish*)"] }, calls: [["write", { path: "notes.md" }], ["bash", { command: "echo hi" }], ["bash", { command: "npm publish" }], ["write", { path: ".env" }]], answers: ["Negar"] });
console.log(JSON.stringify(out));
"""


def _env(home: Path) -> dict:
    env = {k: v for k, v in os.environ.items() if k.upper() in KEEP}
    env.update(HOME=str(home), USERPROFILE=str(home), PINK_CODING_AGENT_DIR=str(home / "agent"))
    return env


def _node(driver: str, args: list[str], home: Path) -> dict:
    proc = subprocess.run(["node", "--input-type=module", "-e", driver, *args], capture_output=True, text=True, encoding="utf-8", env=_env(home), timeout=180)
    assert proc.returncode == 0, proc.stderr[-2000:]
    return json.loads(proc.stdout.strip().splitlines()[-1])


@pytest.fixture(scope="module")
def ctx_out(package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    home = tmp_path_factory.mktemp("ctx-home")
    return _node(CONTEXT_DRIVER, [(package_dir / "extensions" / "pink-context.ts").as_uri()], home)


@pytest.fixture(scope="module")
def modes_out(package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    home = tmp_path_factory.mktemp("modes-home")
    return _node(MODES_DRIVER, [(package_dir / "extensions" / "pink-ui.ts").as_uri()], home)


@pytest.fixture(scope="module")
def perm_out(package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    home = tmp_path_factory.mktemp("perm-home")
    urls = [(package_dir / "extensions" / name).as_uri() for name in ("pink-permissions.ts", "pink-ui.ts")]
    return _node(PERMISSIONS_DRIVER, [*urls, str(home / "base")], home)


# ================================================================================================ pink-context.ts
def test_estimate_is_characters_over_four_rounded_up(ctx_out: dict) -> None:
    assert ctx_out["estimate"] == [1, 2, 0]


def test_estimate_content_counts_text_thinking_and_a_fixed_1200_for_images(ctx_out: dict) -> None:
    c = ctx_out["content"]
    assert c["str"] == 2 and c["parts"] == 3  # 'abcd' = 1, thinking 'abcdefgh' = 2
    assert c["image"] == 1200  # imagem conta fixo, nao o base64
    assert c["imagePlusText"] == 1201


def test_conversation_without_compaction_counts_every_message_only(ctx_out: dict) -> None:
    assert ctx_out["conv"]["none"] == 3  # 1 + 2; a entrada model_change nao conta


def test_conversation_after_compaction_is_summary_plus_kept_messages(ctx_out: dict) -> None:
    assert ctx_out["conv"]["compacted"] == 32  # resumo 20 + mensagem b 10 (firstKeptEntryId) + c 2; a antes de b sai


def test_conversation_with_a_missing_kept_id_starts_after_the_compaction(ctx_out: dict) -> None:
    assert ctx_out["conv"]["missingId"] == 22  # so o resumo (20) + c (2)


def test_the_last_compaction_is_the_one_that_counts(ctx_out: dict) -> None:
    assert ctx_out["conv"]["lastWins"] == 22  # o primeiro resumo (40 chars) nao entra


def test_breakdown_without_measurement_sums_to_the_used_total(ctx_out: dict) -> None:
    u = ctx_out["unmeasured"]
    assert u["labels"] == ["Prompt de sistema", "Ferramentas", "AGENTS.md e instruções", "Memória do projeto", "Skills (lista)", "Conversa"]
    assert u["tokens"][2:5] == [20, 10, 15]  # AGENTS 80 chars, memoria 40, skill (4+ 12 chars + 10)
    assert u["tokens"][0] == 55  # 100 - 20 - 10 - 15: o prompt nao conta o que ja saiu em outra parte
    assert u["measured"] is False and u.get("free") is None and u["window"] == 0  # free nao existe sem janela (undefined no JSON)
    assert u["sum"] == u["used"]


def test_breakdown_with_a_measured_total_uses_the_usage_and_the_window(ctx_out: dict) -> None:
    m = ctx_out["measured"]
    assert m["measured"] is True and m["used"] == 500 and m["window"] == 1000
    assert m["free"] == 500 and m["sum"] == 500 and m["conv"] > 0


def test_breakdown_never_goes_negative_when_usage_is_below_the_fixed_part(ctx_out: dict) -> None:
    c = ctx_out["clamp"]
    assert c["conv"] == 0 and c["sum"] == c["used"] and c["used"] > 5  # o total nao cai abaixo do que e fixo


def test_render_shows_used_over_window_and_the_free_row(ctx_out: dict) -> None:
    lines = ctx_out["render"].splitlines()
    assert lines[0] == "Contexto: 500 de 1.0k tokens (50.0%)"
    assert any(line.startswith("Espaço livre") and "50.0%" in line for line in lines)
    assert lines[-1] == "Total medido na última resposta; as partes são estimadas."


def test_render_without_window_or_measurement_says_so(ctx_out: dict) -> None:
    lines = ctx_out["renderUnknown"].splitlines()
    assert lines[0].endswith("(janela do modelo desconhecida)")
    assert not any(line.startswith("Espaço livre") for line in lines)
    assert lines[-1] == "Sem medição ainda (sessão nova ou recém-compactada): tudo estimado."


def test_context_command_is_registered_and_reports_with_only_active_tools(ctx_out: dict) -> None:
    c = ctx_out["command"]
    assert c["names"] == ["context"] and c["desc"].startswith("Mostra o que ocupa o contexto")
    assert c["level"] == "info" and c["text"].startswith("Contexto: 500 de 1.0k tokens (50.0%)")
    row = re.search(r"^Ferramentas\s+(\d+)\s", c["text"], re.M)
    assert row and int(row.group(1)) == c["expectedRead"]  # so 'read' esta ativa; 'bash' nao entra


def test_subagent_registers_nothing(ctx_out: dict) -> None:
    assert ctx_out["subagent"] == []  # PINK_SUBAGENT: o filho nao ganha o /context


# ================================================================================================ pink-ui.ts modos
def test_default_mode_is_edits_for_build(modes_out: dict) -> None:
    d = modes_out["defaults"]
    assert d["perm"] == "edits" and d["agent"] == "build" and d["mirror"] == "edits"
    assert modes_out["modes"] == ["ask", "edits", "plan"]


def test_alt_m_cycles_ask_then_edits_then_plan_then_ask(modes_out: dict) -> None:
    assert modes_out["cycle"] == ["ask", "edits", "plan", "ask"]
    assert modes_out["nextMode"] == ["edits", "plan", "ask"]


def test_set_mode_plan_sets_the_plan_agent_and_the_mirror(modes_out: dict) -> None:
    p = modes_out["plan"]
    assert p["agent"] == "plan" and p["current"] == "plan" and p["mirror"] == "plan"


def test_set_mode_other_modes_go_back_to_build_with_the_permission(modes_out: dict) -> None:
    assert modes_out["askAfterPlan"] == {"agent": "build", "perm": "ask", "current": "ask", "mirror": "ask"}
    assert modes_out["edits"]["mirror"] == "edits" and modes_out["edits"]["saved"] == "edits"


def test_an_unknown_mode_changes_nothing(modes_out: dict) -> None:
    assert modes_out["unknownSetMode"] == {"perm": "edits", "agent": "build"}


def test_modo_command_takes_names_cycles_on_no_argument_and_warns_on_unknown(modes_out: dict) -> None:
    assert modes_out["modo1"] == "ask"  # /modo perguntar
    assert modes_out["modo2"] == "edits"  # sem nome: ask -> edits
    assert modes_out["modo3"] == "plan"  # /modo plano
    assert modes_out["modoBad"]["mode"] == "plan"  # nome desconhecido nao muda nada
    assert modes_out["modoBad"]["warn"] == {"t": "Use /modo perguntar, /modo editar ou /modo plano", "l": "warning"}
    assert modes_out["modo4"] == "ask"  # sem nome: plan -> ask
    assert "alt+m" in modes_out["modoDesc"]


def test_model_label_says_pergunta_tudo_only_in_ask_mode(modes_out: dict) -> None:
    assert "Build (pergunta tudo)" in modes_out["label"]
    assert "pergunta tudo" not in modes_out["labelEdits"]


def test_model_label_shows_the_external_agent_while_agente_is_on(modes_out: dict) -> None:  # card 1dfwh7kgfjr
    strip = lambda s: __import__("re").sub(r"\x1b\[[0-9;]*m", "", s)  # noqa: E731
    assert strip(modes_out["labelExternal"]) == "Build · opencode · opencode/deepseek"  # o Build fica, o modelo do Pink sai
    assert strip(modes_out["labelExternalDefault"]) == "Build · claude · modelo padrão"
    assert strip(modes_out["labelGlobal"]) == "Build · codex · gpt-6-sol"  # o /agente liga pelo globalThis
    assert "Build" in strip(modes_out["labelBack"]) and "codex" not in strip(modes_out["labelBack"])


def test_hints_line_mentions_alt_m_and_the_only_shortcut_is_alt_m(modes_out: dict) -> None:
    assert "alt+m modo" in modes_out["hints"]
    assert modes_out["shortcuts"] == ["alt+m"]  # nenhuma tecla nova em shift+tab
    assert modes_out["altDesc"].startswith("Troca o modo de permissão")


def test_the_agent_commands_switch_plan_and_build_like_tab(modes_out: dict) -> None:
    # o tab em caixa vazia chama o mesmo switchAgent; o toque real no tab nao roda aqui (depende da TUI)
    assert modes_out["tabPlan"] == "plan" and modes_out["tabBuild"] == "build"


def test_a_fresh_import_with_the_saved_ask_starts_in_ask(modes_out: dict) -> None:
    assert modes_out["freshAsk"] == "ask" and modes_out["freshNone"] == "edits"


def test_the_modes_run_leaves_no_global_behind(modes_out: dict) -> None:
    assert modes_out["leftover"] == {"saved": "undefined", "mirror": "undefined"}


# ================================================================================================ pink-permissions.ts
def test_readsonly_is_true_for_read_tools_and_not_for_mcp_even_with_the_hint(perm_out: dict) -> None:
    r = perm_out["readsOnly"]
    assert r["read"] is True and r["grep"] is True and r["lookup"] is True  # ferramenta do Pink com readOnlyHint
    assert r["mcp"] is False  # MCP com readOnlyHint nao vale: servidor hostil se diria so leitura
    assert r["write"] is False


def test_ask_mode_lets_read_only_tools_through_and_confirms_mcp(perm_out: dict) -> None:
    s = perm_out["askReads"]
    assert s["results"] == ["allow"] * 4  # read, grep, readOnlyHint de ferramenta comum, e o mcp so pergunta:
    assert s["selects"] == 1 and s["titles"][0].startswith("Confirmar mcp__x__y: modo pergunta tudo")


def test_ask_mode_confirms_a_write_and_a_no_is_a_block(perm_out: dict) -> None:
    s = perm_out["askWrites"]
    assert s["results"] == ["A pessoa negou esta ação"] and s["selects"] == 1
    assert s["options"] == ["Permitir uma vez", "Permitir nesta sessão", "Negar"]


def test_permitir_nesta_sessao_skips_the_question_for_the_same_action(perm_out: dict) -> None:
    s = perm_out["askSession"]
    assert s["results"] == ["allow", "allow", "allow"]
    assert s["selects"] == 2  # a.md pergunta uma vez; a segunda vez nao; b.md pergunta de novo
    assert "Permitir nesta sessão" in s["options"]


def test_deny_still_blocks_in_ask_mode_without_asking(perm_out: dict) -> None:
    s = perm_out["askDeny"]
    assert s["results"] == ["Bloqueado pelas permissões do Pink: regra deny write(blocked.md)"] and s["selects"] == 0


def test_ask_mode_without_a_screen_blocks_with_a_reason(perm_out: dict) -> None:
    s = perm_out["askNoUI"]
    assert s["results"][0].startswith("Precisa de confirmação e não há tela para pedir") and s["selects"] == 0


def test_edits_mode_is_unchanged(perm_out: dict) -> None:
    s = perm_out["editsUnchanged"]
    # write comum livre; echo livre; regra ask do usuario confirma (negada); .env continua protegido
    assert s["results"][0] == "allow" and s["results"][1] == "allow"
    assert s["results"][2] == "A pessoa negou esta ação"
    assert s["results"][3].startswith("Bloqueado pelas permissões do Pink: arquivo protegido do Pink")
    assert s["selects"] == 1
