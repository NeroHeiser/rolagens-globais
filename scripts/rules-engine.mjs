import { getActiveAdapter } from "./adapters/index.mjs";

export class RulesEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_RULES = "rules";

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
   * Inicializa o hook de escuta de mensagens do chat.
   */
  static initialize() {
    Hooks.on("createChatMessage", (message, options, userId) => {
      this.#onChatMessageCreated(message, userId);
    });
  }

  /**
   * Processador de nova mensagem no chat.
   */
  static async #onChatMessageCreated(message, userId) {
    // 1. Prevenção de Loop: ignora mensagens que já são rolagens extras deste módulo
    if (message.flags?.[this.MODULE_ID]?.isExtraRoll) {
      return;
    }

    // 2. Ignora mensagens originadas de RollTables (tanto automáticas quanto manuais)
    // Isso impede recursão infinita e impede que rolagens da tabela acionem gatilhos de ataque
    if (message.flags?.core?.RollTable || message.flags?.core?.table) {
      return;
    }

    // 3. Só processa se a mensagem contiver rolagens
    if (!message.rolls || message.rolls.length === 0) {
      return;
    }

    // 4. Seleção do cliente executor:
    // Garante que APENAS UM cliente na mesa execute a regra (o primeiro GM ativo conectado).
    // Se nenhum GM estiver conectado, o próprio autor da rolagem executa como fallback.
    const activeGMs = game.users.filter(u => u.active && u.isGM);
    const isPrimaryGM = activeGMs.length > 0 && activeGMs[0].id === game.user.id;
    const isAuthorFallback = activeGMs.length === 0 && message.isAuthor;

    if (!isPrimaryGM && !isAuthorFallback) {
      return;
    }

    // 5. Verificação de sobreposição a nível de Item (Modo Híbrido)
    const item = await this.#getItemFromMessage(message);
    if (item && item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) {
      return;
    }

    const rules = this.getRules();
    if (!rules || rules.length === 0) {
      return;
    }

    const adapter = getActiveAdapter();

    // 6. Avalia cada regra ativa para cada rolagem contida na mensagem
    for (const rule of rules) {
      if (!rule.enabled) continue;

      for (const roll of message.rolls) {
        if (adapter.matches(rule, message, roll)) {
          console.log(`Rolagens Globais | Gatilho ativado: "${rule.name}" (${rule.effectType})`);
          await this.#executeRule(rule, message, roll);
          break; // Evita disparar a mesma regra múltiplas vezes no mesmo conjunto de dados
        }
      }
    }
  }

  /**
   * Tenta identificar o item de origem da rolagem de forma agnóstica ou específica.
   */
  static async #getItemFromMessage(message) {
    if (message.item) return message.item;
    const itemUuid = message.flags?.dnd5e?.item?.uuid || message.flags?.dnd5e?.roll?.itemUuid;
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
   * Executa a consequência da regra ativada.
   */
  static async #executeRule(rule, originalMessage, originalRoll) {
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
  }

  /**
   * Executa a rolagem de uma Tabela Rolável (RollTable).
   */
  static async #executeTable(rule, originalMessage, rollMode) {
    if (!rule.tableId) {
      console.warn(`Rolagens Globais | Regra "${rule.name}" ativada, mas nenhuma tabela está selecionada.`);
      ui.notifications.warn(`Rolagens Globais: A regra "${rule.name}" foi ativada, mas nenhuma Tabela Rolável foi configurada nela. Abra o Gerenciador e selecione uma tabela.`);
      return;
    }

    let table = game.tables.get(rule.tableId);
    if (!table) {
      try {
        table = await fromUuid(rule.tableId);
      } catch {
        table = null;
      }
    }

    if (!table) {
      console.warn(`Rolagens Globais | Tabela não encontrada: ${rule.tableId}`);
      ui.notifications.warn(`Rolagens Globais: Tabela não encontrada para a regra "${rule.name}".`);
      return;
    }

    const flavor = rule.flavor || `${table.name} (Rolagem Extra)`;

    // Rola a tabela SEM criar mensagem automaticamente no chat
    const draw = await table.draw({ displayChat: false });

    // Publica o resultado no chat com as flags necessárias para prevenção de loop
    await table.toMessage(draw.results, {
      roll: draw.roll,
      messageData: {
        flavor: `<div class="rolagens-globais-badge"><i class="fas fa-dice"></i> ${flavor}</div>`,
        speaker: ChatMessage.getSpeaker({ actor: originalMessage.actor }),
        flags: {
          core: { RollTable: table.id },
          [this.MODULE_ID]: {
            isExtraRoll: true,
            originalMessageId: originalMessage.id,
            ruleId: rule.id
          }
        }
      },
      rollMode
    });
  }

  /**
   * Rola uma fórmula livre de dados e publica no chat.
   */
  static async #executeFormula(rule, originalMessage, rollMode) {
    if (!rule.formula) return;

    try {
      const extraRoll = new Roll(rule.formula);
      await extraRoll.evaluate();

      const flavor = rule.flavor || game.i18n.localize("ROLAGENS_GLOBAIS.Chat.TriggeredBadge");

      await extraRoll.toMessage(
        {
          speaker: ChatMessage.getSpeaker({ actor: originalMessage.actor }),
          flavor: `<div class="rolagens-globais-badge"><i class="fas fa-bolt"></i> ${flavor}</div>`,
          flags: {
            [this.MODULE_ID]: {
              isExtraRoll: true,
              originalMessageId: originalMessage.id,
              ruleId: rule.id
            }
          }
        },
        { rollMode }
      );
    } catch (err) {
      console.error(`Rolagens Globais | Erro ao avaliar fórmula: ${rule.formula}`, err);
    }
  }

  /**
   * Executa uma Macro do mundo.
   */
  static async #executeMacro(rule, originalMessage) {
    if (!rule.macroId) return;

    let macro = game.macros.get(rule.macroId);
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

    try {
      macro.execute({
        message: originalMessage,
        actor: originalMessage.actor,
        rule
      });
    } catch (err) {
      console.error(`Rolagens Globais | Erro ao executar macro: ${macro.name}`, err);
    }
  }

  /**
   * Determina o modo de rolagem para o chat com base na visibilidade escolhida.
   */
  static #resolveRollMode(visibility, originalMessage) {
    switch (visibility) {
      case "whisper_gm":
      case "gm":
        return CONST.DICE_ROLL_MODES.PRIVATE;
      case "blind":
        return CONST.DICE_ROLL_MODES.BLIND;
      case "same":
        if (originalMessage.blind) return CONST.DICE_ROLL_MODES.BLIND;
        if (originalMessage.whisper && originalMessage.whisper.length > 0) return CONST.DICE_ROLL_MODES.PRIVATE;
        return CONST.DICE_ROLL_MODES.PUBLIC;
      case "public":
      default:
        return CONST.DICE_ROLL_MODES.PUBLIC;
    }
  }
}
