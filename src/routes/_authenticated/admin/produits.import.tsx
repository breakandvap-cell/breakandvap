import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminBulkImportProducts } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/produits/import")({
  ssr: false,
  component: ImportPage,
});

type ParsedRow = {
  line: number;
  marque: string;
  nom: string;
  volume_ml: number | null;
  type: string;
  nicotines_10ml: number[];
  stock: number;
  category: string;
  subcategory: string;
  ref_fournisseur: string;
  _error?: string;
};

const EXPECTED_HEADERS = [
  "Marque",
  "Nom",
  "Volume (ml)",
  "Type",
  "Taux nicotine dispo (10ml)",
  "Prix achat HT (info)",
  "Stock estimé",
  "Catégorie",
  "Sous-catégorie suggérée",
  "Réf fournisseur",
] as const;

function detectDelimiter(sample: string): string {
  const first = sample.split(/\r?\n/)[0] ?? "";
  const semi = (first.match(/;/g) || []).length;
  const comma = (first.match(/,/g) || []).length;
  const tab = (first.match(/\t/g) || []).length;
  if (tab >= semi && tab >= comma && tab > 0) return "\t";
  return semi >= comma ? ";" : ",";
}

// Petit parseur CSV tolérant : gère les guillemets doubles et les
// délimiteurs virgule / point-virgule / tabulation.
function parseCsv(text: string): string[][] {
  const delim = detectDelimiter(text);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  return rows;
}

function toInt(x: string): number | null {
  const s = x.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseNicotines(raw: string): number[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;,\s\/|]+/)
    .map((s) => s.replace(/mg/i, "").replace(",", ".").trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 50)
    .map((n) => Math.round(n));
}

function classify(row: ParsedRow): string | null {
  const cat = row.category.trim().toLowerCase();
  const type = row.type.trim().toLowerCase();
  if (!row.nom.trim()) return "Nom manquant.";
  if (cat === "e_liquide") {
    if (type.includes("10ml") || type.includes("prêt") || type.includes("pret")) return null;
    if (type.includes("boosterable") || type.includes("base")) {
      if (!row.volume_ml || row.volume_ml <= 0) return "Volume manquant pour un e-liquide grand format.";
      return null;
    }
    return `Type e-liquide inconnu : « ${row.type} ».`;
  }
  if (cat === "accessoire_vape") {
    if (type.includes("flacon")) {
      if (!row.volume_ml || row.volume_ml <= 0) return "Volume manquant pour un flacon vide.";
      return null;
    }
    return `Type accessoire non supporté à l'import : « ${row.type} ».`;
  }
  return `Catégorie non supportée : « ${row.category} ».`;
}

