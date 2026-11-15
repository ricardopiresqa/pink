// F50: espiao de rede no nivel do SOCKET (pega fetch, undici, http e https). Carregado com NODE_OPTIONS=--require.
// Grava uma linha JSON por tentativa de conexao em PINK_NETSPY_LOG: {"host": ..., "port": ...}.
const fs = require("node:fs");
const net = require("node:net");
const log = process.env.PINK_NETSPY_LOG;
function note(host, port) {
  if (!log) return;
  try { fs.appendFileSync(log, JSON.stringify({ host: String(host), port: Number(port) }) + "\n"); } catch {}
}
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === "object") note(first.host || first.hostname || first.path || "?", first.port);
  else if (typeof first === "number") note(typeof args[1] === "string" ? args[1] : "localhost", first);
  return realConnect.apply(this, args);
};
