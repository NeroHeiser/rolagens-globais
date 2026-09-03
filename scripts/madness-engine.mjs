export class MadnessEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_ENABLED = "madnessEnabled";
  static SETTING_CONFIG = "madnessConfig";
  static isExecuting = false;

  /**
   * Registra as configurações do Modo Loucura no Foundry VTT.
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
        tableId: "",
        interceptMelee: true,
        interceptRanged: true,
        interceptSpells: true,
        flavor: "🌀 A Loucura tomou o controle da ação!",
        visibility: "public"
      }
    });
  }

  /**
   * Verifica se o Modo Loucura está ativo.
   * @returns {boolean}
   */
  static isEnabled() {
    return game.settings.get(this.MODULE_ID, this.SETTING_ENABLED) ?? false;
  }

  /**
   * Alterna o estado ativo/inativo do Modo Loucura.
   * @returns {Promise<boolean>}
   */
  static async toggleEnabled() {
    const nextState = !this.isEnabled();
    await game.settings.set(this.MODULE_ID, this.SETTING_ENABLED, nextState);
    
    if (nextState) {
      ui.notifications.warn(game.i18n.localize("ROLAGENS_GLOBAIS.Madness.ActivatedNotice"));
    } else {
      ui.notifications.info(game.i18n.localize("ROLAGENS_GLOBAIS.Madness.DeactivatedNotice"));
    }

    return nextState;
  }

  /**
   * Retorna as configurações atuais do Modo Loucura.
   * @returns {object}
   */
  static getConfig() {
    const defaults = {
      tableId: "",
      interceptMelee: true,
      interceptRanged: true,
      interceptSpells: true,
      flavor: "🌀 A Loucura tomou o controle da ação!",
      visibility: "public"
    };
    return foundry.utils.mergeObject(defaults, game.settings.get(this.MODULE_ID, this.SETTING_CONFIG) || {});
  }

  /**
   * Salva as configurações do Modo Loucura.
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
      if (!this.#shouldInterceptItem(item, config)) return true;

      // Intercepta e cancela a rolagem normal
      this.triggerMadness(item, "attack");
      return false; // Retornar false cancela o ataque limpo no D&D 5e, Midi-QOL e Ready Set Roll
    });

    // 2. D&D 5e v4: pré-uso de atividades (Activities System)
    Hooks.on("dnd5e.preUseActivity", (activity, usage, dialogConfig) => {
      if (!this.isEnabled()) return true;
      if (this.isExecuting) return true;

      const config = this.getConfig();
      const item = activity?.item;
      if (!this.#shouldInterceptActivity(activity, item, config)) return true;

      // Intercepta e cancela a atividade normal
      this.triggerMadness(item, activity?.type || "activity");
      return false; // Retornar false cancela a atividade
    });
  }

  /**
   * Avalia se um Item deve ser interceptado com base na configuração.
   */
  static #shouldInterceptItem(item, config) {
    if (!item) return false;
    if (item.flags?.[this.MODULE_ID]?.ignoreMadness === true) return false;
    if (item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) return false;

    const actionType = item.system?.actionType || "";
    const itemType = item.type;

    // Magias
    if (itemType === "spell") {
      return !!config.interceptSpells;
    }

    // Ataques corpo a corpo (mwak = melee weapon attack, msak = melee spell attack)
    if (actionType === "mwak" || actionType === "msak") {
      return !!config.interceptMelee;
    }

    // Ataques à distância (rwak = ranged weapon attack, rsak = ranged spell attack)
    if (actionType === "rwak" || actionType === "rsak") {
      return !!config.interceptRanged;
    }

    // Outros ataques
    if (actionType.includes("wak") || actionType.includes("sak")) {
      return true;
    }

    return false;
  }

  /**
   * Avalia se uma Activity do D&D 5e v4 deve ser interceptada.
   */
  static #shouldInterceptActivity(activity, item, config) {
    if (!activity) return false;
    if (item?.flags?.[this.MODULE_ID]?.ignoreMadness === true) return false;
    if (item?.flags?.[this.MODULE_ID]?.ignoreGlobal === true) return false;

    const actType = activity.type;

    // Magias ou Atividades de Conjuração
    if (actType === "cast" || item?.type === "spell") {
      return !!config.interceptSpells;
    }

    // Atividades de Ataque
    if (actType === "attack") {
      const attackType = activity.attack?.type?.value || "";
      if (attackType.includes("melee")) {
        return !!config.interceptMelee;
      }
      if (attackType.includes("ranged")) {
        return !!config.interceptRanged;
      }
      return true;
    }

    return false;
  }

  /**
   * Executa a rolagem da Tabela de Loucura em substituição à ação cancelada.
   * @param {Item} item - Item cuja ação foi interceptada
   * @param {string} actionType - Tipo da ação interceptada
   */
  static async triggerMadness(item, actionType = "attack") {
    if (this.isExecuting) return;
    this.isExecuting = true;

    try {
      const config = this.getConfig();
      if (!config.tableId) {
        ui.notifications.warn(game.i18n.localize("ROLAGENS_GLOBAIS.Madness.NoTableConfigured"));
        return;
      }

      let table = game.tables.get(config.tableId) || game.tables.getName(config.tableId);
      if (!table) {
        try {
          table = await fromUuid(config.tableId);
        } catch {
          table = null;
        }
      }

      if (!table) {
        ui.notifications.warn(`Rolagens Globais: Tabela de Loucura "${config.tableId}" não foi encontrada.`);
        return;
      }

      const actor = item?.actor;
      const actorName = actor?.name || "Personagem";
      const itemName = item?.name || "Ataque";

      // Mensagem informativa no chat avisando sobre a interceptação
      const rollMode = config.visibility || CONST.DICE_ROLL_MODES.PUBLIC;
      const defaultFlavor = `🌀 <strong>A Loucura Interceptou a Ação!</strong><br><em>${actorName}</em> tentou usar <strong>${itemName}</strong>, mas a Loucura assumiu o controle!`;
      const finalFlavor = config.flavor ? config.flavor.replace("{actor}", actorName).replace("{item}", itemName) : defaultFlavor;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<div class="rolagens-globais-badge rolagens-globais-madness-badge"><i class="fas fa-brain"></i> ${finalFlavor}</div>`,
        flags: {
          [this.MODULE_ID]: { isExtraRoll: true }
        }
      }, { rollMode });

      // Sorteia a tabela nativamente (exibindo dados 3D no Dice So Nice)
      await table.draw({ rollMode });

    } catch (err) {
      console.error("Rolagens Globais | Erro ao processar Modo Loucura:", err);
      ui.notifications.error(`Rolagens Globais: Erro na Loucura: ${err.message}`);
    } finally {
      setTimeout(() => {
        this.isExecuting = false;
      }, 1000);
    }
  }
}
