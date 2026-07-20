import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { useCart } from "@/lib/cart";
import { createOrder, type CreateOrderInput } from "@/lib/orders.functions";
import { formatPrice } from "@/lib/products";
import { formatNicotineMg } from "@/lib/site-settings.functions";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Commande | Break and Vap" },
      { name: "description", content: "Finalisez votre commande en toute sécurité." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const createOrderFn = useServerFn(createOrder);
  const { user } = useAuth();

  const { data: savedAddresses = [] } = useQuery({
    queryKey: ["my-addresses", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // "saved:<id>" | "new"
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);

  useEffect(() => {
    if (savedAddresses.length === 0) {
      setUseNewAddress(true);
      setSelectedAddressId(null);
      return;
    }
    if (!selectedAddressId) {
      const def = savedAddresses.find((a) => a.is_default) ?? savedAddresses[0];
      setSelectedAddressId(def.id);
      setUseNewAddress(false);
    }
  }, [savedAddresses, selectedAddressId]);

  const mutation = useMutation({
    mutationFn: (input: CreateOrderInput) => createOrderFn({ data: input }),
    onSuccess: (result) => {
      cart.clear();
      toast.success("Commande enregistrée", {
        description: `Numéro ${result.orderNumber}`,
      });
      navigate({
        to: "/commande/$orderNumber",
        params: { orderNumber: result.orderNumber },
      });
    },
    onError: (err: Error) => {
      toast.error("Impossible de créer la commande", { description: err.message });
    },
  });

  const [form, setForm] = useState({
    email: "",
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    postalCode: "",
    city: "",
    country: "France",
  });

  useEffect(() => {
    if (user?.email && !form.email) {
      setForm((f) => ({ ...f, email: user.email ?? "" }));
    }
  }, [user, form.email]);

  if (cart.hydrated && cart.items.length === 0 && !mutation.isPending) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-2xl">Votre panier est vide</h1>
          <Link
            to="/boutique"
            className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Retour au catalogue
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const selected =
      !useNewAddress && selectedAddressId
        ? savedAddresses.find((a) => a.id === selectedAddressId)
        : null;

    if (!useNewAddress && !selected) {
      toast.error("Veuillez sélectionner ou saisir une adresse de livraison");
      return;
    }

    const shipping = selected
      ? {
          fullName: selected.full_name,
          phone: selected.phone ?? form.phone,
          line1: selected.line1,
          line2: selected.line2 ?? "",
          postalCode: selected.postal_code,
          city: selected.city,
          country: selected.country,
        }
      : {
          fullName: form.fullName,
          phone: form.phone,
          line1: form.line1,
          line2: form.line2,
          postalCode: form.postalCode,
          city: form.city,
          country: form.country,
        };

    mutation.mutate({
      email: form.email,
      shipping,
      items: cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId ?? undefined,
        nicotineMg: i.nicotineMg ?? undefined,
        flavor: i.flavor ?? undefined,
        quantity: i.quantity,
      })),
    });
  };

  const hasSaved = savedAddresses.length > 0;
  const selectedSaved =
    !useNewAddress && selectedAddressId
      ? savedAddresses.find((a) => a.id === selectedAddressId) ?? null
      : null;
  const canProceed = useNewAddress || !!selectedSaved;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <h1
          className="text-3xl leading-tight sm:text-4xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Finaliser la commande
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Livraison en France métropolitaine. Le règlement en ligne sera activé
          prochainement — votre commande est enregistrée et notre équipe vous
          contactera pour le paiement.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:gap-8"
        >
          <section className="space-y-8">
            <Fieldset title="Contact">
              <Field label="Email" required>
                <input
                  type="email"
                  required
                  maxLength={255}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Téléphone" required>
                <input
                  type="tel"
                  required
                  minLength={6}
                  maxLength={30}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input"
                />
              </Field>
            </Fieldset>

            <Fieldset title="Adresse de livraison">
              {hasSaved ? (
                <div className="space-y-3">
                  <ul className="space-y-2">
                    {savedAddresses.map((a) => {
                      const checked = !useNewAddress && selectedAddressId === a.id;
                      return (
                        <li key={a.id}>
                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                              checked
                                ? "border-primary bg-primary/5"
                                : "border-border bg-background"
                            }`}
                          >
                            <input
                              type="radio"
                              name="shipping-address"
                              className="mt-1"
                              checked={checked}
                              onChange={() => {
                                setSelectedAddressId(a.id);
                                setUseNewAddress(false);
                              }}
                            />
                            <span className="flex-1">
                              <span className="font-medium">
                                {a.full_name}
                                {a.is_default ? (
                                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px]">
                                    Par défaut
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-1 block text-muted-foreground">
                                {a.line1}
                                {a.line2 ? `, ${a.line2}` : ""}
                                <br />
                                {a.postal_code} {a.city}, {a.country}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      setUseNewAddress((v) => !v);
                      if (!useNewAddress) setSelectedAddressId(null);
                      else {
                        const def =
                          savedAddresses.find((a) => a.is_default) ??
                          savedAddresses[0];
                        setSelectedAddressId(def?.id ?? null);
                      }
                    }}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {useNewAddress
                      ? "← Utiliser une adresse enregistrée"
                      : "Utiliser une autre adresse"}
                  </button>
                  {!useNewAddress && selectedSaved ? (
                    <p className="rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
                      Cette adresse sera utilisée pour la livraison. Cliquez sur
                      « Valider la commande » pour confirmer.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {useNewAddress ? (
                <div className="space-y-4">
                  <Field label="Nom complet" required>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Adresse" required>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={form.line1}
                  onChange={(e) => setForm({ ...form, line1: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Complément">
                <input
                  type="text"
                  maxLength={200}
                  value={form.line2}
                  onChange={(e) => setForm({ ...form, line2: e.target.value })}
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Code postal" required>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={form.postalCode}
                    onChange={(e) =>
                      setForm({ ...form, postalCode: e.target.value })
                    }
                    className="input"
                  />
                </Field>
                <Field label="Ville" required>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Pays" required>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={form.country}
                    onChange={(e) =>
                      setForm({ ...form, country: e.target.value })
                    }
                    className="input"
                  />
                </Field>
              </div>
                </div>
              ) : null}
            </Fieldset>
          </section>

          <aside className="h-fit rounded-lg border border-border bg-card p-4 sm:p-6 lg:sticky lg:top-4">
            <h2 className="text-lg font-semibold">Votre commande</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {cart.items.map((it) => (
                <li key={it.key} className="flex justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block truncate">{it.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {it.volumeMl ? `${it.volumeMl} ml` : ""}
                      {it.volumeMl && it.nicotineMg != null ? " · " : ""}
                      {it.nicotineMg != null ? `${formatNicotineMg(it.nicotineMg)} · ` : it.volumeMl ? " · " : ""}
                      {it.flavor ? `${it.flavor} · ` : ""}
                      × {it.quantity}
                    </span>
                    {it.boostersCount && it.boostersCount > 0 &&
                    it.boosterUnitPriceCents != null &&
                    it.baseUnitPriceCents != null ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        Flacon {formatPrice(it.baseUnitPriceCents)} + {it.boostersCount}{" "}
                        booster{it.boostersCount > 1 ? "s" : ""} ×{" "}
                        {formatPrice(it.boosterUnitPriceCents)}
                      </span>
                    ) : null}
                  </span>
                  <span className="whitespace-nowrap font-medium">
                    {formatPrice(it.priceCents * it.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-semibold">
                {formatPrice(cart.subtotalCents)}
              </span>
            </div>
            <button
              type="submit"
              disabled={mutation.isPending || !canProceed}
              className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {mutation.isPending
                ? "Envoi en cours…"
                : selectedSaved
                  ? "Confirmer cette adresse et valider"
                  : "Valider la commande"}
            </button>
            <p className="mt-3 text-[11px] text-muted-foreground">
              En validant, vous certifiez être majeur(e) et avoir pris connaissance
              des avertissements sanitaires.
            </p>
          </aside>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <legend className="px-2 text-sm font-semibold">{title}</legend>
      <div className="mt-2 space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}