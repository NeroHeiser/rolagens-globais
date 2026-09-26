import "./helpers/foundry-mock.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TableSerializer } from "../scripts/utils/table-serializer.mjs";

describe("TableSerializer", () => {
  const sampleTables = [
    {
      _id: "tbl1",
      name: "Wild Surge",
      formula: "1d2",
      description: "Chaos table",
      results: [
        { _id: "res1", text: "Fire spark", range: [1, 1], weight: 1, type: 0 },
        { _id: "res2", text: "Ice bloom", range: [2, 2], weight: 1, type: 0 }
      ]
    }
  ];

  it("exports tables to JSON without database IDs and parses back", () => {
    const jsonString = TableSerializer.exportToJSON(sampleTables);
    const parsed = TableSerializer.parseJSON(jsonString);

    assert.equal(Array.isArray(parsed), true);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, "Wild Surge");
    assert.equal(parsed[0]._id, undefined);
    assert.equal(parsed[0].results.length, 2);
    assert.equal(parsed[0].results[0]._id, undefined);
    assert.equal(parsed[0].results[0].text, "Fire spark");
  });

  it("throws an error when parsing invalid JSON structures", () => {
    assert.throws(() => {
      TableSerializer.parseJSON(JSON.stringify({ invalid: true }));
    }, /Estrutura JSON não reconhecida/);
  });

  it("exports and parses CSV with proper escaping and ranges", () => {
    const csvString = TableSerializer.exportToCSV(sampleTables);
    assert.match(csvString, /"Tabela","FaixaMin","FaixaMax","Peso","Texto","Tipo","Documento"/);
    assert.match(csvString, /"Wild Surge","1","1","1","Fire spark","text",""/);

    const parsedTables = TableSerializer.parseCSV(csvString);
    assert.equal(parsedTables.length, 1);
    assert.equal(parsedTables[0].name, "Wild Surge");
    assert.equal(parsedTables[0].results.length, 2);
    assert.deepEqual(parsedTables[0].results[0].range, [1, 1]);
    assert.equal(parsedTables[0].results[0].text, "Fire spark");
    assert.deepEqual(parsedTables[0].results[1].range, [2, 2]);
    assert.equal(parsedTables[0].results[1].text, "Ice bloom");
  });

  it("throws error when parsing empty or header-only CSV", () => {
    assert.throws(() => {
      TableSerializer.parseCSV("Tabela,FaixaMin,FaixaMax,Peso,Texto,Tipo,Documento\n");
    }, /CSV está vazio ou contém apenas cabeçalho/);
  });

  it("exports tables to formatted Markdown", () => {
    const md = TableSerializer.exportToMarkdown(sampleTables);
    assert.match(md, /## Wild Surge \(1d2\)/);
    assert.match(md, /> Chaos table/);
    assert.match(md, /1\. Fire spark/);
    assert.match(md, /2\. Ice bloom/);
  });
});
