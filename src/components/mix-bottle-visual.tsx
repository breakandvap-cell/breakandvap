import { useMemo } from "react";

type Props = {
  /** Taux de remplissage visuel, 0 → 1. */
  fill: number;
  /** Part du remplissage occupée par la base nicotinée (0 → 1 du flacon). */
  baseFill?: number;
  /** Couleurs du liquide (dégradé). */
  from: string;
  to: string;
  /** Contenance réelle du flacon (ml) : pilote la taille affichée. */
  volumeMl?: number | null;
  /** Volume affiché sous le flacon. */
  volumeLabel?: string | null;
  /** Étiquette de composition affichée sur le flacon. */
  caption?: string | null;
};

/** Hauteur affichée proportionnelle au volume réel.
 *  Échelle en racine cubique (comme un volume physique) : chaque palier
 *  10 / 30 / 50 / 60 / 120 ml est visuellement distinct et cohérent. */
function bottleHeightPx(volumeMl: number | null | undefined): number {
  const v = volumeMl && volumeMl > 0 ? volumeMl : 50;
  const k = Math.cbrt(v / 60);
  return Math.max(150, Math.min(340, 270 * k));
}

/**
 * Flacon SVG avec niveau de liquide animé.
 * Uniquement du SVG + CSS (pas de canvas ni de WebGL) : rendu net, léger,
 * et aucune boucle de rendu JS qui pourrait ralentir la page.
 */
export function MixBottleVisual({
  fill,
  baseFill = 0,
  from,
  to,
  volumeMl,
  volumeLabel,
  caption,
}: Props) {
  const ratio = Math.max(0, Math.min(1, fill));
  const baseRatio = Math.max(0, Math.min(ratio, baseFill));
  const gradientId = useMemo(
    () => `mixliquid-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  // Géométrie du corps du flacon
  const bodyTop = 78;
  const bodyBottom = 286;
  const bodyHeight = bodyBottom - bodyTop;
  const liquidHeight = bodyHeight * ratio;
  const liquidY = bodyBottom - liquidHeight;
  const baseY = bodyBottom - bodyHeight * baseRatio;
  const heightPx = bottleHeightPx(volumeMl);

  return (
    <div className="flex flex-col items-center">
      <style>{`
        @keyframes bnv-mix-wave { from { transform: translateX(0); } to { transform: translateX(-60px); } }
        @keyframes bnv-mix-bubble { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: .7; } 100% { transform: translateY(-70px); opacity: 0; } }
        .bnv-wave { animation: bnv-mix-wave 3.2s linear infinite; }
        .bnv-bubble { animation: bnv-mix-bubble 4s ease-in infinite; }
        @media (prefers-reduced-motion: reduce) {
          .bnv-wave, .bnv-bubble { animation: none; }
        }
      `}</style>
      <svg
        viewBox="0 0 180 320"
        className="w-auto drop-shadow-[0_18px_30px_rgba(0,0,0,0.35)]"
        style={{
          height: `${heightPx}px`,
          transition: "height 600ms cubic-bezier(.22,1,.36,1)",
        }}
        role="img"
        aria-label={`Flacon ${volumeMl ? `${volumeMl} ml ` : ""}rempli à ${Math.round(ratio * 100)} %`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={from} stopOpacity="0.95" />
            <stop offset="45%" stopColor={from} stopOpacity="0.8" />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          <linearGradient id={`${gradientId}-glass`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="80%" stopColor="#000000" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id={`${gradientId}-sheen`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
          </linearGradient>
          <clipPath id={`${gradientId}-clip`}>
            <path d="M46 78 q0 -14 12 -18 l6 -14 h52 l6 14 q12 4 12 18 v190 q0 18 -18 18 h-52 q-18 0 -18 -18 z" />
          </clipPath>
        </defs>

        {/* Bouchon */}
        <rect x="72" y="12" width="36" height="30" rx="6" className="fill-muted-foreground/70" />
        <rect x="80" y="38" width="20" height="14" className="fill-muted-foreground/50" />

        {/* Corps (verre) */}
        <path
          d="M46 78 q0 -14 12 -18 l6 -14 h52 l6 14 q12 4 12 18 v190 q0 18 -18 18 h-52 q-18 0 -18 -18 z"
          className="fill-background/40 stroke-border"
          strokeWidth="2"
        />

        {/* Liquide */}
        <g clipPath={`url(#${gradientId}-clip)`}>
          <g style={{ transition: "transform 700ms cubic-bezier(.22,1,.36,1)" }}>
            <rect
              x="30"
              y={liquidY}
              width="120"
              height={liquidHeight + 4}
              fill={`url(#${gradientId})`}
              style={{ transition: "y 700ms cubic-bezier(.22,1,.36,1), height 700ms cubic-bezier(.22,1,.36,1)" }}
            />
            {ratio > 0 && (
              <g
                className="bnv-wave"
                style={{ transition: "transform 700ms cubic-bezier(.22,1,.36,1)" }}
              >
                <path
                  d={`M-60 ${liquidY} q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 v14 h-240 z`}
                  fill={from}
                  opacity="0.85"
                  style={{ transition: "d 700ms cubic-bezier(.22,1,.36,1)" }}
                />
              </g>
            )}
            {/* Ligne de séparation base nicotinée / arômes */}
            {baseRatio > 0 && ratio > baseRatio && (
              <line
                x1="30"
                x2="150"
                y1={baseY}
                y2={baseY}
                stroke="#ffffff"
                strokeOpacity="0.35"
                strokeDasharray="4 4"
                strokeWidth="1.5"
                style={{ transition: "y1 700ms cubic-bezier(.22,1,.36,1), y2 700ms cubic-bezier(.22,1,.36,1)" }}
              />
            )}
            {ratio > 0.1 && (
              <>
                <circle cx="70" cy={bodyBottom - 10} r="3" fill="#fff" opacity="0.35" className="bnv-bubble" />
                <circle
                  cx="104"
                  cy={bodyBottom - 20}
                  r="2"
                  fill="#fff"
                  opacity="0.3"
                  className="bnv-bubble"
                  style={{ animationDelay: "1.4s" }}
                />
              </>
            )}
          </g>
        </g>

        {/* Verre : transparence + reflets */}
        <path
          d="M46 78 q0 -14 12 -18 l6 -14 h52 l6 14 q12 4 12 18 v190 q0 18 -18 18 h-52 q-18 0 -18 -18 z"
          fill={`url(#${gradientId}-glass)`}
          pointerEvents="none"
        />
        <rect x="56" y="92" width="7" height="150" rx="3.5" fill={`url(#${gradientId}-sheen)`} />
        <rect x="126" y="110" width="4" height="96" rx="2" fill="#fff" opacity="0.08" />

        {/* Graduations */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="122"
            x2="134"
            y1={bodyBottom - bodyHeight * g}
            y2={bodyBottom - bodyHeight * g}
            className="stroke-border"
            strokeWidth="1.5"
          />
        ))}

        {/* Étiquette */}
        <rect x="52" y="196" width="76" height="52" rx="6" className="fill-card/85 stroke-border" strokeWidth="1" />
        <text x="90" y="218" textAnchor="middle" className="fill-foreground" fontSize="12">
          Mon Mix
        </text>
        <text x="90" y="234" textAnchor="middle" className="fill-muted-foreground" fontSize="9">
          {volumeLabel ?? "— ml"}
        </text>
      </svg>
      {caption ? (
        <p className="mt-3 max-w-[220px] text-center text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}
