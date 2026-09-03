/**
 * Classe base para os adaptadores de sistema do Rolagens Globais.
 * Cada sistema (D&D 5e, Tormenta20, PF2e, Daggerheart, Genérico) estende esta classe.
 */
export class BaseAdapter {
  constructor() {
    this.id = "base";
    this.name = "Base Adapter";
  }

  /**
   * Retorna os tipos de ação suportados por este sistema para exibição no formulário.
   * @returns {Array<{value: string, label: string}>}
   */
  getActionTypes() {
    return [
      { value: "any", label: game.i18n.localize("ROLAGENS_GLOBAIS.Rule.ActionAny") }
    ];
  }

  /**
   * Retorna os tipos de resultado suportados por este sistema (ex: Nat 1, Nat 20, Graus de Sucesso, Duality).
   * @returns {Array<{value: string, label: string}>}
   */
  getResultTypes() {
    return [
      { value: "any", label: game.i18n.localize("ROLAGENS_GLOBAIS.Rule.ResultAny") }
    ];
  }

  /**
   * Avalia se uma mensagem de chat e sua rolagem atendem aos critérios desta regra.
   * @param {object} rule - Objeto com as configurações da regra.
   * @param {ChatMessage} message - Mensagem do Foundry VTT.
   * @param {Roll} roll - Instância da rolagem (se houver).
   * @returns {boolean} - true se o gatilho foi ativado.
   */
  matches(rule, message, roll) {
    if (!rule.enabled) return false;

    // Filtro de palavra-chave (opcional)
    if (rule.keyword && rule.keyword.trim() !== "") {
      const keyword = rule.keyword.toLowerCase().trim();
      const flavor = (message.flavor || "").toLowerCase();
      const content = (message.content || "").toLowerCase();
      if (!flavor.includes(keyword) && !content.includes(keyword)) {
        return false;
      }
    }

    // Validação da soma total (se configurada)
    if (rule.totalComparison && rule.totalComparison !== "none" && roll) {
      const total = Number(roll.total);
      const targetVal = Number(rule.totalValue);
      if (!isNaN(targetVal)) {
        if (rule.totalComparison === "lt" && !(total <= targetVal)) return false;
        if (rule.totalComparison === "gt" && !(total >= targetVal)) return false;
        if (rule.totalComparison === "eq" && !(total === targetVal)) return false;
      }
    }

    return true;
  }

  /**
   * Helper para extrair todos os dados jogados (Die terms) de uma rolagem.
   * @param {Roll} roll
   * @returns {Array<{faces: number, result: number, active: boolean}>}
   */
  getDiceResults(roll) {
    if (!roll || !roll.terms) return [];
    const results = [];
    for (const term of roll.terms) {
      if (term.faces && Array.isArray(term.results)) {
        for (const res of term.results) {
          if (res.active !== false) {
            results.push({
              faces: term.faces,
              result: res.result,
              active: true
            });
          }
        }
      }
    }
    return results;
  }

  /**
   * Retorna regras recomendadas para este sistema ao clicar em "Carregar Regras Recomendadas".
   * @returns {Array<object>}
   */
  getPresetRules() {
    return [];
  }
}

