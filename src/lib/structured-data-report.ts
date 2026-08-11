/**
 * Génération de rapports (CSV / HTML) à partir des validations JSON-LD.
 */
import type { JsonLdReport } from "./structured-data";

export type PageResult = {
  url: string;
  blocks: number;
  reports: JsonLdReport[];
  parseErrors: string[];
  fetchError?: string;
};

export type ReportRow = {
  url: string;
  type: string;
  statut: "OK" | "Erreur" | "Avertissement";
  severite: "erreur" | "avertissement" | "info";
  champ: string;
  message: string;
};

export function buildRows(pages: PageResult[]): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const page of pages) {
    if (page.fetchError) {
      rows.push({
        url: page.url,
        type: "-",
        statut: "Erreur",
        severite: "erreur",
        champ: "fetch",
        message: page.fetchError,
      });
      continue;
    }
    for (const err of page.parseErrors) {
      rows.push({
        url: page.url,
        type: "-",
        statut: "Erreur",
        severite: "erreur",
        champ: "JSON",
        message: err,
      });
    }
    if (page.blocks === 0) {
      rows.push({
        url: page.url,
        type: "-",
        statut: "Avertissement",
        severite: "avertissement",
        champ: "ld+json",
        message: "Aucun bloc JSON-LD sur cette page.",
      });
    }
    for (const r of page.reports) {
      if (r.errors.length === 0 && r.warnings.length === 0) {
        rows.push({
          url: page.url,
          type: r.type,
          statut: "OK",
          severite: "info",
          champ: "-",
          message: "Aucun problème détecté.",
        });
      }
      r.errors.forEach((e) =>
        rows.push({
          url: page.url,
          type: r.type,
          statut: "Erreur",
          severite: "erreur",
          champ: e.path,
          message: e.message,
        }),
      );
      r.warnings.forEach((w) =>
        rows.push({
          url: page.url,
          type: r.type,
          statut: "Avertissement",
          severite: "avertissement",
          champ: w.path,
          message: w.message,
        }),
      );
    }
  }
  return rows;
}

export function summarize(rows: ReportRow[]) {
  return {
    total: rows.length,
    erreurs: rows.filter((r) => r.severite === "erreur").length,
    avertissements: rows.filter((r) => r.severite === "avertissement").length,
    ok: rows.filter((r) => r.severite === "info").length,
  };
}

const csvCell = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

export function buildCsv(rows: ReportRow[]): string {
  const header = ["URL", "Type", "Statut", "Sévérité", "Champ", "Message"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.url, r.type, r.statut, r.severite, r.champ, r.message].map(csvCell).join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const esc = (v: string) =>
  String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buildHtml(rows: ReportRow[], meta: { base: string; date: Date }): string {
  const s = summarize(rows);
  const body = rows
    .map(
      (r) => `<tr class="${r.severite}">
      <td>${esc(r.url)}</td><td>${esc(r.type)}</td><td><span class="badge">${esc(r.statut)}</span></td>
      <td>${esc(r.champ)}</td><td>${esc(r.message)}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Rapport données structurées — ${esc(meta.base)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; background:#0f1115; color:#e7e9ee; }
  h1 { font-size: 1.4rem; margin-bottom: .25rem; }
  p.meta { color:#9aa3b2; margin-top:0; }
  .cards { display:flex; gap:1rem; flex-wrap:wrap; margin:1.5rem 0; }
  .card { background:#171b23; border:1px solid #262c38; border-radius:12px; padding:1rem 1.25rem; min-width:140px; }
  .card strong { display:block; font-size:1.6rem; }
  table { border-collapse: collapse; width:100%; font-size:.9rem; }
  th, td { text-align:left; padding:.55rem .7rem; border-bottom:1px solid #262c38; vertical-align:top; }
  th { color:#9aa3b2; font-weight:600; }
  .badge { border-radius:999px; padding:.1rem .6rem; font-size:.78rem; border:1px solid currentColor; }
  tr.erreur .badge { color:#ff6b6b; }
  tr.avertissement .badge { color:#ffc94d; }
  tr.info .badge { color:#4ade80; }
</style></head><body>
<h1>Rapport de validation des données structurées</h1>
<p class="meta">${esc(meta.base)} — ${esc(meta.date.toLocaleString("fr-FR"))}</p>
<div class="cards">
  <div class="card"><strong>${s.total}</strong>lignes</div>
  <div class="card"><strong>${s.erreurs}</strong>erreurs</div>
  <div class="card"><strong>${s.avertissements}</strong>avertissements</div>
  <div class="card"><strong>${s.ok}</strong>validations OK</div>
</div>
<table><thead><tr><th>URL</th><th>Type</th><th>Statut</th><th>Champ</th><th>Message</th></tr></thead>
<tbody>
${body}
</tbody></table>
</body></html>`;
}