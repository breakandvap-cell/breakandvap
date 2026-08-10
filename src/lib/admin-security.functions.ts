import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** État d'accès à l'espace gérant : rôle, 2FA activée, niveau de session. */
export const adminAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    const isAdmin = Boolean(data);
    const aal = (context.claims as { aal?: string })?.aal ?? "aal1";
    if (!isAdmin) {
      return {
        isAdmin: false,
        mfaEnabled: false,
        aal,
        needsMfa: false,
        recoveryActive: false,
        backupCodes: { total: 0, remaining: 0, generatedAt: null as string | null },
        factors: [],
      };
    }
    const { listVerifiedFactors } = await import("@/lib/admin-security.server");
    const verified = await listVerifiedFactors(context.userId);
    const { hasActiveRecoveryGrant, backupCodesSummary } = await import(
      "@/lib/admin-security.server"
    );
    const recovery = verified.length > 0 && aal !== "aal2"
      ? await hasActiveRecoveryGrant(context.userId)
      : false;
    const backupCodes = await backupCodesSummary(context.userId);
    return {
      isAdmin: true,
      mfaEnabled: verified.length > 0,
      aal,
      needsMfa: verified.length > 0 && aal !== "aal2" && !recovery,
      recoveryActive: recovery,
      backupCodes,
      factors: verified.map((f) => ({
        id: f.id,
        friendly_name: f.friendly_name ?? null,
        created_at: f.created_at ?? null,
      })),
    };
  });

/** Régénère les 10 codes de secours (affichés une seule fois). */
export const adminRegenerateBackupCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminSession, replaceBackupCodes } = await import(
      "@/lib/admin-security.server"
    );
    await assertAdminSession(context as never);
    const codes = await replaceBackupCodes(context.userId);
    return { codes };
  });

/** Utilise un code de secours pour débloquer l'espace gérant (1 h). */
export const adminRedeemBackupCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) =>
    z.object({ code: z.string().trim().min(4).max(20) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { consumeBackupCode } = await import("@/lib/admin-security.server");
    const { data: isAdminData, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    if (!isAdminData) throw new Error("Accès refusé.");
    return await consumeBackupCode(context.userId, data.code);
  });

/** Referme immédiatement tout accès de secours en cours. */
export const adminRevokeRecoveryAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { revokeRecoveryGrants } = await import("@/lib/admin-security.server");
    await revokeRecoveryGrants(context.userId);
    return { ok: true as const };
  });