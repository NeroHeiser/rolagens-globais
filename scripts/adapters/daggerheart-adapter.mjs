import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Adaptador para Daggerheart (daggerheart).
 * Reconhece a mecânica fundamental de Duality Dice (2d12: Esperança e Medo).
 */
export class DaggerheartAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "daggerheart";
    this.name = "Daggerheart";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Qualquer Rolagem" },
      { value: "action", label: "Rolagem de Ação (Action Roll)" },
      { value: "attack", label: "Rolagem de Ataque" },
      { value: "reaction", label: "Rolagem de Reação" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Qualquer Resultado" },
      { value: "critical", label: "Sucesso Crítico (Duplas no 2d12 / Hope = Fear)" },
      { value: "fear", label: "Com Medo (Fear > Hope)" },
      { value: "hope", label: "Com Esperança (Hope > Fear)" },
      { value: "nat1_both", label: "1 em Ambos os Dados (Falha Catastrófica)" },
      { value: "nat12_both", label: "12 em Ambos os Dados (Crítico Perfeito)" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    const flavor = (message.flavor || "").toLowerCase();
    const content = (message.content || "").toLowerCase();
    const dhFlags = message.flags?.daggerheart || {};

    // Filtro de tipo de ação
    if (rule.actionType && rule.actionType !== "any") {
      if (rule.actionType === "attack" && !flavor.includes("attack") && !flavor.includes("ataque")) return false;
      if (rule.actionType === "reaction" && !flavor.includes("reaction") && !flavor.includes("reação")) return false;
    }

    // Extrair os dados de 12 faces
    const dice = this.getDiceResults(roll);
    const d12Dice = dice.filter(d => d.faces === 12);

    // Se houver flags nativas de Hope e Fear
    let hopeVal = dhFlags.hope ?? null;
    let fearVal = dhFlags.fear ?? null;

    // Se não estiver nas flags, inspeciona os dois primeiros d12 da rolagem
    if (hopeVal === null && d12Dice.length >= 2) {
      hopeVal = d12Dice[0].result;
      fearVal = d12Dice[1].result;
    }

    const hasDuality = hopeVal !== null && fearVal !== null;

    switch (rule.resultType) {
      case "critical":
        // No Daggerheart, números iguais em ambos os dados de 12 faces configuram Crítico
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
        name: "Daggerheart: Sucesso Crítico (Duplas no 2d12)",
        enabled: true,
        actionType: "any",
        resultType: "critical",
        dieType: "d12",
        effectType: "roll",
        tableId: "",
        formula: "1d6",
        macroId: "",
        visibility: "public",
        flavor: "✨ Daggerheart: Sucesso Crítico (Duplas no 2d12)!",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "Daggerheart: Complicação com Medo",
        enabled: true,
        actionType: "any",
        resultType: "fear",
        dieType: "d12",
        effectType: "table",
        tableId: "",
        formula: "1d20",
        macroId: "",
        visibility: "gm",
        flavor: "👁️ Daggerheart: Rolagem com Medo (Fear > Hope)!",
        keyword: ""
      }
    ];
  }
}

