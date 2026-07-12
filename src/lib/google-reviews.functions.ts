import { createServerFn } from "@tanstack/react-start";

export type GoogleReviewsAggregate = {
  rating: number | null;
  total: number;
  configured: boolean;
};

export type SatisfactionSource = {
  key: "google" | "site";
  rating: number | null;
  total: number;
};

export type SatisfactionAggregate = {
  rating: number | null;
  total: number;
  sources: SatisfactionSource[];
};

type PlaceDetails = {
  result?: { rating?: number; user_ratings_total?: number };
  status?: string;
};

async function fetchPlace(placeId: string, apiKey: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "rating,user_ratings_total");
  url.searchParams.set("key", apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as PlaceDetails;
  if (data.status && data.status !== "OK") return null;
  const r = data.result?.rating;
  const n = data.result?.user_ratings_total;
  if (typeof r !== "number" || typeof n !== "number") return null;
  return { rating: r, total: n };
}

export const getGoogleReviews = createServerFn({ method: "GET" }).handler(
  async (): Promise<GoogleReviewsAggregate> => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    const ids = [
      process.env.GOOGLE_PLACE_ID_CREUSOT,
      process.env.GOOGLE_PLACE_ID_MONTCEAU,
    ].filter((v): v is string => !!v && v.length > 0);

    if (!apiKey || ids.length === 0) {
      return { rating: null, total: 0, configured: false };
    }

    try {
      const results = await Promise.all(ids.map((id) => fetchPlace(id, apiKey)));
      const valid = results.filter((r): r is { rating: number; total: number } => !!r);
      if (valid.length === 0) {
        return { rating: null, total: 0, configured: true };
      }
      const total = valid.reduce((s, r) => s + r.total, 0);
      const weighted =
        total > 0
          ? valid.reduce((s, r) => s + r.rating * r.total, 0) / total
          : valid.reduce((s, r) => s + r.rating, 0) / valid.length;
      return { rating: Math.round(weighted * 10) / 10, total, configured: true };
    } catch {
      return { rating: null, total: 0, configured: true };
    }
  },
);