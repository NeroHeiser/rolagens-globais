import { getActiveAdapter } from "./adapters/index.mjs";

export class RulesEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_RULES = "rules";
  static #processedMessages = new Set();

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
   * Inicializa os hooks de escuta de mensagens do chat (criação e atualização).
   */
  static initialize() {
    Hooks.on("createChatMessage", (message, options, userId) => {
      this.#onChatMessageReceived(message, "create");
    });

    Hooks.on("updateChatMessage", (message, changes, options, userId) => {
      this.#onChatMessageReceived(message, "update");
    });
  }

  /**
   * Processador central de mensagens do chat (criação e atualização assíncrona).
   */
  static async #onChatMessageReceived(message, eventSource) {
    // 1. Prevenção de Loop: ignora mensagens que já são rolagens extras deste módulo
    if (message.flags?.[this.MODULE_ID]?.isExtraRoll) {
      return;
    }

    // 2. Ignora mensagens originadas de RollTables (para não avaliar a tabela como um novo ataque)
    if (message.flags?.core?.RollTable || message.flags?.core?.table) {
      return;
    }

    // 3. Só processa se a mensagem contiver rolagens avaliadas
    if (!message.rolls || message.rolls.length === 0) {
      return;
    }

    // 4. Evita processar a mesma mensagem duas vezes
    if (this.#processedMessages.has(message.id)) {
      return;
    }

    // 5. Seleção de Executor:
    // Se o cliente atual for um GM, ele tem prioridade para executar (garante permissões).
    // Se houver múltiplos GMs, apenas o primeiro executa para não duplicar rolagens.
    const isGM = game.user.isGM;
    if (!isGM) {
      // Se não for GM mas houver GM conectado, deixa o GM processar
      const hasOnlineGM = game.users.some(u => u.isGM && u.active);
      if (hasOnlineGM) return;
    } else {
      // Se for GM, garante que apenas um GM ativo execute
      const gms = game.users.filter(u => u.isGM && (u.active || u.id === game.user.id));
      if (gms.length > 0 && gms[0].id !== game.user.id) {
        return;
      }
    }

    // 6. Verificação de sobreposição a nível de Item (Modo Híbrido)
    const item = await this.#getItemFromMessage(message);
    if (item && item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) {
      return;
    }

    const rules = this.getRules();
    if (!rules || rules.length === 0) {
      return;
    }

    console.log(`Rolagens Globais | [${eventSource}] Inspecionando mensagem ${message.id}. Regras ativas: ${rules.filter(r => r.enabled).length}`);

    const adapter = getActiveAdapter();

    // 7. Avalia cada regra ativa para cada rolagem contida na mensagem
    for (const rule of rules) {
      if (!rule.enabled) continue;

      for (const roll of message.rolls) {
        if (adapter.matches(rule, message, roll)) {
          console.log(`Rolagens Globais | ✅ Regra ATIVADA: "${rule.name}" (${rule.effectType})`);
          this.#processedMessages.add(message.id);
          await this.#executeRule(rule, message, roll);
          break; // Dispara uma vez por regra por mensagem
        }
      }
    }
  }

  /**
   * Tenta identificar o item de origem da rolagem de forma agnóstica ou específica.
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
   * Executa a consequência da regra ativada com tratamento de erros.
   */
  static async #executeRule(rule, originalMessage, originalRoll) {
    const rollMode = this.#resolveRollMode(rule.visibility, originalMessage);

    try {
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
      console.error(`Rolagens Globais | Erro ao executar regra "${rule.name}":`, err);
      ui.notifications.error(`Rolagens Globais: Erro na regra "${rule.name}": ${err.message}`);
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

    // Busca por ID, por Nome ou por UUID
    let table = game.tables.get(rule.tableId) || game.tables.getName(rule.tableId);
    if (!table) {
      try {
        table = await fromUuid(rule.tableId);
      } catch {
        table = null;
      }
    }

    if (!table) {
      console.warn(`Rolagens Globais | Tabela não encontrada: ${rule.tableId}`);
      ui.notifications.warn(`Rolagens Globais: Tabela "${rule.tableId}" não encontrada no mundo para a regra "${rule.name}".`);
      return;
    }

    const flavor = rule.flavor || `${table.name} (Rolagem Extra)`;

    // Rola a tabela sem publicar automaticamente no chat
    const draw = await table.draw({ displayChat: false });

    if (!draw || !draw.results || draw.results.length === 0) {
      console.warn(`Rolagens Globais | A tabela ${table.name} não retornou resultados ao rolar.`);
      return;
    }

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
      actor: originalMessage.actor,
      rule
    });
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
