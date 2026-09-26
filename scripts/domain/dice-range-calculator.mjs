/**
 * Pure domain service for dice formula parsing, range distributions, and table text parsing.
 */
export class DiceRangeCalculator {
  /**
   * Extracts minimum and maximum values from a standard dice formula (e.g. 1d100 -> min: 1, max: 100).
   * @param {string} formula - The dice formula string.
   * @param {number} [defaultMax=20] - Fallback maximum value if parsing fails.
   * @returns {{min: number, max: number}}
   */
  static parseFormulaMinMax(formula, defaultMax = 20) {
    const clean = (formula || "").trim().toLowerCase();
    const match = clean.match(/^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/);

    if (match) {
      const count = parseInt(match[1] || "1", 10);
      const faces = parseInt(match[2], 10);
      const sign = match[3];
      const modifier = match[4] ? parseInt(match[4], 10) : 0;
      const signedMod = sign === "+" ? modifier : sign === "-" ? -modifier : 0;

      const min = count + signedMod;
      const max = (count * faces) + signedMod;

      return { min: Math.max(1, min), max: Math.max(1, max) };
    }

    return { min: 1, max: defaultMax };
  }

  /**
   * Distributes N options proportionally across a dice value span from min to max.
   * Guarantees a continuous sequence without gaps or overlaps.
   * @param {number} count - Total number of options.
   * @param {number} min - Minimum roll value.
   * @param {number} max - Maximum roll value.
   * @returns {Array<[number, number]>}
   */
  static calculateProportionalRanges(count, min, max) {
    if (count <= 0) return [];

    const span = max - min + 1;
    const ranges = [];

    for (let i = 0; i < count; i++) {
      const start = min + Math.floor((i * span) / count);
      const end = (i === count - 1)
        ? max
        : min + Math.floor(((i + 1) * span) / count) - 1;

      ranges.push([start, Math.max(start, end)]);
    }

    return ranges;
  }

  /**
   * Parses raw user text into structured option items with optional explicit ranges.
   * Strips list numbering (e.g. "1. ", "2 - ", "[3]") and extracts range prefixes (e.g. "1-4: ").
   * @param {string} rawText - Multi-line text string.
   * @returns {Array<{explicitRange: [number, number]|null, text: string}>}
   */
  static parseLines(rawText) {
    return (rawText || "")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const rangeMatch = line.match(/^\[?(\d+)\s*(?:-|–|—|\.\.)\s*(\d+)\]?[:\-\)]?\s*(.*)$/);
        if (rangeMatch) {
          return {
            explicitRange: [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)],
            text: rangeMatch[3].trim()
          };
        }

        const cleanedText = line.replace(/^(?:\[\d+\]|\d+\s*[\.\-\)])\s*/, "").trim();
        return {
          explicitRange: null,
          text: cleanedText || line
        };
      })
      .filter(item => item.text.length > 0);
  }
}
