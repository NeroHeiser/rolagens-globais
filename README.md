# Global Extra Rolls (Rolagens Globais)

[English](README.md) | [Português (Brasil)](README.pt-BR.md)

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v12%20|%20v14-orange.svg)](https://foundryvtt.com/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-35%20passed-brightgreen.svg)](test/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A **Foundry Virtual Tabletop (V12 and V14)** module that automates extra rolls — such as **RollTables (`RollTable`)**, **Free-form Dice Formulas**, or **Macros** — triggered by roll outcomes and actions from players and Gamemasters.

---

## 🎯 Highlights

- **Intelligent Automation with Infinite Loop Protection:** Immediate dispatch of tables, formulas, or macros with zero risk of infinite recursion (configurable max recursion depth).
- **Polymorphic System Adapter Architecture:** Dedicated support for D&D 5e, Tormenta20, Pathfinder 2e, and Daggerheart, with a universal generic fallback for any d20 or dice-pool system.
- **Modern Management Interface (ApplicationV2):** Responsive UI for rule creation, 1-click recommended presets, and quick toggles.
- **World Rules Mode (Madness Mode / Pre-Attack Interception):** Optional pre-roll interception that substitutes standard actions with sanity tables or setting effects for physical and magical attacks.
- **Complete RollTable Hub:** Quick text-paste table generator, gapless proportional dice range calculator, and bi-directional JSON, CSV, and Markdown serialization.
- **Chained Subtables (`TableChainEngine`):** Automatic detection and drawing of subtable references and inline roll formulas from table results with 3D dice animation (Dice So Nice).

---

## 🧩 Feature and Domain Tables

### RPG System Adapters

| Adapter | System | Supported Triggers & Mechanics |
| :--- | :--- | :--- |
| `Dnd5eAdapter` | D&D 5e (`dnd5e`) | Weapon and spell attacks, ability checks, skill checks, saving throws, and death saves (natural 1 and 20). |
| `Tormenta20Adapter` | Tormenta20 (`tormenta20`) | Attack rolls, skill tests, saving throws (Fortitude, Reflexes, Will), fumbles, and expanded threat ranges. |
| `Pf2eAdapter` | Pathfinder 2e (`pf2e`) | Native 4 degrees of success (*Critical Failure*, *Failure*, *Success*, *Critical Success*), Strikes, and roll contexts. |
| `DaggerheartAdapter` | Daggerheart (`daggerheart`) | *Duality Dice (2d12)* mechanics: Hope rolls (*Hope > Fear*), Fear rolls (*Fear > Hope*), and Criticals (matching pairs). |
| `GenericAdapter` | Universal / Others | Minimum/maximum die faces, explicit target values, total sums, and flavor/content keywords. |

### Core Engines and Domain Services

| Module / Service | Architectural Role | Description |
| :--- | :--- | :--- |
| `RulesEngine` | Primary Dispatcher | Intercepts chat roll messages, evaluates matching conditions via the active system adapter, and triggers tables, formulas, or macros. |
| `MadnessEngine` | Pre-Attack Rules | Intercepts actions prior to rolls according to target type (physical or spell), redirecting to designated roll tables. |
| `TableChainEngine` | Chained Subtables | Inspects drawn results for subtable references and inline dice formulas, triggering chained draws recursively up to depth limit. |
| `DiceRangeCalculator` | Domain Service | Calculates formula boundaries, distributes proportional continuous ranges without gaps, and parses structured text lines. |
| `BoundedSet` | Domain Data Structure | Fixed-capacity ID cache with O(1) LRU eviction policy, preventing memory leaks during long gaming sessions. |
| `TableSerializer` | Utility Service | Bi-directional serialization of RollTables to portable formats: native JSON, CSV spreadsheets, and Markdown tables. |

---

## 🏛️ Architecture & Interfaces

The module strictly enforces **SOLID** principles and layer separation:
- **Presentation Layer:** Built on Foundry's `ApplicationV2` API and `HandlebarsApplicationMixin` (`RulesManager`, `RuleDialog`, `QuickTableDialog`).
- **Pure Domain Layer:** Decoupled domain services (`DiceRangeCalculator`, `BoundedSet`) without DOM or external global dependencies for maximum testability.
- **Public API Exposure:** All core engines, domain classes, and utilities are available globally via `game.modules.get("rolagens-globais").api`.

---

## 🚀 How to Use

### 1. Opening the Management Panel
- Click the dice icon in the top header of the **Chat Log** (GM only).
- Or navigate to `Game Settings` -> `Module Settings` -> `Rolagens Globais` -> `Open Manager`.

### 2. Loading Recommended Rules
In the rules manager, click **`⚡ Load Recommended Rules`**. The module automatically detects your active game system and provisions critical hit and fumble rules.

### 3. Quick Table Creation
1. Open the Rollable Tables sidebar directory and click the **Lightning Bolt (`⚡`)** button.
2. Paste any list of text options (one item per line).
3. Select your target dice formula (e.g. `1d100` or `1d20`). The system computes continuous, gapless ranges automatically.
4. Click **Create RollTable**.

---

## 🛠️ Installation

Copy the `rolagens-globais` folder into your Foundry data directory:
```text
<FoundryData>/Data/modules/rolagens-globais
```
Or install via the manifest URL:
```text
https://raw.githubusercontent.com/NeroHeiser/rolagens-globais/main/module.json
```

---

## 🧪 Automated Testing and Quality

The module features a comprehensive, lightweight unit test suite with zero heavy external dependencies:
```bash
# Run the complete test suite
npm test
```
The suite verifies system adapters, mathematical dice range distributions, RFC 4180 CSV serialization, and `BoundedSet` capacity constraints.

---

## 📄 Compatibility, License, and Author

- **Foundry VTT:** Compatibility verified for v12 and v14.
- **Author:** Lopes ([@NeroHeiser](https://github.com/NeroHeiser))
- **License:** MIT