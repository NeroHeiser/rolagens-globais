export class MadnessEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_ENABLED = "madnessEnabled";
  static SETTING_CONFIG = "madnessConfig";
  static isExecuting = false;

  /**
   * Registra as configurações do Modo de Interceptação no Foundry VTT.
   */
  static registerSettings() {
    game.settings.register(this.MODULE_ID, this.SETTING_ENABLED, {
      name: game.i18n.localize("ROLAGENS_GLOBAIS.Madness.SettingEnabled.Name"),
      hint: game.i18n.localize("ROLAGENS_GLOBAIS.Madness.SettingEnabled.Hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    game.settings.register(this.MODULE_ID, this.SETTING_CONFIG, {
      name: game.i18n.localize("ROLAGENS_GLOBAIS.Madness.SettingConfig.Name"),
      hint: game.i18n.localize("ROLAGENS_GLOBAIS.Madness.SettingConfig.Hint"),
      scope: "world",
      config: false,
      type: Object,
      default: {
        customName: "Regras do Mundo",
        physicalTableId: "",
        magicTableId: "",
        tableId: "",
        interceptMelee: true,
        interceptRanged: true,
        interceptSpells: true,
        flavor: "🌀 {mode}: {actor} tentou usar {item}, mas as regras do mundo interferiram!",
        visibility: "public"
      }
    });
  }

  /**
   * Verifica se o modo está ativo.
   * @returns {boolean}
   */
  static isEnabled() {
    return game.settings.get(this.MODULE_ID, this.SETTING_ENABLED) ?? false;
  }

  /**
   * Retorna o nome configurado para o modo (ex: "Regras do Mundo", "Modo Loucura", etc.).
   * @returns {string}
   */
  static getModeName() {
    const config = this.getConfig();
    return config.customName?.trim() || game.i18n.localize("ROLAGENS_GLOBAIS.Madness.DefaultName");
  }

  /**
   * Alterna o estado ativo/inativo do modo.
   * @returns {Promise<boolean>}
   */
  static async toggleEnabled() {
    const nextState = !this.isEnabled();
    await game.settings.set(this.MODULE_ID, this.SETTING_ENABLED, nextState);
    const modeName = this.getModeName();
    
    if (nextState) {
      ui.notifications.warn(`🌀 ${modeName} ATIVADO! Ataques e magias agora serão interceptados.`);
    } else {
      ui.notifications.info(`✨ ${modeName} DESATIVADO. As rolagens voltaram ao normal.`);
    }

    return nextState;
  }

  /**
   * Retorna as configurações atuais.
   * @returns {object}
   */
  static getConfig() {
    const defaults = {
      customName: "Regras do Mundo",
      physicalTableId: "",
      magicTableId: "",
      tableId: "",
      interceptMelee: true,
      interceptRanged: true,
      interceptSpells: true,
      flavor: "🌀 {mode}: {actor} tentou usar {item}, mas as regras do mundo interferiram!",
      visibility: "public"
    };
    return foundry.utils.mergeObject(defaults, game.settings.get(this.MODULE_ID, this.SETTING_CONFIG) || {});
  }

  /**
   * Salva as configurações.
   * @param {object} newConfig
   */
  static async saveConfig(newConfig) {
    const current = this.getConfig();
    const merged = foundry.utils.mergeObject(current, newConfig);
    return await game.settings.set(this.MODULE_ID, this.SETTING_CONFIG, merged);
  }

  /**
   * Inicializa os interceptadores de pré-rolagem.
   */
  static initialize() {
    if (game.system.id === "dnd5e") {
      this.#initializeDnd5e();
    }
  }

  /**
   * Interceptadores específicos para o sistema D&D 5e (v3 e v4).
   */
  static #initializeDnd5e() {
    // 1. D&D 5e v3 e legado: pré-rolagem de ataque
    Hooks.on("dnd5e.preRollAttack", (item, rollConfig) => {
      if (!this.isEnabled()) return true;
      if (this.isExecuting) return true;

      const config = this.getConfig();
      const interceptInfo = this.#checkItemIntercept(item, config);
      if (!interceptInfo.shouldIntercept) return true;

      // Intercepta e cancela a rolagem normal
      this.triggerInterception(item, "attack", interceptInfo.isMagic);
      return false; // Retornar false cancela o ataque limpo no D&D 5e, Midi-QOL e Ready Set Roll
    });

    // 2. D&D 5e v4: pré-uso de atividades (Activities System)
    Hooks.on("dnd5e.preUseActivity", (activity, usage, dialogConfig) => {
      if (!this.isEnabled()) return true;
      if (this.isExecuting) return true;

      const config = this.getConfig();
      const item = activity?.item;
      const interceptInfo = this.#checkActivityIntercept(activity, item, config);
      if (!interceptInfo.shouldIntercept) return true;

      // Intercepta e cancela a atividade normal
      this.triggerInterception(item, activity?.type || "activity", interceptInfo.isMagic);
      return false; // Retornar false cancela a atividade
    });
  }

  /**
   * Avalia se um Item deve ser interceptado e classifica se é mágico ou físico.
   */
  static #checkItemIntercept(item, config) {
    if (!item) return { shouldIntercept: false, isMagic: false };
    if (item.flags?.[this.MODULE_ID]?.ignoreMadness === true) return { shouldIntercept: false, isMagic: false };
    if (item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) return { shouldIntercept: false, isMagic: false };

    const actionType = item.system?.actionType || "";
    const itemType = item.type;

    // Magias ou ataques mágicos
    if (itemType === "spell" || actionType === "msak" || actionType === "rsak") {
      return { shouldIntercept: !!config.interceptSpells, isMagic: true };
    }

    // Ataques corpo a corpo físicos
    if (actionType === "mwak") {
      return { shouldIntercept: !!config.interceptMelee, isMagic: false };
    }

    // Ataques à distância físicos
    if (actionType === "rwak") {
      return { shouldIntercept: !!config.interceptRanged, isMagic: false };
    }

    // Outros ataques com arma
    if (actionType.includes("wak")) {
      return { shouldIntercept: true, isMagic: false };
    }

    return { shouldIntercept: false, isMagic: false };
  }

  /**
   * Avalia se uma Activity do D&D 5e v4 deve ser interceptada.
   */
  static #checkActivityIntercept(activity, item, config) {
    if (!activity) return { shouldIntercept: false, isMagic: false };
    if (item?.flags?.[this.MODULE_ID]?.ignoreMadness === true) return { shouldIntercept: false, isMagic: false };
    if (item?.flags?.[this.MODULE_ID]?.ignoreGlobal === true) return { shouldIntercept: false, isMagic: false };

    const actType = activity.type;

    // Magias ou Atividades de Conjuração
    if (actType === "cast" || item?.type === "spell") {
      return { shouldIntercept: !!config.interceptSpells, isMagic: true };
    }

    // Atividades de Ataque
    if (actType === "attack") {
      const attackType = activity.attack?.type?.value || "";
      const isSpellAttack = attackType.includes("spell");
      if (isSpellAttack) {
        return { shouldIntercept: !!config.interceptSpells, isMagic: true };
      }
      if (attackType.includes("melee")) {
        return { shouldIntercept: !!config.interceptMelee, isMagic: false };
      }
      if (attackType.includes("ranged")) {
        return { shouldIntercept: !!config.interceptRanged, isMagic: false };
      }
      return { shouldIntercept: true, isMagic: false };
    }

    return { shouldIntercept: false, isMagic: false };
  }

  /**
   * Executa o sorteio da Tabela (Física ou Mágica) em substituição à ação cancelada.
   * @param {Item} item - Item cuja ação foi interceptada
   * @param {string} actionType - Tipo da ação interceptada
   * @param {boolean} isMagic - Se a ação interceptada é mágica
   */
  static async triggerInterception(item, actionType = "attack", isMagic = false) {
    if (this.isExecuting) return;
    this.isExecuting = true;

    try {
      const config = this.getConfig();
      const modeName = this.getModeName();

      // Seleciona a tabela apropriada: Mágica ou Física (com fallback para tableId legado)
      let selectedTableId = isMagic 
        ? (config.magicTableId || config.tableId) 
        : (config.physicalTableId || config.tableId);

      if (!selectedTableId) {
        const categoryLabel = isMagic ? "Magias" : "Ataques Físicos";
        ui.notifications.warn(`Rolagens Globais: Nenhuma Tabela Rolável configurada para ${categoryLabel} em "${modeName}".`);
        return;
      }

      let table = game.tables.get(selectedTableId) || game.tables.getName(selectedTableId);
      if (!table) {
        try {
          table = await fromUuid(selectedTableId);
        } catch {
          table = null;
        }
      }

      if (!table) {
        ui.notifications.warn(`Rolagens Globais: Tabela "${selectedTableId}" não foi encontrada no mundo.`);
        return;
      }

      const actor = item?.actor;
      const actorName = actor?.name || "Personagem";
      const itemName = item?.name || "Ação";

      // Mensagem informativa no chat avisando sobre a interceptação
      const rollMode = config.visibility || CONST.DICE_ROLL_MODES.PUBLIC;
      const defaultFlavor = `🌀 <strong>${modeName}</strong><br><em>${actorName}</em> tentou usar <strong>${itemName}</strong>, mas a ação foi interceptada!`;
      const finalFlavor = config.flavor 
        ? config.flavor.replace("{mode}", modeName).replace("{actor}", actorName).replace("{item}", itemName)
        : defaultFlavor;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<div class="rolagens-globais-badge rolagens-globais-madness-badge"><i class="fas fa-brain"></i> ${finalFlavor}</div>`,
        flags: {
          [this.MODULE_ID]: { isExtraRoll: true }
        }
      }, { rollMode });

      // Sorteia a tabela nativamente (exibindo dados 3D no Dice So Nice e recursividade)
      await table.draw({ recursive: true, rollMode });

    } catch (err) {
      console.error("Rolagens Globais | Erro na interceptação:", err);
      ui.notifications.error(`Rolagens Globais: Erro na interceptação: ${err.message}`);
    } finally {
      setTimeout(() => {
        this.isExecuting = false;
      }, 1000);
    }
  }

  // Alias para manter compatibilidade
  static async triggerMadness(item, actionType = "attack", isMagic = false) {
    return await this.triggerInterception(item, actionType, isMagic);
  }
}
