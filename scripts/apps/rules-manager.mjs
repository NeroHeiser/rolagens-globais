import { RulesEngine } from "../rules-engine.mjs";
import { MadnessEngine } from "../madness-engine.mjs";
import { getActiveAdapter } from "../adapters/index.mjs";
import { RuleDialog } from "./rule-dialog.mjs";
import { QuickTableDialog } from "./quick-table-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Painel Central do Rolagens Globais com suporte a duas abas:
 * 1. Regras do Mundo (Interceptador Pré-Ataque com tabelas Física e Mágica)
 * 2. Rolagens Extras (Gatilhos Reativos)
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
   * Prepara o contexto de dados para renderizar a interface.
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
          targetName = "⚠️ Nenhuma tabela selecionada (clique em Editar)";
          hasConfigError = true;
        } else {
          const table = game.tables.get(rule.tableId) || game.tables.getName(rule.tableId);
          targetName = table ? table.name : (rule.tableId ? "Tabela não encontrada" : "Não configurada");
        }
      } else if (rule.effectType === "macro") {
        if (!rule.macroId) {
          targetName = "⚠️ Nenhuma macro selecionada (clique em Editar)";
          hasConfigError = true;
        } else {
          const macro = game.macros.get(rule.macroId) || game.macros.getName(rule.macroId);
          targetName = macro ? macro.name : (rule.macroId ? "Macro não encontrada" : "Não configurada");
        }
      }

      let triggerSummary = rule.resultType || "Qualquer";
      if (rule.dieType && rule.dieType !== "any") triggerSummary += ` (${rule.dieType})`;
      if (rule.keyword) triggerSummary += ` [${rule.keyword}]`;

      let visibilityLabel = "Pública";
      if (rule.visibility === "whisper_gm" || rule.visibility === "gm") visibilityLabel = "Mestre";
      if (rule.visibility === "blind") visibilityLabel = "Cega";
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
   * Busca todas as tabelas roláveis no mundo e compêndios.
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
        // Ignora compêndios não carregados
      }
    }
    return list;
  }

  /**
   * Ação: Alternar aba ativa.
   */
  static #onSetTab(event, target) {
    const tab = target.dataset.tab;
    if (tab && (tab === "madness" || tab === "rules")) {
      RulesManagerApp.currentTab = tab;
      this.render({ force: true });
    }
  }

  /**
   * Ação: Alternar o Modo ligado/desligado.
   */
  static async #onToggleMadness(event, target) {
    await MadnessEngine.toggleEnabled();
    this.render({ force: true });
  }

  /**
   * Ação: Salvar as configurações da aba Regras do Mundo.
   */
  static async #onSaveMadnessConfig(event, target) {
    const form = this.element.querySelector(".madness-config-form");
    if (!form) return;

    const formData = new FormData(form);
    const newConfig = {
      customName: formData.get("customName")?.toString().trim() || "Regras do Mundo",
      physicalTableId: formData.get("physicalTableId")?.toString() || "",
      magicTableId: formData.get("magicTableId")?.toString() || "",
      interceptMelee: formData.get("interceptMelee") === "on",
      interceptRanged: formData.get("interceptRanged") === "on",
      interceptSpells: formData.get("interceptSpells") === "on",
      flavor: formData.get("flavor")?.toString().trim() || "🌀 {mode}: {actor} tentou usar {item}, mas as regras do mundo interferiram!",
      visibility: formData.get("visibility")?.toString() || "public"
    };

    await MadnessEngine.saveConfig(newConfig);
    ui.notifications.info(game.i18n.localize("ROLAGENS_GLOBAIS.Madness.ConfigSaved"));
    this.render({ force: true });
  }

  /**
   * Ação: Testar o sorteio da Tabela Física.
   */
  static async #onTestMadnessDrawPhysical(event, target) {
    const config = MadnessEngine.getConfig();
    const tableId = config.physicalTableId || config.tableId;
    if (!tableId) {
      ui.notifications.warn("Nenhuma tabela configurada para Ataques Físicos.");
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
      ui.notifications.warn(`Tabela física "${tableId}" não encontrada.`);
      return;
    }

    await table.draw({ recursive: true, rollMode: config.visibility || CONST.DICE_ROLL_MODES.PUBLIC });
  }

  /**
   * Ação: Testar o sorteio da Tabela Mágica.
   */
  static async #onTestMadnessDrawMagic(event, target) {
    const config = MadnessEngine.getConfig();
    const tableId = config.magicTableId || config.tableId;
    if (!tableId) {
      ui.notifications.warn("Nenhuma tabela configurada para Magias.");
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
      ui.notifications.warn(`Tabela mágica "${tableId}" não encontrada.`);
      return;
    }

    await table.draw({ recursive: true, rollMode: config.visibility || CONST.DICE_ROLL_MODES.PUBLIC });
  }

  /**
   * Ação: Abrir o Criador Rápido de Tabelas (geral).
   */
  static #onOpenQuickTable(event, target) {
    new QuickTableDialog({
      onCreated: () => this.render({ force: true })
    }).render({ force: true });
  }

  /**
   * Ação: Abrir o Criador Rápido vinculado à Tabela Física.
   */
  static #onOpenQuickTablePhysical(event, target) {
    new QuickTableDialog({
      targetMode: "physical",
      onCreated: () => this.render({ force: true })
    }).render({ force: true });
  }

  /**
   * Ação: Abrir o Criador Rápido vinculado à Tabela Mágica.
   */
  static #onOpenQuickTableMagic(event, target) {
    new QuickTableDialog({
      targetMode: "magic",
      onCreated: () => this.render({ force: true })
    }).render({ force: true });
  }

  /**
   * Ação: Adicionar uma nova regra reativa.
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
   * Ação: Editar uma regra reativa existente.
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
   * Ação: Alternar ativação de uma regra reativa.
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
   * Ação: Excluir uma regra reativa após confirmação.
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
   * Ação: Carregar presets recomendados para o sistema ativo.
   */
  static async #onLoadPresets(event, target) {
    const adapter = getActiveAdapter();
    const presets = adapter.getPresetRules();
    if (presets.length === 0) {
      ui.notifications.warn("Nenhum preset disponível para este sistema.");
      return;
    }

    const currentRules = RulesEngine.getRules();
    const mergedRules = [...currentRules, ...presets];
    await RulesEngine.saveRules(mergedRules);
    ui.notifications.info("Regras recomendadas carregadas! Lembre-se de clicar em 'Editar' para escolher qual Tabela Rolável ou Macro deseja associar.");
    this.render({ force: true });
  }
}
