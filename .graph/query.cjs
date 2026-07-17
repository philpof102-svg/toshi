// query.cjs — load .graph/*.json, answer one question
const fs = require("fs"), path = require("path");
const root = process.argv[2] || ".";
const mode = process.argv[3];      // "calls" | "imports-in" | "imports-out" | "spine"
const target = process.argv[4];    // symbol or file path

const nodes = JSON.parse(fs.readFileSync(path.join(root, ".graph", "nodes.json"), "utf8"));
const edges = JSON.parse(fs.readFileSync(path.join(root, ".graph", "edges.json"), "utf8"));

if (mode === "callers") {
  // call sites of a symbol, ANY file (cross-file callers)
  const hits = edges
    .filter(e => e.kind === "calls" && e.to === target)
    .reduce((acc, e) => acc.find(x => x.from === e.from) ? acc : [...acc, e], [])
    .slice(0, 20);
  console.log(`# Callers of \`${target}\` (cross-file)`);
  console.log("| From | Kind |");
  console.log("|---|---|");
  for (const e of hits) console.log(`| ${e.from} | calls |`);
  console.log(`\ngraph:edges[calls→${target}]  hits=${hits.length}`);
}

if (mode === "calls") {
  // who calls <symbol>? (filter to symbol-vs-symbol edges, dedupe by from)
  const hits = edges
    .filter(e => e.kind === "calls" && e.to === target && nodes.some(n => n.kind === "symbol" && n.id === target && n.file === e.from))
    .slice(0, 20);
  console.log(`# Who calls \`${target}\`?`);
  console.log("| From | Kind |");
  console.log("|---|---|");
  for (const e of hits) console.log(`| ${e.from} | calls |`);
  console.log(`\ngraph:edges[calls→${target}]  hits=${hits.length}`);
}

if (mode === "imports-in") {
  // which files import <file> ?
  const basename = target.replace(/^\.\//, "");
  const hits = edges
    .filter(e => e.kind === "imports" && (e.to === target || e.to.endsWith("/" + basename) || e.to.endsWith(basename)))
    .slice(0, 20);
  console.log(`# Who imports \`${target}\`?`);
  console.log("| From | Imports |");
  console.log("|---|---|");
  for (const e of hits) console.log(`| ${e.from} | \`${e.to}\` |`);
  console.log(`\ngraph:edges[imports→${target}]  hits=${hits.length}`);
}

if (mode === "imports-out") {
  const hits = edges.filter(e => e.kind === "imports" && e.from === target).slice(0, 20);
  console.log(`# What does \`${target}\` import?`);
  console.log("| From | Imports |");
  console.log("|---|---|");
  for (const e of hits) console.log(`| ${e.from} | \`${e.to}\` |`);
  console.log(`\ngraph:edges[from=${target}]  hits=${hits.length}`);
}

if (mode === "spine") {
  // top 10 most-imported files (basename match on the imports-out)
  const counts = new Map();
  for (const e of edges) {
    if (e.kind !== "imports") continue;
    if (!e.to.startsWith(".")) continue;        // skip bare modules (pkg deps)
    const key = e.to.replace(/^\.\//, "").replace(/^.*\//, "");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log("# Spine (top 10 most-imported local files)");
  console.log("| Local module | Importers |");
  console.log("|---|---|");
  for (const [m, c] of top) console.log(`| ${m} | ${c} |`);
}
