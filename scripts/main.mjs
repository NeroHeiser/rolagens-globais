import { RulesEngine } from "./rules-engine.mjs";
import { MadnessEngine } from "./madness-engine.mjs";
import { TableChainEngine } from "./table-chain-engine.mjs";
import { RulesManagerApp } from "./apps/rules-manager.mjs";
import { QuickTableDialog } from "./apps/quick-table-dialog.mjs";
import { ItemConfigDialog } from "./apps/item-config-dialog.mjs";
import { getActiveAdapter } from "./adapters/index.mjs";

const MODULE_ID = "rolagens-globais";

/**
 * Foundry VTT Initialization Hook (init).
 */
Hooks.once("init", () => {
  console.log("Global Extra Rolls | Initializing module...");

  RulesEngine.registerSettings();
  MadnessEngine.registerSettings();
  TableChainEngine.registerSettings();

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
 * Foundry VTT Ready Hook (ready).
 */
Hooks.once("ready", () => {
  const adapter = getActiveAdapter();
  console.log(`Global Extra Rolls | Ready. Detected system: ${adapter.name} (${game.system.id})`);

  RulesEngine.initialize();
  MadnessEngine.initialize();
  TableChainEngine.initialize();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      RulesManagerApp,
      RulesEngine,
      MadnessEngine,
      TableChainEngine,
      QuickTableDialog,
      DiceRangeCalculator,
      getActiveAdapter,
      openManager: () => new RulesManagerApp().render({ force: true }),
      openQuickTable: (options = {}) => new QuickTableDialog(options).render({ force: true })
    };
  }
});

/**
 * Injects configuration button in item sheet headers for exception handling.
 */
Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  if (!game.user.isGM) return;

  buttons.unshift({
    label: game.i18n.localize("ROLAGENS_GLOBAIS.Title"),
    class: "rolagens-globais-item-btn",
    icon: "fas fa-dice-d20",
    onclick: () => {
      new ItemConfigDialog(sheet.item).render({ force: true });
    }
  });
});

/**
 * Injects dice conversion button into RollTable configuration header.
 */
Hooks.on("getRollTableConfigHeaderButtons", (sheet, buttons) => {
  if (!game.user.isGM) return;

  buttons.unshift({
    label: game.i18n.localize("ROLAGENS_GLOBAIS.TableDice.ConvertButton"),
    class: "rolagens-globais-convert-dice-btn",
    icon: "fas fa-dice-d20",
    onclick: async () => {
      const table = sheet.document;
      if (!table) return;

      let updatedCount = 0;
      const updates = [];
      for (const res of table.results) {
        if (res.type === CONST.TABLE_RESULT_TYPES.TEXT && res.text) {
          const newText = res.text.replace(/(?<!\[\[(?:\/r\s*)?)\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\b(?!\]\])/gi, "[[/r $1]]");
          if (newText !== res.text) {
            updates.push({ _id: res.id, text: newText });
            updatedCount++;
          }
        }
      }

      if (updates.length > 0) {
        await table.updateEmbeddedDocuments("TableResult", updates);
        ui.notifications.info(game.i18n.format("ROLAGENS_GLOBAIS.TableDice.ConvertedNotice", { count: updatedCount }));
      } else {
        ui.notifications.info(game.i18n.localize("ROLAGENS_GLOBAIS.TableDice.NoDiceNotice"));
      }
    }
  });
});

/**
 * Injects quick toolbar inside the RollTable directory sidebar.
 */
Hooks.on("renderRollTableDirectory", (app, html, data) => {
  if (!game.user.isGM) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  if (root.querySelector(".rolagens-globais-sidebar-toolbar")) return;

  const header = root.querySelector(".directory-header");
  if (!header) return;

  const isEnabled = MadnessEngine.isEnabled();
  const modeName = MadnessEngine.getModeName();
  const activeLabel = game.i18n.localize("ROLAGENS_GLOBAIS.Madness.StatusActive");
  const inactiveLabel = game.i18n.localize("ROLAGENS_GLOBAIS.Madness.StatusInactive");
  const toolbar = document.createElement("div");
  toolbar.className = "rolagens-globais-sidebar-toolbar";
  toolbar.innerHTML = `
    <button type="button" class="btn-madness-toggle ${isEnabled ? "active" : "inactive"}" title="Toggle ${modeName}">
      <i class="fas fa-globe"></i>
      <span class="toggle-label">${modeName}: ${isEnabled ? activeLabel : inactiveLabel}</span>
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
    const currentModeName = MadnessEngine.getModeName();
    if (newState) {
      toggleBtn.classList.remove("inactive");
      toggleBtn.classList.add("active");
      labelSpan.textContent = `${currentModeName}: ${activeLabel}`;
    } else {
      toggleBtn.classList.remove("active");
      toggleBtn.classList.add("inactive");
      labelSpan.textContent = `${currentModeName}: ${inactiveLabel}`;
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
 * Injects shortcut button inside the Chat Log control bar for the GM.
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
