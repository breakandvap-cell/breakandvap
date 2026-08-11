/**
 * Vérifie le JSON-LD réellement rendu par le site (tests Rich Results hors ligne).
 * Usage : bun scripts/check-rich-results.ts [baseUrl] [chemin...] [--out=dossier] [--no-report]
 * Ex.   : bun scripts/check-rich-results.ts https://breakandvap.lovable.app / /a-propos
 * Les rapports CSV + HTML sont écrits par défaut dans /mnt/documents/rich-results.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateHtmlStructuredData } from "../src/lib/structured-data";
import {
  buildCsv,
  buildHtml,
  buildRows,
  summarize,
  type PageResult,
} from "../src/lib/structured-data-report";

const args = process.argv.slice(2).filter((a) => a.trim().length > 0);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));
const [baseArg, ...pathArgs] = positional;
const base = (baseArg ?? "http://localhost:8080").replace(/\/$/, "");
const paths = pathArgs.length ? pathArgs : ["/", "/a-propos", "/boutique"];
const outDir =
  flags.find((f) => f.startsWith("--out="))?.slice(6) ?? "/mnt/documents/rich-results";
const writeReport = !flags.includes("--no-report");

let failed = false;
const pages: PageResult[] = [];

for (const path of paths) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Googlebot-check" } });
    const html = await res.text();
    const { blocks, reports, parseErrors } = validateHtmlStructuredData(html);
    pages.push({ url, blocks, reports, parseErrors });
    console.log(`\n${url} — ${blocks} bloc(s) JSON-LD`);
    for (const err of parseErrors) {
      failed = true;
      console.log(`  ✖ ${err}`);
    }
    if (blocks === 0) console.log("  · aucun JSON-LD sur cette page");
    for (const r of reports) {
      const status = r.valid ? "✔" : "✖";
      if (!r.valid) failed = true;
      console.log(`  ${status} ${r.type}`);
      r.errors.forEach((e) => console.log(`      erreur : ${e.path} — ${e.message}`));
      r.warnings.forEach((w) => console.log(`      avert. : ${w.path} — ${w.message}`));
    }
  } catch (e) {
    failed = true;
    const message = (e as Error).message;
    pages.push({ url, blocks: 0, reports: [], parseErrors: [], fetchError: message });
    console.log(`\n${url} — échec de récupération : ${message}`);
  }
}

if (writeReport) {
  const now = new Date();
  const rows = buildRows(pages);
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  await mkdir(outDir, { recursive: true });
  const csvPath = join(outDir, `rich-results-${stamp}.csv`);
  const htmlPath = join(outDir, `rich-results-${stamp}.html`);
  await writeFile(csvPath, buildCsv(rows), "utf8");
  await writeFile(htmlPath, buildHtml(rows, { base, date: now }), "utf8");
  await writeFile(join(outDir, "rich-results-latest.csv"), buildCsv(rows), "utf8");
  await writeFile(join(outDir, "rich-results-latest.html"), buildHtml(rows, { base, date: now }), "utf8");
  const s = summarize(rows);
  console.log(
    `\nRapport : ${s.erreurs} erreur(s), ${s.avertissements} avertissement(s), ${s.ok} validation(s) OK`,
  );
  console.log(`  CSV  : ${csvPath}`);
  console.log(`  HTML : ${htmlPath}`);
}

console.log(failed ? "\nDes erreurs bloquantes ont été détectées." : "\nToutes les données structurées sont valides.");
process.exit(failed ? 1 : 0);
