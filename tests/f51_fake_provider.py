# ruff: noqa: E501
"""Provedor de modelos FALSO e controlavel, como PROCESSO real, para a F51 (nunca chama fornecedor externo).

Compatível com a API da OpenAI (``/v1/chat/completions``). O comportamento vem do NOME do modelo pedido:
ok, ok-tools, limit, gone, server-error, auth-fail, slow, bad-request, capability, bad-tool, cut-stream, early-error-stream.
``GET /_log`` devolve o que o provedor recebeu (modelo, se veio Authorization, tamanho), sem o valor do segredo.
Uso: python f51_fake_provider.py [--port N]  -> imprime {"port": N} e serve ate ser morto.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG: list[dict] = []
LOCK = threading.Lock()
# card 1dfwh7kg4g2: roteiros de ferramentas (um turno por ferramenta; depois, a resposta final "fim")
DIFF_PANEL_SCENARIOS = {
    "edit-diff": [("write", {"path": "notas.txt", "content": "linha um\nlinha dois\nlinha tres\n"}), ("edit", {"path": "notas.txt", "edits": [{"oldText": "linha dois", "newText": "linha 2 alterada"}]})],
    "write-big": [("write", {"path": "grande.txt", "content": "".join(f"linha {n:02d}\n" for n in range(1, 61))})],
    "read-line": [("bash", {"command": "echo a > notas.txt"}), ("read", {"path": "notas.txt"}), ("grep", {"pattern": "a", "path": "."}), ("bash", {"command": "echo oi-pink"})],
    "bg-shell": [("bash", {"command": "sleep 6 && echo fim-bg", "run_in_background": True})],
    "bg-agent": [("subagent", {"agent": "scout", "task": "SUBAGENTE: responda oi", "background": True})],
    "bg-both": [("bash", {"command": "sleep 20 && echo fim-bg", "run_in_background": True}), ("subagent", {"agent": "general", "task": "SUBAGENTE: responda oi", "background": True})],
    "write-ctrl": [("write", {"path": "controle.txt", "content": "ok\x1b[31mvermelho\rfim\nlinha " + "漢" * 60 + "\n" + "😀" * 30 + "\n"})],
    "write-5000": [("write", {"path": "enorme.txt", "content": "".join(f"l{n}\n" for n in range(1, 5001))})],
}


def completion(model: str, content: str = "pong", tool: bool = False, usage: bool = True) -> dict:
    message: dict = {"role": "assistant", "content": None if tool else content}
    if tool:
        message["tool_calls"] = [{"id": "call_1", "type": "function", "function": {"name": "get_weather", "arguments": json.dumps({"city": "Lisbon"})}}]
    body = {"id": "chatcmpl-f51", "object": "chat.completion", "created": 1, "model": model, "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if tool else "stop"}]}
    if usage:
        body["usage"] = {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10}
    return body


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args) -> None:
        return

    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/_log":
            with LOCK:
                self._json(200, {"data": list(LOG)})
        else:
            self._json(404, {"error": {"message": "not found"}})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        model = str(payload.get("model", ""))
        auth = self.headers.get("Authorization", "")
        with LOCK:
            LOG.append({"model": model, "stream": bool(payload.get("stream")), "has_auth": bool(auth), "auth_sha8": hashlib.sha256(auth.encode()).hexdigest()[:8] if auth else None,
                        "tools": bool(payload.get("tools")), "messages": len(payload.get("messages", [])), "has_user": "user" in payload,
                        "max_tokens": payload.get("max_tokens"), "images": sum(1 for m in payload.get("messages", []) if isinstance(m, dict) and isinstance(m.get("content"), list) for part in m["content"] if isinstance(part, dict) and part.get("type") == "image_url")})
        stream = bool(payload.get("stream"))
        if model == "limit":
            return self._json(429, {"error": {"message": "Free usage exceeded, subscribe to Go", "type": "rate_limit"}})
        if model == "gone":
            return self._json(404, {"error": {"message": "The model `gone` does not exist", "code": "model_not_found"}})
        if model == "server-error":
            return self._json(500, {"error": {"message": "internal error"}})
        if model == "auth-fail":
            return self._json(401, {"error": {"message": "Invalid API key"}})
        if model == "echo-key-error":
            return self._json(400, {"error": {"message": f"Incorrect API key provided: {auth}", "type": "invalid_request_error"}})
        if model == "bad-request":
            return self._json(400, {"error": {"message": "messages: Input should be a valid list", "type": "invalid_request_error"}})
        if model == "capability":
            return self._json(400, {"error": {"message": "this model does not support tools"}})
        if model == "slow":
            time.sleep(5)
            return self._json(200, completion(model))
        if model == "bad-tool":
            body = completion(model, tool=True)
            body["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"] = "{not json"
            return self._json(200, body)
        if not stream:
            return self._json(200, completion(model, tool=model == "ok-tools"))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

        def event(data: dict | str) -> None:
            self.wfile.write(b"data: " + (data if isinstance(data, str) else json.dumps(data)).encode("utf-8") + b"\n\n")
            self.wfile.flush()

        if model == "early-error-stream":
            return event({"error": {"message": "Free usage exceeded, subscribe to Go"}})
        chunk = lambda text: {"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}]}  # noqa: E731
        messages = payload.get("messages") or [{}]
        if model in DIFF_PANEL_SCENARIOS:  # cada turno pede a próxima ferramenta do roteiro; o subagente (tarefa "SUBAGENTE") responde direto
            subagent_turn = "SUBAGENTE" in str(next((m.get("content") for m in reversed(messages) if m.get("role") == "user"), ""))
            steps = DIFF_PANEL_SCENARIOS[model]
            done_tools = sum(1 for m in messages if m.get("role") == "tool")
            if not subagent_turn and done_tools < len(steps):
                name, args = steps[done_tools]
                call = {"index": 0, "id": f"call_{done_tools}", "type": "function", "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}
                event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {"tool_calls": [call]}, "finish_reason": None}]})
                event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]})
                return event("[DONE]")
            if subagent_turn:
                time.sleep(8)  # o subagente em segundo plano fica rodando por um tempo: o painel o mostra
            event(chunk("oi" if subagent_turn else "fim"))
            last = chunk("")
            last["choices"][0]["finish_reason"] = "stop"
            last["usage"] = {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10}
            event(last)
            return event("[DONE]")
        if model == "ask" and messages[-1].get("role") != "tool":
            # card 1dfwh7kfmqn: pede a pergunta com opções; depois do resultado da ferramenta, devolve o que a pessoa escolheu
            question = {"questions": [{"id": "deploy", "prompt": "Publicar agora?", "options": [{"value": "sim", "label": "Sim, publicar"}, {"value": "nao", "label": "Não, depois"}]}]}
            call = {"index": 0, "id": "call_q", "type": "function", "function": {"name": "questionnaire", "arguments": json.dumps(question, ensure_ascii=False)}}
            event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {"tool_calls": [call]}, "finish_reason": None}]})
            event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]})
            return event("[DONE]")
        if model in ("ask-long", "ask-tabs"):  # pergunta com 4 opções (com descrições) depois de 12 tarefas; ou 2 perguntas em abas
            def tool_call(name: str, args: dict, call_id: str) -> dict:
                return {"index": 0, "id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}
            todos = [{"content": f"tarefa {i:02d}", "status": status} for i, status in enumerate(["completed", "completed", "in_progress"] + ["pending"] * 9, start=1)]
            long_question = {"questions": [{"id": "deploy", "prompt": "Publicar agora?", "options": [
                {"value": "sim", "label": "Sim, publicar", "description": "envia para produção hoje"},
                {"value": "nao", "label": "Não, depois", "description": "adia para a próxima janela"},
                {"value": "teste", "label": "Só em teste", "description": "publica no ambiente de testes"},
                {"value": "cancel", "label": "Cancelar", "description": "não publica nada"}]}]}
            tabs_question = {"questions": [
                {"id": "ambiente", "prompt": "Qual ambiente?", "options": [{"value": "prod", "label": "Produção"}, {"value": "test", "label": "Teste"}]},
                {"id": "tag", "prompt": "Qual versão?", "options": [{"value": "v1", "label": "Versão 1"}, {"value": "v2", "label": "Versão 2"}]}]}
            last_message = messages[-1]
            if last_message.get("role") != "tool":  # primeiro passo
                if model == "ask-long":
                    event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {"tool_calls": [tool_call("todowrite", {"todos": todos}, "call_todo")]}, "finish_reason": None}]})
                else:
                    event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {"tool_calls": [tool_call("questionnaire", tabs_question, "call_q")]}, "finish_reason": None}]})
                event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]})
                return event("[DONE]")
            if last_message.get("tool_call_id") == "call_todo":  # depois das tarefas, a pergunta
                event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {"tool_calls": [tool_call("questionnaire", long_question, "call_q")]}, "finish_reason": None}]})
                event({"id": "chatcmpl-f51", "object": "chat.completion.chunk", "model": model, "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]})
                return event("[DONE]")
            result = last_message.get("content")  # depois da resposta: eco do que a pessoa escolheu
            text = result if isinstance(result, str) else " ".join(part.get("text", "") for part in result or [] if isinstance(part, dict))
            event(chunk(f"eco: {text}"))
        if model == "ask":
            result = messages[-1].get("content")
            text = result if isinstance(result, str) else " ".join(part.get("text", "") for part in result or [] if isinstance(part, dict))
            event(chunk(f"eco: {text}"))
        elif model not in ("ask-long", "ask-tabs"):
            event(chunk("po"))
            event(chunk("ng"))
        if model == "cut-stream":
            self.wfile.flush()
            return  # closes the connection with no [DONE] and no more data
        last = chunk("")
        last["choices"][0]["finish_reason"] = "stop"
        last["usage"] = {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10}
        event(last)
        event("[DONE]")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    print(json.dumps({"port": server.server_address[1]}), flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
