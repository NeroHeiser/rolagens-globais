import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Adaptador para Tormenta20 (tormenta20).
 * Reconhece testes de ataque, perícias e resistências (Fortitude/Reflexos/Vontade).
 */
export class Tormenta20Adapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "tormenta20";
    this.name = "Tormenta20";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Qualquer Rolagem" },
      { value: "attack", label: "Teste de Ataque" },
      { value: "skill", label: "Teste de Perícia" },
      { value: "save", label: "Teste de Resistência (Fort/Ref/Von)" },
      { value: "attribute", label: "Teste de Atributo" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Qualquer Resultado" },
      { value: "nat1", label: "Falha Crítica (1 no d20)" },
      { value: "threat", label: "Ameaça de Crítico (20 no d20)" },
      { value: "expanded_threat", label: "Margem de Ameaça (19 ou 20)" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    const t20Flags = message.flags?.tormenta20 || {};
    const flavor = (message.flavor || "").toLowerCase();
    const content = (message.content || "").toLowerCase();

    // Verificação de tipo de ação
    if (rule.actionType && rule.actionType !== "any") {
      switch (rule.actionType) {
        case "attack":
          if (!flavor.includes("ataque") && !content.includes("ataque") && t20Flags.rollType !== "attack") return false;
          break;
        case "skill":
          if (!flavor.includes("perícia") && !content.includes("perícia") && t20Flags.rollType !== "skill") return false;
          break;
        case "save":
          if (!flavor.includes("fortitude") && !flavor.includes("reflexos") && !flavor.includes("vontade") && !flavor.includes("resistência")) return false;
          break;
        case "attribute":
          if (!flavor.includes("atributo") && t20Flags.rollType !== "attribute") return false;
          break;
      }
    }

    const dice = this.getDiceResults(roll);
    const d20Dice = dice.filter(d => d.faces === 20);

    const hasNat1 = d20Dice.some(d => d.result === 1);
    const hasNat20 = d20Dice.some(d => d.result === 20);
    const has19or20 = d20Dice.some(d => d.result >= 19);

    switch (rule.resultType) {
      case "nat1":
        return hasNat1;
      case "threat":
        return hasNat20;
      case "expanded_threat":
        return has19or20;
      case "any":
      default:
        return true;
    }
  }

  getPresetRules() {
    return [
      {
        id: foundry.utils.randomID(),
        name: "T20: Erro Crítico em Ataque",
        enabled: true,
        actionType: "attack",
        resultType: "nat1",
        dieType: "d20",
        effectType: "table",
        tableId: "",
        formula: "1d100",
        macroId: "",
        visibility: "public",
        flavor: "💀 Tormenta20: Falha Crítica em Ataque!",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "T20: Ameaça de Crítico",
        enabled: true,
        actionType: "attack",
        resultType: "threat",
        dieType: "d20",
        effectType: "roll",
        tableId: "",
        formula: "1d8",
        macroId: "",
        visibility: "public",
        flavor: "⚔️ Tormenta20: Ameaça de Crítico!",
        keyword: ""
      }
    ];
  }
}

