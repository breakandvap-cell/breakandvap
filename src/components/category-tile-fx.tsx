import { useMemo } from "react";

type Variant = "cbd" | "e_liquide" | "accessoire_vape" | "accessoire_cbd";

// Simple stylised SVG glyphs used as falling particles.
function Glyph({ kind }: { kind: string }) {
  switch (kind) {
    case "leaf":
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2c4 3 7 6 7 11 0 5-3 9-7 9s-7-4-7-9c0-5 3-8 7-11Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M12 4v18M12 10l3-2M12 14l3-2M12 14l-3-2M12 10l-3-2"
            stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case "bud":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.2" />
          <path d="M12 3c1.5 2 1.5 4 0 6M12 21c-1.5-2-1.5-4 0-6M3 12c2-1.5 4-1.5 6 0M21 12c-2 1.5-4 1.5-6 0M5.5 5.5c2 .5 3.2 1.7 3.7 3.7M18.5 5.5c-2 .5-3.2 1.7-3.7 3.7M5.5 18.5c2-.5 3.2-1.7 3.7-3.7M18.5 18.5c-2-.5-3.2-1.7-3.7-3.7"
            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "bottle-s":
    case "bottle-m":
    case "bottle-l": {
      const h = kind === "bottle-s" ? 12 : kind === "bottle-m" ? 15 : 18;
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="9" y="2" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10 5h4v2h-4z" stroke="currentColor" strokeWidth="1.1" />
          <rect x="7.5" y={22 - h} width="9" height={h} rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d={`M9 ${22 - h + 3} h6`} stroke="currentColor" strokeWidth="1" opacity=".6" />
        </svg>
      );
    }
    case "drip":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M8 3h8v3H8zM9 6h6v3H9zM10 9h4v10a2 2 0 0 1-4 0z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "coil":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="8" y="4" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 8h6M9 11h6M9 14h6" stroke="currentColor" strokeWidth="1.1" />
          <path d="M10 18v2M14 18v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "paper":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="5" y="6" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 10h8M8 13h8M8 16h5" stroke="currentColor" strokeWidth="1" opacity=".7" />
        </svg>
      );
    case "grinder":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.1" />
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2 2M15.7 15.7l2 2M17.7 6.3l-2 2M8.3 15.7l-2 2"
            stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case "tray":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3" y="8" width="18" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6 12h4M6 14h6" stroke="currentColor" strokeWidth="1" opacity=".7" />
        </svg>
      );
    case "lighter":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="8" y="9" width="8" height="12" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10 9V7h4v2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M12 3c1 1.5 2 2.5 2 4 0 1-1 1.5-2 1.5S10 8 10 7c0-1.5 1-2.5 2-4Z"
            stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

const KINDS: Record<Variant, string[]> = {
  cbd: ["leaf", "bud", "leaf", "bud", "leaf"],
  e_liquide: ["bottle-s", "bottle-m", "bottle-l", "bottle-s", "bottle-m", "bottle-l"],
  accessoire_vape: ["drip", "coil", "drip", "coil", "drip"],
  accessoire_cbd: ["paper", "grinder", "tray", "lighter", "paper", "grinder"],
};

const COUNT = 14;

export function CategoryTileFx({ variant }: { variant: Variant }) {
  const particles = useMemo(() => {
    const kinds = KINDS[variant] ?? [];
    return Array.from({ length: COUNT }).map((_, i) => {
      const kind = kinds[i % kinds.length];
      const size = 14 + Math.round(Math.random() * 18);
      const left = Math.round(Math.random() * 100);
      const delay = -Math.random() * 14;
      const dur = 10 + Math.random() * 10;
      const drift = Math.round((Math.random() - 0.5) * 40);
      const rot = Math.round((Math.random() - 0.5) * 220);
      const opacity = 0.28 + Math.random() * 0.35;
      return { i, kind, size, left, delay, dur, drift, rot, opacity };
    });
  }, [variant]);

  return (
    <div className={`tile-fx tile-fx--${variant}`} aria-hidden>
      {variant === "e_liquide" && (
        <>
          <div className="tile-fx__warm" />
          <div className="tile-fx__cold" />
          <div className="tile-fx__mist" />
        </>
      )}
      <div className="tile-fx__particles">
        {particles.map((p) => (
          <span
            key={p.i}
            className="tile-fx__p"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              // @ts-expect-error CSS vars
              "--dur": `${p.dur}s`,
              "--delay": `${p.delay}s`,
              "--drift": `${p.drift}px`,
              "--rot": `${p.rot}deg`,
            }}
          >
            <Glyph kind={p.kind} />
          </span>
        ))}
      </div>
    </div>
  );
}