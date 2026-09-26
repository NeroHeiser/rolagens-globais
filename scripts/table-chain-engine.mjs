/**
 * Reactive engine for detecting and automatically triggering chained subtables.
 * When the result of a RollTable contains references to other tables
 * (e.g., "table: Wild Magic 17", "@UUID[RollTable...]"),
 * TableChainEngine locates and draws the subtable automatically.
 */
export class TableChainEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_ENABLED = "tableChainEnabled";
  static SETTING_MAX_DEPTH = "tableChainMaxDepth";
  static SETTING_DELAY = "tableChainDelay";
  static SETTING_DICE_ENABLED = "tableDiceEnabled";
  static SETTING_DICE_UPDATE_CHAT = "tableDiceUpdateChat";

  static #processedIds = new Set();
  static #isExecuting = false;

  /**
   * Registers subtable chaining settings in Foundry VTT.
   */
  static registerSettings() {
    game.settings.register(this.MODULE_ID, this.SETTING_ENABLED, {
      name: game.i18n.localize("ROLAGENS_GLOBAIS.TableChain.SettingEnabled.Name"),
      hint: game.i18n.localize("ROLAGENS_GLOBAIS.TableChain.SettingEnabled.Hint"),
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(this.MODULE_ID, this.SETTING_MAX_DEPTH, {
      name: game.i18n.localize("ROLAGENS_GLOBAIS.TableChain.SettingMaxDepth.Name"),
      hint: game.i18n.localize("ROLAGENS_GLOBAIS.TableChain.SettingMaxDepth.Hint"),
      scope: "world",
      config: true,
      type: Number,
      default: 5
    });

    game.settings.register(this.MODULE_ID, this.SETTING_DELAY, {
      name: game.i18n.localize("ROLAGENS_GLOBAIS.TableChain.SettingDelay.Name"),
      hint: game.i18n.localize("ROLAGENS_GLOBAIS.TableChain.SettingDelay.Hint"),
      scope: "world",
      config: false,
      type: Number,
      default: 600
    });

    game.settings.register(this.MODULE_ID, this.SETTING_DICE_ENABLED, {
      name: game.i18n.localize("ROLAGENS_GLOBAIS.TableDice.SettingEnabled.Name"),
      hint: game.i18n.localize("ROLAGENS_GLOBAIS.TableDice.SettingEnabled.Hint"),
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(this.MODULE_ID, this.SETTING_DICE_UPDATE_CHAT, {
      name: game.i18n.localize("ROLAGENS_GLOBAIS.TableDice.SettingUpdateChat.Name"),
      hint: game.i18n.localize("ROLAGENS_GLOBAIS.TableDice.SettingUpdateChat.Hint"),
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
  }

  /**
   * Initializes the chat message listener hook.
   */
  static initialize() {
    Hooks.on("createChatMessage", (message, options, userId) => {
      this.#onChatMessageCreated(message);
    });

    console.log("Rolagens Globais | TableChainEngine initialized successfully.");
  }

  /**
   * Chat message creation handler.
   * @param {ChatMessage} message
   */
  static async #onChatMessageCreated(message) {
    const isEnabled = game.settings.get(this.MODULE_ID, this.SETTING_ENABLED) ?? true;
    if (!isEnabled) return;

    if (!this.#canExecute()) return;
    if (this.#processedIds.has(message.id)) return;

    const isTableMessage = 
      message.isRollTable || 
      !!message.flags?.core?.RollTable || 
      !!message.flags?.core?.table ||
      (message.content && (
        message.content.includes("table-result") || 
        message.content.includes("table-draw") || 
        message.content.includes("result-text")
      ));

    if (!isTableMessage) return;

    const maxDepth = game.settings.get(this.MODULE_ID, this.SETTING_MAX_DEPTH) || 5;
    const currentDepth = message.flags?.[this.MODULE_ID]?.chainDepth || 0;

    if (currentDepth >= maxDepth) {
      console.warn(`Rolagens Globais | Maximum chained subtable depth reached (${maxDepth}). Halting to prevent infinite loop.`);
      return;
    }

    this.#processedIds.add(message.id);

    // 6. Recupera a tabela de origem, se houver
    const sourceTableId = message.flags?.core?.RollTable;
    let sourceTable = null;
    if (sourceTableId) {
      sourceTable = game.tables.get(sourceTableId);
      if (!sourceTable) {
        try {
          sourceTable = await fromUuid(sourceTableId);
        } catch {
          sourceTable = null;
        }
      }
    }

    // 7. Coleta os textos dos resultados sorteados
    const resultTexts = this.#extractResultTexts(message, sourceTable);
    if (resultTexts.length === 0) return;

    // 8. Rolagem Automática de Dados ("Xdx") encontrados nos resultados
    const isDiceEnabled = game.settings.get(this.MODULE_ID, this.SETTING_DICE_ENABLED) ?? true;
    if (isDiceEnabled) {
      await this.#processDiceRolls(message, resultTexts, sourceTable);
    }

    // 9. Extrai referências a subtabelas em cada texto
    const candidateNames = new Set();
    for (const text of resultTexts) {
      const names = this.#parseTableReferences(text);
      for (const name of names) {
        candidateNames.add(name);
      }
    }

    if (candidateNames.size === 0) return;

    // 9. Localiza os documentos das tabelas no mundo ou compêndios
    const tablesToDraw = [];
    for (const query of candidateNames) {
      const found = await this.findTable(query, sourceTable);
      if (found && !tablesToDraw.some(t => t.id === found.id)) {
        tablesToDraw.push(found);
      }
    }

    if (tablesToDraw.length === 0) return;

    // 10. Executa o sorteio de cada subtabela encontrada
    const delayMs = game.settings.get(this.MODULE_ID, this.SETTING_DELAY) || 600;
    const rollMode = this.#resolveRollMode(message);

    for (const subTable of tablesToDraw) {
      console.log(`Rolagens Globais | Chained subtable triggered: "${subTable.name}" (Depth ${currentDepth + 1})`);
      
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }

      try {
        const subtableLabel = game.i18n.localize("ROLAGENS_GLOBAIS.TableChain.SubTableBadge") || "Subtable";
        await subTable.draw({
          recursive: true,
          rollMode,
          messageData: {
            speaker: message.speaker,
            flavor: `<div class="rolagens-globais-badge"><i class="fas fa-link"></i> ${subtableLabel}: <strong>${subTable.name}</strong></div>`,
            flags: {
              [this.MODULE_ID]: {
                isChainedRoll: true,
                chainDepth: currentDepth + 1,
                parentTableId: sourceTable?.id || null
              }
            }
          }
        });
      } catch (err) {
        console.error(`Rolagens Globais | Error drawing subtable "${subTable.name}":`, err);
      }
    }
  }

  /**
   * Processes and rolls dice formulas (e.g. "1d4 Common Healing Reagents") found within table results.
   * @param {ChatMessage} message - Original table draw chat message
   * @param {string[]} resultTexts - Text results drawn from table
   * @param {RollTable|null} sourceTable - Source table
   */
  static async #processDiceRolls(message, resultTexts, sourceTable) {
    const rollMode = this.#resolveRollMode(message);
    const tableName = sourceTable ? sourceTable.name : "Table";
    const shouldUpdateChat = game.settings.get(this.MODULE_ID, this.SETTING_DICE_UPDATE_CHAT) ?? true;

    const replacements = [];

    for (const text of resultTexts) {
      const formulas = this.#parseDiceFormulas(text);
      if (formulas.length === 0) continue;

      for (const formula of formulas) {
        try {
          const roll = new Roll(formula);
          await roll.evaluate();

          const replacedDescription = text.replace(new RegExp(`\\b${formula}\\b`, "i"), `<strong>${roll.total}</strong>`);

          console.log(`Rolagens Globais | Table dice roll for "${tableName}": ${formula} = ${roll.total}`);

          await roll.toMessage({
            speaker: message.speaker,
            flavor: `<div class="rolagens-globais-badge"><i class="fas fa-dice"></i> ${tableName}: ${replacedDescription}</div>`,
            flags: {
              [this.MODULE_ID]: {
                isExtraRoll: true,
                isTableDiceRoll: true,
                parentMessageId: message.id
              }
            }
          }, { rollMode });

          replacements.push({ formula, total: roll.total });
        } catch (err) {
          console.error(`Rolagens Globais | Error rolling table dice ("${formula}"):`, err);
        }
      }
    }

    if (shouldUpdateChat && replacements.length > 0 && message.content && game.user.isGM) {
      await this.#updateTableMessageWithRolls(message, replacements);
    }
  }

  /**
   * Updates original chat message HTML content to show rolled totals instead of raw formula strings.
   * @param {ChatMessage} message
   * @param {Array<{formula: string, total: number}>} replacements
   */
  static async #updateTableMessageWithRolls(message, replacements) {
    try {
      let content = message.content;
      let modified = false;

      for (const { formula, total } of replacements) {
        const regex = new RegExp(`\\b${formula}\\b`, "gi");
        if (regex.test(content)) {
          content = content.replace(regex, `<a class="inline-roll inline-result" data-mode="roll" data-formula="${formula}" title="${formula} (Rolled automatically)"><i class="fas fa-dice-d20"></i> ${total}</a>`);
          modified = true;
        }
      }

      if (modified) {
        await message.update({ content });
      }
    } catch (err) {
      console.warn("Rolagens Globais | Could not update table chat card:", err);
    }
  }

  /**
   * Analisa um texto e extrai fórmulas de dados válidas (ex: "1d4", "1d2", "2d6+1", "[[/r 1d4]]").
   * Ignora fórmulas que façam parte de gatilhos de subtabelas (ex: "role 1d20 na tabela...").
   * @param {string} text
   * @returns {string[]}
   */
  static #parseDiceFormulas(text) {
    if (!text || typeof text !== "string") return [];

    // 1. Remove menções a rolagens de subtabela (ex: "role 1d20 na tabela...")
    const cleanText = text.replace(/(?:role|rolar|roll|jogar)\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(?:na|no|em|on)\s+(?:uma\s+)?(?:tabela|table)/gi, "");

    const formulas = [];

    // Native Foundry inline rolls: [[/r 1d4]] or [[1d4]]
    const inlineRegex = /\[\[(?:\/r\s+)?(\d+d\d+(?:\s*[+-]\s*\d+)?)\]\]/gi;
    let m;
    while ((m = inlineRegex.exec(cleanText)) !== null) {
      const f = m[1].replace(/\s+/g, "");
      if (!formulas.includes(f)) {
        formulas.push(f);
      }
    }

    // Free-form dice formulas: 1d4, 1d2, 2d6+1, etc.
    const freeRegex = /\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\b/gi;
    while ((m = freeRegex.exec(cleanText)) !== null) {
      const f = m[1].replace(/\s+/g, "");
      if (!formulas.includes(f)) {
        formulas.push(f);
      }
    }

    return formulas;
  }

  /**
   * Extracts text content of table results from chat message.
   * @param {ChatMessage} message
   * @param {RollTable|null} sourceTable
   * @returns {string[]}
   */
  static #extractResultTexts(message, sourceTable) {
    const texts = [];

    // Priority 1: Extract directly from TableResult documents via flags.core.results
    const resultIds = message.flags?.core?.results;
    if (sourceTable && Array.isArray(resultIds)) {
      for (const resId of resultIds) {
        const resDoc = sourceTable.results.get(resId);
        if (resDoc?.text) {
          texts.push(resDoc.text);
        }
      }
    }

    // Priority 2: Extract from message HTML if flags do not contain results
    if (texts.length === 0 && message.content) {
      const resultRegex = /<div[^>]*class=["'][^"']*(?:result-text|table-result)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
      let m;
      while ((m = resultRegex.exec(message.content)) !== null) {
        const clean = m[1].replace(/<[^>]*>/g, "").trim();
        if (clean) texts.push(clean);
      }

      if (texts.length === 0) {
        const cleanContent = message.content.replace(/<[^>]*>/g, "").trim();
        if (cleanContent) texts.push(cleanContent);
      }
    }

    return texts;
  }

  /**
   * Parses text and extracts references to other rollable tables.
   * Supports:
   * - "table: Wild 17"
   * - "roll on table Wild Magic 57."
   * - "@UUID[RollTable.XYZ]{Name}"
   * @param {string} text
   * @returns {string[]}
   */
  static #parseTableReferences(text) {
    if (!text || typeof text !== "string") return [];

    const found = new Set();

    // 1. Native Foundry links: @UUID[RollTable.id]{Name} or @RollTable[id]{Name}
    const uuidRegex = /@(?:UUID\[(?:RollTable\.)?([^\]]+)\]|RollTable\[([^\]]+)\])(?:\{([^}]+)\})?/gi;
    let match;
    while ((match = uuidRegex.exec(text)) !== null) {
      const idOrUuid = match[1] || match[2];
      const linkName = match[3];
      if (linkName) found.add(linkName.trim());
      if (idOrUuid) found.add(idOrUuid.trim());
    }

    // 2. Direct prefix "table: Name" or "tabela: Name"
    const prefixRegex = /(?:tabela|table|@):\s*["'«“]?([^<>\n\r\t,.;"'»”\)\(]+)["'»”]?/gi;
    while ((match = prefixRegex.exec(text)) !== null) {
      const raw = this.#cleanName(match[1]);
      if (raw) found.add(raw);
    }

    // 3. "roll on table Name" / "role na tabela Name"
    const rollOnRegex = /(?:role|rolar|roll|jogar)(?:\s+[\ddD\+]+)?\s+(?:na|em|no|on)\s+(?:uma\s+)?(?:tabela|table)(?:\s+(?:de|da|do|dos|das))?\s*[:\-]?\s*["'«“]?([^<>\n\r\t,.;"'»”\)\(]+)["'»”]?/gi;
    while ((match = rollOnRegex.exec(text)) !== null) {
      const raw = this.#cleanName(match[1]);
      if (raw) found.add(raw);
    }

    // 4. "table of Name" / "tabela de Name"
    const tableOfRegex = /(?:tabela|table)\s+(?:de|da|do|dos|das)\s+["'«“]?([^<>\n\r\t,.;"'»”\)\(]+)["'»”]?/gi;
    while ((match = tableOfRegex.exec(text)) !== null) {
      const raw = this.#cleanName(match[1]);
      if (raw) found.add(raw);
    }

    return Array.from(found);
  }

  /**
   * Locates a RollTable in the world or compendiums by ID, exact name, or fuzzy match.
   * @param {string} query - Search term (ID, UUID or Name)
   * @param {RollTable|null} sourceTable - Table that generated the roll
   * @returns {Promise<RollTable|null>}
   */
  static async findTable(query, sourceTable = null) {
    if (!query) return null;
    const clean = this.#cleanName(query);
    if (!clean) return null;

    // 1. Direct ID lookup
    let table = game.tables.get(clean);
    if (table) return table;

    // 2. UUID lookup
    try {
      table = await fromUuid(clean);
      if (table instanceof RollTable) return table;
    } catch {
      // Ignore invalid UUID error
    }

    // 3. Exact world name lookup
    table = game.tables.getName(clean);
    if (table) return table;

    // 4. Case-insensitive world name lookup
    const lowerClean = clean.toLowerCase();
    table = game.tables.find(t => t.name.trim().toLowerCase() === lowerClean);
    if (table) return table;

    // 5. Normalized search (strip accents and table prefixes)
    const normQuery = this.#normalizeKey(clean);
    table = game.tables.find(t => this.#normalizeKey(t.name) === normQuery);
    if (table) return table;

    // 6. Number matching (e.g. "57" or "17")
    const queryNum = this.#extractNumber(clean);
    const worldTables = game.tables.contents;

    if (queryNum !== null) {
      const candidates = worldTables.filter(t => {
        if (sourceTable && t.id === sourceTable.id) return false;
        return this.#extractNumber(t.name) === queryNum;
      });

      if (candidates.length === 1) {
        return candidates[0];
      }

      if (candidates.length > 1) {
        const best = candidates.find(t => {
          const normName = this.#normalizeKey(t.name);
          return normQuery.includes(normName) || normName.includes(normQuery);
        });
        if (best) return best;
        return candidates[0];
      }
    }

    // 7. Partial match (excluding source table)
    const partialMatch = worldTables.find(t => {
      if (sourceTable && t.id === sourceTable.id) return false;
      const normName = this.#normalizeKey(t.name);
      return normName.length >= 3 && (normQuery.includes(normName) || normName.includes(normQuery));
    });
    if (partialMatch) return partialMatch;

    // 8. Fallback: Compendium search
    for (const pack of game.packs) {
      if (pack.documentName !== "RollTable") continue;
      
      const entry = pack.index.find(e => {
        const entryNorm = this.#normalizeKey(e.name);
        return entryNorm === normQuery || (queryNum !== null && this.#extractNumber(e.name) === queryNum);
      });

      if (entry) {
        try {
          const doc = await pack.getDocument(entry._id);
          if (doc) return doc;
        } catch {
          // Continue
        }
      }
    }

    return null;
  }

  /**
   * Cleans boundary punctuation and tags from an extracted name.
   * @param {string} str
   * @returns {string}
   */
  static #cleanName(str) {
    if (!str) return "";
    return str
      .replace(/<[^>]*>/g, "")
      .replace(/^[@:\s"'(«“]+/, "")
      .replace(/[.:,;!?"')\]»”]+$/, "")
      .trim();
  }

  /**
   * Normalizes a string for loose comparison.
   * @param {string} str
   * @returns {string}
   */
  static #normalizeKey(str) {
    return this.#cleanName(str)
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/^(?:tabela|table)\s+(?:de|da|do|dos|das)\s+/i, "")
      .replace(/^(?:tabela|table):\s*/i, "")
      .replace(/^(?:tabela|table)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Extracts the first integer from a string (e.g. "Wild 57" -> 57).
   * @param {string} str
   * @returns {number|null}
   */
  static #extractNumber(str) {
    if (!str) return null;
    const m = str.match(/\b(\d+)\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  /**
   * Resolves the inherited roll mode from the original message.
   * @param {ChatMessage} message
   * @returns {string}
   */
  static #resolveRollMode(message) {
    if (message.whisper && message.whisper.length > 0) {
      if (message.blind) return CONST.DICE_ROLL_MODES.BLIND;
      return CONST.DICE_ROLL_MODES.PRIVATE;
    }
    return CONST.DICE_ROLL_MODES.PUBLIC;
  }

  /**
   * Determines if this Foundry client has authority to execute automation.
   * @returns {boolean}
   */
  static #canExecute() {
    const isGM = game.user.isGM;
    if (!isGM) {
      const hasOnlineGM = game.users.some(u => u.isGM && u.active);
      return !hasOnlineGM;
    } else {
      const gms = game.users.filter(u => u.isGM && (u.active || u.id === game.user.id));
      return gms.length === 0 || gms[0].id === game.user.id;
    }
  }
}
