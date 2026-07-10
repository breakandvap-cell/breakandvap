import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/compte/adresses")({
  component: AddressesPage,
});

const addressSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  postal_code: z.string().trim().min(3).max(20),
  city: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(80),
  is_default: z.boolean(),
});

type AddressInput = z.infer<typeof addressSchema>;

const emptyForm: AddressInput = {
  full_name: "",
  phone: "",
  line1: "",
  line2: "",
  postal_code: "",
  city: "",
  country: "France",
  is_default: false,
};

function AddressesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<AddressInput>(emptyForm);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ["my-addresses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (input: AddressInput) => {
      const parsed = addressSchema.parse(input);
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("addresses").insert({
        user_id: user.id,
        full_name: parsed.full_name,
        phone: parsed.phone || null,
        line1: parsed.line1,
        line2: parsed.line2 || null,
        postal_code: parsed.postal_code,
        city: parsed.city,
        country: parsed.country,
        is_default: parsed.is_default,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Adresse enregistrée");
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["my-addresses"] });
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("addresses").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Adresse supprimée");
      qc.invalidateQueries({ queryKey: ["my-addresses"] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    addMutation.mutate(form);
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section>
        <h2 className="text-lg font-semibold">Mes adresses</h2>
        {isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>
        ) : addresses.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Aucune adresse enregistrée.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {addresses.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-border bg-card p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {a.full_name}
                      {a.is_default ? (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px]">
                          Par défaut
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}
                      <br />
                      {a.postal_code} {a.city}, {a.country}
                      {a.phone ? <><br />{a.phone}</> : null}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(a.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Ajouter une adresse</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <TextField label="Nom complet" required value={form.full_name}
            onChange={(v) => setForm({ ...form, full_name: v })} />
          <TextField label="Téléphone" value={form.phone ?? ""}
            onChange={(v) => setForm({ ...form, phone: v })} />
          <TextField label="Adresse" required value={form.line1}
            onChange={(v) => setForm({ ...form, line1: v })} />
          <TextField label="Complément" value={form.line2 ?? ""}
            onChange={(v) => setForm({ ...form, line2: v })} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField label="Code postal" required value={form.postal_code}
              onChange={(v) => setForm({ ...form, postal_code: v })} />
            <TextField label="Ville" required value={form.city}
              onChange={(v) => setForm({ ...form, city: v })} />
            <TextField label="Pays" required value={form.country}
              onChange={(v) => setForm({ ...form, country: v })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            />
            Utiliser comme adresse par défaut
          </label>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {addMutation.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </section>
    </div>
  );
}

function TextField({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </label>
  );
}