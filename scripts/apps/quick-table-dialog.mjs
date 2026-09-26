import { MadnessEngine } from "../madness-engine.mjs";
import { TableSerializer } from "../utils/table-serializer.mjs";
import { DiceRangeCalculator } from "../domain/dice-range-calculator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * RollTables Hub:
 * 1. Quick text-based creator
 * 2. Export to JSON, CSV, and Markdown
 * 3. File import across worlds and tools
 */
export class QuickTableDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.onCreated = options.onCreated || null;
    this.targetMode = options.targetMode || (options.setAsMadness ? "physical" : "");
    this.activeTab = options.initialTab || "create";
    this.exportFormat = "json";
    this.pendingImportData = null;
    this.selectedDie = options.initialDie || "auto";
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

    const createForm = this.element.querySelector(".quick-table-create-form");
    if (createForm) {
      createForm.addEventListener("submit", (e) => this.#onFormSubmit(e));
      
      const textarea = createForm.querySelector("textarea[name='rawText']");
      const formulaInput = createForm.querySelector("input[name='formula']");
      const lineCountSpan = createForm.querySelector(".line-count");
      const distTextSpan = createForm.querySelector(".distribution-text");
      const presetButtons = createForm.querySelectorAll(".btn-dice-preset");

      const updateDistributionUI = () => {
        const parsedItems = DiceRangeCalculator.parseLines(textarea?.value || "");
        const count = parsedItems.length;

        if (lineCountSpan) {
          lineCountSpan.textContent = count;
        }

        if (this.selectedDie === "auto" && formulaInput) {
          formulaInput.value = count > 0 ? `1d${count}` : "1d6";
        }

        const currentFormula = formulaInput?.value?.trim() || (count > 0 ? `1d${count}` : "1d6");
        const { min, max } = DiceRangeCalculator.parseFormulaMinMax(currentFormula, count || 6);

        if (distTextSpan) {
          if (count === 0) {
            distTextSpan.textContent = game.i18n.localize("ROLAGENS_GLOBAIS.QuickTable.DistributionDefault");
          } else if (max < count) {
            distTextSpan.innerHTML = `<span style="color: #ff9e00;"><i class="fas fa-exclamation-triangle"></i> Warning: Formula <strong>${currentFormula}</strong> has ${max} values for ${count} options (${count - max} options will not be rolled).</span>`;
          } else if (max === count && min === 1) {
            distTextSpan.innerHTML = `<span><i class="fas fa-check-circle" style="color: #4caf50;"></i> 1-to-1 distribution: <strong>${currentFormula}</strong> (${count} options, each from 1 to ${max}).</span>`;
          } else {
            const avgSpan = ((max - min + 1) / count).toFixed(1);
            distTextSpan.innerHTML = `<span><i class="fas fa-chart-pie" style="color: #64b5f6;"></i> Proportional distribution: <strong>${currentFormula}</strong> (${count} options cover ${min} to ${max}, ~${avgSpan} values per option).</span>`;
          }
        }
      };

      presetButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const die = btn.dataset.die;
          this.selectedDie = die;

          presetButtons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");

          if (die === "auto") {
            const parsed = DiceRangeCalculator.parseLines(textarea?.value || "");
            if (formulaInput) formulaInput.value = parsed.length > 0 ? `1d${parsed.length}` : "1d6";
          } else {
            if (formulaInput) formulaInput.value = die;
          }

          updateDistributionUI();
        });
      });

      // Listener para digitação manual na fórmula
      if (formulaInput) {
        formulaInput.addEventListener("input", () => {
          const val = formulaInput.value.trim().toLowerCase();
          let matchedPreset = false;
          presetButtons.forEach(btn => {
            if (btn.dataset.die === val) {
              btn.classList.add("active");
              this.selectedDie = val;
              matchedPreset = true;
            } else {
              btn.classList.remove("active");
            }
          });
          if (!matchedPreset) {
            this.selectedDie = "custom";
          }
          updateDistributionUI();
        });
      }

      if (textarea) {
        textarea.addEventListener("input", updateDistributionUI);
      }

      updateDistributionUI();
    }

    // Configuração da Aba 2: Mudança de formato de exportação
    const formatCards = this.element.querySelectorAll(".format-card");
    formatCards.forEach(card => {
      card.addEventListener("click", () => {
        const format = card.dataset.format;
        if (format) {
          this.exportFormat = format;
          const radio = card.querySelector("input[type='radio']");
          if (radio) radio.checked = true;
          formatCards.forEach(c => c.classList.remove("selected"));
          card.classList.add("selected");
        }
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
   * Processes the selected file for import and displays preview.
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
          // Text file (.txt or .md)
          const items = DiceRangeCalculator.parseLines(content);
          tablesToCreate = [{
            name: fileName.replace(/\.[^/.]+$/, ""),
            formula: `1d${items.length}`,
            results: items.map((item, i) => ({
              type: CONST.TABLE_RESULT_TYPES.TEXT,
              text: item.text,
              range: item.explicitRange || [i + 1, i + 1],
              weight: 1,
              drawn: false
            })),
            displayRoll: true,
            replacement: true
          }];
        }

        if (!tablesToCreate || tablesToCreate.length === 0) {
          throw new Error("No valid tables found in file.");
        }

        this.pendingImportData = tablesToCreate;

        const previewBox = this.element.querySelector(".import-preview-box");
        const fileNameLabel = this.element.querySelector(".file-name-label");
        const previewContent = this.element.querySelector(".preview-content");
        const importBtn = this.element.querySelector(".btn-import-trigger");

        if (previewBox && fileNameLabel && previewContent && importBtn) {
          fileNameLabel.textContent = `${fileName} (${tablesToCreate.length} table(s) detected)`;
          previewContent.innerHTML = tablesToCreate.map(t => `
            <div class="preview-table-item">
              <strong>${t.name}</strong> <span>(${t.results?.length || t.results?.size || 0} results, formula: ${t.formula || "1d20"})</span>
            </div>
          `).join("");
          previewBox.style.display = "block";
          importBtn.removeAttribute("disabled");
        }

        ui.notifications.info(`File "${fileName}" loaded! Click "Import Tables" to import into the world.`);
      } catch (err) {
        console.error("Rolagens Globais | Error reading file:", err);
        ui.notifications.error(`Error processing file: ${err.message}`);
      }
    };

    reader.readAsText(file);
  }

  // --- Hub Actions ---

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
   * Executes export of selected tables in the chosen format.
   */
  static #onDoExport(event, target) {
    const checkedBoxes = Array.from(this.element.querySelectorAll(".export-table-checkbox:checked"));
    if (checkedBoxes.length === 0) {
      ui.notifications.warn("Please select at least one table to export.");
      return;
    }

    const selectedIds = checkedBoxes.map(cb => cb.value);
    const tables = selectedIds.map(id => game.tables.get(id)).filter(Boolean);

    if (tables.length === 0) {
      ui.notifications.warn("No valid tables were found.");
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const baseName = tables.length === 1 ? tables[0].name.slugify() : `exported-tables-${timestamp}`;

    if (this.exportFormat === "json") {
      const data = TableSerializer.exportToJSON(tables);
      TableSerializer.triggerDownload(data, "application/json", `${baseName}.json`);
      ui.notifications.info(`Successfully exported ${tables.length} table(s) as JSON!`);
    } else if (this.exportFormat === "csv") {
      const data = TableSerializer.exportToCSV(tables);
      TableSerializer.triggerDownload(data, "text/csv;charset=utf-8;", `${baseName}.csv`);
      ui.notifications.info(`Successfully exported ${tables.length} table(s) as CSV!`);
    } else if (this.exportFormat === "md") {
      const data = TableSerializer.exportToMarkdown(tables);
      TableSerializer.triggerDownload(data, "text/markdown;charset=utf-8;", `${baseName}.md`);
      ui.notifications.info(`Successfully exported ${tables.length} table(s) as Markdown!`);
    }
  }

  /**
   * Executes import of processed tables into the world.
   */
  static async #onDoImport(event, target) {
    if (!this.pendingImportData || this.pendingImportData.length === 0) {
      ui.notifications.warn("No pending data to import.");
      return;
    }

    try {
      const createdTables = await RollTable.createDocuments(this.pendingImportData);
      ui.notifications.info(`Successfully imported ${createdTables.length} table(s) into the world!`);

      if (typeof this.onCreated === "function") {
        this.onCreated(createdTables);
      }

      this.close();
    } catch (err) {
      console.error("Rolagens Globais | Error importing tables:", err);
      ui.notifications.error(`Error saving tables to world: ${err.message}`);
    }
  }

  // Delegate formula and range calculation to DiceRangeCalculator
  static parseFormulaMinMax(formula, defaultMax = 20) {
    return DiceRangeCalculator.parseFormulaMinMax(formula, defaultMax);
  }

  static calculateProportionalRanges(count, min, max) {
    return DiceRangeCalculator.calculateProportionalRanges(count, min, max);
  }

  async #onFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const name = formData.get("name")?.toString().trim() || "New RollTable";
    const description = formData.get("description")?.toString().trim() || "";
    const rawText = formData.get("rawText")?.toString() || "";
    const setTarget = formData.get("setTarget")?.toString() || "";

    const parsedItems = DiceRangeCalculator.parseLines(rawText);
    if (parsedItems.length === 0) {
      ui.notifications.warn(game.i18n.localize("ROLAGENS_GLOBAIS.QuickTable.EmptyWarn"));
      return;
    }

    const customFormula = formData.get("formula")?.toString().trim();
    const formula = customFormula || `1d${parsedItems.length}`;

    const { min, max } = DiceRangeCalculator.parseFormulaMinMax(formula, parsedItems.length);
    const proportionalRanges = DiceRangeCalculator.calculateProportionalRanges(parsedItems.length, min, max);

    const results = [];
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const range = item.explicitRange || proportionalRanges[i];
      const lineText = item.text;

      let isTable = false;
      let targetTable = null;
      let displayText = lineText;

      const tablePrefixMatch = lineText.match(/^(?:tabela|table|@):\s*(.+)$/i);
      if (tablePrefixMatch) {
        const searchName = tablePrefixMatch[1].trim();
        targetTable = game.tables.getName(searchName) || game.tables.get(searchName);
        if (targetTable) {
          isTable = true;
          displayText = targetTable.name;
        }
      } else {
        const matchTable = game.tables.getName(lineText);
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

    ui.notifications.info(`Table "${createdTable.name}" created successfully with ${results.length} results (${formula})!`);

    const modeName = MadnessEngine.getModeName();
    if (setTarget === "physical") {
      await MadnessEngine.saveConfig({ physicalTableId: createdTable.id });
      ui.notifications.info(`Table "${createdTable.name}" assigned to Physical Attacks in "${modeName}"!`);
    } else if (setTarget === "magic") {
      await MadnessEngine.saveConfig({ magicTableId: createdTable.id });
      ui.notifications.info(`Table "${createdTable.name}" assigned to Spells in "${modeName}"!`);
    }

    if (typeof this.onCreated === "function") {
      this.onCreated(createdTable);
    }

    this.close();
  }
}
