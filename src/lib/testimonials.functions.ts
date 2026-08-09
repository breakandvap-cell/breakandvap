import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

export type Testimonial = {
  id: string;
  author_name: string;
  content: string;
  rating: number | null;
  is_featured: boolean;
  sort_order: number;
  review_date: string | null;
  created_at: string;
  updated_at: string;
};

// Lecture publique (avis mis en avant uniquement) — utilisé sur la page d'accueil.
export const featuredTestimonialsQueryOptions = () =>
  queryOptions({
    queryKey: ["testimonials", "featured"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("testimonials" as any)
        .select("*")
        .eq("is_featured", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(4);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Testimonial[];
    },
  });

// -------- Admin --------
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { assertAdminSession } = await import("@/lib/admin-security.server");
  await assertAdminSession(context as never);
}

const inputSchema = z.object({
  id: z.string().uuid().optional(),
  author_name: z.string().trim().min(1).max(120),
  content: z.string().trim().min(3).max(1000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  is_featured: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(0),
  review_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const adminListTestimonials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("testimonials" as any)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Testimonial[];
  });

export const adminUpsertTestimonial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      author_name: data.author_name,
      content: data.content,
      rating: data.rating ?? null,
      is_featured: data.is_featured,
      sort_order: data.sort_order,
      review_date: data.review_date ?? null,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("testimonials" as any)
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("testimonials" as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const adminDeleteTestimonial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("testimonials" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });