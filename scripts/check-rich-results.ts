/**
 * Vérifie le JSON-LD réellement rendu par le site (tests Rich Results hors ligne).
 * Usage : bun scripts/check-rich-results.ts [baseUrl] [chemin...]
 * Ex.   : bun scripts/check-rich-results.ts https://breakandvap.lovable.app / /a-propos
 */
import { validateHtmlStructuredData } from "../src/lib/structured-data";

const [, , baseArg, ...pathArgs] = process.argv;
const base = (baseArg ?? "http://localhost:8080").replace(/\/$/, "");
const paths = pathArgs.length ? pathArgs : ["/", "/a-propos", "/boutique"];

let failed = false;

for (const path of paths) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Googlebot-check" } });
    const html = await res.text();
    const { blocks, reports, parseErrors } = validateHtmlStructuredData(html);
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
    console.log(`\n${url} — échec de récupération : ${(e as Error).message}`);
  }
}

console.log(failed ? "\nDes erreurs bloquantes ont été détectées." : "\nToutes les données structurées sont valides.");
process.exit(failed ? 1 : 0);
