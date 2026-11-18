// Filho falso do multiplexador (PINK_MUX_CLI), so para o teste ponta a ponta de "sessoes abertas".
// Grava a pasta e os argumentos em PINK_FAKE_LOG, avisa o arquivo da sessao (OSC 9;pink-session) como o Pink de verdade e
// fica aberto; um arquivo cujo nome contem "fechar" faz o filho sair sozinho (como uma sessao fechada).
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const at = args.indexOf("--session");
const file = at >= 0 ? args[at + 1] : "";
appendFileSync(process.env.PINK_FAKE_LOG, `${JSON.stringify({ cwd: process.cwd(), args })}\n`);
process.stdout.write(`\x1b]9;pink-session=${file}\x07`);
// PINK_FAKE_OSC: estados do programa (OSC 7501), uma lista de payloads "state=...:app=pink:..."; o ESC \ fecha cada um
for (const payload of JSON.parse(process.env.PINK_FAKE_OSC || "[]")) process.stdout.write(`\x1b]7501;${payload}\x1b\\`);
if (file.includes("fechar")) process.exit(0);
setInterval(() => {}, 60_000);
