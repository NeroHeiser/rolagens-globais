import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Adaptador específico para D&D 5ª Edição (dnd5e).
 * Lê flags nativas do sistema (flags.dnd5e.roll.type, isCritical, isFumble).
 */
export class Dnd5eAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "dnd5e";
    this.name = "Dungeons & Dragons 5e";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Qualquer Rolagem" },
      { value: "attack", label: "Qualquer Ataque" },
      { value: "weaponAttack", label: "Ataque com Arma" },
      { value: "spellAttack", label: "Ataque com Magia" },
      { value: "save", label: "Teste de Resistência (Save)" },
      { value: "skill", label: "Teste de Perícia" },
      { value: "ability", label: "Teste de Atributo" },
      { value: "death", label: "Salvaguarda contra a Morte" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Qualquer Resultado" },
      { value: "nat1", label: "Falha Crítica (1 Natural)" },
      { value: "nat20", label: "Acerto Crítico (20 Natural / Crítico)" },
      { value: "death1", label: "1 na Salvaguarda da Morte" },
      { value: "death20", label: "20 na Salvaguarda da Morte" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    const dndFlags = message.flags?.dnd5e?.roll || {};
    const rollType = dndFlags.type || "";
    const flavor = (message.flavor || "").toLowerCase();

    // Verificação do tipo de ação
    if (rule.actionType && rule.actionType !== "any") {
      switch (rule.actionType) {
        case "attack":
          if (rollType !== "attack" && !flavor.includes("ataque") && !flavor.includes("attack")) return false;
          break;
        case "weaponAttack":
          if (!flavor.includes("arma") && !flavor.includes("weapon") && rollType !== "attack") return false;
          break;
        case "spellAttack":
          if (!flavor.includes("magia") && !flavor.includes("spell") && rollType !== "attack") return false;
          break;
        case "save":
          if (rollType !== "save" && !flavor.includes("resistência") && !flavor.includes("save")) return false;
          break;
        case "skill":
          if (rollType !== "skill" && !flavor.includes("perícia") && !flavor.includes("skill")) return false;
          break;
        case "ability":
          if (rollType !== "ability" && !flavor.includes("atributo") && !flavor.includes("ability")) return false;
          break;
        case "death":
          if (rollType !== "death" && !flavor.includes("morte") && !flavor.includes("death")) return false;
          break;
      }
    }

    const dice = this.getDiceResults(roll);
    const d20Dice = dice.filter(d => d.faces === 20);

    const hasNat1 = dndFlags.isFumble || d20Dice.some(d => d.result === 1);
    const hasNat20 = dndFlags.isCritical || d20Dice.some(d => d.result === 20);

    // Verificação da condição de resultado
    switch (rule.resultType) {
      case "nat1":
        return hasNat1;
      case "nat20":
        return hasNat20;
      case "death1":
        return (rollType === "death" || flavor.includes("morte")) && hasNat1;
      case "death20":
        return (rollType === "death" || flavor.includes("morte")) && hasNat20;
      case "any":
      default:
        return true;
    }
  }

  getPresetRules() {
    return [
      {
        id: foundry.utils.randomID(),
        name: "D&D 5e: Erro Crítico em Ataque",
        enabled: true,
        actionType: "attack",
        resultType: "nat1",
        dieType: "d20",
        effectType: "table",
        tableId: "",
        formula: "1d100",
        macroId: "",
        visibility: "public",
        flavor: "💥 D&D 5e: Falha Crítica em Ataque!",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "D&D 5e: Acerto Crítico em Ataque",
        enabled: true,
        actionType: "attack",
        resultType: "nat20",
        dieType: "d20",
        effectType: "roll",
        tableId: "",
        formula: "1d6",
        macroId: "",
        visibility: "public",
        flavor: "⭐ D&D 5e: Acerto Crítico!",
        keyword: ""
      }
    ];
  }
}

