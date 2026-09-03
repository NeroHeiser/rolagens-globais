import { MadnessEngine } from "../madness-engine.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Diálogo para criação e importação ultra-rápida de Tabelas Roláveis no Foundry VTT.
 * Suporta colagem de texto simples, remoção de numeração e detecção de tabelas aninhadas.
 */
export class QuickTableDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.onCreated = options.onCreated || null;
    this.targetMode = options.targetMode || (options.setAsMadness ? "physical" : "");
  }

  static DEFAULT_OPTIONS = {
    id: "rolagens-globais-quick-table",
    classes: ["rolagens-globais", "quick-table-window"],
    tag: "div",
    window: {
      title: "ROLAGENS_GLOBAIS.QuickTable.Title",
      icon: "fas fa-bolt",
      resizable: true
    },
    position: {
      width: 680,
      height: 720
    },
    actions: {
      cancel: QuickTableDialog.#onCancel
    }
  };

  static PARTS = {
    main: {
      template: "modules/rolagens-globais/templates/quick-table-dialog.hbs"
    }
  };

  async _prepareContext(options) {
    const modeName = MadnessEngine.getModeName();
    return {
      targetMode: this.targetMode,
      isPhysicalTarget: this.targetMode === "physical",
      isMagicTarget: this.targetMode === "magic",
      modeName
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element.querySelector("form");
    if (form) {
      form.addEventListener("submit", (e) => this.#onFormSubmit(e));
      
      const textarea = form.querySelector("textarea[name='rawText']");
      const formulaInput = form.querySelector("input[name='formula']");
      const lineCountSpan = form.querySelector(".line-count");

      if (textarea && formulaInput) {
        const updateCount = () => {
          const lines = this.#parseLines(textarea.value);
          if (lineCountSpan) {
            lineCountSpan.textContent = lines.length;
          }
          if (lines.length > 0) {
            formulaInput.value = `1d${lines.length}`;
          }
        };

        textarea.addEventListener("input", updateCount);
        updateCount();
      }
    }
  }

  static #onCancel(event, target) {
    this.close();
  }

  /**
   * Limpa e divide o texto em linhas úteis, removendo numerações prefixadas.
   */
  #parseLines(rawText) {
    return (rawText || "")
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => {
        // Remove numeração opcional do início: "1. ", "1 - ", "1) ", "[1] "
        return l.replace(/^(\[\d+\]|\d+[\.\-\)]\s*)/, "").trim();
      })
      .filter(l => l.length > 0);
  }

  async #onFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const name = formData.get("name")?.toString().trim() || "Nova Tabela Rolável";
    const description = formData.get("description")?.toString().trim() || "";
    const rawText = formData.get("rawText")?.toString() || "";
    const setTarget = formData.get("setTarget")?.toString() || "";

    const lines = this.#parseLines(rawText);
    if (lines.length === 0) {
      ui.notifications.warn(game.i18n.localize("ROLAGENS_GLOBAIS.QuickTable.EmptyWarn"));
      return;
    }

    const customFormula = formData.get("formula")?.toString().trim();
    const formula = customFormula || `1d${lines.length}`;

    // Constrói os resultados da tabela
    const results = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const range = [i + 1, i + 1];

      // Verifica se é uma Tabela Aninhada (prefixo "tabela:", "table:" ou nome exato existente)
      let isTable = false;
      let targetTable = null;
      let displayText = line;

      const tablePrefixMatch = line.match(/^(?:tabela|table|@):\s*(.+)$/i);
      if (tablePrefixMatch) {
        const searchName = tablePrefixMatch[1].trim();
        targetTable = game.tables.getName(searchName) || game.tables.get(searchName);
        if (targetTable) {
          isTable = true;
          displayText = targetTable.name;
        }
      } else {
        // Busca por correspondência exata de nome de tabela no mundo
        const matchTable = game.tables.getName(line);
        if (matchTable) {
          isTable = true;
          targetTable = matchTable;
          displayText = matchTable.name;
        }
      }

      if (isTable && targetTable) {
        results.push({
          type: CONST.TABLE_RESULT_TYPES.DOCUMENT,
          documentCollection: "RollTable",
          documentId: targetTable.id,
          text: displayText,
          img: targetTable.img || "icons/svg/d20-grey.svg",
          range,
          weight: 1,
          drawn: false
        });
      } else {
        results.push({
          type: CONST.TABLE_RESULT_TYPES.TEXT,
          text: displayText,
          img: "icons/svg/d20-grey.svg",
          range,
          weight: 1,
          drawn: false
        });
      }
    }

    // Cria o documento oficial no Foundry VTT
    const createdTable = await RollTable.create({
      name,
      description,
      formula,
      results,
      displayRoll: true,
      replacement: true
    });

    ui.notifications.info(`Tabela "${createdTable.name}" criada com sucesso com ${results.length} resultados!`);

    // Vincula automaticamente à categoria escolhida
    const modeName = MadnessEngine.getModeName();
    if (setTarget === "physical") {
      await MadnessEngine.saveConfig({ physicalTableId: createdTable.id });
      ui.notifications.info(`Tabela "${createdTable.name}" definida para Ataques Físicos em "${modeName}"!`);
    } else if (setTarget === "magic") {
      await MadnessEngine.saveConfig({ magicTableId: createdTable.id });
      ui.notifications.info(`Tabela "${createdTable.name}" definida para Magias em "${modeName}"!`);
    }

    if (typeof this.onCreated === "function") {
      this.onCreated(createdTable);
    }

    this.close();
  }
}
