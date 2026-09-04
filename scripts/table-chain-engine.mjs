/**
 * Motor reativo para detecção e execução automática de subtabelas encadeadas.
 * Quando o resultado de uma Tabela Rolável contém referências a outras tabelas
 * (ex: "tabela: Selvagem 17", "role na tabela de Magia Selvagem 57", "@UUID[RollTable...]"),
 * o TableChainEngine localiza e sorteia a subtabela automaticamente.
 */
export class TableChainEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_ENABLED = "tableChainEnabled";
  static SETTING_MAX_DEPTH = "tableChainMaxDepth";
  static SETTING_DELAY = "tableChainDelay";

  static #processedIds = new Set();
  static #isExecuting = false;

  /**
   * Registra as configurações de encadeamento no Foundry VTT.
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
  }

  /**
   * Inicializa o hook de escuta de mensagens de chat.
   */
  static initialize() {
    Hooks.on("createChatMessage", (message, options, userId) => {
      this.#onChatMessageCreated(message);
    });

    console.log("Rolagens Globais | TableChainEngine inicializado com sucesso.");
  }

  /**
   * Processador de novas mensagens no chat.
   * @param {ChatMessage} message
   */
  static async #onChatMessageCreated(message) {
    // 1. Verifica se o recurso está ativado
    const isEnabled = game.settings.get(this.MODULE_ID, this.SETTING_ENABLED) ?? true;
    if (!isEnabled) return;

    // 2. Trava de autoridade multiplayer: apenas o Mestre ativo (ou o autor caso não haja GM online)
    if (!this.#canExecute()) return;

    // 3. Evita reprocessar a mesma mensagem
    if (this.#processedIds.has(message.id)) return;

    // 4. Verifica se a mensagem provém de uma Tabela Rolável ou contém resultado de tabela
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

    // 5. Profundidade de recursão para evitar loops infinitos
    const maxDepth = game.settings.get(this.MODULE_ID, this.SETTING_MAX_DEPTH) || 5;
    const currentDepth = message.flags?.[this.MODULE_ID]?.chainDepth || 0;

    if (currentDepth >= maxDepth) {
      console.warn(`Rolagens Globais | Limite máximo de subtabelas encadeadas atingido (${maxDepth}). Interrompendo para prevenir loop infinito.`);
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

    // 8. Extrai referências a subtabelas em cada texto
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
      console.log(`Rolagens Globais | 🎲 Subtabela disparada automaticamente: "${subTable.name}" (Profundidade ${currentDepth + 1})`);
      
      // Delay suave para sincronia com dados 3D
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }

      try {
        await subTable.draw({
          recursive: true,
          rollMode,
          messageData: {
            speaker: message.speaker,
            flavor: `<div class="rolagens-globais-badge"><i class="fas fa-link"></i> Subtabela: <strong>${subTable.name}</strong></div>`,
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
        console.error(`Rolagens Globais | Erro ao rolar subtabela "${subTable.name}":`, err);
      }
    }
  }

  /**
   * Extrai os textos puros dos resultados da mensagem.
   * @param {ChatMessage} message
   * @param {RollTable|null} sourceTable
   * @returns {string[]}
   */
  static #extractResultTexts(message, sourceTable) {
    const texts = [];

    // Prioridade 1: Extrai diretamente dos documentos de TableResult via flags.core.results
    const resultIds = message.flags?.core?.results;
    if (sourceTable && Array.isArray(resultIds)) {
      for (const resId of resultIds) {
        const resDoc = sourceTable.results.get(resId);
        if (resDoc?.text) {
          texts.push(resDoc.text);
        }
      }
    }

    // Prioridade 2: Se não houver textos ou resultados nas flags, extrai do HTML da mensagem
    if (texts.length === 0 && message.content) {
      // Usa regex seguro para extrair o conteúdo de .result-text ou do corpo HTML sem depender de DOM no Node
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
   * Analisa um texto e extrai menções a outras tabelas.
   * Suporta:
   * - "tabela: Selvagem 17"
   * - "role na tabela de Magia Selvagem 57."
   * - "role na tabela: Selvagem 57"
   * - "tabela de Magia Selvagem 57"
   * - "@UUID[RollTable.XYZ]{Nome}"
   * @param {string} text
   * @returns {string[]}
   */
  static #parseTableReferences(text) {
    if (!text || typeof text !== "string") return [];

    const found = new Set();

    // 1. Links nativos do Foundry: @UUID[RollTable.id]{Nome} ou @RollTable[id]{Nome}
    const uuidRegex = /@(?:UUID\[(?:RollTable\.)?([^\]]+)\]|RollTable\[([^\]]+)\])(?:\{([^}]+)\})?/gi;
    let match;
    while ((match = uuidRegex.exec(text)) !== null) {
      const idOrUuid = match[1] || match[2];
      const linkName = match[3];
      if (linkName) found.add(linkName.trim());
      if (idOrUuid) found.add(idOrUuid.trim());
    }

    // 2. Prefixo direto "tabela: Nome" ou "table: Nome"
    const prefixRegex = /(?:tabela|table|@):\s*["'«“]?([^<>\n\r\t,.;"'»”\)\(]+)["'»”]?/gi;
    while ((match = prefixRegex.exec(text)) !== null) {
      const raw = this.#cleanName(match[1]);
      if (raw) found.add(raw);
    }

    // 3. "role na tabela de/da/do/..." ou "role 1d20 na tabela de/da/do/..."
    const rollOnRegex = /(?:role|rolar|roll|jogar)(?:\s+[\ddD\+]+)?\s+(?:na|em|no|on)\s+(?:uma\s+)?(?:tabela|table)(?:\s+(?:de|da|do|dos|das))?\s*[:\-]?\s*["'«“]?([^<>\n\r\t,.;"'»”\)\(]+)["'»”]?/gi;
    while ((match = rollOnRegex.exec(text)) !== null) {
      const raw = this.#cleanName(match[1]);
      if (raw) found.add(raw);
    }

    // 4. "tabela de/da/do Nome"
    const tableOfRegex = /(?:tabela|table)\s+(?:de|da|do|dos|das)\s+["'«“]?([^<>\n\r\t,.;"'»”\)\(]+)["'»”]?/gi;
    while ((match = tableOfRegex.exec(text)) !== null) {
      const raw = this.#cleanName(match[1]);
      if (raw) found.add(raw);
    }

    return Array.from(found);
  }

  /**
   * Localiza uma Tabela Rolável no mundo ou compêndios por ID, Nome exato ou busca flexível.
   * @param {string} query - Termo de busca (ID, UUID ou Nome)
   * @param {RollTable|null} sourceTable - Tabela que gerou a rolagem (evita re-seleção acidental)
   * @returns {Promise<RollTable|null>}
   */
  static async findTable(query, sourceTable = null) {
    if (!query) return null;
    const clean = this.#cleanName(query);
    if (!clean) return null;

    // 1. Busca por ID direto
    let table = game.tables.get(clean);
    if (table) return table;

    // 2. Busca por UUID
    try {
      table = await fromUuid(clean);
      if (table instanceof RollTable) return table;
    } catch {
      // Ignora erro de UUID inválido
    }

    // 3. Busca por Nome Exato no mundo
    table = game.tables.getName(clean);
    if (table) return table;

    // 4. Busca por Nome Case-Insensitive
    const lowerClean = clean.toLowerCase();
    table = game.tables.find(t => t.name.trim().toLowerCase() === lowerClean);
    if (table) return table;

    // 5. Busca Normalizada (remove acentos, prefixos "tabela de", etc.)
    const normQuery = this.#normalizeKey(clean);
    table = game.tables.find(t => this.#normalizeKey(t.name) === normQuery);
    if (table) return table;

    // 6. Busca Inteligente com correspondência de número (ex: "57" ou "17")
    const queryNum = this.#extractNumber(clean);
    const worldTables = game.tables.contents;

    if (queryNum !== null) {
      // Se a consulta possui um número específico (ex: 57), filtra candidatos com o mesmo número
      const candidates = worldTables.filter(t => {
        if (sourceTable && t.id === sourceTable.id) return false;
        return this.#extractNumber(t.name) === queryNum;
      });

      if (candidates.length === 1) {
        return candidates[0];
      }

      if (candidates.length > 1) {
        // Encontra o que tem maior sobreposição de nome com a busca
        const best = candidates.find(t => {
          const normName = this.#normalizeKey(t.name);
          return normQuery.includes(normName) || normName.includes(normQuery);
        });
        if (best) return best;
        return candidates[0];
      }
    }

    // 7. Busca Parcial / Contém (excluindo a própria tabela de origem)
    const partialMatch = worldTables.find(t => {
      if (sourceTable && t.id === sourceTable.id) return false;
      const normName = this.#normalizeKey(t.name);
      return normName.length >= 3 && (normQuery.includes(normName) || normName.includes(normQuery));
    });
    if (partialMatch) return partialMatch;

    // 8. Fallback: Busca em Compêndios de RollTable
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
          // Continua
        }
      }
    }

    return null;
  }

  /**
   * Limpa pontuações periféricas e tags de um nome extraído.
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
   * Normaliza um texto para comparação frouxa.
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
   * Extrai o primeiro número inteiro de uma string (ex: "Selvagem 57" -> 57).
   * @param {string} str
   * @returns {number|null}
   */
  static #extractNumber(str) {
    if (!str) return null;
    const m = str.match(/\b(\d+)\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  /**
   * Determina o modo de rolagem herdado da mensagem original.
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
   * Determina se este cliente Foundry deve executar a automação no multiplayer.
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
