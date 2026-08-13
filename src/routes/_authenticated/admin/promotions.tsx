import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { shopCategoriesQueryOptions } from "@/lib/categories.functions";
import {
  adminDeletePromotion,
  adminDeleteWheelPrize,
  adminListPromotions,
  adminListWheelPrizes,
  adminSetPromotionActive,
  adminSetWheelEnabled,
  adminUpsertPromotion,
  adminUpsertWheelPrize,
  adminWheelSummary,
  type DiscountType,
  type Promotion,
  type WheelPrize,
  type WheelType,
} from "@/lib/promotions.functions";

export const Route = createFileRoute("/_authenticated/admin/promotions")({
  ssr: false,
  component: PromotionsAdmin,
});

const euro = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function discountLabel(type: DiscountType, value: number): string {
  return type === "percentage"
    ? `-${value.toLocaleString("fr-FR")} %`
    : `-${value.toLocaleString("fr-FR")} €`;
}

function promotionState(p: Promotion): { label: string; className: string } {
  const now = Date.now();
  const start = new Date(p.start_date).getTime();
  const end = p.end_date ? new Date(p.end_date).getTime() : null;
  if (!p.is_active) return { label: "Inactive", className: "bg-secondary text-muted-foreground" };
  if (end != null && end < now) return { label: "Terminée", className: "bg-secondary text-muted-foreground" };
  if (start > now) return { label: "Planifiée", className: "bg-amber-500/15 text-amber-500" };
  return { label: "En cours", className: "bg-emerald-500/15 text-emerald-500" };
}

function PromotionsAdmin() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Promotions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Réductions du site et lots des roues de la fortune.
        </p>
      </header>
      <SitePromotionsSection />
      <WheelSection wheelType="welcome" title="Roue de bienvenue" hint="Jouée à l'inscription d'un nouveau client." />
      <WheelSection wheelType="general" title="Roue générale" hint="Jouable au moment du paiement lorsqu'elle est activée." />
    </div>
  );
}

// ------------------------------------------------------------------ Promotions

