import { MadnessEngine } from "../madness-engine.mjs";
import { TableSerializer } from "../utils/table-serializer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Central de Tabelas Roláveis:
 * 1. Criador Rápido por Texto
 * 2. Exportação para JSON, CSV e Markdown
 * 3. Importação de Arquivos entre mundos e programas
 */
export class QuickTableDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.onCreated = options.onCreated || null;
    this.targetMode = options.targetMode || (options.setAsMadness ? "physical" : "");
    this.activeTab = options.initialTab || "create";
    this.exportFormat = "json";
    this.pendingImportData = null;
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
      width: 700,
      height: 720
    },
    actions: {
      setTab: QuickTableDialog.#onSetTab,
      cancel: QuickTableDialog.#onCancel,
      selectAllTables: QuickTableDialog.#onSelectAllTables,
      deselectAllTables: QuickTableDialog.#onDeselectAllTables,
      doExport: QuickTableDialog.#onDoExport,
      triggerFileInput: QuickTableDialog.#onTriggerFileInput,
      doImport: QuickTableDialog.#onDoImport
    }
  };

  static PARTS = {
    main: {
      template: "modules/rolagens-globais/templates/quick-table-dialog.hbs"
    }
  };

  async _prepareContext(options) {
    const modeName = MadnessEngine.getModeName();
    
    // Lista de tabelas existentes no mundo para a aba de exportação
    const worldTables = game.tables.map(t => ({
      id: t.id,
      name: t.name,
      img: t.img || "icons/svg/d20-grey.svg",
      resultsCount: t.results?.size || 0
    }));

    return {
      activeTab: this.activeTab,
      exportFormat: this.exportFormat,
      targetMode: this.targetMode,
      isPhysicalTarget: this.targetMode === "physical",
      isMagicTarget: this.targetMode === "magic",
      modeName,
      worldTables
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Configuração da Aba 1: Criador Rápido
    const createForm = this.element.querySelector(".quick-table-create-form");
    if (createForm) {
      createForm.addEventListener("submit", (e) => this.#onFormSubmit(e));
      
      const textarea = createForm.querySelector("textarea[name='rawText']");
      const formulaInput = createForm.querySelector("input[name='formula']");
      const lineCountSpan = createForm.querySelector(".line-count");

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

    // Configuração da Aba 2: Mudança de formato de exportação
    const formatRadios = this.element.querySelectorAll("input[name='exportFormat']");
    formatRadios.forEach(radio => {
      radio.addEventListener("change", (e) => {
        this.exportFormat = e.target.value;
        this.element.querySelectorAll(".format-card").forEach(card => card.classList.remove("selected"));
        e.target.closest(".format-card")?.classList.add("selected");
      });
    });

    // Configuração da Aba 3: Drag & Drop e Leitura de Arquivo
    const dropZone = this.element.querySelector("#file-drop-zone");
    const fileInput = this.element.querySelector(".import-file-input");

    if (dropZone && fileInput) {
      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });

      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
      });

      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files?.length) {
          this.#handleFileLoad(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener("change", (e) => {
        if (e.target.files?.length) {
          this.#handleFileLoad(e.target.files[0]);
        }
      });
    }
  }

  /**
   * Processa o arquivo selecionado para importação e exibe prévia.
   */
  #handleFileLoad(file) {
    const reader = new FileReader();
    const fileName = file.name;
    const ext = fileName.split(".").pop().toLowerCase();

    reader.onload = (e) => {
      try {
        const content = e.target.result;
        let tablesToCreate = [];

        if (ext === "json") {
          tablesToCreate = TableSerializer.parseJSON(content);
        } else if (ext === "csv") {
          tablesToCreate = TableSerializer.parseCSV(content);
        } else {
          // Arquivo de texto (.txt ou .md)
          const lines = this.#parseLines(content);
          tablesToCreate = [{
            name: fileName.replace(/\.[^/.]+$/, ""),
            formula: `1d${lines.length}`,
            results: lines.map((l, i) => ({
              type: CONST.TABLE_RESULT_TYPES.TEXT,
              text: l,
              range: [i + 1, i + 1],
              weight: 1,
              drawn: false
            })),
            displayRoll: true,
            replacement: true
          }];
        }

        if (!tablesToCreate || tablesToCreate.length === 0) {
          throw new Error("Nenhuma tabela válida encontrada no arquivo.");
        }

        this.pendingImportData = tablesToCreate;

        // Exibe a prévia no modal
        const previewBox = this.element.querySelector(".import-preview-box");
        const fileNameLabel = this.element.querySelector(".file-name-label");
        const previewContent = this.element.querySelector(".preview-content");
        const importBtn = this.element.querySelector(".btn-import-trigger");

        if (previewBox && fileNameLabel && previewContent && importBtn) {
          fileNameLabel.textContent = `${fileName} (${tablesToCreate.length} tabela(s) detectada(s))`;
          previewContent.innerHTML = tablesToCreate.map(t => `
            <div class="preview-table-item">
              <strong>${t.name}</strong> <span>(${t.results?.length || t.results?.size || 0} resultados, fórmula: ${t.formula || "1d20"})</span>
            </div>
          `).join("");
          previewBox.style.display = "block";
          importBtn.removeAttribute("disabled");
        }

        ui.notifications.info(`Arquivo "${fileName}" carregado! Clique em "Importar Tabelas" para salvar no mundo.`);
      } catch (err) {
        console.error("Rolagens Globais | Erro ao ler arquivo:", err);
        ui.notifications.error(`Erro ao processar arquivo: ${err.message}`);
      }
    };

    reader.readAsText(file);
  }

  // --- Ações do Hub ---

  static #onSetTab(event, target) {
    const tab = target.dataset.tab;
    if (tab) {
      this.activeTab = tab;
      this.render({ force: true });
    }
  }

  static #onCancel(event, target) {
    this.close();
  }

  static #onSelectAllTables(event, target) {
    const checkboxes = this.element.querySelectorAll(".export-table-checkbox");
    checkboxes.forEach(cb => cb.checked = true);
  }

  static #onDeselectAllTables(event, target) {
    const checkboxes = this.element.querySelectorAll(".export-table-checkbox");
    checkboxes.forEach(cb => cb.checked = false);
  }

  static #onTriggerFileInput(event, target) {
    const fileInput = this.element.querySelector(".import-file-input");
    fileInput?.click();
  }

  /**
   * Executa a exportação das tabelas selecionadas no formato escolhido.
   */
  static #onDoExport(event, target) {
    const checkedBoxes = Array.from(this.element.querySelectorAll(".export-table-checkbox:checked"));
    if (checkedBoxes.length === 0) {
      ui.notifications.warn("Por favor, selecione ao menos uma tabela para exportar.");
      return;
    }

    const selectedIds = checkedBoxes.map(cb => cb.value);
    const tables = selectedIds.map(id => game.tables.get(id)).filter(Boolean);

    if (tables.length === 0) {
      ui.notifications.warn("Nenhuma tabela válida foi encontrada.");
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const baseName = tables.length === 1 ? tables[0].name.slugify() : `tabelas-exportadas-${timestamp}`;

    if (this.exportFormat === "json") {
      const data = TableSerializer.exportToJSON(tables);
      TableSerializer.triggerDownload(data, "application/json", `${baseName}.json`);
      ui.notifications.info(`${tables.length} tabela(s) exportada(s) como JSON com sucesso!`);
    } else if (this.exportFormat === "csv") {
      const data = TableSerializer.exportToCSV(tables);
      TableSerializer.triggerDownload(data, "text/csv;charset=utf-8;", `${baseName}.csv`);
      ui.notifications.info(`${tables.length} tabela(s) exportada(s) como Planilha CSV com sucesso!`);
    } else if (this.exportFormat === "md") {
      const data = TableSerializer.exportToMarkdown(tables);
      TableSerializer.triggerDownload(data, "text/markdown;charset=utf-8;", `${baseName}.md`);
      ui.notifications.info(`${tables.length} tabela(s) exportada(s) como Markdown com sucesso!`);
    }
  }

  /**
   * Executa a importação dos dados processados para o mundo.
   */
  static async #onDoImport(event, target) {
    if (!this.pendingImportData || this.pendingImportData.length === 0) {
      ui.notifications.warn("Nenhum dado pendente para importação.");
      return;
    }

    try {
      const createdTables = await RollTable.createDocuments(this.pendingImportData);
      ui.notifications.info(`🎉 ${createdTables.length} tabela(s) importada(s) com sucesso para o mundo!`);

      if (typeof this.onCreated === "function") {
        this.onCreated(createdTables);
      }

      this.close();
    } catch (err) {
      console.error("Rolagens Globais | Erro ao importar tabelas:", err);
      ui.notifications.error(`Erro ao salvar tabelas no mundo: ${err.message}`);
    }
  }

  // --- Auxiliares de Criação de Texto ---

  #parseLines(rawText) {
    return (rawText || "")
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => l.replace(/^(\[\d+\]|\d+[\.\-\)]\s*)/, "").trim())
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

    const results = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const range = [i + 1, i + 1];

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

    const createdTable = await RollTable.create({
      name,
      description,
      formula,
      results,
      displayRoll: true,
      replacement: true
    });

    ui.notifications.info(`Tabela "${createdTable.name}" criada com sucesso com ${results.length} resultados!`);

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
