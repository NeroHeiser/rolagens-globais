import { RulesEngine } from "../rules-engine.mjs";
import { getActiveAdapter } from "../adapters/index.mjs";
import { RuleDialog } from "./rule-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Painel Central do Rolagens Globais construído sobre a API moderna ApplicationV2.
 */
export class RulesManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
      width: 780,
      height: 560
    },
    actions: {
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

    const rules = rawRules.map(rule => {
      let targetName = "";
      let hasConfigError = false;

      if (rule.effectType === "table") {
        if (!rule.tableId) {
          targetName = "⚠️ Nenhuma tabela selecionada (clique em Editar)";
          hasConfigError = true;
        } else {
          const table = game.tables.get(rule.tableId);
          targetName = table ? table.name : (rule.tableId ? "Tabela não encontrada" : "Não configurada");
        }
      } else if (rule.effectType === "macro") {
        if (!rule.macroId) {
          targetName = "⚠️ Nenhuma macro selecionada (clique em Editar)";
          hasConfigError = true;
        } else {
          const macro = game.macros.get(rule.macroId);
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
      rules
    };
  }

  /**
   * Ação: Adicionar uma nova regra.
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
   * Ação: Editar uma regra existente.
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
   * Ação: Alternar ativação de uma regra.
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
   * Ação: Excluir uma regra após confirmação.
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
