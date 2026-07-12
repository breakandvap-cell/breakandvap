import { useMemo } from "react";

type Variant = "cbd" | "e_liquide" | "accessoire_vape" | "accessoire_cbd";

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 6;

// Deterministic pseudo-random from a seed string, so SSR and client match.
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export function CategoryTileFx({
  variant,
  photos,
}: {
  variant: Variant;
  photos: string[];
}) {
  const particles = useMemo(() => {
    const pool = photos.slice(0, MAX_PHOTOS);
    if (pool.length < MIN_PHOTOS) return [];
    const rand = seeded(variant + ":" + pool.length);
    // Duplicate the pool so the tile feels populated even with 3 photos.
    const total = Math.min(9, Math.max(6, pool.length * 2));
    return Array.from({ length: total }).map((_, i) => {
      const src = pool[i % pool.length];
      const size = 68 + Math.round(rand() * 46);
      const left = Math.round(rand() * 100);
      const top = Math.round(rand() * 100);
      const delay = -rand() * 18;
      const dur = 14 + rand() * 12;
      const dx = Math.round((rand() - 0.5) * 40);
      const dy = Math.round((rand() - 0.5) * 30);
      const rot = Math.round((rand() - 0.5) * 10);
      const opacity = 0.55 + rand() * 0.3;
      return { i, src, size, left, top, delay, dur, dx, dy, rot, opacity };
    });
  }, [variant, photos]);

  const hasPhotos = particles.length > 0;

  return (
    <div
      className={`tile-fx tile-fx--${variant} ${hasPhotos ? "" : "tile-fx--fallback"}`}
      aria-hidden
    >
      {variant === "e_liquide" && (
        <>
          <div className="tile-fx__warm" />
          <div className="tile-fx__cold" />
          <div className="tile-fx__mist" />
        </>
      )}
      {hasPhotos && (
        <div className="tile-fx__particles">
          {particles.map((p) => (
            <img
              key={p.i}
              src={p.src}
              alt=""
              loading="lazy"
              className="tile-fx__photo"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: p.size,
                height: p.size,
                opacity: p.opacity,
                // @ts-expect-error CSS vars
                "--dur": `${p.dur}s`,
                "--delay": `${p.delay}s`,
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
                "--rot": `${p.rot}deg`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}