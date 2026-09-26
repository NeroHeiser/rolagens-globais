import { getActiveAdapter } from "./adapters/index.mjs";

export class RulesEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_RULES = "rules";
  static #processedIds = new Set();
  static isExecuting = false;

  /**
   * Registers module rules settings in Foundry VTT.
   */
  static registerSettings() {
    game.settings.register(this.MODULE_ID, this.SETTING_RULES, {
      name: game.i18n.localize("ROLAGENS_GLOBAIS.Settings.Rules.Name"),
      hint: game.i18n.localize("ROLAGENS_GLOBAIS.Settings.Rules.Hint"),
      scope: "world",
      config: false,
      type: Array,
      default: []
    });
  }

  /**
   * Returns configured rules list.
   * @returns {Array<object>}
   */
  static getRules() {
    return game.settings.get(this.MODULE_ID, this.SETTING_RULES) || [];
  }

  /**
   * Persists rules list to world settings.
   * @param {Array<object>} rules
   */
  static async saveRules(rules) {
    return await game.settings.set(this.MODULE_ID, this.SETTING_RULES, rules);
  }

  /**
   * Initializes listeners for chat and system-specific roll events.
   */
  static initialize() {
    Hooks.on("preCreateChatMessage", (document, data, options, userId) => {
      if (this.isExecuting) {
        document.updateSource({
          flags: {
            [this.MODULE_ID]: { isExtraRoll: true },
            core: { RollTable: true }
          }
        });
      }
    });

    Hooks.on("createChatMessage", (message, options, userId) => {
      this.#onChatMessageCreated(message);
    });

    if (game.system.id === "dnd5e") {
      Hooks.on("dnd5e.rollAttack", (item, roll) => {
        this.#onDnd5eDirectRoll(item, roll, "attack");
      });

      Hooks.on("dnd5e.postActivityUse", (activity, usage, results) => {
        if (!results || !results.rolls) return;
        for (const roll of results.rolls) {
          const type = activity?.type === "attack" ? "attack" : "action";
          this.#onDnd5eDirectRoll(activity?.item, roll, type);
        }
      });
    }
  }

  static async #onDnd5eDirectRoll(item, roll, rollType) {
    if (this.isExecuting) return;
    if (!this.#canExecute()) return;

    const rollId = roll?._id || `${item?.id}-${roll?.total}-${Date.now()}`;
    if (this.#processedIds.has(rollId)) return;

    if (item && item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) return;

    const rules = this.getRules();
    if (!rules || rules.length === 0) return;

    const adapter = getActiveAdapter();
    const fakeMessage = {
      flavor: item ? `${item.name}` : rollType,
      content: item ? item.name : "",
      actor: item?.actor,
      item: item,
      flags: {
        dnd5e: {
          roll: { type: rollType },
          activity: { type: rollType }
        }
      }
    };

    for (const rule of rules) {
      if (!rule.enabled) continue;

      if (adapter.matches(rule, fakeMessage, roll)) {
        console.log(`Global Extra Rolls | Rule triggered via D&D 5e: "${rule.name}"`);
        this.#processedIds.add(rollId);
        await this.#executeRule(rule, fakeMessage, roll);
        break;
      }
    }
  }

  static async #onChatMessageCreated(message) {
    if (this.isExecuting) {
      return;
    }

    if (message.flags?.[this.MODULE_ID]?.isExtraRoll) {
      return;
    }

    if (message.isRollTable || message.flags?.core?.RollTable || message.flags?.core?.table) {
      return;
    }

    if (message.content && (message.content.includes("table-result") || message.content.includes("table-draw") || message.content.includes("result-text"))) {
      return;
    }

    if (message.flavor && (message.flavor.includes("Tabela") || message.flavor.includes("Table") || message.flavor.includes("Rolagem Extra") || message.flavor.includes("Extra Roll") || message.flavor.includes("rolagens-globais"))) {
      return;
    }

    if (!message.rolls || message.rolls.length === 0) {
      return;
    }

    if (this.#processedIds.has(message.id)) {
      return;
    }

    if (!this.#canExecute()) {
      return;
    }

    const item = await this.#getItemFromMessage(message);
    if (item && item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) {
      return;
    }

    const rules = this.getRules();
    if (!rules || rules.length === 0) {
      return;
    }

    const adapter = getActiveAdapter();

    for (const rule of rules) {
      if (!rule.enabled) continue;

      for (const roll of message.rolls) {
        if (adapter.matches(rule, message, roll)) {
          console.log(`Global Extra Rolls | Rule triggered via Chat: "${rule.name}"`);
          this.#processedIds.add(message.id);
          await this.#executeRule(rule, message, roll);
          break;
        }
      }
    }
  }

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

  static async #getItemFromMessage(message) {
    if (message.item) return message.item;
    const itemUuid = message.flags?.dnd5e?.item?.uuid || message.flags?.dnd5e?.roll?.itemUuid || message.flags?.dnd5e?.activity?.item;
    if (itemUuid) {
      try {
        return await fromUuid(itemUuid);
      } catch {
        return null;
      }
    }
    return null;
  }

  static async #executeRule(rule, originalMessage, originalRoll) {
    if (this.isExecuting) return;
    this.isExecuting = true;

    try {
      const rollMode = this.#resolveRollMode(rule.visibility, originalMessage);

      switch (rule.effectType) {
        case "table":
          await this.#executeTable(rule, originalMessage, rollMode);
          break;

        case "roll":
          await this.#executeFormula(rule, originalMessage, rollMode);
          break;

        case "macro":
          await this.#executeMacro(rule, originalMessage);
          break;
      }
    } catch (err) {
      console.error(`Global Extra Rolls | Error executing "${rule.name}":`, err);
      ui.notifications.error(`Global Extra Rolls: Error executing rule "${rule.name}": ${err.message}`);
    } finally {
      setTimeout(() => {
        this.isExecuting = false;
      }, 1000);
    }
  }

  static async #executeTable(rule, originalMessage, rollMode) {
    if (!rule.tableId) {
      ui.notifications.warn(`Global Extra Rolls: Rule "${rule.name}" has no table selected.`);
      return;
    }

    let table = game.tables.get(rule.tableId) || game.tables.getName(rule.tableId);
    if (!table) {
      try {
        table = await fromUuid(rule.tableId);
      } catch {
        table = null;
      }
    }

    if (!table) {
      ui.notifications.warn(`Global Extra Rolls: Table "${rule.tableId}" not found.`);
      return;
    }

    await table.draw({ rollMode: rollMode || CONST.DICE_ROLL_MODES.PUBLIC });
  }

  static async #executeFormula(rule, originalMessage, rollMode) {
    if (!rule.formula) return;

    const extraRoll = new Roll(rule.formula);
    await extraRoll.evaluate();

    const flavor = rule.flavor || game.i18n.localize("ROLAGENS_GLOBAIS.Chat.TriggeredBadge");

    await extraRoll.toMessage(
      {
        speaker: ChatMessage.getSpeaker({ actor: originalMessage?.actor }),
        flavor: `<div class="rolagens-globais-badge"><i class="fas fa-bolt"></i> ${flavor}</div>`,
        flags: {
          [this.MODULE_ID]: {
            isExtraRoll: true,
            ruleId: rule.id
          }
        }
      },
      { rollMode }
    );
  }

  static async #executeMacro(rule, originalMessage) {
    if (!rule.macroId) return;

    let macro = game.macros.get(rule.macroId) || game.macros.getName(rule.macroId);
    if (!macro) {
      try {
        macro = await fromUuid(rule.macroId);
      } catch {
        macro = null;
      }
    }

    if (!macro) {
      console.warn(`Global Extra Rolls | Macro not found: ${rule.macroId}`);
      return;
    }

    macro.execute({
      message: originalMessage,
      actor: originalMessage?.actor,
      rule
    });
  }

  static #resolveRollMode(visibility, originalMessage) {
    switch (visibility) {
      case "whisper_gm":
      case "gm":
        return CONST.DICE_ROLL_MODES.PRIVATE;
      case "blind":
        return CONST.DICE_ROLL_MODES.BLIND;
      case "same":
        if (originalMessage?.blind) return CONST.DICE_ROLL_MODES.BLIND;
        if (originalMessage?.whisper && originalMessage.whisper.length > 0) return CONST.DICE_ROLL_MODES.PRIVATE;
        return CONST.DICE_ROLL_MODES.PUBLIC;
      case "public":
      default:
        return CONST.DICE_ROLL_MODES.PUBLIC;
    }
  }
}
