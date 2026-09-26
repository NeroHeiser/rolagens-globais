# Refactoring and Quality Improvements Summary: `rolagens-globais`

## Overview
This document summarizes the architectural, visual, testability, and performance improvements integrated into the `rolagens-globais` Foundry VTT module.

---

## 1. Visual Contrast & Accessibility (Ad-hoc Priority 0)
- **Problem:** Chat badges and form inputs inside Foundry VTT had low contrast or invisible text on light parchment backgrounds and dark theme variations.
- **Solution (`styles/style.css`):**
  - Explicit dark solid backgrounds (`#241607` for standard badge, `#190d29` for world/madness badge) with glowing golden/amber and purple borders.
  - High-contrast text colors (`#ffdd99` and `#ffebcc`) with bold `#ffffff` highlights, guaranteeing readability regardless of light/dark Foundry chat themes.
  - Scoped CSS variables and dark backgrounds for all dialog forms, labels, inputs, selects, and `.notes` descriptions.

---

## 2. Testability & Automated Unit Tests (Priority 1)
- **Infrastructure:** Native Node.js test runner (`node:test`) configured in `package.json` with zero heavy dependencies, optimal for moderate hardware (8GB RAM).
- **Mock Environment (`test/helpers/foundry-mock.mjs`):** Lightweight emulation of Foundry VTT globals (`CONST`, `foundry.utils`, `game.i18n`).
- **Test Suites:**
  - `test/adapters.test.mjs`: Tests rule matching across all 6 system adapters (`BaseAdapter`, `GenericAdapter`, `Dnd5eAdapter`, `DaggerheartAdapter`, `Tormenta20Adapter`, `Pf2eAdapter`).
  - `test/table-ranges.test.mjs`: Tests dice formula bounds, proportional 1-to-1 and multi-option distribution, and line parsing.
  - `test/table-serializer.test.mjs`: Tests JSON, CSV (RFC 4180), and Markdown serialization/deserialization.
  - `test/bounded-set.test.mjs`: Tests LRU eviction and memory bounds.
- **Execution:** `npm test` runs 35 unit tests in ~400ms.

---

## 3. Domain Decoupling & Single Responsibility (Priority 2)
- **Extracted Service (`scripts/domain/dice-range-calculator.mjs`):**
  - Pure domain class independent of Foundry DOM/UI.
  - `parseFormulaMinMax(formula, defaultMax)`: Safely extracts min and max bounds from formulas (e.g. `1d100`, `2d6+2`).
  - `calculateProportionalRanges(count, min, max)`: Proportional distribution covering the entire range without gaps or overlaps.
  - `parseLines(rawText)`: Parses multi-line inputs, handles explicit ranges (`[1-4]`), and strips list prefixes.
- **Integration:** `QuickTableDialog` now delegates mathematical and parsing responsibilities to `DiceRangeCalculator`, maintaining static proxy methods for backward compatibility. Exposed via `module.api.DiceRangeCalculator`.

---

## 4. Clean Code, Internationalization & Emoji Removal (Priority 3)
- **Code Standards:**
  - Complete translation of all internal comments, JSDoc docstrings, error messages, and console logs to English.
  - Zero emojis in all source code files (`scripts/**/*.mjs`).
  - Updated localization keys in `lang/en.json` and `lang/pt-BR.json`.
  - Replaced hardcoded status labels in dialogs with clean English constants and localized strings.

---

## 5. Resource Efficiency & Memory Bounding (Priority 4)
- **Extracted Service (`scripts/domain/bounded-set.mjs`):**
  - `BoundedSet` implements a capacity-bounded Set with LRU eviction in O(1) time and space using native JavaScript `Set` insertion order semantics.
- **Integration:**
  - `RulesEngine.#processedIds`: Replaced unbounded `Set` with `BoundedSet(500)` to prevent unbounded memory growth during long gaming sessions.
  - `TableChainEngine.#processedIds`: Replaced unbounded `Set` with `BoundedSet(500)`.
  - Exposed via `module.api.BoundedSet`.

---

## Verification & Execution
To run the automated test suite locally:
```bash
npm test
```
All 35 unit tests pass cleanly with zero external dependencies.
