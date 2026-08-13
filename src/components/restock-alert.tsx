import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type Channel = "email" | "sms" | "both";

function localKey(productId: string, variantId?: string | null) {
  return `bnv_restock_${productId}_${variantId ?? "base"}`;
}

/**
 * Bouton « M'alerter du réapprovisionnement » pour un produit (ou une variante)
 * en rupture de stock. Crée une ligne stock_notifications en statut pending.
 */
export function RestockAlertButton({
  productId,
  variantId = null,
  compact = false,
}: {
  productId: string;
  variantId?: string | null;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const key = useMemo(() => localKey(productId, variantId), [productId, variantId]);

  // Alerte déjà enregistrée : côté client (invité) puis vérification en base
  // pour les clients connectés.
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(key) === "1") {
      setSubscribed(true);
    }
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    setEmail((prev) => prev || user.email || "");
    void (async () => {
      const [{ data: prof }, { data: rows }] = await Promise.all([
        supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
        (() => {
          let q = supabase
            .from("stock_notifications")
            .select("id")
            .eq("product_id", productId)
            .eq("status", "pending")
            .eq("user_id", user.id);
          q = variantId ? q.eq("variant_id", variantId) : q.is("variant_id", null);
          return q.limit(1);
        })(),
      ]);
      if (cancelled) return;
      if (prof?.phone) setPhone((prev) => prev || prof.phone!);
      if ((rows?.length ?? 0) > 0) setSubscribed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, productId, variantId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const needsEmail = channel === "email" || channel === "both";
    const needsPhone = channel === "sms" || channel === "both";
    if (needsEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      toast.error("Adresse email invalide");
      return;
    }
    if (needsPhone && phone.replace(/\D/g, "").length < 9) {
      toast.error("Numéro de téléphone invalide");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("stock_notifications").insert({
      product_id: productId,
      variant_id: variantId,
      email: needsEmail ? email.trim().toLowerCase() : null,
      phone: needsPhone ? phone.trim() : null,
      channel,
      user_id: user?.id ?? null,
      status: "pending" as const,
    });
    setSaving(false);
    // 23505 = alerte déjà enregistrée pour ce contact → même retour visuel.
    if (error && (error as { code?: string }).code !== "23505") {
      toast.error("Impossible d'enregistrer l'alerte", { description: error.message });
      return;
    }
    if (typeof window !== "undefined") window.localStorage.setItem(key, "1");
    setSubscribed(true);
    setOpen(false);
    toast.success("Alerte enregistrée", {
      description: "Vous serez prévenu dès le retour en stock.",
    });
  }

  if (subscribed) {
    return (
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 font-medium text-secondary-foreground " +
          (compact ? "text-[11px]" : "text-xs")
        }
      >
        <Check className="h-3.5 w-3.5" /> Vous serez alerté
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-medium text-foreground transition-colors hover:bg-secondary " +
          (compact ? "text-[11px]" : "text-xs")
        }
      >
        <Bell className="h-3.5 w-3.5" /> M'alerter du réapprovisionnement
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="w-full space-y-2 rounded-md border border-border bg-card p-3 text-left"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <BellRing className="h-3.5 w-3.5" /> Me prévenir du retour en stock
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["email", "Email"],
            ["sms", "SMS"],
            ["both", "Les deux"],
          ] as Array<[Channel, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setChannel(value)}
            className={
              "rounded-md border px-2.5 py-1 text-[11px] transition-colors " +
              (channel === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-secondary")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {(channel === "email" || channel === "both") && (
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="votre@email.fr"
          autoComplete="email"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
        />
      )}
      {(channel === "sms" || channel === "both") && (
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="06 12 34 56 78"
          autoComplete="tel"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
        />
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Valider
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-3 py-2 text-xs hover:bg-secondary"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}