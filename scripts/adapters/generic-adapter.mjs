import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Adaptador universal/genérico. Funciona em qualquer sistema inspecionando
 * dados nativos do Foundry VTT (faces, resultados e totais de Roll).
 */
export class GenericAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "generic";
    this.name = "Genérico (Universal)";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Qualquer Rolagem" },
      { value: "attack", label: "Contém 'Ataque' no texto" },
      { value: "check", label: "Contém 'Teste' ou 'Check' no texto" },
      { value: "save", label: "Contém 'Resistência' ou 'Save' no texto" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Qualquer Resultado" },
      { value: "nat1", label: "1 Natural (Falha Crítica em d20)" },
      { value: "nat20", label: "20 Natural (Sucesso Crítico em d20)" },
      { value: "min_face", label: "Face Mínima do Dado (1)" },
      { value: "max_face", label: "Face Máxima do Dado (Máx)" },
      { value: "custom_face", label: "Valor Específico de Face" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    // Filtro de tipo de ação genérico por texto
    if (rule.actionType && rule.actionType !== "any") {
      const text = `${message.flavor || ""} ${message.content || ""}`.toLowerCase();
      if (rule.actionType === "attack" && !text.includes("ataque") && !text.includes("attack")) return false;
      if (rule.actionType === "check" && !text.includes("teste") && !text.includes("check") && !text.includes("perícia")) return false;
      if (rule.actionType === "save" && !text.includes("resistência") && !text.includes("save") && !text.includes("salvaguarda")) return false;
    }

    const dice = this.getDiceResults(roll);
    if (dice.length === 0) return false;

    // Filtro por tipo de dado (se especificado, ex: d20, d100, etc.)
    const targetFaces = rule.dieType && rule.dieType !== "any" ? parseInt(rule.dieType.replace("d", ""), 10) : null;
    const matchingDice = targetFaces ? dice.filter(d => d.faces === targetFaces) : dice;

    if (targetFaces && matchingDice.length === 0) return false;

    // Filtro por condição de resultado
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
        name: "Falha Crítica (1 no d20)",
        enabled: true,
        actionType: "any",
        resultType: "nat1",
        dieType: "d20",
        effectType: "table",
        tableId: "",
        formula: "1d100",
        macroId: "",
        visibility: "public",
        flavor: "⚠️ Falha Crítica! Rolagem Extra acionada.",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "Sucesso Crítico (20 no d20)",
        enabled: true,
        actionType: "any",
        resultType: "nat20",
        dieType: "d20",
        effectType: "roll",
        tableId: "",
        formula: "1d6",
        macroId: "",
        visibility: "public",
        flavor: "⭐ Sucesso Crítico! Dano extra adicionado.",
        keyword: ""
      }
    ];
  }
}

