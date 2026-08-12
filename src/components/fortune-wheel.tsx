import { useEffect, useRef, useState } from "react";

export type WheelSegment = { id: string; label: string };

/**
 * Roue de la fortune animée (CSS pur). Le gagnant est TOUJOURS déterminé côté
 * serveur : ce composant se contente d'animer jusqu'au segment reçu.
 */
export function FortuneWheel({
  segments,
  winningId,
  spinning,
  onSettled,
}: {
  segments: WheelSegment[];
  /** Segment gagnant renvoyé par le serveur (null tant que non tiré). */
  winningId: string | null;
  spinning: boolean;
  onSettled?: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const settledFor = useRef<string | null>(null);
  const count = Math.max(segments.length, 1);
  const seg = 360 / count;

  useEffect(() => {
    if (!winningId || settledFor.current === winningId) return;
    const index = segments.findIndex((s) => s.id === winningId);
    if (index < 0) return;
    settledFor.current = winningId;
    const target = 360 * 6 - (index * seg + seg / 2);
    setRotation((r) => r + ((target - (r % 360)) + 360) % 360 + 360 * 5);
    const t = setTimeout(() => onSettled?.(), 4200);
    return () => clearTimeout(t);
  }, [winningId, segments, seg, onSettled]);

  const gradient = segments
    .map((_, i) => {
      const color = i % 2 === 0 ? "var(--primary)" : "var(--secondary)";
      return `${color} ${i * seg}deg ${(i + 1) * seg}deg`;
    })
    .join(", ");

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      <div className="absolute left-1/2 top-0 z-10 -ml-3 h-0 w-0 border-x-[12px] border-t-[18px] border-x-transparent border-t-accent" />
      <div
        className="h-full w-full rounded-full border-4 border-border shadow-lg"
        style={{
          background:
            segments.length > 0 ? `conic-gradient(${gradient})` : "var(--secondary)",
          transform: `rotate(${rotation}deg)`,
          transition: "transform 4s cubic-bezier(0.15, 0.85, 0.2, 1)",
        }}
      >
        {segments.map((s, i) => (
          <div
            key={s.id}
            className="pointer-events-none absolute left-1/2 top-1/2 origin-left"
            style={{
              transform: `rotate(${i * seg + seg / 2 - 90}deg) translateX(24px)`,
            }}
          >
            <span
              className={
                "block max-w-[95px] truncate text-[11px] font-semibold " +
                (i % 2 === 0 ? "text-primary-foreground" : "text-secondary-foreground")
              }
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-border bg-card" />
      {spinning && (
        <span className="sr-only" role="status">
          Tirage en cours…
        </span>
      )}
    </div>
  );
}
