import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Fiche de picking PDF (admin) : renvoyée en base64 pour un téléchargement direct.
export const getPickingSheetPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { assertAdminSession } = await import("@/lib/admin-security.server");
    await assertAdminSession(context as never);
    const { buildPickingSheet } = await import("./picking-sheet.server");
    return await buildPickingSheet(data.orderId);
  });