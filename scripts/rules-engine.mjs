import { getActiveAdapter } from "./adapters/index.mjs";

export class RulesEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_RULES = "rules";
  static #processedIds = new Set();
  static isExecuting = false;

  /**
   * Registra as configurações do módulo no Foundry VTT.
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
   * Obtém a lista atual de regras configuradas.
   * @returns {Array<object>}
   */
  static getRules() {
    return game.settings.get(this.MODULE_ID, this.SETTING_RULES) || [];
  }

  /**
   * Salva a lista de regras no mundo.
   * @param {Array<object>} rules
   */
  static async saveRules(rules) {
    return await game.settings.set(this.MODULE_ID, this.SETTING_RULES, rules);
  }

  /**
   * Inicializa os hooks de escuta de rolagens.
   */
  static initialize() {
    // 1. Hook de pré-criação: Carimba a flag isExtraRoll no momento em que o módulo cria a rolagem
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

    // 2. Escuta de mensagens do chat criadas
    Hooks.on("createChatMessage", (message, options, userId) => {
      this.#onChatMessageCreated(message);
    });

    // 3. Hooks nativos do D&D 5e (para capturar disparos diretos de fichas e atividades)
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

  /**
   * Processador para rolagens capturadas diretamente por hooks do D&D 5e.
   */
  static async #onDnd5eDirectRoll(item, roll, rollType) {
    if (this.isExecuting) return;
    if (!this.#canExecute()) return;

    // Evita processar a mesma rolagem duas vezes
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
        console.log(`Rolagens Globais | ✅ Regra ATIVADA via D&D 5e: "${rule.name}"`);
        this.#processedIds.add(rollId);
        await this.#executeRule(rule, fakeMessage, roll);
        break;
      }
    }
  }

  /**
   * Processador de novas mensagens no chat.
   */
  static async #onChatMessageCreated(message) {
    // 1. Trava anti-loop: Se o módulo está executando uma rolagem extra agora, IGNORE!
    if (this.isExecuting) {
      return;
    }

    // 2. Prevenção por Flags
    if (message.flags?.[this.MODULE_ID]?.isExtraRoll) {
      return;
    }

    // 3. Ignora se for mensagem originada de RollTable (tanto automática quanto manual)
    if (message.isRollTable || message.flags?.core?.RollTable || message.flags?.core?.table) {
      return;
    }

    // 4. Ignora se o HTML do chat contém resultado de tabela
    if (message.content && (message.content.includes("table-result") || message.content.includes("table-draw") || message.content.includes("result-text"))) {
      return;
    }

    // 5. Ignora se o flavor indica ser tabela ou rolagem do módulo
    if (message.flavor && (message.flavor.includes("Tabela") || message.flavor.includes("Rolagem Extra") || message.flavor.includes("rolagens-globais"))) {
      return;
    }

    // 6. Só processa se houver rolagens
    if (!message.rolls || message.rolls.length === 0) {
      return;
    }

    // 7. Evita processar a mesma mensagem duas vezes
    if (this.#processedIds.has(message.id)) {
      return;
    }

    // 8. Seleção de Executor (Apenas o GM ativo executa)
    if (!this.#canExecute()) {
      return;
    }

    // 9. Modo Híbrido: Item com ignoreGlobal
    const item = await this.#getItemFromMessage(message);
    if (item && item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) {
      return;
    }

    const rules = this.getRules();
    if (!rules || rules.length === 0) {
      return;
    }

    const adapter = getActiveAdapter();

    // 10. Avalia cada regra para cada rolagem da mensagem
    for (const rule of rules) {
      if (!rule.enabled) continue;

      for (const roll of message.rolls) {
        if (adapter.matches(rule, message, roll)) {
          console.log(`Rolagens Globais | ✅ Regra ATIVADA via Chat: "${rule.name}"`);
          this.#processedIds.add(message.id);
          await this.#executeRule(rule, message, roll);
          break;
        }
      }
    }
  }

  /**
   * Determina se o cliente atual deve ser o executor do gatilho.
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

  /**
   * Tenta recuperar o Item da mensagem.
   */
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

  /**
   * Executa a regra com trava estrita contra recursão e loops.
   */
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
      console.error(`Rolagens Globais | Erro ao executar "${rule.name}":`, err);
      ui.notifications.error(`Rolagens Globais: Erro na regra "${rule.name}": ${err.message}`);
    } finally {
      // Mantém a trava ativa por 1 segundo após o disparo para que todas as mensagens do chat geradas terminem
      setTimeout(() => {
        this.isExecuting = false;
      }, 1000);
    }
  }

  /**
   * Executa o sorteio de uma Tabela Rolável nativa do Foundry.
   */
  static async #executeTable(rule, originalMessage, rollMode) {
    if (!rule.tableId) {
      ui.notifications.warn(`Rolagens Globais: A regra "${rule.name}" não possui tabela selecionada.`);
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
      ui.notifications.warn(`Rolagens Globais: Tabela "${rule.tableId}" não encontrada.`);
      return;
    }

    // Executa o sorteio oficial do Foundry VTT
    await table.draw({ rollMode: rollMode || CONST.DICE_ROLL_MODES.PUBLIC });
  }

  /**
   * Rola uma fórmula livre de dados e publica no chat.
   */
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

  /**
   * Executa uma Macro do mundo.
   */
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
      console.warn(`Rolagens Globais | Macro não encontrada: ${rule.macroId}`);
      return;
    }

    macro.execute({
      message: originalMessage,
      actor: originalMessage?.actor,
      rule
    });
  }

  /**
   * Determina o modo de rolagem para o chat com base na visibilidade.
   */
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
