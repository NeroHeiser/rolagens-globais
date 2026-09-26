import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Adapter for Daggerheart (daggerheart).
 * Detects fundamental mechanics of Duality Dice (2d12: Hope and Fear).
 */
export class DaggerheartAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "daggerheart";
    this.name = "Daggerheart";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Any Roll" },
      { value: "action", label: "Action Roll" },
      { value: "attack", label: "Attack Roll" },
      { value: "reaction", label: "Reaction Roll" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Any Result" },
      { value: "critical", label: "Critical Success (Doubles on 2d12 / Hope = Fear)" },
      { value: "fear", label: "With Fear (Fear > Hope)" },
      { value: "hope", label: "With Hope (Hope > Fear)" },
      { value: "nat1_both", label: "1 on Both Dice (Critical Failure)" },
      { value: "nat12_both", label: "12 on Both Dice (Perfect Critical)" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    const flavor = (message.flavor || "").toLowerCase();
    const content = (message.content || "").toLowerCase();
    const dhFlags = message.flags?.daggerheart || {};

    // Action type filtering
    if (rule.actionType && rule.actionType !== "any") {
      if (rule.actionType === "attack" && !flavor.includes("attack") && !flavor.includes("ataque")) return false;
      if (rule.actionType === "reaction" && !flavor.includes("reaction") && !flavor.includes("reação")) return false;
    }

    // Extract 12-sided dice
    const dice = this.getDiceResults(roll);
    const d12Dice = dice.filter(d => d.faces === 12);

    let hopeVal = dhFlags.hope ?? null;
    let fearVal = dhFlags.fear ?? null;

    if (hopeVal === null && d12Dice.length >= 2) {
      hopeVal = d12Dice[0].result;
      fearVal = d12Dice[1].result;
    }

    const hasDuality = hopeVal !== null && fearVal !== null;

    switch (rule.resultType) {
      case "critical":
        if (hasDuality) return hopeVal === fearVal;
        if (d12Dice.length >= 2) return d12Dice[0].result === d12Dice[1].result;
        return false;

      case "fear":
        if (hasDuality) return fearVal > hopeVal;
        if (flavor.includes("fear") || content.includes("fear") || flavor.includes("medo")) return true;
        return false;

      case "hope":
        if (hasDuality) return hopeVal > fearVal;
        if (flavor.includes("hope") || content.includes("hope") || flavor.includes("esperança")) return true;
        return false;

      case "nat1_both":
        if (hasDuality) return hopeVal === 1 && fearVal === 1;
        return d12Dice.length >= 2 && d12Dice[0].result === 1 && d12Dice[1].result === 1;

      case "nat12_both":
        if (hasDuality) return hopeVal === 12 && fearVal === 12;
        return d12Dice.length >= 2 && d12Dice[0].result === 12 && d12Dice[1].result === 12;

      case "any":
      default:
        return true;
    }
  }

  getPresetRules() {
    return [
      {
        id: foundry.utils.randomID(),
        name: "Daggerheart: Critical Success (Doubles on 2d12)",
        enabled: true,
        actionType: "any",
        resultType: "critical",
        dieType: "d12",
        effectType: "roll",
        tableId: "",
        formula: "1d6",
        macroId: "",
        visibility: "public",
        flavor: "Daggerheart: Critical Success (Doubles on 2d12)!",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "Daggerheart: Complication with Fear",
        enabled: true,
        actionType: "any",
        resultType: "fear",
        dieType: "d12",
        effectType: "table",
        tableId: "",
        formula: "1d20",
        macroId: "",
        visibility: "gm",
        flavor: "Daggerheart: Roll with Fear (Fear > Hope)!",
        keyword: ""
      }
    ];
  }
}

