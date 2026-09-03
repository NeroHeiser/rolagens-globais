import { getActiveAdapter } from "../adapters/index.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Diálogo para criar ou editar uma regra de Rolagem Extra.
 */
export class RuleDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.rule = options.rule || this.#createDefaultRule();
    this.onSave = options.onSave || (() => {});
  }

  static DEFAULT_OPTIONS = {
    id: "rolagens-globais-rule-dialog",
    classes: ["rolagens-globais", "rule-dialog-window"],
    tag: "div",
    window: {
      title: "ROLAGENS_GLOBAIS.Rule.NewRuleTitle",
      icon: "fas fa-cog",
      resizable: true
    },
    position: {
      width: 580,
      height: 640
    },
    actions: {
      cancel: RuleDialog.#onCancel,
      changeEffectType: RuleDialog.#onChangeEffectType
    }
  };

  static PARTS = {
    main: {
      template: "modules/rolagens-globais/templates/rule-dialog.hbs"
    }
  };

  #createDefaultRule() {
    return {
      id: foundry.utils.randomID(),
      name: "",
      enabled: true,
      actionType: "any",
      resultType: "any",
      dieType: "any",
      dieFace: "",
      totalComparison: "none",
      totalValue: "",
      keyword: "",
      effectType: "table",
      tableId: "",
      formula: "1d100",
      macroId: "",
      visibility: "public",
      flavor: ""
    };
  }

  async _prepareContext(options) {
    const adapter = getActiveAdapter();

    return {
      rule: this.rule,
      actionTypes: adapter.getActionTypes(),
      resultTypes: adapter.getResultTypes(),
      tables: game.tables.contents.map(t => ({ id: t.id, name: t.name })),
      macros: game.macros.contents.map(m => ({ id: m.id, name: m.name }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;
    const form = html.querySelector("form");
    if (!form) return;

    // Listener para o submit do formulário
    form.addEventListener("submit", (e) => this.#onFormSubmit(e));

    // Listener para mudança dinâmica no tipo de efeito
    const effectSelect = form.querySelector('[name="effectType"]');
    if (effectSelect) {
      effectSelect.addEventListener("change", (e) => {
        this.#updateEffectFieldsVisibility(html, e.target.value);
      });
      this.#updateEffectFieldsVisibility(html, effectSelect.value);
    }
  }

  #updateEffectFieldsVisibility(html, effectType) {
    const tableGroup = html.querySelector(".effect-table-group");
    const rollGroup = html.querySelector(".effect-roll-group");
    const macroGroup = html.querySelector(".effect-macro-group");

    if (tableGroup) tableGroup.style.display = effectType === "table" ? "block" : "none";
    if (rollGroup) rollGroup.style.display = effectType === "roll" ? "block" : "none";
    if (macroGroup) macroGroup.style.display = effectType === "macro" ? "block" : "none";
  }

  static #onChangeEffectType(event, target) {
    // Tratado via _onRender event listener
  }

  static #onCancel(event, target) {
    this.close();
  }

  async #onFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const updatedRule = {
      id: this.rule.id || foundry.utils.randomID(),
      name: formData.get("name")?.toString().trim() || "Nova Regra",
      enabled: formData.get("enabled") === "on",
      actionType: formData.get("actionType")?.toString() || "any",
      resultType: formData.get("resultType")?.toString() || "any",
      dieType: formData.get("dieType")?.toString() || "any",
      dieFace: formData.get("dieFace") ? Number(formData.get("dieFace")) : null,
      totalComparison: formData.get("totalComparison")?.toString() || "none",
      totalValue: formData.get("totalValue") ? Number(formData.get("totalValue")) : null,
      keyword: formData.get("keyword")?.toString().trim() || "",
      effectType: formData.get("effectType")?.toString() || "table",
      tableId: formData.get("tableId")?.toString() || "",
      formula: formData.get("formula")?.toString().trim() || "",
      macroId: formData.get("macroId")?.toString() || "",
      visibility: formData.get("visibility")?.toString() || "public",
      flavor: formData.get("flavor")?.toString().trim() || ""
    };

    if (this.onSave) {
      await this.onSave(updatedRule);
    }

    this.close();
  }
}

