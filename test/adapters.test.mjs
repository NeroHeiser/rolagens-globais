import "./helpers/foundry-mock.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BaseAdapter } from "../scripts/adapters/base-adapter.mjs";
import { GenericAdapter } from "../scripts/adapters/generic-adapter.mjs";
import { Dnd5eAdapter } from "../scripts/adapters/dnd5e-adapter.mjs";
import { DaggerheartAdapter } from "../scripts/adapters/daggerheart-adapter.mjs";
import { Tormenta20Adapter } from "../scripts/adapters/t20-adapter.mjs";
import { Pf2eAdapter } from "../scripts/adapters/pf2e-adapter.mjs";

describe("System Adapters", () => {
  describe("BaseAdapter", () => {
    const adapter = new BaseAdapter();

    it("returns false if rule is disabled", () => {
      const rule = { enabled: false };
      assert.equal(adapter.matches(rule, {}, {}), false);
    });

    it("filters by keyword in message flavor or content", () => {
      const rule = { enabled: true, keyword: "fireball" };
      assert.equal(adapter.matches(rule, { flavor: "Cast Fireball Spell" }, {}), true);
      assert.equal(adapter.matches(rule, { content: "Took 20 fireball damage" }, {}), true);
      assert.equal(adapter.matches(rule, { flavor: "Attack with sword" }, {}), false);
    });

    it("evaluates roll total comparisons", () => {
      const roll = { total: 15 };
      assert.equal(adapter.matches({ enabled: true, totalComparison: "gt", totalValue: 12 }, {}, roll), true);
      assert.equal(adapter.matches({ enabled: true, totalComparison: "gt", totalValue: 18 }, {}, roll), false);
      assert.equal(adapter.matches({ enabled: true, totalComparison: "lt", totalValue: 15 }, {}, roll), true);
      assert.equal(adapter.matches({ enabled: true, totalComparison: "lt", totalValue: 10 }, {}, roll), false);
      assert.equal(adapter.matches({ enabled: true, totalComparison: "eq", totalValue: 15 }, {}, roll), true);
      assert.equal(adapter.matches({ enabled: true, totalComparison: "eq", totalValue: 14 }, {}, roll), false);
    });

    it("extracts active dice terms correctly", () => {
      const mockRoll = {
        terms: [
          { faces: 20, results: [{ result: 1, active: false }, { result: 20, active: true }] },
          { faces: 6, results: [{ result: 5, active: true }] }
        ]
      };
      const dice = adapter.getDiceResults(mockRoll);
      assert.equal(dice.length, 2);
      assert.deepEqual(dice[0], { faces: 20, result: 20, active: true });
      assert.deepEqual(dice[1], { faces: 6, result: 5, active: true });
    });
  });

  describe("GenericAdapter", () => {
    const adapter = new GenericAdapter();

    it("detects natural 1 and natural 20 on d20", () => {
      const rollNat1 = { terms: [{ faces: 20, results: [{ result: 1, active: true }] }] };
      const rollNat20 = { terms: [{ faces: 20, results: [{ result: 20, active: true }] }] };

      assert.equal(adapter.matches({ enabled: true, resultType: "nat1" }, {}, rollNat1), true);
      assert.equal(adapter.matches({ enabled: true, resultType: "nat1" }, {}, rollNat20), false);
      assert.equal(adapter.matches({ enabled: true, resultType: "nat20" }, {}, rollNat20), true);
      assert.equal(adapter.matches({ enabled: true, resultType: "nat20" }, {}, rollNat1), false);
    });

    it("detects min face and max face on arbitrary dice", () => {
      const rollD8 = { terms: [{ faces: 8, results: [{ result: 8, active: true }] }] };
      assert.equal(adapter.matches({ enabled: true, resultType: "max_face", dieType: "d8" }, {}, rollD8), true);
      assert.equal(adapter.matches({ enabled: true, resultType: "min_face", dieType: "d8" }, {}, rollD8), false);
    });

    it("detects custom face value", () => {
      const roll = { terms: [{ faces: 10, results: [{ result: 7, active: true }] }] };
      assert.equal(adapter.matches({ enabled: true, resultType: "custom_face", dieType: "d10", dieFace: 7 }, {}, roll), true);
      assert.equal(adapter.matches({ enabled: true, resultType: "custom_face", dieType: "d10", dieFace: 4 }, {}, roll), false);
    });
  });

  describe("Dnd5eAdapter", () => {
    const adapter = new Dnd5eAdapter();

    it("identifies attack rolls and criticals", () => {
      const attackMessage = {
        flavor: "Longsword Attack",
        flags: { dnd5e: { roll: { type: "attack", isCritical: true } } }
      };
      const rollCrit = {
        terms: [{ faces: 20, results: [{ result: 20, active: true }] }],
        isCritical: true
      };

      assert.equal(adapter.matches({ enabled: true, actionType: "attack", resultType: "nat20" }, attackMessage, rollCrit), true);
      assert.equal(adapter.matches({ enabled: true, actionType: "attack", resultType: "nat1" }, attackMessage, rollCrit), false);
    });

    it("identifies death saves and fumble / critical states", () => {
      const deathSaveMessage = {
        flavor: "Death Saving Throw",
        flags: { dnd5e: { roll: { type: "death" } } }
      };
      const rollFumble = {
        terms: [{ faces: 20, results: [{ result: 1, active: true }] }]
      };

      assert.equal(adapter.matches({ enabled: true, actionType: "death", resultType: "death1" }, deathSaveMessage, rollFumble), true);
      assert.equal(adapter.matches({ enabled: true, actionType: "death", resultType: "death20" }, deathSaveMessage, rollFumble), false);
    });
  });

  describe("DaggerheartAdapter", () => {
    const adapter = new DaggerheartAdapter();

    it("identifies critical when duality dice have equal values", () => {
      const message = { flags: { daggerheart: { hope: 8, fear: 8 } } };
      const roll = { terms: [{ faces: 12, results: [{ result: 8, active: true }, { result: 8, active: true }] }] };

      assert.equal(adapter.matches({ enabled: true, resultType: "critical" }, message, roll), true);
      assert.equal(adapter.matches({ enabled: true, resultType: "fear" }, message, roll), false);
      assert.equal(adapter.matches({ enabled: true, resultType: "hope" }, message, roll), false);
    });

    it("distinguishes Hope vs Fear outcomes", () => {
      const hopeMessage = { flags: { daggerheart: { hope: 10, fear: 4 } } };
      const fearMessage = { flags: { daggerheart: { hope: 3, fear: 9 } } };
      const dummyRoll = { terms: [{ faces: 12, results: [{ result: 1, active: true }, { result: 1, active: true }] }] };

      assert.equal(adapter.matches({ enabled: true, resultType: "hope" }, hopeMessage, dummyRoll), true);
      assert.equal(adapter.matches({ enabled: true, resultType: "fear" }, hopeMessage, dummyRoll), false);

      assert.equal(adapter.matches({ enabled: true, resultType: "fear" }, fearMessage, dummyRoll), true);
      assert.equal(adapter.matches({ enabled: true, resultType: "hope" }, fearMessage, dummyRoll), false);
    });
  });

  describe("Tormenta20Adapter", () => {
    const adapter = new Tormenta20Adapter();

    it("detects threat (20) and expanded threat (19-20)", () => {
      const roll19 = { terms: [{ faces: 20, results: [{ result: 19, active: true }] }] };
      const roll20 = { terms: [{ faces: 20, results: [{ result: 20, active: true }] }] };
      const message = { flavor: "Teste de Ataque", flags: { tormenta20: { rollType: "attack" } } };

      assert.equal(adapter.matches({ enabled: true, resultType: "threat" }, message, roll19), false);
      assert.equal(adapter.matches({ enabled: true, resultType: "threat" }, message, roll20), true);
      assert.equal(adapter.matches({ enabled: true, resultType: "expanded_threat" }, message, roll19), true);
    });
  });

  describe("Pf2eAdapter", () => {
    const adapter = new Pf2eAdapter();

    it("matches PF2e degrees of success via context outcome", () => {
      const critFailMsg = { flags: { pf2e: { context: { type: "attack-roll", outcome: "criticalFailure" } } } };
      const critSuccessMsg = { flags: { pf2e: { context: { type: "attack-roll", outcome: "criticalSuccess" } } } };
      const roll = { terms: [{ faces: 20, results: [{ result: 15, active: true }] }] };

      assert.equal(adapter.matches({ enabled: true, actionType: "attack-roll", resultType: "criticalFailure" }, critFailMsg, roll), true);
      assert.equal(adapter.matches({ enabled: true, actionType: "attack-roll", resultType: "criticalSuccess" }, critSuccessMsg, roll), true);
      assert.equal(adapter.matches({ enabled: true, actionType: "attack-roll", resultType: "criticalFailure" }, critSuccessMsg, roll), false);
    });
  });
});
