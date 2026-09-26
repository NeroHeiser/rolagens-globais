# Rolagens Globais (Global Extra Rolls)

[English](README.md) | [Português (Brasil)](README.pt-BR.md)

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v12%20|%20v14-orange.svg)](https://foundryvtt.com/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-35%20passed-brightgreen.svg)](test/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Módulo para **Foundry Virtual Tabletop (V12 e V14)** que automatiza a execução de rolagens extras — como **Tabelas Roláveis (`RollTable`)**, **Fórmulas Livres de Dados** ou **Macros** — disparadas por gatilhos de dados e ações de jogadores e mestres.

---

## 🎯 Destaques

- **Automação Inteligente com Proteção Anti-Loop:** Disparo imediato de tabelas, fórmulas ou macros sem risco de recursão infinita (limite de profundidade configurável).
- **Arquitetura de Adaptadores Polimórficos:** Suporte dedicado a D&D 5e, Tormenta20, Pathfinder 2e e Daggerheart, com fallback universal genérico para qualquer sistema d20/dice-pool.
- **Painel Central Moderno (ApplicationV2):** Interface responsiva para criação de regras, predefinições com 1 clique e controle intuitivo.
- **Modo Regras do Mundo (Modo Loucura / Pré-Ataque):** Interceptação opcional antes da rolagem de dados para impor efeitos de sanidade ou regras de cenário em ataques físicos ou mágicos.
- **Central Completa de Tabelas:** Criador rápido por colagem de texto, cálculo proporcional de faixas contínuas e serialização bidirecional em JSON, CSV e Markdown.
- **Subtabelas Encadeadas (`TableChainEngine`):** Detecção automática de menções a subtabelas e fórmulas inline em resultados com animação 3D (Dice So Nice).

---

## 🧩 Tabelas de Recursos e Domínio

### Adaptadores de Sistemas de RPG

| Adaptador | Sistema | Gatilhos e Mecânicas Reconhecidas |
| :--- | :--- | :--- |
| `Dnd5eAdapter` | D&D 5e (`dnd5e`) | Ataques de armas/magias, testes de habilidade, perícias, resistências e salvaguardas contra a morte (1 e 20 naturais). |
| `Tormenta20Adapter` | Tormenta20 (`tormenta20`) | Testes de ataque, perícias, testes de resistência (Fortitude, Reflexos, Vontade), falhas críticas e margem de ameaça expandida. |
| `Pf2eAdapter` | Pathfinder 2e (`pf2e`) | Graus de sucesso nativos (*Falha Crítica*, *Falha*, *Sucesso*, *Sucesso Crítico*), Golpes (*Strikes*) e contexto de rolagem. |
| `DaggerheartAdapter` | Daggerheart (`daggerheart`) | Sistema de *Duality Dice (2d12)*: Sucessos com Esperança (*Hope > Fear*), com Medo (*Fear > Hope*) e Críticos em pares. |
| `GenericAdapter` | Universal / Outros | Verificação de faces mínimas/máximas, valores específicos, somas totais e palavras-chave no texto/flavor. |

### Motores e Serviços de Domínio

| Módulo / Serviço | Papel Arquitetural | Descrição |
| :--- | :--- | :--- |
| `RulesEngine` | Regras Principais | Intercepta rolagens de chat, avalia condições através do adaptador ativo e despacha tabelas, fórmulas ou macros. |
| `MadnessEngine` | Regras do Mundo | Substitui ações antes da rolagem com base no alvo (físico ou mágico), aplicando tabelas de loucura/cenário. |
| `TableChainEngine` | Encadeamento | Processa resultados sorteados em busca de menções a subtabelas e fórmulas embutidas, disparando-as em sequência. |
| `DiceRangeCalculator` | Serviço de Domínio | Cálculo de limites de dados, distribuição proporcional de intervalos contínuos e parser textual de linhas. |
| `BoundedSet` | Estrutura de Dados | Cache de IDs com tamanho fixo e política de expulsão LRU em O(1), prevenindo vazamentos de memória em sessões longas. |
| `TableSerializer` | Utilitário | Importação e exportação de RollTables para formatos portáteis: JSON nativo, planilhas CSV e tabelas Markdown. |

---

## 🏛️ Arquitetura e Interfaces

O módulo adota princípios estritos de **SOLID** e separação de camadas:
- **Camada de Apresentação:** Construída com a API Foundry `ApplicationV2` e `HandlebarsApplicationMixin` (`RulesManager`, `RuleDialog`, `QuickTableDialog`).
- **Camada de Domínio Puro:** Serviços desacoplados (`DiceRangeCalculator`, `BoundedSet`) sem dependência de DOM ou globais externas, garantindo alta testabilidade.
- **Injeção de API Pública:** Todos os módulos de domínio e utilitários são exportados via `game.modules.get("rolagens-globais").api`.

---

## 🚀 Como Usar

### 1. Acesso ao Painel Central
- Clique no ícone de dado no topo da aba do **Chat** (exclusivo para o Mestre).
- Ou acesse `Configurações do Jogo` -> `Configurações de Módulos` -> `Rolagens Globais` -> `Abrir Gerenciador`.

### 2. Carregar Regras Recomendadas
No gerenciador de regras, clique em **`⚡ Carregar Regras Recomendadas`**. O módulo detecta o sistema ativo e pré-configura regras de acertos e falhas críticas automaticamente.

### 3. Criação Rápida de Tabelas
1. Abra a barra de tabelas roláveis na barra lateral e clique no botão **Raio (`⚡`)**.
2. Cole qualquer lista de texto (uma opção por linha).
3. Selecione a fórmula do dado (ex: `1d100` ou `1d20`). O módulo distribui os intervalos proporcionalmente sem furos.
4. Clique em **Criar Tabela Rolável**.

---

## 🛠️ Instalação

Copie a pasta `rolagens-globais` para o diretório de dados do Foundry:
```text
<FoundryData>/Data/modules/rolagens-globais
```
Ou instale pelo manifesto oficial:
```text
https://raw.githubusercontent.com/NeroHeiser/rolagens-globais/main/module.json
```

---

## 🧪 Testes Automatizados e Qualidade

O módulo conta com uma suíte de testes unitários sem dependências externas pesadas:
```bash
# Executar a suíte de testes completa
npm test
```
A suíte valida adaptadores de sistema, distribuição matemática de faixas de dados, serialização RFC 4180 e limites de memória do `BoundedSet`.

---

## 📄 Compatibilidade, Licença e Autoria

- **Foundry VTT:** Versões v12 e v14.
- **Autor:** Lopes ([@NeroHeiser](https://github.com/NeroHeiser))
- **Licença:** MIT
