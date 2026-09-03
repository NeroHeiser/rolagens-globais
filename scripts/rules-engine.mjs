import { getActiveAdapter } from "./adapters/index.mjs";

export class RulesEngine {
  static MODULE_ID = "rolagens-globais";
  static SETTING_RULES = "rules";
  static #processedMessages = new Set();
  static #isExecuting = false;

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
   * Inicializa os hooks de escuta do chat e hooks específicos de sistemas.
   */
  static initialize() {
    // 1. Escuta de mensagens do chat (Criação e Atualização)
    Hooks.on("createChatMessage", (message, options, userId) => {
      this.#onChatMessageReceived(message, "create");
    });

    Hooks.on("updateChatMessage", (message, changes, options, userId) => {
      this.#onChatMessageReceived(message, "update");
    });

    // 2. Hooks nativos do D&D 5e (Captura disparos de fichas, armas e atividades diretamente)
    if (game.system.id === "dnd5e") {
      Hooks.on("dnd5e.rollAttack", (item, roll) => {
        this.#onDnd5eRoll(item, roll, "attack");
      });

      Hooks.on("dnd5e.rollDamage", (item, roll) => {
        this.#onDnd5eRoll(item, roll, "damage");
      });

      // Suporte ao sistema de Activities do D&D 5e v4
      Hooks.on("dnd5e.postActivityUse", (activity, usage, results) => {
        if (!results || !results.rolls) return;
        for (const roll of results.rolls) {
          const type = activity?.type === "attack" ? "attack" : (activity?.type === "damage" ? "damage" : "action");
          this.#onDnd5eRoll(activity?.item, roll, type);
        }
      });
    }
  }