type PromoForm = {
  id?: string;
  name: string;
  discount_type: DiscountType;
  discount_value: string;
  scope: "site" | "category" | "product";
  scope_id: string | null;
  scope_label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const emptyPromo = (): PromoForm => ({
  name: "",
  discount_type: "percentage",
  discount_value: "10",
  scope: "site",
  scope_id: null,
  scope_label: "",
  start_date: toLocalInput(new Date().toISOString()),
  end_date: "",
  is_active: true,
});

function SitePromotionsSection() {
  const qc = useQueryClient();
  const list = useServerFn(adminListPromotions);
  const upsert = useServerFn(adminUpsertPromotion);
  const setActive = useServerFn(adminSetPromotionActive);
  const del = useServerFn(adminDeletePromotion);
  const [form, setForm] = useState<PromoForm>(emptyPromo);
  const { data: categories = [] } = useQuery(shopCategoriesQueryOptions());

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "promotions"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "promotions"] });

  const mSave = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: form.id,
          name: form.name.trim(),
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value.replace(",", ".")),
          scope: form.scope,
          scope_id: form.scope === "site" ? null : form.scope_id,
          start_date: new Date(form.start_date).toISOString(),
          end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
          is_active: form.is_active,
        },
      }),
    onSuccess: () => {
      toast.success(form.id ? "Promotion mise à jour" : "Promotion créée");
      setForm(emptyPromo());
      invalidate();
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const mToggle = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => setActive({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Promotion supprimée");
      invalidate();
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const scopeName = (p: Promotion) => {
    if (p.scope === "site") return "Tout le site";
    if (p.scope === "category")
      return categories.find((c) => c.id === p.scope_id)?.name ?? "Catégorie";
    return "Produit";
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Promo générale du site</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nom interne">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Soldes d'été"
          />
        </Field>
        <Field label="Type de réduction">
          <select
            className="input"
            value={form.discount_type}
            onChange={(e) => setForm({ ...form, discount_type: e.target.value as DiscountType })}
          >
            <option value="percentage">Pourcentage (%)</option>
            <option value="fixed_amount">Montant fixe (€)</option>
          </select>
        </Field>
        <Field label="Valeur">
          <input
            className="input"
            inputMode="decimal"
            value={form.discount_value}
            onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
          />
        </Field>
        <Field label="Portée">
          <select
            className="input"
            value={form.scope}
            onChange={(e) =>
              setForm({
                ...form,
                scope: e.target.value as PromoForm["scope"],
                scope_id: null,
                scope_label: "",
              })
            }
          >
            <option value="site">Tout le site</option>
            <option value="category">Une catégorie</option>
            <option value="product">Un produit</option>
          </select>
        </Field>
        {form.scope === "category" ? (
          <Field label="Catégorie">
            <select
              className="input"
              value={form.scope_id ?? ""}
              onChange={(e) => setForm({ ...form, scope_id: e.target.value || null })}
            >
              <option value="">Sélectionner…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {form.scope === "product" ? (
          <Field label="Produit">
            <ProductPicker
              value={form.scope_id}
              label={form.scope_label}
              onChange={(id, label) => setForm({ ...form, scope_id: id, scope_label: label })}
            />
          </Field>
        ) : null}
        <Field label="Date de début">
          <input
            type="datetime-local"
            className="input"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </Field>
        <Field label="Date de fin (optionnelle)">
          <input
            type="datetime-local"
            className="input"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </Field>
        <Field label="Statut">
          <label className="flex h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Active
          </label>
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => mSave.mutate()}
          disabled={mSave.isPending || !form.name.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {mSave.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {form.id ? "Enregistrer" : "Créer la promotion"}
        </button>
        {form.id ? (
          <button
            onClick={() => setForm(emptyPromo())}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Annuler
          </button>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune promotion enregistrée.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Nom</th>
                <th>Réduction</th>
                <th>Portée</th>
                <th>Début</th>
                <th>Fin</th>
                <th>État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => {
                const st = promotionState(p);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td>{discountLabel(p.discount_type, Number(p.discount_value))}</td>
                    <td>{scopeName(p)}</td>
                    <td>{formatDate(p.start_date)}</td>
                    <td>{formatDate(p.end_date)}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${st.className}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        onClick={() => mToggle.mutate({ id: p.id, is_active: !p.is_active })}
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        {p.is_active ? "Désactiver" : "Activer"}
                      </button>
                      <button
                        onClick={() =>
                          setForm({
                            id: p.id,
                            name: p.name,
                            discount_type: p.discount_type,
                            discount_value: String(p.discount_value),
                            scope: p.scope,
                            scope_id: p.scope_id,
                            scope_label: "",
                            start_date: toLocalInput(p.start_date),
                            end_date: toLocalInput(p.end_date),
                            is_active: p.is_active,
                          })
                        }
                        className="ml-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => mDelete.mutate(p.id)}
                        aria-label="Supprimer"
                        className="ml-2 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-secondary"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ProductPicker({
  value,
  label,
  onChange,
}: {
  value: string | null;
  label: string;
  onChange: (id: string | null, label: string) => void;
}) {
  const [term, setTerm] = useState(label);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const { data = [] } = useQuery({
    queryKey: ["admin", "promo-product-search", debounced] as const,
    enabled: debounced.length >= 2 && !value,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_products", {
        search_term: debounced,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).slice(0, 6) as Array<{ id: string; name: string }>;
    },
  });

  if (value) {
    return (
      <div className="flex h-11 items-center justify-between gap-2 rounded-md border border-input px-3 text-sm">
        <span className="truncate">{label || "Produit sélectionné"}</span>
        <button
          type="button"
          onClick={() => {
            onChange(null, "");
            setTerm("");
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        className="input"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Rechercher un produit…"
      />
      {data.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {data.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onChange(p.id, p.name)}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------- Roues

function WheelSection({
  wheelType,
  title,
  hint,
}: {
  wheelType: WheelType;
  title: string;
  hint: string;
}) {
  const qc = useQueryClient();
  const list = useServerFn(adminListWheelPrizes);
  const upsert = useServerFn(adminUpsertWheelPrize);
  const del = useServerFn(adminDeleteWheelPrize);
  const setEnabled = useServerFn(adminSetWheelEnabled);
  const summaryFn = useServerFn(adminWheelSummary);

  const { data: prizes = [], isLoading } = useQuery({
    queryKey: ["admin", "wheel-prizes"],
    queryFn: () => list(),
  });
  const { data: summary } = useQuery({
    queryKey: ["admin", "wheel-summary"],
    queryFn: () => summaryFn(),
  });

  const rows = useMemo(
    () => prizes.filter((p) => p.wheel_type === wheelType),
    [prizes, wheelType],
  );
  /** Probabilités en cours d'édition (id -> { proba, actif }). */
  const [drafts, setDrafts] = useState<
    Record<string, { weight: number; is_active: boolean }>
  >({});
  const totalProbability = rows.reduce((s, r) => {
    const d = drafts[r.id] ?? { weight: Number(r.weight || 0), is_active: r.is_active };
    return d.is_active ? s + Number(d.weight || 0) : s;
  }, 0);
  const totalValid = Math.round(totalProbability * 100) === 10000;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "wheel-prizes"] });
    qc.invalidateQueries({ queryKey: ["admin", "wheel-summary"] });
    qc.invalidateQueries({ queryKey: ["wheel-toggles"] });
  };

  const mSave = useMutation({
    mutationFn: (p: Partial<WheelPrize> & { wheel_type: WheelType }) =>
      upsert({
        data: {
          id: p.id,
          wheel_type: p.wheel_type,
          label: p.label ?? "",
          discount_type: (p.discount_type ?? "percentage") as DiscountType,
          discount_value: Number(p.discount_value ?? 0),
          weight: Number(p.weight ?? 1),
          is_active: p.is_active ?? true,
        },
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const mToggleWheel = useMutation({
    mutationFn: (enabled: boolean) => setEnabled({ data: { wheel_type: wheelType, enabled } }),
    onSuccess: () => {
      toast.success("Réglage enregistré");
      invalidate();
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const enabled =
    wheelType === "welcome"
      ? (summary?.toggles.welcome_wheel_enabled ?? false)
      : (summary?.toggles.general_wheel_enabled ?? false);
  const stats = summary?.stats[wheelType];

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={mToggleWheel.isPending || !summary}
            onChange={(e) => mToggleWheel.mutate(e.target.checked)}
          />
          {enabled ? "Roue activée" : "Roue désactivée"}
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Tirages effectués" value={String(stats?.spins ?? 0)} />
        <Stat label="Gains utilisés" value={String(stats?.used ?? 0)} />
        <Stat label="Réductions accordées" value={euro(stats?.total_discount_cents ?? 0)} />
      </div>

      <div
        className={`mt-6 rounded-md p-2 text-sm ${
          totalValid
            ? "bg-secondary/50 text-muted-foreground"
            : "border border-destructive bg-destructive/10 text-destructive"
        }`}
      >
        {totalValid
          ? "Total des probabilités : 100 %"
          : `Le total doit faire 100 %, actuellement ${totalProbability
              .toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`}
      </div>

      <div className="mt-4 overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Libellé</th>
                <th>Type</th>
                <th>Valeur</th>
                <th>Probabilité (%)</th>
                <th>Actif</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <PrizeRow
                  key={p.id}
                  prize={p}
                  totalValid={totalValid}
                  onDraftChange={(next) =>
                    setDrafts((prev) => ({ ...prev, [p.id]: next }))
                  }
                  onSave={(next) => mSave.mutate(next)}
                  onDelete={() => mDelete.mutate(p.id)}
                />
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-sm text-muted-foreground">
                    Aucun lot pour cette roue.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      <button
        onClick={() =>
          mSave.mutate({
            wheel_type: wheelType,
            label: "-5%",
            discount_type: "percentage",
            discount_value: 5,
            weight: 0,
            is_active: false,
          })
        }
        disabled={mSave.isPending}
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> Ajouter un lot
      </button>
    </section>
  );
}

function PrizeRow({
  prize,
  totalValid,
  onDraftChange,
  onSave,
  onDelete,
}: {
  prize: WheelPrize;
  totalValid: boolean;
  onDraftChange: (d: { weight: number; is_active: boolean }) => void;
  onSave: (p: WheelPrize) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(prize);
  useEffect(() => setDraft(prize), [prize]);
  useEffect(() => {
    onDraftChange({ weight: Number(draft.weight) || 0, is_active: draft.is_active });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.weight, draft.is_active]);
  const dirty =
    draft.label !== prize.label ||
    draft.discount_type !== prize.discount_type ||
    Number(draft.discount_value) !== Number(prize.discount_value) ||
    Number(draft.weight) !== Number(prize.weight) ||
    draft.is_active !== prize.is_active;
  const probaInvalid = Number(draft.weight) < 0 || Number(draft.weight) > 100;

  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-2">
        <input
          className="input h-9"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
      </td>
      <td className="pr-2">
        <select
          className="input h-9"
          value={draft.discount_type}
          onChange={(e) =>
            setDraft({ ...draft, discount_type: e.target.value as DiscountType })
          }
        >
          <option value="percentage">%</option>
          <option value="fixed_amount">€</option>
        </select>
      </td>
      <td className="pr-2">
        <input
          className="input h-9 w-20"
          inputMode="decimal"
          value={String(draft.discount_value)}
          onChange={(e) =>
            setDraft({ ...draft, discount_value: Number(e.target.value.replace(",", ".")) || 0 })
          }
        />
      </td>
      <td className="pr-2">
        <input
          className={`input h-9 w-20 ${probaInvalid || !totalValid ? "border-destructive" : ""}`}
          inputMode="decimal"
          aria-label="Probabilité en pourcentage"
          value={String(draft.weight)}
          onChange={(e) =>
            setDraft({
              ...draft,
              weight: Math.round(Number(e.target.value.replace(",", ".")) || 0),
            })
          }
        />
      </td>
      <td className="pr-2">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
        />
      </td>
      <td className="whitespace-nowrap text-right">
        <button
          onClick={() => onSave(draft)}
          disabled={!dirty || !totalValid || probaInvalid}
          title={!totalValid ? "Le total des probabilités doit faire 100 %" : undefined}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-40"
        >
          Enregistrer
        </button>
        <button
          onClick={onDelete}
          aria-label="Supprimer le lot"
          className="ml-2 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-secondary"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
