import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  receptionApplyStock,
  receptionCreateMapping,
  receptionMatchLines,
  receptionSearchVariants,
} from "@/lib/reception.functions";

export const Route = createFileRoute("/_authenticated/admin/reception-marchandise")({
  ssr: false,
  component: ReceptionPage,
});

type CsvLine = {
  line: number;
  supplier: string;
  supplier_ref: string;
  supplier_label: string;
  qty: number;
  unit_price_ht_cents: number | null;
  _error?: string;
};

type Recognized = {
  line: number;
  supplier: string;
  supplier_ref: string;
  supplier_label: string;
  qty: number;
  variantId: string;
  sku: string | null;
  volume_ml: number;
  nicotine_type: string;
  current_stock: number;
  new_stock: number;
  product_id: string;
  product_name: string;
  brand: string | null;
  range: string | null;
};

type Unrecognized = {
  line: number;
  supplier: string;
  supplier_ref: string;
  supplier_label: string;
  qty: number;
  unit_price_ht_cents: number | null;
  decision?: "associate" | "to_create";
};

function detectDelimiter(sample: string): string {
  const first = sample.split(/\r?\n/)[0] ?? "";
  const semi = (first.match(/;/g) || []).length;
  const comma = (first.match(/,/g) || []).length;
  const tab = (first.match(/\t/g) || []).length;
  if (tab >= semi && tab >= comma && tab > 0) return "\t";
  return semi >= comma ? ";" : ",";
}

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
    if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
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
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toCents(x: string): number | null {
  const s = x.trim().replace(/\s/g, "").replace(/€/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function csvDownload(filename: string, header: string[], rows: string[][]) {
  const escape = (v: string) =>
    /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const body = [header, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReceptionPage() {
  const qc = useQueryClient();
  const matchFn = useServerFn(receptionMatchLines);
  const applyFn = useServerFn(receptionApplyStock);
  const searchFn = useServerFn(receptionSearchVariants);
  const mapFn = useServerFn(receptionCreateMapping);

  const [fileName, setFileName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [csvLines, setCsvLines] = useState<CsvLine[]>([]);
  const [recognized, setRecognized] = useState<Recognized[]>([]);
  const [unrecognized, setUnrecognized] = useState<Unrecognized[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [summary, setSummary] = useState<{
    updated: number;
    pending: number;
    to_create: number;
  } | null>(null);

  const dominantSupplier = useMemo(() => {
    const c = new Map<string, number>();
    csvLines.forEach((l) => c.set(l.supplier, (c.get(l.supplier) ?? 0) + 1));
    let best = "";
    let max = 0;
    for (const [s, n] of c) if (n > max) { best = s; max = n; }
    return best;
  }, [csvLines]);

  const matchMutation = useMutation({
    mutationFn: (lines: CsvLine[]) =>
      matchFn({
        data: {
          lines: lines
            .filter((l) => !l._error)
            .map((l) => ({
              line: l.line,
              supplier: l.supplier,
              supplier_ref: l.supplier_ref,
              supplier_label: l.supplier_label,
              qty: l.qty,
              unit_price_ht_cents: l.unit_price_ht_cents,
            })),
        },
      }),
    onSuccess: (res) => {
      setRecognized(res.recognized as Recognized[]);
      setUnrecognized(res.unrecognized as Unrecognized[]);
      const c: Record<number, boolean> = {};
      (res.recognized as Recognized[]).forEach((r) => (c[r.line] = true));
      setChecked(c);
      setSummary(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      const invoice = invoiceNumber.trim();
      if (!invoice) throw new Error("Numéro de facture fournisseur requis.");
      const updates = recognized
        .filter((r) => checked[r.line])
        .map((r) => ({ variant_id: r.variantId, qty: r.qty }));
      const pending = unrecognized.filter((u) => u.decision !== "to_create").length;
      const to_create = unrecognized.filter((u) => u.decision === "to_create").length;
      return applyFn({
        data: {
          supplier: dominantSupplier || "inconnu",
          invoice_number: invoice,
          updates,
          counts: { pending, to_create },
        },
      });
    },
    onSuccess: async (res) => {
      setSummary({ updated: res.updated, pending: res.pending, to_create: res.to_create });
      toast.success(`${res.updated} variante(s) mise(s) à jour.`);
      // Décale l'affichage : on retire les lignes cochées et appliquées
      setRecognized((prev) => prev.filter((r) => !checked[r.line]));
      setChecked({});
      setInvoiceNumber("");
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function handleFile(file: File) {
    setSummary(null);
    setRecognized([]);
    setUnrecognized([]);
    setChecked({});
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setCsvLines([]);
        toast.error("Fichier vide.");
        return;
      }
      const header = rows[0].map((h) => h.trim());
      const idx = (needle: string) =>
        header.findIndex((h) =>
          h
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .includes(needle),
        );
      const cols = {
        supplier: idx("fournisseur"),
        ref: idx("reference"),
        label: idx("libelle"),
        qty: idx("quantite") >= 0 ? idx("quantite") : idx("qte"),
        price: idx("prix"),
      };
      if (cols.supplier < 0 || cols.qty < 0 || (cols.ref < 0 && cols.label < 0)) {
        toast.error(
          "Colonnes requises : Fournisseur, Référence fournisseur ou Libellé, Quantité, Prix achat HT.",
        );
        setCsvLines([]);
        return;
      }
      const out: CsvLine[] = [];
      for (let i = 1; i < rows.length; i++) {
        const raw = rows[i];
        const get = (n: number) => (n >= 0 && raw[n] != null ? String(raw[n]) : "");
        const supplier = get(cols.supplier).trim();
        const supplier_ref = get(cols.ref).trim();
        const supplier_label = get(cols.label).trim();
        const qty = toInt(get(cols.qty)) ?? 0;
        const price = toCents(get(cols.price));
        const line: CsvLine = {
          line: i + 1,
          supplier,
          supplier_ref,
          supplier_label,
          qty,
          unit_price_ht_cents: price,
        };
        if (!supplier) line._error = "Fournisseur manquant.";
        else if (!supplier_ref && !supplier_label) line._error = "Référence ou libellé requis.";
        else if (qty <= 0) line._error = "Quantité invalide.";
        out.push(line);
      }
      setCsvLines(out);
      const valid = out.filter((l) => !l._error);
      if (valid.length > 0) matchMutation.mutate(out);
      else toast.error("Aucune ligne valide dans le fichier.");
    };
    reader.readAsText(file, "utf-8");
  }

  const toCreateCount = unrecognized.filter((u) => u.decision === "to_create").length;

  function exportToCreate() {
    const rows = unrecognized
      .filter((u) => u.decision === "to_create")
      .map((u) => [
        "", // Marque
        u.supplier_label || u.supplier_ref, // Nom
        "", // Volume (ml)
        "", // Type
        "", // Nicotines
        u.unit_price_ht_cents != null
          ? (u.unit_price_ht_cents / 100).toFixed(2)
          : "",
        String(u.qty),
        "",
        "",
        u.supplier_ref,
      ]);
    csvDownload(
      `nouveaux-produits-a-creer-${new Date().toISOString().slice(0, 10)}.csv`,
      [
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
      ],
      rows,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Réception marchandise</h1>
        <Link to="/admin/produits" className="text-sm text-muted-foreground hover:underline">
          ← Retour aux produits
        </Link>
      </div>

      <div className="rounded-md border bg-muted/20 p-4 text-sm space-y-2">
        <p className="font-medium">Format attendu du CSV</p>
        <p className="text-muted-foreground">
          Colonnes : <code>Fournisseur ; Référence fournisseur ; Libellé ; Quantité ; Prix achat HT</code>.
          La référence ou le libellé suffit pour la reconnaissance. Le prix d'achat est informatif
          (ré-utilisé lors de la création de nouveaux produits).
        </p>
      </div>

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

      <div className="flex flex-col gap-1 max-w-md">
        <label htmlFor="invoice-number" className="text-sm font-medium">
          Numéro de facture fournisseur <span className="text-destructive">*</span>
        </label>
        <input
          id="invoice-number"
          type="text"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          placeholder="Ex. FAC-2026-00123"
          className="rounded-md border px-3 py-2 text-sm"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Obligatoire pour appliquer les stocks. Le couple fournisseur + numéro est mémorisé pour
          empêcher tout ré-import accidentel de la même facture.
        </p>
      </div>

      {matchMutation.isPending && (
        <p className="text-sm text-muted-foreground">Analyse des lignes…</p>
      )}

      {csvLines.some((l) => l._error) && (
        <details className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <summary className="cursor-pointer font-medium text-destructive">
            {csvLines.filter((l) => l._error).length} ligne(s) ignorée(s) du CSV
          </summary>
          <ul className="mt-2 space-y-1">
            {csvLines
              .filter((l) => l._error)
              .slice(0, 30)
              .map((l) => (
                <li key={l.line}>
                  Ligne {l.line} — {l._error}
                </li>
              ))}
          </ul>
        </details>
      )}

      {recognized.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold">Produits reconnus</h2>
              <p className="text-xs text-muted-foreground">
                Cochez les lignes à appliquer. Les quantités reçues sont additionnées au stock existant.
              </p>
            </div>
            <button
              onClick={() => applyMutation.mutate()}
              disabled={
                applyMutation.isPending ||
                !invoiceNumber.trim() ||
                recognized.filter((r) => checked[r.line]).length === 0
              }
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {applyMutation.isPending
                ? "Application…"
                : `Appliquer les mises à jour de stock (${recognized.filter((r) => checked[r.line]).length})`}
            </button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 w-8">
                    <input
                      type="checkbox"
                      checked={recognized.every((r) => checked[r.line])}
                      onChange={(e) => {
                        const v = e.target.checked;
                        const c: Record<number, boolean> = {};
                        recognized.forEach((r) => (c[r.line] = v));
                        setChecked(c);
                      }}
                    />
                  </th>
                  <th className="px-2 py-1">Ligne</th>
                  <th className="px-2 py-1">Réf fournisseur</th>
                  <th className="px-2 py-1">Produit catalogue</th>
                  <th className="px-2 py-1">Format</th>
                  <th className="px-2 py-1 text-right">Stock actuel</th>
                  <th className="px-2 py-1 text-right">Reçu</th>
                  <th className="px-2 py-1 text-right">Nouveau stock</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recognized.map((r) => (
                  <tr key={r.line}>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={!!checked[r.line]}
                        onChange={(e) =>
                          setChecked((prev) => ({ ...prev, [r.line]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-2 py-1">{r.line}</td>
                    <td className="px-2 py-1 font-mono">
                      {r.supplier_ref || <span className="text-muted-foreground">{r.supplier_label}</span>}
                    </td>
                    <td className="px-2 py-1">
                      <div className="font-medium">{r.product_name}</div>
                      <div className="text-muted-foreground">
                        {[r.brand, r.range].filter(Boolean).join(" · ")}
                        {r.sku && <span className="ml-2 font-mono">{r.sku}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      {r.volume_ml} ml
                      {r.nicotine_type && r.nicotine_type !== "normale" && (
                        <span className="ml-1 text-muted-foreground">· {r.nicotine_type}</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">{r.current_stock}</td>
                    <td className="px-2 py-1 text-right font-medium">+{r.qty}</td>
                    <td className="px-2 py-1 text-right font-semibold text-emerald-500">
                      {r.new_stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {unrecognized.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold">Produits non reconnus</h2>
              <p className="text-xs text-muted-foreground">
                Associez à une variante existante (crée la correspondance pour les prochaines
                factures) ou marquez comme nouveau produit à créer.
              </p>
            </div>
            {toCreateCount > 0 && (
              <button
                onClick={exportToCreate}
                className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                Exporter {toCreateCount} nouveau(x) produit(s) en CSV
              </button>
            )}
          </div>
          <div className="space-y-2">
            {unrecognized.map((u) => (
              <UnrecognizedRow
                key={u.line}
                line={u}
                onAssociate={async (variantId, variantSummary) => {
                  try {
                    await mapFn({
                      data: {
                        supplier: u.supplier,
                        supplier_ref: u.supplier_ref || null,
                        supplier_label: u.supplier_label || null,
                        variant_id: variantId,
                      },
                    });
                    // Retire de la liste non-reconnue et ajoute à reconnue
                    setUnrecognized((prev) => prev.filter((x) => x.line !== u.line));
                    setRecognized((prev) => [
                      ...prev,
                      {
                        line: u.line,
                        supplier: u.supplier,
                        supplier_ref: u.supplier_ref,
                        supplier_label: u.supplier_label,
                        qty: u.qty,
                        variantId,
                        ...variantSummary,
                      },
                    ]);
                    setChecked((prev) => ({ ...prev, [u.line]: true }));
                    toast.success("Correspondance enregistrée.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                onMarkToCreate={() =>
                  setUnrecognized((prev) =>
                    prev.map((x) =>
                      x.line === u.line
                        ? { ...x, decision: x.decision === "to_create" ? undefined : "to_create" }
                        : x,
                    ),
                  )
                }
                searchFn={searchFn as any}
              />
            ))}
          </div>
        </section>
      )}

      {summary && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <p className="font-medium text-emerald-200">
            {summary.updated} variante(s) mise(s) à jour, {summary.pending} ligne(s) en attente
            d'association, {summary.to_create} nouveau(x) produit(s) à créer.
          </p>
        </div>
      )}
    </div>
  );
}

function UnrecognizedRow({
  line,
  onAssociate,
  onMarkToCreate,
  searchFn,
}: {
  line: Unrecognized;
  onAssociate: (
    variantId: string,
    summary: {
      sku: string | null;
      volume_ml: number;
      nicotine_type: string;
      current_stock: number;
      new_stock: number;
      product_id: string;
      product_name: string;
      brand: string | null;
      range: string | null;
    },
  ) => void;
  onMarkToCreate: () => void;
  searchFn: (args: { data: { query: string } }) => Promise<any[]>;
}) {
  const [q, setQ] = useState(line.supplier_label || line.supplier_ref);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function doSearch() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const rows = await searchFn({ data: { query: q.trim() } });
      setResults(rows);
      setOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const isToCreate = line.decision === "to_create";

  return (
    <div
      className={
        "rounded-md border p-3 " +
        (isToCreate ? "border-amber-500/40 bg-amber-500/5" : "bg-card")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">
            {line.supplier_label || <span className="text-muted-foreground">(sans libellé)</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            Ligne {line.line} · {line.supplier}
            {line.supplier_ref && <span className="font-mono"> · {line.supplier_ref}</span>}
            <span> · Qté reçue {line.qty}</span>
            {line.unit_price_ht_cents != null && (
              <span> · PA HT {(line.unit_price_ht_cents / 100).toFixed(2)} €</span>
            )}
          </div>
        </div>
        <button
          onClick={onMarkToCreate}
          className={
            "inline-flex items-center rounded-md border px-2 py-1 text-xs " +
            (isToCreate
              ? "border-amber-500/60 bg-amber-500/10 text-amber-200"
              : "hover:bg-muted")
          }
        >
          {isToCreate ? "✓ Nouveau produit à créer" : "Marquer comme nouveau produit"}
        </button>
      </div>

      {!isToCreate && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); doSearch(); }
              }}
              placeholder="Rechercher par nom, marque, gamme, SKU…"
              className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <button
              onClick={doSearch}
              disabled={loading}
              className="rounded-md border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
            >
              {loading ? "…" : "Rechercher"}
            </button>
          </div>
          {open && results.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucun résultat.</p>
          )}
          {results.length > 0 && (
            <ul className="divide-y rounded-md border">
              {results.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-2 py-1 text-xs">
                  <div>
                    <div className="font-medium">{r.product_name}</div>
                    <div className="text-muted-foreground">
                      {[r.brand, r.range].filter(Boolean).join(" · ")} · {r.volume_ml} ml
                      {r.nicotine_type && r.nicotine_type !== "normale" && ` · ${r.nicotine_type}`}
                      {r.sku && <span className="ml-2 font-mono">{r.sku}</span>}
                      <span className="ml-2">stock {r.stock}</span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      onAssociate(r.id, {
                        sku: r.sku,
                        volume_ml: r.volume_ml,
                        nicotine_type: r.nicotine_type,
                        current_stock: r.stock,
                        new_stock: r.stock + line.qty,
                        product_id: r.product_id,
                        product_name: r.product_name,
                        brand: r.brand,
                        range: r.range,
                      })
                    }
                    className="rounded-md bg-primary px-2 py-1 text-primary-foreground"
                  >
                    Associer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}