import { BaseAdapter } from "./base-adapter.mjs";

/**
 * Adapter specifically for D&D 5th Edition (dnd5e v3 and v4).
 * Reads native system flags (flags.dnd5e, activities, isCritical, isFumble).
 */
export class Dnd5eAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = "dnd5e";
    this.name = "Dungeons & Dragons 5e";
  }

  getActionTypes() {
    return [
      { value: "any", label: "Any Roll" },
      { value: "attack", label: "Any Attack" },
      { value: "weaponAttack", label: "Weapon Attack" },
      { value: "spellAttack", label: "Spell Attack" },
      { value: "save", label: "Saving Throw" },
      { value: "skill", label: "Skill Check" },
      { value: "ability", label: "Ability Check" },
      { value: "death", label: "Death Saving Throw" }
    ];
  }

  getResultTypes() {
    return [
      { value: "any", label: "Any Result" },
      { value: "nat1", label: "Critical Fumble (Natural 1)" },
      { value: "nat20", label: "Critical Hit (Natural 20)" },
      { value: "death1", label: "1 on Death Save" },
      { value: "death20", label: "20 on Death Save" }
    ];
  }

  matches(rule, message, roll) {
    if (!super.matches(rule, message, roll)) return false;
    if (!roll) return false;

    const dndFlags = message.flags?.dnd5e?.roll || {};
    const rollType = dndFlags.type || message.flags?.dnd5e?.type || "";
    const activityType = message.flags?.dnd5e?.activity?.type || "";
    const flavor = (message.flavor || "").toLowerCase();
    const content = (message.content || "").toLowerCase();
    const fullText = `${flavor} ${content}`;

    // Action type verification
    if (rule.actionType && rule.actionType !== "any") {
      const isAttack = rollType === "attack" || activityType === "attack" || fullText.includes("ataque") || fullText.includes("attack");
      const isSave = rollType === "save" || activityType === "save" || fullText.includes("resistência") || fullText.includes("save") || fullText.includes("salvaguarda");
      const isSkill = rollType === "skill" || activityType === "skill" || fullText.includes("perícia") || fullText.includes("skill");
      const isAbility = rollType === "ability" || fullText.includes("atributo") || fullText.includes("ability") || fullText.includes("teste de");
      const isDeath = rollType === "death" || fullText.includes("morte") || fullText.includes("death");

      switch (rule.actionType) {
        case "attack":
          if (!isAttack) return false;
          break;
        case "weaponAttack":
          if (!isAttack) return false;
          if (!fullText.includes("arma") && !fullText.includes("weapon") && !fullText.includes("corpo a corpo") && !fullText.includes("à distância")) return false;
          break;
        case "spellAttack":
          if (!isAttack) return false;
          if (!fullText.includes("magia") && !fullText.includes("spell")) return false;
          break;
        case "save":
          if (!isSave) return false;
          break;
        case "skill":
          if (!isSkill) return false;
          break;
        case "ability":
          if (!isAbility) return false;
          break;
        case "death":
          if (!isDeath) return false;
          break;
      }
    }

    const dice = this.getDiceResults(roll);
    const d20Dice = dice.filter(d => d.faces === 20);

    const hasNat1 = dndFlags.isFumble || roll.isFumble || d20Dice.some(d => d.result === 1);
    const hasNat20 = dndFlags.isCritical || roll.isCritical || d20Dice.some(d => d.result === 20);

    // Result condition verification
    switch (rule.resultType) {
      case "nat1":
        return hasNat1;
      case "nat20":
        return hasNat20;
      case "death1":
        return (rollType === "death" || fullText.includes("morte")) && hasNat1;
      case "death20":
        return (rollType === "death" || fullText.includes("morte")) && hasNat20;
      case "any":
      default:
        return true;
    }
  }

  getPresetRules() {
    return [
      {
        id: foundry.utils.randomID(),
        name: "D&D 5e: Critical Fumble on Attack",
        enabled: true,
        actionType: "attack",
        resultType: "nat1",
        dieType: "d20",
        effectType: "table",
        tableId: "",
        formula: "1d100",
        macroId: "",
        visibility: "public",
        flavor: "D&D 5e: Critical Fumble on Attack!",
        keyword: ""
      },
      {
        id: foundry.utils.randomID(),
        name: "D&D 5e: Critical Hit on Attack",
        enabled: true,
        actionType: "attack",
        resultType: "nat20",
        dieType: "d20",
        effectType: "roll",
        tableId: "",
        formula: "1d6",
        macroId: "",
        visibility: "public",
        flavor: "D&D 5e: Critical Hit!",
        keyword: ""
      }
    ];
  }
}
