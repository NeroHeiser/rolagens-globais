# Rolagens Globais (Global Extra Rolls)

Módulo para **Foundry Virtual Tabletop (V12 e V14)** que automatiza a execução de rolagens extras — como **Tabelas Roláveis (RollTable)**, **Fórmulas Livres de Dados** ou **Macros** — acionadas por gatilhos de dados e ações de jogadores e mestres.

---

## ✨ Principais Recursos

- **100% Automático com Prevenção de Loop:** Ao identificar uma condição (ex: 1 natural ou dados iguais), o módulo dispara a rolagem secundária imediatamente sem risco de recursão infinita.
- **Arquitetura de Adaptadores Inteligentes:**
  - **Dungeons & Dragons 5e (`dnd5e`):** Reconhece ataques com armas, magias, testes de resistência, perícias e salvaguardas contra a morte; avalia 1 e 20 naturais automaticamente.
  - **Tormenta20 (`tormenta20`):** Reconhece testes de ataque, perícias e resistências (Fortitude/Reflexos/Vontade), com suporte a falha crítica e margem de ameaça.
  - **Pathfinder 2e (`pf2e`):** Suporte nativo aos 4 graus de sucesso (*Falha Crítica*, *Falha*, *Sucesso*, *Sucesso Crítico*) e tipos de ação como Golpes (*Strikes*).
  - **Daggerheart (`daggerheart`):** Suporte à mecânica central de *Duality Dice (2d12)* — detecta Críticos (duplas/dados iguais), rolagens com Medo (*Fear > Hope*) e rolagens com Esperança (*Hope > Fear*).
  - **Modo Genérico Universal:** Funciona em qualquer outro sistema por inspeção direta das faces dos dados, valores mínimos/máximos, totais e palavras-chave.
- **Painel Central Moderno (ApplicationV2):** Interface elegante e responsiva para gerenciar regras, ativar/desativar com um clique e carregar regras recomendadas instantaneamente.
- **3 Tipos de Saída / Efeitos Extras:**
  1. **Tabelas Roláveis (`RollTable`):** Sorteia e publica automaticamente o resultado de qualquer tabela do mundo.
  2. **Fórmulas de Dados (`Roll`):** Rola dados extras (ex: `1d100`, `2d6[fogo]`, `1d4`).
- **🌀 Regras do Mundo (Pré-Ataque / Modo Loucura):**
  - Intercepta ações e ataques antes do d20 ser rolado, substituindo a ação por um sorteio de tabela rolável.
  - **Tabelas Independentes:** Separação entre tabela de **Ataques Físicos** (corpo a corpo e à distância) e **Magias/Conjurações**.
  - Nome do modo 100% customizável pelo Mestre (ex: *Regras do Mundo*, *Modo Loucura*, *Magia Selvagem*, *Névoas de Ravenloft*).
  - Botão de ativação rápida na barra lateral de tabelas.
- **⚡ Central de Tabelas Roláveis:**
  - **Criador Rápido:** Cole qualquer lista de texto (1 opção por linha) para criar uma tabela pronta em segundos.
  - **Seletor de Dados & Distribuição Proporcional:** Escolha dados clássicos (`d100`, `d20`, `d12`, `d10`, `d8`, `d6` ou fórmula livre). Ao escolher `d100` com 27 opções, por exemplo, o módulo calcula faixas perfeitas de 1 a 100 sem lacunas nem sobreposições.
  - **Exportação Universal:** Exporte suas tabelas em **JSON** (para outros mundos do Foundry), **CSV** (para Excel, Google Planilhas e Roll20) ou **Markdown** (para Obsidian e Notion).
  - **Importação com 1 Clique:** Arraste e solte arquivos `.json`, `.csv` ou `.txt` para recriar tabelas instantaneamente no mundo.
- **🔗 Subtabelas Automáticas (`TableChainEngine`):**
  - Reconhece quando um resultado de tabela cita outra (ex: `tabela: Selvagem 17`, `role na tabela de Magia Selvagem 57.`, `@UUID[RollTable...]`).
  - Rola a subtabela no chat automaticamente com animação de dados 3D no Dice So Nice.
  - Proteção anti-loop de até 5 níveis e autoridade de mestre para partidas multiplayer.
- **Controle de Visibilidade:** Pública (para todos), Sussurrada ao Mestre, Rolagem Cega ou mantendo a visibilidade da rolagem original.
- **Suporte Híbrido nos Itens:** Botão integrado no cabeçalho das fichas de itens para permitir que armas ou itens específicos ignorem regras globais ou interceptações.

---

## 🚀 Como Usar

### 1. Abrindo o Gerenciador de Regras
Existem duas formas simples de acessar o painel:
1. Clique no botão de dado **(<i class="fas fa-dice-d20"></i>)** no topo da aba do **Chat** (exclusivo para o Mestre).
2. Acesse `Configurações do Jogo` -> `Configurações de Módulos` -> `Rolagens Globais` -> `Abrir Gerenciador`.

### 2. Carregando Regras Recomendadas
No painel de regras, clique no botão **`⚡ Carregar Regras Recomendadas`**. O módulo identificará o sistema ativo (ex: D&D 5e, T20, PF2e ou Daggerheart) e criará regras pré-configuradas de falhas e acertos críticos automaticamente.

### 3. Criando uma Regra Personalizada
1. Clique em **`+ Nova Regra`**.
2. Defina o nome da regra e o tipo de ação (Ataque, Perícia, etc.).
3. Escolha a condição de ativação (ex: 1 Natural, Sucesso Crítico, Face do dado, soma total).
4. Selecione o que deve acontecer:
   - Escolha uma **Tabela Rolável** existente no seu mundo.
   - Ou digite uma **Fórmula de Dados** (ex: `1d100`).
   - Ou escolha uma **Macro** para rodar efeitos visuais, sonoros ou condições.
5. Defina a visibilidade da mensagem no chat e clique em **Salvar Regra**.

### 4. Configuração Individual em Itens (Modo Híbrido)
Ao abrir a ficha de qualquer item (uma espada mágica, por exemplo), clique no botão **Rolagens Extras** no cabeçalho da janela para marcar opções exclusivas, como *"Ignorar regras globais para este item"*.

---

## 🛠️ Instalação

Copie a pasta `rolagens-globais` para o diretório de dados do Foundry:
```text
<FoundryData>/Data/modules/rolagens-globais
```
Ou instale pelo manifesto:
```text
https://raw.githubusercontent.com/NeroHeiser/rolagens-globais/main/module.json
```

---

## 🧑‍💻 Autor

- **Lopes** (GitHub: [@NeroHeiser](https://github.com/NeroHeiser))
- Licença: MIT