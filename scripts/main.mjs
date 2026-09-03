import { RulesEngine } from "./rules-engine.mjs";
import { RulesManagerApp } from "./apps/rules-manager.mjs";
import { ItemConfigDialog } from "./apps/item-config-dialog.mjs";
import { getActiveAdapter } from "./adapters/index.mjs";

const MODULE_ID = "rolagens-globais";

/**
 * Hook de Inicialização do Foundry VTT (init).
 */
Hooks.once("init", () => {
  console.log("Rolagens Globais | Inicializando módulo...");

  // Registrar configurações de mundo
  RulesEngine.registerSettings();

  // Registrar o botão de configuração no menu de módulos
  game.settings.registerMenu(MODULE_ID, "managerMenu", {
    name: game.i18n.localize("ROLAGENS_GLOBAIS.Settings.OpenManager.Name"),
    label: game.i18n.localize("ROLAGENS_GLOBAIS.Settings.OpenManager.Label"),
    hint: game.i18n.localize("ROLAGENS_GLOBAIS.Settings.OpenManager.Hint"),
    icon: "fas fa-dice-d20",
    type: RulesManagerApp,
    restricted: true
  });
});

/**
 * Hook quando o Foundry VTT está pronto (ready).
 */
Hooks.once("ready", () => {
  const adapter = getActiveAdapter();
  console.log(`Rolagens Globais | Pronto para uso! Sistema detectado: ${adapter.name} (${game.system.id})`);

  // Inicializar o mecanismo de escuta do chat
  RulesEngine.initialize();

  // Expor API pública no objeto do módulo
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      RulesManagerApp,
      RulesEngine,
      getActiveAdapter,
      openManager: () => new RulesManagerApp().render({ force: true })
    };
  }
});

/**
 * Suporte Híbrido: Adiciona botão no cabeçalho das fichas de Item para configurar exceções.
 */
Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  if (!game.user.isGM) return;

  buttons.unshift({
    label: "Rolagens Extras",
    class: "rolagens-globais-item-btn",
    icon: "fas fa-dice-d20",
    onclick: () => {
      new ItemConfigDialog(sheet.item).render({ force: true });
    }
  });
});

/**
 * Adiciona um botão de atalho rápido na barra lateral do Chat para o Mestre.
 */
Hooks.on("renderChatLog", (app, html, data) => {
  if (!game.user.isGM) return;

  const controlButtons = html.querySelector(".control-buttons") || html.find?.(".control-buttons")?.[0];
  if (!controlButtons) return;

  if (controlButtons.querySelector(".rolagens-globais-chat-btn")) return;

  const btn = document.createElement("a");
  btn.className = "button control-button rolagens-globais-chat-btn";
  btn.title = game.i18n.localize("ROLAGENS_GLOBAIS.ManagerTitle");
  btn.innerHTML = '<i class="fas fa-dice-d20"></i>';
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    new RulesManagerApp().render({ force: true });
  });

  controlButtons.prepend(btn);
});

/**
 * Adiciona um botão destacado no cabeçalho da aba de Tabelas Roláveis na barra lateral.
 */
Hooks.on("renderRollTableDirectory", (app, html, data) => {
  if (!game.user.isGM) return;

  const headerActions = html.querySelector?.(".header-actions") || html.find?.(".header-actions")?.[0];
  if (!headerActions) return;

  if (headerActions.querySelector(".rolagens-globais-table-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "create-document rolagens-globais-table-btn";
  btn.innerHTML = '<i class="fas fa-dice-d20"></i> Rolagens Globais';
  btn.style.marginTop = "4px";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    new RulesManagerApp().render({ force: true });
  });

  headerActions.appendChild(btn);
});

