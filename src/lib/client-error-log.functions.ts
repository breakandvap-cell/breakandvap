import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const payloadSchema = z.object({
  message: z.string().max(2000).optional(),
  stack: z.string().max(20000).optional(),
  componentStack: z.string().max(20000).optional(),
  route: z.string().max(500).optional(),
  boundary: z.string().max(120).optional(),
  userAgent: z.string().max(500).optional(),
});

/**
 * Journalise côté serveur une erreur de rendu React interceptée par
 * l'Error Boundary global. Rien n'est renvoyé au client.
 */
export const logClientError = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data }) => {
    const error = new Error(data.message ?? "Unhandled React render error");
    if (data.stack) error.stack = data.stack;
    console.error("[client-error-boundary]", {
      boundary: data.boundary,
      route: data.route,
      userAgent: data.userAgent,
      componentStack: data.componentStack,
    });
    console.error(error);
    return { ok: true as const };
  });
