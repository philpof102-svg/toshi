// Codebase Graph Query — one-shot builder for toshi/.
// Disposes after running. Output: .graph/nodes.json + .graph/edges.json
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = process.argv[2] || ".";
const exts = (process.argv[3] || "ts,tsx,js,jsx,mjs,cjs,html,css").split(",");

let files = [];
try {
  files = execSync(`git -C "${root}" ls-files`, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
} catch {
  files = execSync(`find "${root}" -type f`, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

files = files
  .filter(f => exts.some(e => f.endsWith("." + e)))
  .filter(f => !/node_modules|\.git[\\\/]|dist|build|coverage/.test(f));

const nodes = [];
const edges = [];

for (const rel of files) {
  const abs = path.join(root, rel);
  let src;
  try { src = fs.readFileSync(abs, "utf8"); } catch { continue; }
  const loc = src.split("\n").length;
  nodes.push({ kind: "file", id: rel, loc });

  // imports
  for (const m of src.matchAll(/(?:import|require)\s*\(?\s*[^"')]*["']([^"')]+)["']/g)) {
    edges.push({ from: rel, to: m[1], kind: "imports" });
  }
  // defines
  for (const m of src.matchAll(/(?:export\s+)?(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    const sym = m[1];
    if (sym === "from" || sym === "require") continue;
    nodes.push({ kind: "symbol", id: sym, file: rel });
    edges.push({ from: rel, to: sym, kind: "defines" });
  }
  // calls (rough)
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const sym = m[1];
    if (["if", "for", "while", "switch", "return", "catch", "function", "class", "const", "let", "var"].includes(sym)) continue;
    edges.push({ from: rel, to: sym, kind: "calls" });
  }
}

fs.mkdirSync(path.join(root, ".graph"), { recursive: true });
fs.writeFileSync(path.join(root, ".graph/nodes.json"), JSON.stringify(nodes, null, 2));
fs.writeFileSync(path.join(root, ".graph/edges.json"), JSON.stringify(edges, null, 2));
console.log(`nodes=${nodes.length} edges=${edges.length} files=${files.length}`);
