import { createServerFn } from "@tanstack/react-start";
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
      return { isAdmin: false, mfaEnabled: false, aal, needsMfa: false, factors: [] };
    }
    const { listVerifiedFactors } = await import("@/lib/admin-security.server");
    const verified = await listVerifiedFactors(context.userId);
    return {
      isAdmin: true,
      mfaEnabled: verified.length > 0,
      aal,
      needsMfa: verified.length > 0 && aal !== "aal2",
      factors: verified.map((f) => ({
        id: f.id,
        friendly_name: f.friendly_name ?? null,
        created_at: f.created_at ?? null,
      })),
    };
  });