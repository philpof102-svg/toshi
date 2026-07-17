// verify-docs.cjs — drift / acceptance checks for docs/
const fs = require("fs"), path = require("path");
const ROOT = "D:/Users/VolKov/veilleIA/toshi";
const DOCS = ROOT + "/docs";
const m = JSON.parse(fs.readFileSync(path.join(DOCS, "_manifest.json"), "utf8"));
const idxText = fs.readFileSync(path.join(DOCS, "INDEX.md"), "utf8");
const idxLines = idxText.split("\n").length;
const graph = fs.readFileSync(path.join(DOCS, "graph.md"), "utf8");
const files = fs.readdirSync(path.join(DOCS, "files")).filter(f => f.endsWith(".md"));

const checks = {
  "INDEX.md exists & <=40 lines": idxLines <= 40,
  "_manifest.json parses": typeof m.generated_at === "string",
  "files/ count == manifest.files.length": files.length === m.files.length,
  "graph.md has mermaid block": /```mermaid\ngraph LR/.test(graph),
  "INDEX has safe-first-change section": /safe\s+first\s+change/i.test(idxText),
  "INDEX has spine section": /^##\s*Spine\b/im.test(idxText),
};
let ok = true;
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? "PASS" : "FAIL"}  ${k}`); if (!v) ok = false; }
console.log(`\nfiles=${files.length}  index_lines=${idxLines}  manifest_entries=${m.files.length}`);
process.exit(ok ? 0 : 1);
