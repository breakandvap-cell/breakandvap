import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MIX_MAX_FLAVORS, MIX_MAX_NICOTINE_MG } from "./custom-mix";

const flavorSchema = z.object({
  flavor_product_id: z.string().uuid(),
  percentage: z.number().min(1).max(100),
});

const saveSchema = z.object({
  mixId: z.string().uuid().nullable().optional(),
  sessionId: z.string().min(8).max(128),
  userId: z.string().uuid().nullable().optional(),
  bottleProductId: z.string().uuid(),
  nicotineMg: z.number().int().min(0).max(MIX_MAX_NICOTINE_MG),
  flavors: z.array(flavorSchema).min(1).max(MIX_MAX_FLAVORS),
});

/** Enregistre (ou met à jour) un mix en brouillon après validation serveur. */
export const saveCustomMixDraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data }) => {
    const { saveMixDraft } = await import("./custom-mix.mutations.server");
    return saveMixDraft(data);
  });

/** Fige le prix du mix côté serveur et passe le mix en « validated ». */
export const validateCustomMix = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        mixId: z.string().uuid(),
        sessionId: z.string().min(8).max(128),
        userId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { validateMix } = await import("./custom-mix.mutations.server");
    return validateMix(data);
  });

/** Relit un mix (brouillon ou validé) à partir de son id + session. */
export const getCustomMix = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        mixId: z.string().uuid(),
        sessionId: z.string().min(8).max(128),
        userId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { readMix } = await import("./custom-mix.mutations.server");
    return readMix(data);
  });
