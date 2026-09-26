import "./helpers/foundry-mock.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QuickTableDialog } from "../scripts/apps/quick-table-dialog.mjs";

describe("Formula and Proportional Ranges Calculation", () => {
  describe("parseFormulaMinMax", () => {
    it("parses simple dice formula", () => {
      assert.deepEqual(QuickTableDialog.parseFormulaMinMax("1d100"), { min: 1, max: 100 });
      assert.deepEqual(QuickTableDialog.parseFormulaMinMax("1d20"), { min: 1, max: 20 });
      assert.deepEqual(QuickTableDialog.parseFormulaMinMax("d12"), { min: 1, max: 12 });
    });

    it("parses dice formula with positive and negative modifiers", () => {
      assert.deepEqual(QuickTableDialog.parseFormulaMinMax("2d6 + 2"), { min: 4, max: 14 });
      assert.deepEqual(QuickTableDialog.parseFormulaMinMax("1d8 - 2"), { min: 1, max: 6 });
    });

    it("falls back to default max when formula is invalid or empty", () => {
      assert.deepEqual(QuickTableDialog.parseFormulaMinMax("", 15), { min: 1, max: 15 });
      assert.deepEqual(QuickTableDialog.parseFormulaMinMax("invalid", 30), { min: 1, max: 30 });
    });
  });

  describe("calculateProportionalRanges", () => {
    it("returns empty array when count is zero or negative", () => {
      assert.deepEqual(QuickTableDialog.calculateProportionalRanges(0, 1, 20), []);
      assert.deepEqual(QuickTableDialog.calculateProportionalRanges(-5, 1, 20), []);
    });

    it("produces exact 1-to-1 ranges when count matches die face count", () => {
      const ranges = QuickTableDialog.calculateProportionalRanges(6, 1, 6);
      assert.deepEqual(ranges, [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
        [6, 6]
      ]);
    });

    it("distributes 27 options across 1d100 continuously with zero gaps and zero overlaps", () => {
      const count = 27;
      const min = 1;
      const max = 100;
      const ranges = QuickTableDialog.calculateProportionalRanges(count, min, max);

      assert.equal(ranges.length, count);
      assert.equal(ranges[0][0], min);
      assert.equal(ranges[count - 1][1], max);

      for (let i = 0; i < count; i++) {
        const [start, end] = ranges[i];
        assert.ok(start <= end, `Range at index ${i} should have start <= end (${start} <= ${end})`);

        if (i < count - 1) {
          const nextStart = ranges[i + 1][0];
          assert.equal(
            nextStart,
            end + 1,
            `Continuous check failed at index ${i}: current end=${end}, next start=${nextStart}`
          );
        }
      }
    });

    it("splits evenly into halves for 2 options on 1d20", () => {
      const ranges = QuickTableDialog.calculateProportionalRanges(2, 1, 20);
      assert.deepEqual(ranges, [
        [1, 10],
        [11, 20]
      ]);
    });
  });
});
