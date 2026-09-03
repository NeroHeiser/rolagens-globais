import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Adaptador para Pathfinder 2ª Edição (pf2e).
 * Lê as flags nativas do PF2e: context.type e context.outcome (Graus de Sucesso).
 */
export class Pf2eAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "pf2e";
    this.name = "Pathfinder 2e";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Qualquer Rolagem" },
      { value: "attack-roll", label: "Golpe / Ataque (Strike)" },
      { value: "saving-throw", label: "Salvaguarda (Saving Throw)" },
      { value: "skill-check", label: "Teste de Perícia (Skill Check)" },
      { value: "perception-check", label: "Percepção" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Qualquer Resultado" },
      { value: "criticalFailure", label: "Falha Crítica (Critical Failure)" },
      { value: "criticalSuccess", label: "Sucesso Crítico (Critical Success)" },
      { value: "failure", label: "Falha Comum (Failure)" },
      { value: "success", label: "Sucesso Comum (Success)" },
      { value: "nat1", label: "1 Natural no d20" },
      { value: "nat20", label: "20 Natural no d20" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    const pf2eContext = message.flags?.pf2e?.context || {};
    const rollType = pf2eContext.type || "";
    const outcome = pf2eContext.outcome || "";
    const flavor = (message.flavor || "").toLowerCase();

    // Filtro por tipo de ação
    if (rule.actionType && rule.actionType !== "any") {
      if (rule.actionType === "attack-roll" && rollType !== "attack-roll" && !flavor.includes("strike") && !flavor.includes("golpe") && !flavor.includes("attack")) return false;
      if (rule.actionType === "saving-throw" && rollType !== "saving-throw" && !flavor.includes("saving throw") && !flavor.includes("salvaguarda")) return false;
      if (rule.actionType === "skill-check" && rollType !== "skill-check" && !flavor.includes("skill") && !flavor.includes("perícia")) return false;
      if (rule.actionType === "perception-check" && rollType !== "perception-check" && !flavor.includes("perception") && !flavor.includes("percepção")) return false;
    }

    // Graus de Sucesso nativos do PF2e
    if (rule.resultType === "criticalFailure") {
      if (outcome === "criticalFailure") return true;
      if (flavor.includes("critical failure") || flavor.includes("falha crítica")) return true;
    }

    if (rule.resultType === "criticalSuccess") {
      if (outcome === "criticalSuccess") return true;
      if (flavor.includes("critical success") || flavor.includes("sucesso crítico")) return true;
    }

    if (rule.resultType === "failure") {
      if (outcome === "failure") return true;
    }

    if (rule.resultType === "success") {
      if (outcome === "success") return true;
    }

    // Checagem de dados brutos
    const dice = this.getDiceResults(roll);
    const d20Dice = dice.filter(d => d.faces === 20);

    if (rule.resultType === "nat1") {
      return d20Dice.some(d => d.result === 1);
    }
    if (rule.resultType === "nat20") {
      return d20Dice.some(d => d.result === 20);
    }

    if (rule.resultType === "any") return true;

    return false;
  }

  getPresetRules() {
    return [
      {
        id: foundry.utils.randomID(),
        name: "PF2e: Falha Crítica em Golpe",
        enabled: true,
        actionType: "attack-roll",
        resultType: "criticalFailure",
        dieType: "d20",
        effectType: "table",
        tableId: "",
        formula: "1d100",
        macroId: "",
        visibility: "public",
        flavor: "💥 PF2e: Falha Crítica em Golpe!",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "PF2e: Sucesso Crítico em Golpe",
        enabled: true,
        actionType: "attack-roll",
        resultType: "criticalSuccess",
        dieType: "d20",
        effectType: "roll",
        tableId: "",
        formula: "1d10",
        macroId: "",
        visibility: "public",
        flavor: "⭐ PF2e: Sucesso Crítico!",
        keyword: ""
      }
    ];
  }
}