function ImportPage() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<{
    created: number;
    ignored: number;
    errors: Array<{ line: number; message: string }>;
  } | null>(null);

  const qc = useQueryClient();
  const importFn = useServerFn(adminBulkImportProducts);
  const mutation = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          rows: rows
            .filter((r) => !r._error)
            .map((r) => ({
              line: r.line,
              marque: r.marque,
              nom: r.nom,
              volume_ml: r.volume_ml,
              type: r.type,
              nicotines_10ml: r.nicotines_10ml,
              stock: r.stock,
              category: r.category,
              subcategory: r.subcategory,
              ref_fournisseur: r.ref_fournisseur,
            })),
        },
      }),
    onSuccess: async (res) => {
      setResult(res);
      toast.success(`${res.created} produit(s) créé(s) en brouillon.`);
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const validCount = useMemo(() => rows.filter((r) => !r._error).length, [rows]);
  const errorRows = useMemo(() => rows.filter((r) => r._error), [rows]);

  function handleFile(file: File) {
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setRows([]);
        toast.error("Fichier vide.");
        return;
      }
      const header = parsed[0].map((h) => h.trim());
      // Mapping tolérant (accent, casse) : cherche la colonne par mots-clés.
      const idx = (needle: string) =>
        header.findIndex((h) =>
          h
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .includes(needle),
        );
      const cols = {
        marque: idx("marque"),
        nom: idx("nom"),
        volume: idx("volume"),
        type: idx("type"),
        nicotines: idx("taux nicotine"),
        stock: idx("stock"),
        category: idx("categorie"),
        subcategory: idx("sous-categorie") >= 0 ? idx("sous-categorie") : idx("sous categorie"),
        ref: idx("ref"),
      };
      if (cols.nom < 0 || cols.category < 0 || cols.type < 0) {
        toast.error(
          `Colonnes manquantes. En-têtes attendus : ${EXPECTED_HEADERS.join(", ")}.`,
        );
        setRows([]);
        return;
      }
      const out: ParsedRow[] = [];
      for (let i = 1; i < parsed.length; i++) {
        const raw = parsed[i];
        const get = (n: number) => (n >= 0 && raw[n] != null ? String(raw[n]) : "");
        const row: ParsedRow = {
          line: i + 1,
          marque: get(cols.marque).trim(),
          nom: get(cols.nom).trim(),
          volume_ml: toInt(get(cols.volume)),
          type: get(cols.type).trim(),
          nicotines_10ml: parseNicotines(get(cols.nicotines)),
          stock: toInt(get(cols.stock)) ?? 0,
          category: get(cols.category).trim(),
          subcategory: get(cols.subcategory).trim(),
          ref_fournisseur: get(cols.ref).trim(),
        };
        const err = classify(row);
        if (err) row._error = err;
        out.push(row);
      }
      setRows(out);
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import CSV en masse</h1>
        <Link to="/admin/produits" className="text-sm text-muted-foreground hover:underline">
          ← Retour aux produits
        </Link>
      </div>

      <div className="rounded-md border bg-muted/20 p-4 text-sm space-y-2">
        <p className="font-medium">Format attendu</p>
        <p className="text-muted-foreground">
          Colonnes (délimiteur <code>;</code> ou <code>,</code>) :{" "}
          <code>{EXPECTED_HEADERS.join(" · ")}</code>
        </p>
        <ul className="list-inside list-disc text-muted-foreground text-xs space-y-1">
          <li>
            <strong>e_liquide</strong> + « 10ml prêt à l'emploi » : crée un e-liquide 10 ml avec les
            taux listés dans « Taux nicotine dispo » (ex. <code>3;6;12</code>), sans boosters.
          </li>
          <li>
            <strong>e_liquide</strong> + « Boosterable (base 0mg) » : e-liquide grand format,
            capacité de flacon à compléter manuellement après import.
          </li>
          <li>
            <strong>accessoire_vape</strong> + « Flacon vide » : flacon vide avec contenance renseignée.
          </li>
          <li>
            Toutes les lignes deviennent des <strong>brouillons non publiés</strong> avec un prix
            de vente à 0 € ; « Prix achat HT (info) » est ignoré.
          </li>
          <li>
            Les lignes de même Marque + Nom mais de contenances différentes sont regroupées en un
            seul produit à plusieurs formats.
          </li>
        </ul>
      </div>

      <div>
        <label className="inline-flex items-center gap-3 rounded-md border border-dashed px-4 py-3 cursor-pointer hover:bg-muted/30">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <span className="text-sm font-medium">Choisir un fichier CSV…</span>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </label>
      </div>

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-200">
              {validCount} ligne(s) valide(s)
            </span>
            {errorRows.length > 0 && (
              <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">
                {errorRows.length} ligne(s) ignorée(s)
              </span>
            )}
            <button
              onClick={() => mutation.mutate()}
              disabled={validCount === 0 || mutation.isPending}
              className="ml-auto inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {mutation.isPending
                ? "Import en cours…"
                : `Créer ${validCount} produit(s) en brouillon`}
            </button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Ligne</th>
                  <th className="px-2 py-1">Marque</th>
                  <th className="px-2 py-1">Nom</th>
                  <th className="px-2 py-1">Cat.</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">Vol (ml)</th>
                  <th className="px-2 py-1">Nicotines</th>
                  <th className="px-2 py-1">Stock</th>
                  <th className="px-2 py-1">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.line} className={r._error ? "bg-destructive/5" : ""}>
                    <td className="px-2 py-1">{r.line}</td>
                    <td className="px-2 py-1">{r.marque}</td>
                    <td className="px-2 py-1 font-medium">{r.nom}</td>
                    <td className="px-2 py-1">{r.category}</td>
                    <td className="px-2 py-1">{r.type}</td>
                    <td className="px-2 py-1">{r.volume_ml ?? "—"}</td>
                    <td className="px-2 py-1">{r.nicotines_10ml.join(", ") || "—"}</td>
                    <td className="px-2 py-1">{r.stock}</td>
                    <td className="px-2 py-1">
                      {r._error ? (
                        <span className="text-destructive">{r._error}</span>
                      ) : (
                        <span className="text-emerald-500">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="border-t px-2 py-2 text-xs text-muted-foreground">
                Aperçu limité aux 10 premières lignes — {rows.length - 10} autres lignes seront
                traitées.
              </p>
            )}
          </div>

          {errorRows.length > 0 && (
            <details className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-destructive">
                Voir les {errorRows.length} ligne(s) ignorée(s)
              </summary>
              <ul className="mt-2 space-y-1">
                {errorRows.map((r) => (
                  <li key={r.line}>
                    Ligne {r.line} — {r._error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <p className="font-medium text-emerald-200">
            Import terminé : {result.created} produit(s) créé(s) en brouillon,{" "}
            {result.ignored} ligne(s) ignorée(s).
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-emerald-100/80">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  Ligne {e.line} — {e.message}
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/admin/produits"
            className="mt-3 inline-flex text-sm text-primary hover:underline"
          >
            Voir les produits importés →
          </Link>
        </div>
      )}
    </div>
  );
}