import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sécurité de l'espace gérant.
 *
 * Règle : un administrateur qui a activé la double authentification (TOTP)
 * doit disposer d'une session de niveau `aal2` pour accéder à l'espace admin
 * et pour exécuter la moindre action serveur d'administration.
 */
export type AdminClaims = { aal?: string; sub?: string } & Record<string, unknown>;

export async function listVerifiedFactors(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(error.message);
  const factors = (data?.factors ?? []) as Array<{
    id: string;
    status: string;
    friendly_name?: string | null;
    factor_type?: string;
    created_at?: string;
  }>;
  return factors.filter((f) => f.status === "verified");
}

export async function assertAdminSession(context: {
  supabase: SupabaseClient<any>;
  userId: string;
  claims?: AdminClaims;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès refusé.");

  const aal = context.claims?.aal;
  if (aal !== "aal2") {
    const verified = await listVerifiedFactors(context.userId);
    if (verified.length > 0) {
      throw new Error(
        "Double authentification requise : reconnectez-vous via la connexion sécurisée gérant.",
      );
    }
  }
}