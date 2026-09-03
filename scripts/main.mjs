import { RulesEngine } from "./rules-engine.mjs";
import { MadnessEngine } from "./madness-engine.mjs";
import { RulesManagerApp } from "./apps/rules-manager.mjs";
import { QuickTableDialog } from "./apps/quick-table-dialog.mjs";
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
  MadnessEngine.registerSettings();

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

  // Inicializar os motores de escuta
  RulesEngine.initialize();
  MadnessEngine.initialize();

  // Expor API pública no objeto do módulo
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      RulesManagerApp,
      RulesEngine,
      MadnessEngine,
      QuickTableDialog,
      getActiveAdapter,
      openManager: () => new RulesManagerApp().render({ force: true }),
      openQuickTable: (options = {}) => new QuickTableDialog(options).render({ force: true })
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
 * Adiciona barra de controle rápida na Aba de Tabelas Roláveis da barra lateral.
 */
Hooks.on("renderRollTableDirectory", (app, html, data) => {
  if (!game.user.isGM) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  if (root.querySelector(".rolagens-globais-sidebar-toolbar")) return;

  const header = root.querySelector(".directory-header");
  if (!header) return;

  const isEnabled = MadnessEngine.isEnabled();
  const toolbar = document.createElement("div");
  toolbar.className = "rolagens-globais-sidebar-toolbar";
  toolbar.innerHTML = `
    <button type="button" class="btn-madness-toggle ${isEnabled ? "active" : "inactive"}" title="${game.i18n.localize("ROLAGENS_GLOBAIS.Madness.SidebarToggleTitle")}">
      <i class="fas fa-brain"></i>
      <span class="toggle-label">${isEnabled ? game.i18n.localize("ROLAGENS_GLOBAIS.Madness.StatusActive") : game.i18n.localize("ROLAGENS_GLOBAIS.Madness.StatusInactive")}</span>
    </button>
    <button type="button" class="btn-quick-table" title="${game.i18n.localize("ROLAGENS_GLOBAIS.QuickTable.ButtonTooltip")}">
      <i class="fas fa-bolt"></i>
    </button>
    <button type="button" class="btn-open-manager" title="${game.i18n.localize("ROLAGENS_GLOBAIS.ManagerTitle")}">
      <i class="fas fa-cog"></i>
    </button>
  `;

  const toggleBtn = toolbar.querySelector(".btn-madness-toggle");
  const labelSpan = toolbar.querySelector(".toggle-label");
  const quickTableBtn = toolbar.querySelector(".btn-quick-table");
  const managerBtn = toolbar.querySelector(".btn-open-manager");

  toggleBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const newState = await MadnessEngine.toggleEnabled();
    if (newState) {
      toggleBtn.classList.remove("inactive");
      toggleBtn.classList.add("active");
      labelSpan.textContent = game.i18n.localize("ROLAGENS_GLOBAIS.Madness.StatusActive");
    } else {
      toggleBtn.classList.remove("active");
      toggleBtn.classList.add("inactive");
      labelSpan.textContent = game.i18n.localize("ROLAGENS_GLOBAIS.Madness.StatusInactive");
    }
  });

  quickTableBtn.addEventListener("click", (e) => {
    e.preventDefault();
    new QuickTableDialog().render({ force: true });
  });

  managerBtn.addEventListener("click", (e) => {
    e.preventDefault();
    new RulesManagerApp().render({ force: true });
  });

  header.appendChild(toolbar);
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
