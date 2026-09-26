import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Adapter for Tormenta20 (tormenta20).
 * Detects attack rolls, skills, and saving throws (Fortitude/Reflex/Will).
 */
export class Tormenta20Adapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "tormenta20";
    this.name = "Tormenta20";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Any Roll" },
      { value: "attack", label: "Attack Roll" },
      { value: "skill", label: "Skill Check" },
      { value: "save", label: "Saving Throw (Fort/Ref/Will)" },
      { value: "attribute", label: "Attribute Check" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Any Result" },
      { value: "nat1", label: "Critical Fumble (1 on d20)" },
      { value: "threat", label: "Critical Threat (20 on d20)" },
      { value: "expanded_threat", label: "Expanded Threat (19 or 20)" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    const t20Flags = message.flags?.tormenta20 || {};
    const flavor = (message.flavor || "").toLowerCase();
    const content = (message.content || "").toLowerCase();

    // Action type verification
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
        name: "T20: Critical Fumble on Attack",
        enabled: true,
        actionType: "attack",
        resultType: "nat1",
        dieType: "d20",
        effectType: "table",
        tableId: "",
        formula: "1d100",
        macroId: "",
        visibility: "public",
        flavor: "Tormenta20: Critical Fumble on Attack!",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "T20: Critical Threat",
        enabled: true,
        actionType: "attack",
        resultType: "threat",
        dieType: "d20",
        effectType: "roll",
        tableId: "",
        formula: "1d8",
        macroId: "",
        visibility: "public",
        flavor: "Tormenta20: Critical Threat!",
        keyword: ""
      }
    ];
  }
}

