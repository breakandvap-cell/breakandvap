import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { useCart } from "@/lib/cart";
import { createOrder, type CreateOrderInput } from "@/lib/orders.functions";
import { formatPrice } from "@/lib/products";

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
    mutation.mutate({
      email: form.email,
      shipping: {
        fullName: form.fullName,
        phone: form.phone,
        line1: form.line1,
        line2: form.line2,
        postalCode: form.postalCode,
        city: form.city,
        country: form.country,
      },
      items: cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId ?? undefined,
        nicotineMg: i.nicotineMg ?? undefined,
        quantity: i.quantity,
      })),
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1
          className="text-4xl leading-tight"
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
          className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]"
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
            </Fieldset>
          </section>

          <aside className="h-fit rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Votre commande</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {cart.items.map((it) => (
                <li key={it.key} className="flex justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block truncate">{it.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {it.volumeMl ? `${it.volumeMl} ml` : ""}
                      {it.volumeMl && it.nicotineMg != null ? " · " : ""}
                      {it.nicotineMg != null ? `${it.nicotineMg} mg · ` : it.volumeMl ? " · " : ""}
                      × {it.quantity}
                    </span>
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
              disabled={mutation.isPending}
              className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {mutation.isPending ? "Envoi en cours…" : "Valider la commande"}
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
    <fieldset className="rounded-lg border border-border bg-card p-6">
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