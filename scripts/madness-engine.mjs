export class MadnessEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_ENABLED = "madnessEnabled";
  static SETTING_CONFIG = "madnessConfig";
  static isExecuting = false;

  /**
   * Registers interception mode settings in Foundry VTT.
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
        customName: "World Rules",
        physicalTableId: "",
        magicTableId: "",
        tableId: "",
        interceptMelee: true,
        interceptRanged: true,
        interceptSpells: true,
        flavor: "{mode}: {actor} tried to use {item}, but the action was intercepted!",
        visibility: "public"
      }
    });
  }

  /**
   * Checks if interception mode is active.
   * @returns {boolean}
   */
  static isEnabled() {
    return game.settings.get(this.MODULE_ID, this.SETTING_ENABLED) ?? false;
  }

  /**
   * Returns configured mode display name.
   * @returns {string}
   */
  static getModeName() {
    const config = this.getConfig();
    return config.customName?.trim() || game.i18n.localize("ROLAGENS_GLOBAIS.Madness.DefaultName");
  }

  /**
   * Toggles enabled state of interception mode.
   * @returns {Promise<boolean>}
   */
  static async toggleEnabled() {
    const nextState = !this.isEnabled();
    await game.settings.set(this.MODULE_ID, this.SETTING_ENABLED, nextState);
    const modeName = this.getModeName();
    
    if (nextState) {
      ui.notifications.warn(`${modeName}: ${game.i18n.localize("ROLAGENS_GLOBAIS.Madness.ActivatedNotice")}`);
    } else {
      ui.notifications.info(`${modeName}: ${game.i18n.localize("ROLAGENS_GLOBAIS.Madness.DeactivatedNotice")}`);
    }

    return nextState;
  }

  /**
   * Returns current interception configuration.
   * @returns {object}
   */
  static getConfig() {
    const defaults = {
      customName: "World Rules",
      physicalTableId: "",
      magicTableId: "",
      tableId: "",
      interceptMelee: true,
      interceptRanged: true,
      interceptSpells: true,
      flavor: "{mode}: {actor} tried to use {item}, but the action was intercepted!",
      visibility: "public"
    };
    return foundry.utils.mergeObject(defaults, game.settings.get(this.MODULE_ID, this.SETTING_CONFIG) || {});
  }

  /**
   * Saves updated configuration.
   * @param {object} newConfig
   */
  static async saveConfig(newConfig) {
    const current = this.getConfig();
    const merged = foundry.utils.mergeObject(current, newConfig);
    return await game.settings.set(this.MODULE_ID, this.SETTING_CONFIG, merged);
  }

  /**
   * Initializes pre-roll interception listeners.
   */
  static initialize() {
    if (game.system.id === "dnd5e") {
      this.#initializeDnd5e();
    }
  }

  static #initializeDnd5e() {
    Hooks.on("dnd5e.preRollAttack", (item, rollConfig) => {
      if (!this.isEnabled()) return true;
      if (this.isExecuting) return true;

      const config = this.getConfig();
      const interceptInfo = this.#checkItemIntercept(item, config);
      if (!interceptInfo.shouldIntercept) return true;

      this.triggerInterception(item, "attack", interceptInfo.isMagic);
      return false;
    });

    Hooks.on("dnd5e.preUseActivity", (activity, usage, dialogConfig) => {
      if (!this.isEnabled()) return true;
      if (this.isExecuting) return true;

      const config = this.getConfig();
      const item = activity?.item;
      const interceptInfo = this.#checkActivityIntercept(activity, item, config);
      if (!interceptInfo.shouldIntercept) return true;

      this.triggerInterception(item, activity?.type || "activity", interceptInfo.isMagic);
      return false;
    });
  }

  static #checkItemIntercept(item, config) {
    if (!item) return { shouldIntercept: false, isMagic: false };
    if (item.flags?.[this.MODULE_ID]?.ignoreMadness === true) return { shouldIntercept: false, isMagic: false };
    if (item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) return { shouldIntercept: false, isMagic: false };

    const actionType = item.system?.actionType || "";
    const itemType = item.type;

    if (itemType === "spell" || actionType === "msak" || actionType === "rsak") {
      return { shouldIntercept: !!config.interceptSpells, isMagic: true };
    }

    if (actionType === "mwak") {
      return { shouldIntercept: !!config.interceptMelee, isMagic: false };
    }

    if (actionType === "rwak") {
      return { shouldIntercept: !!config.interceptRanged, isMagic: false };
    }

    if (actionType.includes("wak")) {
      return { shouldIntercept: true, isMagic: false };
    }

    return { shouldIntercept: false, isMagic: false };
  }

  static #checkActivityIntercept(activity, item, config) {
    if (!activity) return { shouldIntercept: false, isMagic: false };
    if (item?.flags?.[this.MODULE_ID]?.ignoreMadness === true) return { shouldIntercept: false, isMagic: false };
    if (item?.flags?.[this.MODULE_ID]?.ignoreGlobal === true) return { shouldIntercept: false, isMagic: false };

    const actType = activity.type;

    if (actType === "cast" || item?.type === "spell") {
      return { shouldIntercept: !!config.interceptSpells, isMagic: true };
    }

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
   * Draws configured table replacing the cancelled action.
   * @param {Item} item
   * @param {string} actionType
   * @param {boolean} isMagic
   */
  static async triggerInterception(item, actionType = "attack", isMagic = false) {
    if (this.isExecuting) return;
    this.isExecuting = true;

    try {
      const config = this.getConfig();
      const modeName = this.getModeName();

      let selectedTableId = isMagic 
        ? (config.magicTableId || config.tableId) 
        : (config.physicalTableId || config.tableId);

      if (!selectedTableId) {
        const categoryLabel = isMagic ? "Spells" : "Physical Attacks";
        ui.notifications.warn(`Global Extra Rolls: No RollTable configured for ${categoryLabel} in "${modeName}".`);
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
        ui.notifications.warn(`Global Extra Rolls: Table "${selectedTableId}" was not found in the world.`);
        return;
      }

      const actor = item?.actor;
      const actorName = actor?.name || "Character";
      const itemName = item?.name || "Action";

      const rollMode = config.visibility || CONST.DICE_ROLL_MODES.PUBLIC;
      const defaultFlavor = `<strong>${modeName}</strong><br><em>${actorName}</em> tried to use <strong>${itemName}</strong>, but the action was intercepted!`;
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

      await table.draw({ recursive: true, rollMode });

    } catch (err) {
      console.error("Global Extra Rolls | Error in interception:", err);
      ui.notifications.error(`Global Extra Rolls: Error in interception: ${err.message}`);
    } finally {
      setTimeout(() => {
        this.isExecuting = false;
      }, 1000);
    }
  }

  static async triggerMadness(item, actionType = "attack", isMagic = false) {
    return await this.triggerInterception(item, actionType, isMagic);
  }
}
