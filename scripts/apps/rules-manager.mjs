import { RulesEngine } from "../rules-engine.mjs";
import { MadnessEngine } from "../madness-engine.mjs";
import { getActiveAdapter } from "../adapters/index.mjs";
import { RuleDialog } from "./rule-dialog.mjs";
import { QuickTableDialog } from "./quick-table-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Central management dialog for Rolagens Globais supporting two tabs:
 * 1. World Rules (Pre-attack interception with Physical and Magic tables)
 * 2. Extra Rolls (Reactive triggers)
 */
export class RulesManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static currentTab = "madness";

  static DEFAULT_OPTIONS = {
    id: "rolagens-globais-manager",
    classes: ["rolagens-globais", "manager-window"],
    tag: "div",
    window: {
      title: "ROLAGENS_GLOBAIS.ManagerTitle",
      icon: "fas fa-dice-d20",
      resizable: true
    },
    position: {
      width: 820,
      height: 640
    },
    actions: {
      setTab: RulesManagerApp.#onSetTab,
      toggleMadness: RulesManagerApp.#onToggleMadness,
      saveMadnessConfig: RulesManagerApp.#onSaveMadnessConfig,
      testMadnessDrawPhysical: RulesManagerApp.#onTestMadnessDrawPhysical,
      testMadnessDrawMagic: RulesManagerApp.#onTestMadnessDrawMagic,
      openQuickTable: RulesManagerApp.#onOpenQuickTable,
      openQuickTablePhysical: RulesManagerApp.#onOpenQuickTablePhysical,
      openQuickTableMagic: RulesManagerApp.#onOpenQuickTableMagic,
      openExportTables: RulesManagerApp.#onOpenExportTables,
      addRule: RulesManagerApp.#onAddRule,
      editRule: RulesManagerApp.#onEditRule,
      deleteRule: RulesManagerApp.#onDeleteRule,
      toggleRule: RulesManagerApp.#onToggleRule,
      loadPresets: RulesManagerApp.#onLoadPresets
    }
  };

  static PARTS = {
    main: {
      template: "modules/rolagens-globais/templates/rules-manager.hbs"
    }
  };

  /**
   * Prepares render context for the handlebars template.
   */
  async _prepareContext(options) {
    const adapter = getActiveAdapter();
    const rawRules = RulesEngine.getRules();
    const madnessEnabled = MadnessEngine.isEnabled();
    const madnessConfig = MadnessEngine.getConfig();
    const modeName = MadnessEngine.getModeName();
    const tables = await this.#getAvailableTables();

    const rules = rawRules.map(rule => {
      let targetName = "";
      let hasConfigError = false;

      if (rule.effectType === "table") {
        if (!rule.tableId) {
          targetName = "No table selected (click Edit)";
          hasConfigError = true;
        } else {
          const table = game.tables.get(rule.tableId) || game.tables.getName(rule.tableId);
          targetName = table ? table.name : (rule.tableId ? "Table not found" : "Not configured");
        }
      } else if (rule.effectType === "macro") {
        if (!rule.macroId) {
          targetName = "No macro selected (click Edit)";
          hasConfigError = true;
        } else {
          const macro = game.macros.get(rule.macroId) || game.macros.getName(rule.macroId);
          targetName = macro ? macro.name : (rule.macroId ? "Macro not found" : "Not configured");
        }
      }

      let triggerSummary = rule.resultType || "Any";
      if (rule.dieType && rule.dieType !== "any") triggerSummary += ` (${rule.dieType})`;
      if (rule.keyword) triggerSummary += ` [${rule.keyword}]`;

      let visibilityLabel = "Public";
      if (rule.visibility === "whisper_gm" || rule.visibility === "gm") visibilityLabel = "GM";
      if (rule.visibility === "blind") visibilityLabel = "Blind";
      if (rule.visibility === "same") visibilityLabel = "Original";

      return {
        ...rule,
        targetName,
        hasConfigError,
        triggerSummary,
        visibilityLabel
      };
    });

    return {
      systemName: adapter.name,
      activeTab: RulesManagerApp.currentTab,
      madnessEnabled,
      madnessConfig,
      modeName,
      tables,
      rules
    };
  }

  /**
   * Retrieves all available RollTables in world and compendiums.
   */
  async #getAvailableTables() {
    const list = game.tables.map(t => ({ id: t.id, name: t.name }));
    for (const pack of game.packs.filter(p => p.documentName === "RollTable")) {
      try {
        const index = await pack.getIndex({ fields: ["name"] });
        for (const entry of index) {
          list.push({
            id: `Compendium.${pack.collection}.${entry._id}`,
            name: `${entry.name} [${pack.metadata.label}]`
          });
        }
      } catch {
        // Ignore unindexed compendiums
      }
    }
    return list;
  }

  /**
   * Action: Switch active tab.
   */
  static #onSetTab(event, target) {
    const tab = target.dataset.tab;
    if (tab && (tab === "madness" || tab === "rules")) {
      RulesManagerApp.currentTab = tab;
      this.render({ force: true });
    }
  }

  /**
   * Action: Toggle World Rules interception on/off.
   */
  static async #onToggleMadness(event, target) {
    await MadnessEngine.toggleEnabled();
    this.render({ force: true });
  }

  /**
   * Action: Save World Rules configuration.
   */
  static async #onSaveMadnessConfig(event, target) {
    const form = this.element.querySelector(".madness-config-form");
    if (!form) return;

    const defaultName = game.i18n.localize("ROLAGENS_GLOBAIS.Madness.DefaultName") || "World Rules";
    const formData = new FormData(form);
    const newConfig = {
      customName: formData.get("customName")?.toString().trim() || defaultName,
      physicalTableId: formData.get("physicalTableId")?.toString() || "",
      magicTableId: formData.get("magicTableId")?.toString() || "",
      interceptMelee: formData.get("interceptMelee") === "on",
      interceptRanged: formData.get("interceptRanged") === "on",
      interceptSpells: formData.get("interceptSpells") === "on",
      flavor: formData.get("flavor")?.toString().trim() || "{mode}: {actor} tried to use {item}, but the action was intercepted!",
      visibility: formData.get("visibility")?.toString() || "public"
    };

    await MadnessEngine.saveConfig(newConfig);
    ui.notifications.info(game.i18n.localize("ROLAGENS_GLOBAIS.Madness.ConfigSaved"));
    this.render({ force: true });
  }

  /**
   * Action: Test draw from Physical Table.
   */
  static async #onTestMadnessDrawPhysical(event, target) {
    const config = MadnessEngine.getConfig();
    const tableId = config.physicalTableId || config.tableId;
    if (!tableId) {
      ui.notifications.warn("No table configured for physical attacks.");
      return;
    }

    let table = game.tables.get(tableId) || game.tables.getName(tableId);
    if (!table) {
      try {
        table = await fromUuid(tableId);
      } catch {
        table = null;
      }
    }

    if (!table) {
      ui.notifications.warn(`Physical table "${tableId}" not found.`);
      return;
    }

    await table.draw({ recursive: true, rollMode: config.visibility || CONST.DICE_ROLL_MODES.PUBLIC });
  }

  /**
   * Action: Test draw from Magic Table.
   */
  static async #onTestMadnessDrawMagic(event, target) {
    const config = MadnessEngine.getConfig();
    const tableId = config.magicTableId || config.tableId;
    if (!tableId) {
      ui.notifications.warn("No table configured for spells.");
      return;
    }

    let table = game.tables.get(tableId) || game.tables.getName(tableId);
    if (!table) {
      try {
        table = await fromUuid(tableId);
      } catch {
        table = null;
      }
    }

    if (!table) {
      ui.notifications.warn(`Magic table "${tableId}" not found.`);
      return;
    }

    await table.draw({ recursive: true, rollMode: config.visibility || CONST.DICE_ROLL_MODES.PUBLIC });
  }

  /**
   * Action: Open Quick Table dialog.
   */
  static #onOpenQuickTable(event, target) {
    new QuickTableDialog({
      onCreated: () => this.render({ force: true })
    }).render({ force: true });
  }

  /**
   * Action: Open Quick Table dialog bound to Physical Table.
   */
  static #onOpenQuickTablePhysical(event, target) {
    new QuickTableDialog({
      targetMode: "physical",
      onCreated: () => this.render({ force: true })
    }).render({ force: true });
  }

  /**
   * Action: Open Quick Table dialog bound to Magic Table.
   */
  static #onOpenQuickTableMagic(event, target) {
    new QuickTableDialog({
      targetMode: "magic",
      onCreated: () => this.render({ force: true })
    }).render({ force: true });
  }

  /**
   * Action: Open Tables Hub in Export tab.
   */
  static #onOpenExportTables(event, target) {
    new QuickTableDialog({
      initialTab: "export",
      onCreated: () => this.render({ force: true })
    }).render({ force: true });
  }

  /**
   * Action: Add a new reactive rule.
   */
  static #onAddRule(event, target) {
    const dialog = new RuleDialog({
      rule: null,
      onSave: async (newRule) => {
        const rules = RulesEngine.getRules();
        rules.push(newRule);
        await RulesEngine.saveRules(rules);
        this.render({ force: true });
      }
    });
    dialog.render({ force: true });
  }

  /**
   * Action: Edit an existing reactive rule.
   */
  static #onEditRule(event, target) {
    const ruleId = target.dataset.ruleId;
    const rules = RulesEngine.getRules();
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    const dialog = new RuleDialog({
      rule: foundry.utils.deepClone(rule),
      onSave: async (updatedRule) => {
        const currentRules = RulesEngine.getRules();
        const index = currentRules.findIndex(r => r.id === ruleId);
        if (index !== -1) {
          currentRules[index] = updatedRule;
          await RulesEngine.saveRules(currentRules);
          this.render({ force: true });
        }
      }
    });
    dialog.render({ force: true });
  }

  /**
   * Action: Toggle reactive rule enabled state.
   */
  static async #onToggleRule(event, target) {
    const ruleId = target.dataset.ruleId;
    const rules = RulesEngine.getRules();
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    rule.enabled = !rule.enabled;
    await RulesEngine.saveRules(rules);
    this.render({ force: true });
  }

  /**
   * Action: Delete a reactive rule after confirmation.
   */
  static async #onDeleteRule(event, target) {
    const ruleId = target.dataset.ruleId;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ROLAGENS_GLOBAIS.Manager.Delete") },
      content: `<p>${game.i18n.localize("ROLAGENS_GLOBAIS.Manager.ConfirmDelete")}</p>`,
      yes: { label: game.i18n.localize("Yes"), icon: "fas fa-check" },
      no: { label: game.i18n.localize("No"), icon: "fas fa-times" }
    });

    if (confirmed) {
      const rules = RulesEngine.getRules().filter(r => r.id !== ruleId);
      await RulesEngine.saveRules(rules);
      this.render({ force: true });
    }
  }

  /**
   * Action: Load recommended presets for active system.
   */
  static async #onLoadPresets(event, target) {
    const adapter = getActiveAdapter();
    const presets = adapter.getPresetRules();
    if (presets.length === 0) {
      ui.notifications.warn("No presets available for this system.");
      return;
    }

    const currentRules = RulesEngine.getRules();
    const mergedRules = [...currentRules, ...presets];
    await RulesEngine.saveRules(mergedRules);
    ui.notifications.info(game.i18n.localize("ROLAGENS_GLOBAIS.Manager.PresetsLoaded"));
    this.render({ force: true });
  }
}