  /**
   * Processador de rolagens nativas do D&D 5e (disparadas por armas ou magias na ficha).
   */
  static async #onDnd5eRoll(item, roll, rollType) {
    // Bloqueia se já estiver executando uma rolagem extra (anti-loop)
    if (this.#isExecuting) return;

    if (!this.#canExecute()) return;

    if (item && item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) {
      return;
    }

    const rules = this.getRules();
    if (!rules || rules.length === 0) return;

    const adapter = getActiveAdapter();

    // Mensagem simulada para passar pelo adaptador
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
        console.log(`Rolagens Globais | ✅ D&D 5e [${rollType}] Regra ATIVADA: "${rule.name}" (${rule.effectType})`);
        await this.#executeRule(rule, fakeMessage, roll);
        break;
      }
    }
  }

  /**
   * Processador central de mensagens do chat.
   */
  static async #onChatMessageReceived(message, eventSource) {
    // 1. Trava anti-loop absoluta: se o módulo está gerando uma rolagem no momento, ignora qualquer mensagem
    if (this.#isExecuting) {
      return;
    }

    // 2. Prevenção de Loop: ignora mensagens com flag de rolagem extra
    if (message.flags?.[this.MODULE_ID]?.isExtraRoll) {
      return;
    }

    // 3. Ignora mensagens originadas de RollTables (para nunca disparar em resultados de tabelas)
    if (message.isRollTable || message.flags?.core?.RollTable || message.flags?.core?.table) {
      return;
    }

    // 4. Ignora mensagens cujo conteúdo HTML contenha marcação de resultado de tabela
    if (message.content && (message.content.includes("table-result") || message.content.includes("table-draw"))) {
      return;
    }

    // 5. Só processa se a mensagem contiver rolagens avaliadas
    if (!message.rolls || message.rolls.length === 0) {
      return;
    }

    // 6. Evita processar a mesma mensagem duas vezes
    if (this.#processedMessages.has(message.id)) {
      return;
    }

    // 7. Seleção de Executor (apenas 1 cliente na mesa executa)
    if (!this.#canExecute()) {
      return;
    }

    // 8. Verificação de sobreposição a nível de Item (Modo Híbrido)
    const item = await this.#getItemFromMessage(message);
    if (item && item.flags?.[this.MODULE_ID]?.ignoreGlobal === true) {
      return;
    }

    const rules = this.getRules();
    if (!rules || rules.length === 0) {
      return;
    }

    const adapter = getActiveAdapter();

    // 9. Avalia cada regra ativa para cada rolagem contida na mensagem
    for (const rule of rules) {
      if (!rule.enabled) continue;

      for (const roll of message.rolls) {
        if (adapter.matches(rule, message, roll)) {
          console.log(`Rolagens Globais | ✅ Regra ATIVADA via Chat: "${rule.name}" (${rule.effectType})`);
          this.#processedMessages.add(message.id);
          await this.#executeRule(rule, message, roll);
          break;
        }
      }
    }
  }

  /**
   * Verifica se este cliente é o responsável por executar as regras no mundo.
   */
  static #canExecute() {
    const isGM = game.user.isGM;
    if (!isGM) {
      const hasOnlineGM = game.users.some(u => u.isGM && u.active);
      if (hasOnlineGM) return false;
      return true;
    } else {
      const gms = game.users.filter(u => u.isGM && (u.active || u.id === game.user.id));
      return gms.length === 0 || gms[0].id === game.user.id;
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
   * Executa a consequência da regra ativada com proteção anti-loop estrita.
   */
  static async #executeRule(rule, originalMessage, originalRoll) {
    if (this.#isExecuting) return;
    this.#isExecuting = true;

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
      console.error(`Rolagens Globais | Erro ao executar regra "${rule.name}":`, err);
      ui.notifications.error(`Rolagens Globais: Erro na regra "${rule.name}": ${err.message}`);
    } finally {
      // Pequeno intervalo para garantir que os eventos do chat gerados pela rolagem terminem antes de liberar novos gatilhos
      setTimeout(() => {
        this.#isExecuting = false;
      }, 350);
    }
  }

  /**
   * Executa a rolagem de uma Tabela Rolável (RollTable).
   */
  static async #executeTable(rule, originalMessage, rollMode) {
    if (!rule.tableId) {
      ui.notifications.warn(`Rolagens Globais: A regra "${rule.name}" foi ativada, mas nenhuma Tabela Rolável foi configurada nela.`);
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
      ui.notifications.warn(`Rolagens Globais: Tabela "${rule.tableId}" não encontrada no mundo para a regra "${rule.name}".`);
      return;
    }

    const flavor = rule.flavor || `${table.name} (Rolagem Extra)`;

    // Rola a tabela sem publicar automaticamente no chat
    const draw = await table.draw({ displayChat: false });

    if (!draw || !draw.results || draw.results.length === 0) {
      return;
    }

    // Publica o resultado no chat com as flags necessárias para prevenção de loop
    const createdMsg = await table.toMessage(draw.results, {
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

    if (createdMsg) {
      this.#processedMessages.add(createdMsg.id);
    }
  }

  /**
   * Rola uma fórmula livre de dados e publica no chat.
   */
  static async #executeFormula(rule, originalMessage, rollMode) {
    if (!rule.formula) return;

    const extraRoll = new Roll(rule.formula);
    await extraRoll.evaluate();

    const flavor = rule.flavor || game.i18n.localize("ROLAGENS_GLOBAIS.Chat.TriggeredBadge");

    const createdMsg = await extraRoll.toMessage(
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

    if (createdMsg) {
      this.#processedMessages.add(createdMsg.id);
    }
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
        if (originalMessage?.blind) return CONST.DICE_ROLL_MODES.BLIND;
        if (originalMessage?.whisper && originalMessage.whisper.length > 0) return CONST.DICE_ROLL_MODES.PRIVATE;
        return CONST.DICE_ROLL_MODES.PUBLIC;
      case "public":
      default:
        return CONST.DICE_ROLL_MODES.PUBLIC;
    }
  }
}
