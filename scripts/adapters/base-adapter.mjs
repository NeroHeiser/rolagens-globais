/**
 * Base class for Rolagens Globais system adapters.
 * Each supported system (D&D 5e, Tormenta20, PF2e, Daggerheart, Generic) extends this class.
 */
export class BaseAdapter {
  constructor() {
    this.id = "base";
    this.name = "Base Adapter";
  }

  /**
   * Returns action types supported by this system for display in forms.
   * @returns {Array<{value: string, label: string}>}
   */
  getActionTypes() {
    return [
      { value: "any", label: game.i18n.localize("ROLAGENS_GLOBAIS.Rule.ActionAny") }
    ];
  }

  /**
   * Returns result conditions supported by this system (e.g. Nat 1, Nat 20, Degrees of Success, Duality).
   * @returns {Array<{value: string, label: string}>}
   */
  getResultTypes() {
    return [
      { value: "any", label: game.i18n.localize("ROLAGENS_GLOBAIS.Rule.ResultAny") }
    ];
  }

  /**
   * Evaluates whether a chat message and its roll meet the rule criteria.
   * @param {object} rule - Rule configuration object.
   * @param {ChatMessage} message - Foundry VTT chat message.
   * @param {Roll} roll - Roll instance (if any).
   * @returns {boolean} - true if the rule trigger was activated.
   */
  matches(rule, message, roll) {
    if (!rule.enabled) return false;

    // Optional keyword filter
    if (rule.keyword && rule.keyword.trim() !== "") {
      const keyword = rule.keyword.toLowerCase().trim();
      const flavor = (message.flavor || "").toLowerCase();
      const content = (message.content || "").toLowerCase();
      if (!flavor.includes(keyword) && !content.includes(keyword)) {
        return false;
      }
    }

    // Roll total comparison
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
   * Helper extracting all active die terms from a roll.
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
   * Returns preset recommended rules for this system.
   * @returns {Array<object>}
   */
  getPresetRules() {
    return [];
  }
}

