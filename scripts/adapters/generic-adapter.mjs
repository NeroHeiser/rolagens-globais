import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Universal/generic adapter. Operates on any system by inspecting
 * Foundry VTT native roll data (die terms, results, and totals).
 */
export class GenericAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "generic";
    this.name = "Generic (Universal)";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Any Roll" },
      { value: "attack", label: "Contains 'Attack' in text" },
      { value: "check", label: "Contains 'Check' in text" },
      { value: "save", label: "Contains 'Save' in text" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Any Result" },
      { value: "nat1", label: "Natural 1 (Critical Fumble on d20)" },
      { value: "nat20", label: "Natural 20 (Critical Success on d20)" },
      { value: "min_face", label: "Minimum Die Face (1)" },
      { value: "max_face", label: "Maximum Die Face (Max)" },
      { value: "custom_face", label: "Specific Die Face" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    // Generic action type filtering by text
    if (rule.actionType && rule.actionType !== "any") {
      const text = `${message.flavor || ""} ${message.content || ""}`.toLowerCase();
      if (rule.actionType === "attack" && !text.includes("ataque") && !text.includes("attack")) return false;
      if (rule.actionType === "check" && !text.includes("teste") && !text.includes("check") && !text.includes("perícia") && !text.includes("skill")) return false;
      if (rule.actionType === "save" && !text.includes("resistência") && !text.includes("save") && !text.includes("salvaguarda")) return false;
    }

    const dice = this.getDiceResults(roll);
    if (dice.length === 0) return false;

    // Filter by die type (e.g. d20, d100)
    const targetFaces = rule.dieType && rule.dieType !== "any" ? parseInt(rule.dieType.replace("d", ""), 10) : null;
    const matchingDice = targetFaces ? dice.filter(d => d.faces === targetFaces) : dice;

    if (targetFaces && matchingDice.length === 0) return false;

    // Filter by result condition
    switch (rule.resultType) {
      case "nat1":
        return dice.some(d => d.faces === 20 && d.result === 1);

      case "nat20":
        return dice.some(d => d.faces === 20 && d.result === 20);

      case "min_face":
        return matchingDice.some(d => d.result === 1);

      case "max_face":
        return matchingDice.some(d => d.result === d.faces);

      case "custom_face":
        if (rule.dieFace !== undefined && rule.dieFace !== null && rule.dieFace !== "") {
          const target = Number(rule.dieFace);
          return matchingDice.some(d => d.result === target);
        }
        return true;

      case "any":
      default:
        return true;
    }
  }

  getPresetRules() {
    return [
      {
        id: foundry.utils.randomID(),
        name: "Critical Fumble (1 on d20)",
        enabled: true,
        actionType: "any",
        resultType: "nat1",
        dieType: "d20",
        effectType: "table",
        tableId: "",
        formula: "1d100",
        macroId: "",
        visibility: "public",
        flavor: "Critical Fumble! Extra roll triggered.",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "Critical Success (20 on d20)",
        enabled: true,
        actionType: "any",
        resultType: "nat20",
        dieType: "d20",
        effectType: "roll",
        tableId: "",
        formula: "1d6",
        macroId: "",
        visibility: "public",
        flavor: "Critical Success! Extra damage added.",
        keyword: ""
      }
    ];
  }
}

