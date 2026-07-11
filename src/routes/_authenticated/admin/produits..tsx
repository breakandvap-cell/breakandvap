
function FlavorsEditor({
  flavors,
  onChange,
}: {
  flavors: FormFlavor[];
  onChange: (next: FormFlavor[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addFlavor = () => {
    const name = draft.trim();
    if (!name) return;
    const exists = flavors.some(
      (f) => f.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      toast.error("Ce goût est déjà dans la liste.");
      return;
    }
    onChange([...flavors, { name, stock: 0 }]);
    setDraft("");
  };

  const update = (idx: number, patch: Partial<FormFlavor>) =>
    onChange(flavors.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const remove = (idx: number) =>
    onChange(flavors.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3 rounded-md border border-border bg-background/40 p-4">
      <div>
        <h3 className="text-sm font-medium">
          Goûts disponibles <span className="text-destructive">*</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Tape le nom d'un goût puis clique sur « Ajouter ». Indique le stock
          propre à chaque goût — les goûts à 0 seront grisés côté boutique.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFlavor();
            }
          }}
          placeholder="Ex. Fraise, Menthe, Tabac blond…"
          maxLength={80}
        />
        <button
          type="button"
          onClick={addFlavor}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>

      {flavors.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 bg-background/30 p-4 text-center text-xs text-muted-foreground">
          Aucun goût pour l'instant.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {flavors.map((f, idx) => (
            <li key={idx} className="flex items-center gap-3 p-2">
              <input
                className="input flex-1"
                type="text"
                value={f.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                maxLength={80}
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Stock :</span>
                <input
                  className="input h-8 w-20 px-2 py-1 text-xs"
                  type="number"
                  min={0}
                  value={f.stock}
                  onChange={(e) =>
                    update(idx, { stock: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="inline-flex items-center justify-center rounded-md border border-border p-2 text-destructive hover:bg-destructive/10"
                aria-label="Supprimer ce goût"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
