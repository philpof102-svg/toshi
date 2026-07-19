// verify-docs.cjs — drift / acceptance checks for docs/
const fs = require("fs"), path = require("path");
// derived, not hardcoded: this file used to pin "D:/Users/VolKov/veilleIA/toshi", so it only ran on one
// machine — in a repo that ships a whole PORTABILITY test section asserting the opposite.
const ROOT = path.resolve(__dirname);
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
  /* HAND-WRITTEN DOCS SURVIVE A REGEN — the check that was missing, and the only one that fires on the
   * failure that actually happened. auto-doc.cjs used to rmSync the whole docs/ tree, destroying the two
   * hand-authored guides and the three real product screenshots the README links to. All six checks above
   * still passed afterwards, because every one of them inspects the SHAPE of what is there and none can
   * see what went missing. A generator that can delete work nobody can regenerate needs a check that
   * looks for absence. */
  "hand-written guides survive a regen":
    ["openrouter-key.md", "providers.md"].every((f) => fs.existsSync(path.join(DOCS, f))),
  "product screenshots survive a regen":
    ["toshi-answer.png", "toshi-mini.png", "toshi-panel.png"].every((f) => fs.existsSync(path.join(DOCS, f))),
};
let ok = true;
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? "PASS" : "FAIL"}  ${k}`); if (!v) ok = false; }
console.log(`\nfiles=${files.length}  index_lines=${idxLines}  manifest_entries=${m.files.length}`);
process.exit(ok ? 0 : 1);
