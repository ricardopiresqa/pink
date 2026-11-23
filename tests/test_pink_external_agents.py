# ruff: noqa: E501
"""Card 1dfwh7kgf8g - Claude Code instalado como subagente do Pink (extensions/pink-external-agents.ts).

Um driver de node importa o external.ts do pacote construído (examples/extensions/subagent/external.ts) e confere:
achar o claude no PATH, os argumentos do claude -p e a tradução do stream-json (formato real do claude 2.x) para as
mensagens do subagente. Também confere que os patches do subagente entraram no pacote. Não roda o claude de verdade.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path[:0] = [str(Path(__file__).resolve().parent)]

from test_f50 import built, package_dir  # noqa: E402, F401 - fixtures do pacote construido

DRIVER = r"""
const [url, root] = process.argv.slice(1);
const ext = await import(url);
const path = await import("node:path");
const out = {};
const bin = path.join(root, "bin");
const has = (file) => file === path.join(bin, "claude.exe");
out.found = ext.externalAgents({ PATH: ["C:\\nada", bin].join(path.delimiter) }, has, "win32").map((a) => ({ name: a.name, external: a.external, command: a.command === path.join(bin, "claude.exe"), source: a.source }));
out.missing = ext.externalAgents({ PATH: "C:\\nada" }, has, "win32");
out.cmdOnly = ext.externalAgents({ PATH: bin }, (file) => file.endsWith("claude.cmd"), "win32");
out.args = ext.externalInvocation({ command: "claude.exe" }, "-rm tudo").args;

const fresh = () => ({ messages: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 } });
let emits = 0;
const ok = fresh();
for (const event of [
  { type: "system", subtype: "hook_started" },
  { type: "system", subtype: "init", model: "claude-opus-5-5", session_id: "s1" },
  { type: "assistant", message: { content: [{ type: "text", text: "Vou ler." }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }], usage: { input_tokens: 9 } } },
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "x" }] } },
  { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } },
  { type: "rate_limit_event" },
  { type: "result", subtype: "success", is_error: false, num_turns: 2, result: "ok", usage: { input_tokens: 2, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 4 }, total_cost_usd: 0.3 },
]) ext.applyExternalEvent(event, ok, () => emits++);
out.ok = { model: ok.model, stop: ok.stopReason, usage: ok.usage, count: ok.messages.length, parts: ok.messages.map((m) => m.content.map((p) => p.type === "text" ? `text:${p.text}` : `tool:${p.name}:${p.arguments.file_path}`)), emits };

const differs = fresh();
ext.applyExternalEvent({ type: "assistant", message: { content: [{ type: "tool_use", id: "t", name: "Bash", input: { command: "ls" } }] } }, differs, () => {});
ext.applyExternalEvent({ type: "result", is_error: false, num_turns: 1, result: "Resposta final", usage: {} }, differs, () => {});
out.finalAdded = differs.messages.at(-1).content[0];

const bad = fresh();
ext.applyExternalEvent({ type: "result", subtype: "success", is_error: true, num_turns: 0, result: "Invalid API key · Please run /login", usage: {} }, bad, () => {});
out.bad = { stop: bad.stopReason, error: bad.errorMessage, count: bad.messages.length };
const broke = fresh();
ext.applyExternalEvent({ type: "result", subtype: "error_max_turns", is_error: true, usage: {} }, broke, () => {});
out.broke = broke.errorMessage;
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def ext(package_dir: Path, tmp_path_factory: pytest.TempPathFactory) -> dict:
    url = (package_dir / "examples" / "extensions" / "subagent" / "external.ts").as_uri()
    done = subprocess.run(["node", "--input-type=module", "-e", DRIVER, url, str(tmp_path_factory.mktemp("ext"))], capture_output=True, text=True, encoding="utf-8", timeout=120, check=False)
    assert done.returncode == 0, done.stderr[-2000:]
    return json.loads(done.stdout.strip().splitlines()[-1])


def test_claude_is_offered_only_when_the_native_binary_is_on_path(ext: dict) -> None:
    assert ext["found"] == [{"name": "claude", "external": "claude", "command": True, "source": "builtin"}]
    assert ext["missing"] == [] and ext["cmdOnly"] == []  # sem claude.exe (só o .cmd do npm) não oferece


def test_the_task_goes_after_double_dash_so_it_never_becomes_an_option(ext: dict) -> None:
    assert ext["args"] == ["-p", "--output-format", "stream-json", "--verbose", "--", "-rm tudo"]


def test_stream_json_becomes_subagent_messages_with_tools_usage_and_the_final_answer(ext: dict) -> None:
    ok = ext["ok"]
    assert ok["model"] == "claude-opus-5-5" and ok["stop"] == "stop"
    assert ok["parts"] == [["text:Vou ler.", "tool:Read:a.ts"], ["text:ok"]]  # "ok" do result não se repete
    assert ok["usage"] == {"input": 12, "output": 4, "cacheRead": 100, "cacheWrite": 0, "cost": 0, "contextTokens": 0, "turns": 2}  # custo 0: plano, não cobrança
    assert ok["emits"] == 3
    assert ext["finalAdded"] == {"type": "text", "text": "Resposta final"}  # só ferramenta na tela: o result vira a resposta


def test_errors_say_what_to_do(ext: dict) -> None:
    assert ext["bad"]["stop"] == "error" and ext["bad"]["count"] == 0
    assert ext["bad"]["error"].startswith("Invalid API key") and "faça login" in ext["bad"]["error"]
    assert ext["broke"] == "error_max_turns"


def test_the_subagent_patches_are_in_the_package(package_dir: Path) -> None:
    sub = package_dir / "examples" / "extensions" / "subagent"
    agents, index = (sub / "agents.ts").read_text(encoding="utf-8"), (sub / "index.ts").read_text(encoding="utf-8")
    assert 'import { externalAgents } from "./external.ts"' in agents and "for (const agent of externalAgents())" in agents
    assert "externalInvocation(agent as any, task) : getPiInvocation(args)" in index and "applyExternalEvent(event, currentResult, emitUpdate)" in index
