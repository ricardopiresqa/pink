// Sonda do F50 (select-option-mouse-click e thinking-collapsed-every-session).
// Roda as classes REAIS do pacote instalado, nao copias: o ExtensionSelectorComponent do chunk (com o patch do clique)
// e o SettingsManager do modulo (com o patch do pensamento recolhido). Imprime uma linha JSON no fim.
// Uso: node f50_selector_probe.mjs selector <chunk-com-export.js>
//      node f50_selector_probe.mjs settings <dist/core/settings-manager.js> <cwd> <agentDir>
import { pathToFileURL } from "node:url";

const [mode, target, cwd, agentDir] = process.argv.slice(2);
const out = {};

if (mode === "settings") {
  const { SettingsManager } = await import(pathToFileURL(target).href);
  const fromFile = SettingsManager.create(cwd, agentDir);
  out.rawFile = fromFile.getGlobalSettings().hideThinkingBlock;   // o que o arquivo diz: false
  out.fromFile = fromFile.getHideThinkingBlock();                   // o que o Pink usa: true
  out.inMemory = SettingsManager.inMemory({ hideThinkingBlock: false }).getHideThinkingBlock();
  out.empty = SettingsManager.inMemory({}).getHideThinkingBlock();
} else if (mode === "selector") {
  const { ExtensionSelectorComponent } = await import(pathToFileURL(target).href);
  // o tema vem do chunk de interface (T726RZZU, irmao do chunk do seletor): sem ele o desenho falha com "Theme not initialized"
  const { initTheme } = await import(new URL("./chunk-T726RZZU.js", pathToFileURL(target)).href);
  initTheme("dark", false);
  const OPTIONS = ["Alfa", "Bravo", "Charlie"];
  const WIDTH = 60;
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const make = () => {
    const calls = [];
    const component = new ExtensionSelectorComponent("Escolha", OPTIONS, (option) => calls.push(option), () => calls.push("<cancelar>"));
    return { component, calls };
  };
  const rowOf = (component, name) => {
    const lines = component.render(WIDTH).map(strip);
    return lines.findIndex((line) => line.includes(name));
  };
  const mouse = (component, y, button, type = "click") => {
    const height = component.render(WIDTH).length;
    return component.handleMouse({ type, button, x: 4, y, width: WIDTH, height, screenX: 4, screenY: y });
  };

  let run = make();
  const bravoRow = rowOf(run.component, "Bravo");
  out.rows = { alfa: rowOf(run.component, "Alfa"), bravo: bravoRow, charlie: rowOf(run.component, "Charlie") };
  const leftBravo = mouse(run.component, bravoRow, "left");
  out.leftBravo = { calls: run.calls, handled: leftBravo?.handled ?? null };

  run = make();
  mouse(run.component, rowOf(run.component, "Alfa"), "left");
  out.leftAlfa = { calls: run.calls };

  run = make();
  mouse(run.component, bravoRow, "right");
  out.rightBravo = { calls: run.calls };

  run = make();
  mouse(run.component, bravoRow, "middle");
  out.middleBravo = { calls: run.calls };

  run = make();
  mouse(run.component, bravoRow, "left", "press");
  out.pressLeftBravo = { calls: run.calls };

  run = make();
  run.component.handleInput("\r");
  out.enter = { calls: run.calls };

  run = make();
  run.component.handleInput("\x1b[B");
  run.component.handleInput("\r");
  out.arrowEnter = { calls: run.calls };

  run = make();
  mouse(run.component, bravoRow, "left");
  out.selectedAfterClick = run.component.selectedIndex;
  run.calls.length = 0; // so conta o Enter, nao o clique
  run.component.handleInput("\r");
  out.clickEnter = { calls: run.calls };
} else {
  throw new Error(`modo desconhecido: ${mode}`);
}

console.log(JSON.stringify(out));
