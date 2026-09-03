/**
 * Serializador e conversor universal de Tabelas Roláveis para JSON, CSV e Markdown.
 * Suporta exportação e importação entre mesas do Foundry e entre programas externos.
 */
export class TableSerializer {
  /**
   * Exporta tabelas para o formato JSON nativo / compatível com Foundry VTT.
   * @param {RollTable[]} tables
   * @returns {string} JSON string formatado
   */
  static exportToJSON(tables) {
    const bundle = {
      version: "1.0",
      generator: "rolagens-globais",
      timestamp: new Date().toISOString(),
      tables: tables.map(t => {
        const data = t.toObject ? t.toObject() : foundry.utils.deepClone(t);
        delete data._id;
        if (Array.isArray(data.results)) {
          data.results = data.results.map(r => {
            const res = { ...r };
            delete res._id;
            return res;
          });
        }
        return data;
      })
    };
    return JSON.stringify(bundle, null, 2);
  }

  /**
   * Exporta tabelas para formato CSV (compatível com Excel, Google Sheets, Roll20).
   * @param {RollTable[]} tables
   * @returns {string} CSV formatado RFC 4180
   */
  static exportToCSV(tables) {
    const rows = [
      ["Tabela", "FaixaMin", "FaixaMax", "Peso", "Texto", "Tipo", "Documento"]
    ];

    for (const table of tables) {
      const tableName = table.name || "Tabela";
      const results = table.results 
        ? (Array.isArray(table.results) ? table.results : Array.from(table.results.values())) 
        : [];
      
      for (const res of results) {
        const range = res.range || [1, 1];
        const weight = res.weight || 1;
        const text = res.text || "";
        const isDoc = res.type === 1 || res.type === "document" || !!res.documentCollection;
        const type = isDoc ? "document" : "text";
        const doc = res.documentCollection ? `${res.documentCollection}:${res.text}` : "";

        rows.push([tableName, range[0], range[1], weight, text, type, doc]);
      }
    }

    return rows.map(cols => cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  }

  /**
   * Exporta tabelas para formato Markdown / Texto Puro (compatível com Notion, Obsidian, Bloco de notas).
   * @param {RollTable[]} tables
   * @returns {string} Texto formatado
   */
  static exportToMarkdown(tables) {
    const sections = [];

    for (const table of tables) {
      const lines = [];
      const formula = table.formula || `1d${table.results?.size || 6}`;
      lines.push(`## ${table.name} (${formula})`);
      if (table.description) {
        lines.push(`> ${table.description}\n`);
      }

      const results = table.results 
        ? (Array.isArray(table.results) ? table.results : Array.from(table.results.values())) 
        : [];
      
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const isTable = res.documentCollection === "RollTable" || res.type === 1 || res.type === "document";
        if (isTable) {
          lines.push(`${i + 1}. tabela: ${res.text}`);
        } else {
          lines.push(`${i + 1}. ${res.text}`);
        }
      }

      sections.push(lines.join("\n"));
    }

    return sections.join("\n\n---\n\n");
  }

  /**
   * Analisa e extrai tabelas de um arquivo JSON.
   * @param {string} content
   * @returns {object[]} Array de dados prontos para RollTable.createDocuments
   */
  static parseJSON(content) {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.tables && Array.isArray(parsed.tables)) {
      return parsed.tables;
    }
    // Se for um único documento de RollTable exportado nativamente pelo Foundry
    if (parsed.name && (parsed.results || parsed.formula)) {
      return [parsed];
    }
    throw new Error("Estrutura JSON não reconhecida como pacote de tabelas.");
  }

  /**
   * Analisa e extrai tabelas de um arquivo CSV.
   * @param {string} content
   * @returns {object[]} Array de dados de tabelas
   */
  static parseCSV(content) {
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) throw new Error("O arquivo CSV está vazio ou contém apenas cabeçalho.");

    // Agrupa linhas por nome de tabela
    const tableMap = new Map();

    // Pula o cabeçalho (linha 0)
    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      const cols = this.#parseCSVLine(rawLine);
      if (cols.length < 5) continue;

      const tableName = cols[0] || "Tabela Importada";
      const minRange = parseInt(cols[1], 10) || 1;
      const maxRange = parseInt(cols[2], 10) || minRange;
      const weight = parseInt(cols[3], 10) || 1;
      const text = cols[4] || "";
      const type = cols[5] || "text";

      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, []);
      }

      tableMap.get(tableName).push({
        type: (type === "document" || type === "1") ? CONST.TABLE_RESULT_TYPES.DOCUMENT : CONST.TABLE_RESULT_TYPES.TEXT,
        text,
        range: [minRange, maxRange],
        weight,
        drawn: false
      });
    }

    const createdData = [];
    for (const [name, results] of tableMap.entries()) {
      createdData.push({
        name,
        formula: `1d${results.length}`,
        results,
        displayRoll: true,
        replacement: true
      });
    }

    return createdData;
  }

  /**
   * Dispara o download de arquivo no navegador usando a função nativa do Foundry VTT.
   * @param {string} data - Conteúdo do arquivo
   * @param {string} type - MIME type (ex: "application/json", "text/csv")
   * @param {string} filename - Nome do arquivo a baixar
   */
  static triggerDownload(data, type, filename) {
    if (typeof saveDataToFile === "function") {
      saveDataToFile(data, type, filename);
    } else {
      // Fallback para navegadores / testes
      const blob = new Blob([data], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Auxiliar para quebra de linha CSV respeitando aspas duplas.
   */
  static #parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
}

