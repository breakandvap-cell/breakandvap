import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sécurité de l'espace gérant.
 *
 * Règle : un administrateur qui a activé la double authentification (TOTP)
 * doit disposer d'une session de niveau `aal2` pour accéder à l'espace admin
 * et pour exécuter la moindre action serveur d'administration.
 */
export type AdminClaims = { aal?: string; sub?: string } & Record<string, unknown>;

/** Durée de validité d'un accès de secours ouvert avec un code de récupération. */
const GRANT_MINUTES = 60;

export function hashBackupCode(code: string): string {
  return createHash("sha256")
    .update(code.replace(/[\s-]/g, "").toUpperCase(), "utf8")
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Génère 10 codes à usage unique, format XXXX-XXXX (sans caractères ambigus). */
export function makeBackupCodes(count = 10): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let raw = "";
    for (const b of bytes) raw += alphabet[b % alphabet.length];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

export async function replaceBackupCodes(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const codes = makeBackupCodes();
  await supabaseAdmin.from("admin_backup_codes").delete().eq("user_id", userId);
  const { error } = await supabaseAdmin
    .from("admin_backup_codes")
    .insert(codes.map((c) => ({ user_id: userId, code_hash: hashBackupCode(c) })));
  if (error) throw new Error(error.message);
  return codes;
}

export async function backupCodesSummary(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("admin_backup_codes")
    .select("id, used_at, created_at")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    total: rows.length,
    remaining: rows.filter((r) => !r.used_at).length,
    generatedAt: rows[0]?.created_at ?? null,
  };
}

/** Consomme un code de secours et ouvre un accès temporaire à l'espace gérant. */
export async function consumeBackupCode(userId: string, code: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("admin_backup_codes")
    .select("id, code_hash")
    .eq("user_id", userId)
    .is("used_at", null);
  if (error) throw new Error(error.message);
  const target = hashBackupCode(code);
  const match = (data ?? []).find((r) => safeEqualHex(r.code_hash, target));
  if (!match) return { ok: false as const };

  const { error: upErr } = await supabaseAdmin
    .from("admin_backup_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", match.id)
    .is("used_at", null);
  if (upErr) throw new Error(upErr.message);

  const expiresAt = new Date(Date.now() + GRANT_MINUTES * 60_000).toISOString();
  const { error: grantErr } = await supabaseAdmin
    .from("admin_mfa_grants")
    .insert({ user_id: userId, expires_at: expiresAt });
  if (grantErr) throw new Error(grantErr.message);

  return { ok: true as const, expiresAt };
}

export async function hasActiveRecoveryGrant(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("admin_mfa_grants")
    .select("id, expires_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function revokeRecoveryGrants(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_mfa_grants").delete().eq("user_id", userId);
}

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
      // Un code de secours valide ouvre un accès temporaire équivalent.
      if (await hasActiveRecoveryGrant(context.userId)) return;
      throw new Error(
        "Double authentification requise : reconnectez-vous via la connexion sécurisée gérant.",
      );
    }
  }
}