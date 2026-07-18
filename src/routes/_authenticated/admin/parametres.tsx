import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  adminUpdateBoosterConfig,
  siteSettingsQueryOptions,
} from "@/lib/site-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/parametres")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(siteSettingsQueryOptions());
  const update = useServerFn(adminUpdateBoosterConfig);

  const [volume, setVolume] = useState("10");
  const [concentration, setConcentration] = useState("20");

  useEffect(() => {
    if (data) {
      setVolume(String(data.boosterVolumeMl));
      setConcentration(String(data.boosterConcentrationMgPerMl));
    }
  }, [data]);

  const mgTotal = (Number(volume) || 0) * (Number(concentration) || 0);

  const m = useMutation({
    mutationFn: (payload: { booster_volume_ml: number; booster_concentration_mg_per_ml: number }) =>
      update({ data: payload }),
    onSuccess: async () => {
      toast.success("Réglages enregistrés.");
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: (e) => toast.error((e as Error).message || "Enregistrement impossible."),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = Number(volume.replace(",", "."));
    const c = Number(concentration.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Le volume du booster doit être un nombre positif.");
      return;
    }
    if (!Number.isFinite(c) || c <= 0) {
      toast.error("La concentration doit être un nombre positif.");
      return;
    }
    m.mutate({ booster_volume_ml: v, booster_concentration_mg_per_ml: c });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Paramètres du site</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Réglages globaux appliqués à l'ensemble du catalogue.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <section className="space-y-4 rounded-md border border-border bg-card/40 p-5">
            <div>
              <h2 className="text-sm font-medium">Dosage standard d'un booster de nicotine</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Sert au calcul automatique du taux de nicotine affiché sur les
                fiches e-liquides pour les flacons 50 / 100 / 200 ml. Valeur
                partagée par tous les types de booster (Normal, Sel, Ice).
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Volume d'un booster (ml)</span>
                <input
                  className="input"
                  type="text"
                  inputMode="decimal"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder="10"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Concentration (mg/ml)</span>
                <input
                  className="input"
                  type="text"
                  inputMode="decimal"
                  value={concentration}
                  onChange={(e) => setConcentration(e.target.value)}
                  placeholder="20"
                />
              </label>
            </div>
            <p className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
              Contenu d'un booster :{" "}
              <strong className="text-foreground">{mgTotal.toFixed(0)} mg</strong>{" "}
              de nicotine ({volume || "?"} ml × {concentration || "?"} mg/ml).
            </p>
          </section>

          <button
            type="submit"
            disabled={m.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </form>
      )}
    </div>
  );
}