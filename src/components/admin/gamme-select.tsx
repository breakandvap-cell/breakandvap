import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createGamme, gammesByBrandQueryOptions } from "@/lib/gammes";

const CREATE = "__create__";

/**
 * Sélecteur de gamme rattaché à la marque du produit.
 * - désactivé tant qu'aucune marque n'est saisie
 * - options triées alphabétiquement, limitées aux gammes de cette marque
 * - option « + Créer une nouvelle gamme » sans quitter le formulaire
 * - facultatif : la valeur vide est autorisée
 */
export function GammeSelect({
  brand,
  value,
  onChange,
}: {
  brand: string;
  value: string;
  onChange: (nom: string) => void;
}) {
  const marque = brand.trim();
  const qc = useQueryClient();
  const { data: gammes = [] } = useQuery(gammesByBrandQueryOptions(marque));
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const create = useMutation({
    mutationFn: (nom: string) => createGamme({ nom, marque }),
    onSuccess: async (g) => {
      await qc.invalidateQueries({ queryKey: ["gammes"] });
      onChange(g.nom);
      setCreating(false);
      setDraft("");
      toast.success(`Gamme « ${g.nom} » créée.`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const known = gammes.some((g) => g.nom.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <select
        className="input h-11 w-full text-base disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!marque}
        value={known ? value : ""}
        onChange={(e) => {
          if (e.target.value === CREATE) {
            setCreating(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">
          {marque ? "Aucune gamme" : "Sélectionnez d'abord une marque"}
        </option>
        {gammes.map((g) => (
          <option key={g.id} value={g.nom}>
            {g.nom}
          </option>
        ))}
        {marque && <option value={CREATE}>+ Créer une nouvelle gamme</option>}
      </select>

      {value.trim() && !known && marque && (
        <p className="text-xs text-muted-foreground">
          Gamme actuelle : « {value.trim()} » (sera rattachée à {marque} à
          l'enregistrement).
        </p>
      )}

      {creating && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            className="input h-10 flex-1 text-base"
            value={draft}
            placeholder="Nom de la nouvelle gamme"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (draft.trim()) create.mutate(draft);
              }
              if (e.key === "Escape") setCreating(false);
            }}
          />
          <button
            type="button"
            disabled={!draft.trim() || create.isPending}
            onClick={() => create.mutate(draft)}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Créer
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
