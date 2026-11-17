"""tools/importar_claude.py: sessão do Claude Code vira sessão v3 do Pink (card 1dfwh7kfq92).

JSONL sintético, sem dados reais: cadeia por parentUuid, um bloco por linha mesclado pelo message.id, ferramenta com
resultado, resumo de compactação cujo pai não existe no arquivo, subagente (isSidechain) e recado interno (isMeta) fora.
Tudo grava numa pasta temporária (--destino), nunca em ~/.pink.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("importar_claude", ROOT / "tools" / "importar_claude.py")
imp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(imp)

CWD = "C:\\Projetos\\sintetico"


def stamp(second: int) -> str:
    return f"2026-10-17T10:00:{second:02d}.000Z"


def synthetic() -> list[dict]:
    return [
        {"type": "user", "uuid": "u1", "parentUuid": None, "timestamp": stamp(1), "cwd": CWD,
         "message": {"role": "user", "content": "Oi <system-reminder>lixo interno</system-reminder>"}},
        # só raciocínio: não vira mensagem no Pink
        {"type": "assistant", "uuid": "a1", "parentUuid": "u1", "timestamp": stamp(2),
         "message": {"id": "m1", "role": "assistant", "model": "claude-x", "content": [{"type": "thinking", "thinking": "..."}]}},
        {"type": "assistant", "uuid": "a2", "parentUuid": "a1", "timestamp": stamp(3),
         "message": {"id": "m1", "role": "assistant", "model": "claude-x", "content": [{"type": "text", "text": "Vou ler."}]}},
        {"type": "assistant", "uuid": "a3", "parentUuid": "a2", "timestamp": stamp(4),
         "message": {"id": "m1", "role": "assistant", "model": "claude-x",
                     "content": [{"type": "tool_use", "id": "t1", "name": "Read", "input": {"file_path": "x"}}]}},
        {"type": "user", "uuid": "u2", "parentUuid": "a3", "timestamp": stamp(5),
         "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "conteudo", "is_error": False}]}},
        {"type": "assistant", "uuid": "a4", "parentUuid": "u2", "timestamp": stamp(6),
         "message": {"id": "m2", "role": "assistant", "model": "claude-x", "content": [{"type": "text", "text": "Pronto."}]}},
        # subagente: fora da conversa principal
        {"type": "user", "uuid": "s1", "parentUuid": "a4", "isSidechain": True, "timestamp": stamp(7),
         "message": {"role": "user", "content": "texto do subagente"}},
        # recado interno: some na saída
        {"type": "user", "uuid": "mt", "parentUuid": "a4", "isMeta": True, "timestamp": stamp(8),
         "message": {"role": "user", "content": "recado interno"}},
        # compactação: o pai lógico não está no arquivo
        {"type": "user", "uuid": "c1", "parentUuid": None, "logicalParentUuid": "ausente", "isCompactSummary": True,
         "timestamp": stamp(9), "message": {"role": "user", "content": "Resumo da conversa."}},
        {"type": "user", "uuid": "u3", "parentUuid": "c1", "timestamp": stamp(10),
         "message": {"role": "user", "content": "Continua"}},
    ]


def write_jsonl(path: Path, entries: list[dict], broken_line: bool = False) -> Path:
    lines = [json.dumps(e, ensure_ascii=False) for e in entries]
    if broken_line:
        lines.insert(3, '{"type": "user", "uuid": "cortad')  # linha cortada no meio, como numa sessão ainda aberta
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def convert_file(tmp_path: Path, entries: list[dict], broken_line: bool = False) -> tuple[dict, list[dict]]:
    src = write_jsonl(tmp_path / "origem.jsonl", entries, broken_line)
    dest = tmp_path / "destino"
    assert imp.main([str(src), "--destino", str(dest)]) == 0
    folder = dest / "--C--Projetos-sintetico--"
    (target,) = folder.glob("*.jsonl")
    rows = [json.loads(line) for line in target.read_text(encoding="utf-8").splitlines()]
    return rows[0], rows[1:]


def test_the_folder_name_follows_the_pink_session_folder_rule() -> None:
    assert imp.session_dir(Path("/x"), CWD) == Path("/x") / "--C--Projetos-sintetico--"


def test_the_conversation_keeps_order_merges_blocks_and_drops_thinking_subagents_and_meta(tmp_path: Path) -> None:
    header, body = convert_file(tmp_path, synthetic())
    assert header["type"] == "session" and header["version"] == 3 and header["cwd"] == CWD

    kinds = [(e["type"], e["message"]["role"] if e["type"] == "message" else e["type"]) for e in body]
    assert kinds == [("message", "user"), ("message", "assistant"), ("message", "toolResult"),
                     ("message", "assistant"), ("compaction", "compaction"), ("message", "user")]

    texts = json.dumps(body, ensure_ascii=False)
    assert "lixo interno" not in texts and "texto do subagente" not in texts and "recado interno" not in texts
    assert "thinking" not in texts

    ids = [e["id"] for e in body]
    assert [e["parentId"] for e in body] == [None, *ids[:-1]]  # cada entrada aponta para a anterior


def test_blocks_of_one_response_become_one_message_and_the_tool_result_keeps_its_name(tmp_path: Path) -> None:
    _, body = convert_file(tmp_path, synthetic())
    assistant = body[1]["message"]
    assert [b["type"] for b in assistant["content"]] == ["text", "toolCall"]
    assert assistant["content"][1] == {"type": "toolCall", "id": "t1", "name": "Read", "arguments": {"file_path": "x"}}
    assert assistant["stopReason"] == "toolUse" and assistant["responseId"] == "m1"

    result = body[2]["message"]
    assert result["toolCallId"] == "t1" and result["toolName"] == "Read"
    assert result["content"] == [{"type": "text", "text": "conteudo"}] and result["isError"] is False
    assert body[1]["message"]["content"][0]["text"] == "Vou ler."


def test_the_user_text_loses_the_system_reminder(tmp_path: Path) -> None:
    _, body = convert_file(tmp_path, synthetic())
    assert body[0]["message"]["content"] == [{"type": "text", "text": "Oi"}]


def test_the_compaction_summary_becomes_the_cut_point_for_the_next_kept_message(tmp_path: Path) -> None:
    _, body = convert_file(tmp_path, synthetic())
    compaction = body[4]
    assert compaction["summary"] == "Resumo da conversa."
    assert body[5]["message"]["content"] == [{"type": "text", "text": "Continua"}]
    assert compaction["firstKeptEntryId"] == body[5]["id"]


def test_a_cut_line_in_the_middle_of_the_file_is_skipped(tmp_path: Path) -> None:
    _, body = convert_file(tmp_path, synthetic(), broken_line=True)
    assert len(body) == 6


def test_a_long_tool_result_is_cut_and_says_so(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(imp, "MAX_RESULT", 4)
    _, body = convert_file(tmp_path, synthetic())
    text = body[2]["message"]["content"][0]["text"]
    assert text.startswith("cont") and "cortado na importação" in text


def test_a_file_without_a_conversation_is_refused(tmp_path: Path) -> None:
    src = write_jsonl(tmp_path / "vazio.jsonl", [{"type": "summary", "uuid": "x", "timestamp": stamp(1)}])
    with pytest.raises(SystemExit, match="sem conversa principal"):
        imp.main([str(src), "--destino", str(tmp_path / "destino")])
