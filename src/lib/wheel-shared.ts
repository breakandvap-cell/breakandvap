import { z } from "zod";
import type { DiscountType, WheelType } from "@/lib/promotions.functions";
import type { PendingSpin } from "@/lib/wheel.functions";

export type SpinRow = {
  id: string;
  wheel_type: WheelType;
  prize_id: string | null;
  status: string;
  expires_at: string;
  discount_amount_cents: number | null;
  wheel_prizes: { label: string; discount_type: DiscountType; discount_value: number } | null;
};

export const SPIN_SELECT =
  "id, wheel_type, prize_id, status, expires_at, discount_amount_cents, wheel_prizes(label, discount_type, discount_value)";

export function toPending(row: SpinRow): PendingSpin {
  return {
    id: row.id,
    wheel_type: row.wheel_type,
    prize_id: row.prize_id,
    label: row.wheel_prizes?.label ?? "Remise",
    discount_type: row.wheel_prizes?.discount_type ?? "fixed_amount",
    discount_value: Number(row.wheel_prizes?.discount_value ?? 0),
    discount_amount_cents: row.discount_amount_cents ?? 0,
    expires_at: row.expires_at,
  };
}

export function pickWeighted<T extends { weight: number }>(prizes: T[]): T | null {
  const pool = prizes.filter((p) => p.weight > 0);
  if (pool.length === 0) return null;
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pool[pool.length - 1]!;
}

export const spinSchema = z.object({
  wheel_type: z.enum(["welcome", "general"]),
  /** Sous-total panier en centimes (roue générale : fige le montant). */
  cart_subtotal_cents: z.number().int().min(0).max(10_000_000).optional(),
});

