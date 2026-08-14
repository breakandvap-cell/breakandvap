import { useEffect, useId, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

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
  /** Composition à 100 % : mise en scène finale (scellage + scintillement). */
  complete?: boolean;
};

/** Hauteur affichée proportionnelle au volume réel (échelle racine cubique). */
function bottleHeightPx(volumeMl: number | null | undefined): number {
  const v = volumeMl && volumeMl > 0 ? volumeMl : 50;
  const k = Math.cbrt(v / 60);
  return Math.max(150, Math.min(340, 270 * k));
}

const BODY_PATH =
  "M46 78 q0 -14 12 -18 l6 -14 h52 l6 14 q12 4 12 18 v190 q0 18 -18 18 h-52 q-18 0 -18 -18 z";

/**
 * Flacon SVG « atelier » : profondeur, réfraction du liquide, clapotis à chaque
 * ajout, diffusion de couleur, bulles et halo vert. 100 % SVG + CSS : aucune
 * boucle de rendu JS, dégradation propre sur mobile et en reduced-motion.
 */
export function MixBottleVisual({
  fill,
  baseFill = 0,
  from,
  to,
  volumeMl,
  volumeLabel,
  caption,
  complete = false,
}: Props) {
  const isMobile = useIsMobile();
  const ratio = Math.max(0, Math.min(1, fill));
  const baseRatio = Math.max(0, Math.min(ratio, baseFill));
  const uid = useId().replace(/:/g, "");
  const gradientId = `mixliquid-${uid}`;

  // Géométrie du corps du flacon
  const bodyTop = 78;
  const bodyBottom = 286;
  const bodyHeight = bodyBottom - bodyTop;
  const liquidHeight = bodyHeight * ratio;
  const liquidY = bodyBottom - liquidHeight;
  const baseY = bodyBottom - bodyHeight * baseRatio;
  const heightPx = bottleHeightPx(volumeMl);

  // ---- Réactions visuelles (clapotis + diffusion de couleur) --------------
  const [slosh, setSlosh] = useState(0); // clé d'animation, relancée à chaque ajout
  const [diffuse, setDiffuse] = useState(0);
  const prevFill = useRef(ratio);
  const prevColor = useRef(from);

  useEffect(() => {
    if (Math.abs(ratio - prevFill.current) > 0.005) setSlosh((s) => s + 1);
    prevFill.current = ratio;
  }, [ratio]);

  useEffect(() => {
    if (prevColor.current !== from) setDiffuse((d) => d + 1);
    prevColor.current = from;
  }, [from]);

  // ---- Tilt 3D léger au survol / au doigt ---------------------------------
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const onMove = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (clientX - r.left) / r.width - 0.5;
    const py = (clientY - r.top) / r.height - 0.5;
    const amp = isMobile ? 5 : 12;
    setTilt({ x: -py * amp, y: px * amp });
  };

  const bubbles = isMobile ? 3 : 6;

  return (
    <div className="flex flex-col items-center">
      <style>{`
        @keyframes bnv-mix-wave { from { transform: translateX(0); } to { transform: translateX(-60px); } }
        @keyframes bnv-mix-wave2 { from { transform: translateX(-60px); } to { transform: translateX(0); } }
        @keyframes bnv-mix-bubble { 0% { transform: translateY(0) scale(.6); opacity: 0; } 15% { opacity: .75; } 100% { transform: translateY(-120px) scale(1); opacity: 0; } }
        @keyframes bnv-mix-slosh { 0% { transform: rotate(0deg) translateY(0); } 20% { transform: rotate(2.2deg) translateY(-4px); } 45% { transform: rotate(-1.6deg) translateY(2px); } 70% { transform: rotate(.8deg) translateY(-1px); } 100% { transform: rotate(0deg) translateY(0); } }
        @keyframes bnv-mix-diffuse { 0% { opacity: 0; transform: scale(.25); } 35% { opacity: .75; } 100% { opacity: 0; transform: scale(2.4); } }
        @keyframes bnv-mix-glow { 0%,100% { opacity: .35; } 50% { opacity: .7; } }
        @keyframes bnv-mix-seal { 0% { transform: translateY(-6px) scale(1); } 60% { transform: translateY(1px) scale(1.04); } 100% { transform: translateY(0) scale(1); } }
        @keyframes bnv-mix-sparkle { 0% { opacity: 0; transform: scale(.4); } 40% { opacity: 1; } 100% { opacity: 0; transform: scale(1.6); } }
        .bnv-wave { animation: bnv-mix-wave 3.2s linear infinite; }
        .bnv-wave-back { animation: bnv-mix-wave2 4.6s linear infinite; }
        .bnv-bubble { animation: bnv-mix-bubble 4.6s ease-in infinite; }
        .bnv-slosh { animation: bnv-mix-slosh 1.1s cubic-bezier(.22,1,.36,1); transform-origin: 90px 286px; }
        .bnv-diffuse { animation: bnv-mix-diffuse 1.2s ease-out forwards; }
        .bnv-glow { animation: bnv-mix-glow 3.6s ease-in-out infinite; }
        .bnv-seal { animation: bnv-mix-seal .6s cubic-bezier(.22,1,.36,1); }
        .bnv-sparkle { animation: bnv-mix-sparkle 1.4s ease-out infinite; }
        .bnv-stage { transition: transform 450ms cubic-bezier(.22,1,.36,1); transform-style: preserve-3d; }
        @media (prefers-reduced-motion: reduce) {
          .bnv-wave, .bnv-wave-back, .bnv-bubble, .bnv-slosh, .bnv-diffuse,
          .bnv-glow, .bnv-seal, .bnv-sparkle { animation: none; }
          .bnv-stage { transition: none; transform: none !important; }
        }
      `}</style>

      <div
        ref={wrapRef}
        className="relative"
        style={{ perspective: "900px" }}
        onPointerMove={(e) => onMove(e.clientX, e.clientY)}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      >
        {/* Halo de marque (vert) derrière le flacon */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 -z-10 ${complete ? "bnv-glow" : ""}`}
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 45%, transparent), transparent 72%)",
            filter: `blur(${isMobile ? 18 : 30}px)`,
            opacity: complete ? 0.7 : 0.28 + ratio * 0.3,
            transition: "opacity 700ms ease",
          }}
        />

        <svg
          viewBox="0 0 180 320"
          className={`bnv-stage w-auto drop-shadow-[0_26px_44px_rgba(0,0,0,0.5)]`}
          style={{
            height: `${heightPx}px`,
            transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transition:
              "height 700ms cubic-bezier(.22,1,.36,1), transform 450ms cubic-bezier(.22,1,.36,1)",
          }}
          role="img"
          aria-label={`Flacon ${volumeMl ? `${volumeMl} ml ` : ""}rempli à ${Math.round(ratio * 100)} %`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={from} stopOpacity="0.95" style={{ transition: "stop-color 900ms ease" }} />
              <stop offset="45%" stopColor={from} stopOpacity="0.8" style={{ transition: "stop-color 900ms ease" }} />
              <stop offset="100%" stopColor={to} style={{ transition: "stop-color 900ms ease" }} />
            </linearGradient>
            <radialGradient id={`${gradientId}-drop`}>
              <stop offset="0%" stopColor={from} stopOpacity="0.95" />
              <stop offset="100%" stopColor={from} stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${gradientId}-glass`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.20" />
              <stop offset="30%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="62%" stopColor="#000000" stopOpacity="0.22" />
              <stop offset="86%" stopColor="#ffffff" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.22" />
            </linearGradient>
            <linearGradient id={`${gradientId}-sheen`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
            </linearGradient>
            <clipPath id={`${gradientId}-clip`}>
              <path d={BODY_PATH} />
            </clipPath>
            {!isMobile && (
              <filter id={`${gradientId}-refract`} x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves="2" seed="7" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            )}
          </defs>

          {/* Bouchon (se referme visuellement à 100 %) */}
          <g className={complete ? "bnv-seal" : undefined} key={`cap-${complete}`}>
            <rect x="72" y="12" width="36" height="30" rx="6" className="fill-muted-foreground/70" />
            <rect x="80" y="38" width="20" height="14" className="fill-muted-foreground/50" />
          </g>

          {/* Corps (verre) */}
          <path d={BODY_PATH} className="fill-background/40 stroke-border" strokeWidth="2" />

          {/* Liquide */}
          <g clipPath={`url(#${gradientId}-clip)`}>
            <g
              key={`slosh-${slosh}`}
              className={ratio > 0 ? "bnv-slosh" : undefined}
              filter={!isMobile ? `url(#${gradientId}-refract)` : undefined}
            >
              <rect
                x="30"
                y={liquidY}
                width="120"
                height={liquidHeight + 4}
                fill={`url(#${gradientId})`}
                style={{ transition: "y 800ms cubic-bezier(.22,1,.36,1), height 800ms cubic-bezier(.22,1,.36,1)" }}
              />
              {ratio > 0 && (
                <>
                  <g className="bnv-wave-back">
                    <path
                      d={`M-60 ${liquidY + 4} q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 v16 h-240 z`}
                      fill={to}
                      opacity="0.55"
                      style={{ transition: "d 800ms cubic-bezier(.22,1,.36,1)" }}
                    />
                  </g>
                  <g className="bnv-wave">
                    <path
                      d={`M-60 ${liquidY} q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 v14 h-240 z`}
                      fill={from}
                      opacity="0.85"
                      style={{ transition: "d 800ms cubic-bezier(.22,1,.36,1)" }}
                    />
                  </g>
                </>
              )}

              {/* Diffusion d'une goutte de couleur lors d'un changement d'arôme */}
              {ratio > 0 && diffuse > 0 && (
                <circle
                  key={`diffuse-${diffuse}`}
                  className="bnv-diffuse"
                  cx="90"
                  cy={liquidY + 24}
                  r="34"
                  fill={`url(#${gradientId}-drop)`}
                  style={{ transformOrigin: `90px ${liquidY + 24}px` }}
                />
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
                  style={{ transition: "y1 800ms cubic-bezier(.22,1,.36,1), y2 800ms cubic-bezier(.22,1,.36,1)" }}
                />
              )}

              {ratio > 0.08 &&
                Array.from({ length: bubbles }).map((_, i) => (
                  <circle
                    key={i}
                    cx={62 + ((i * 17) % 56)}
                    cy={bodyBottom - 8 - (i % 3) * 6}
                    r={1.4 + (i % 3) * 0.9}
                    fill="#fff"
                    opacity="0.32"
                    className="bnv-bubble"
                    style={{ animationDelay: `${i * 0.7}s`, animationDuration: `${4 + (i % 3)}s` }}
                  />
                ))}
            </g>

            {/* Ombre interne : profondeur du verre sur le liquide */}
            <rect x="30" y="60" width="120" height="240" fill={`url(#${gradientId}-glass)`} opacity="0.5" pointerEvents="none" />
          </g>

          {/* Verre : transparence + reflets */}
          <path d={BODY_PATH} fill={`url(#${gradientId}-glass)`} pointerEvents="none" />
          <rect x="56" y="92" width="7" height="150" rx="3.5" fill={`url(#${gradientId}-sheen)`} />
          <rect x="126" y="110" width="4" height="96" rx="2" fill="#fff" opacity="0.10" />

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

          {/* Scintillement final */}
          {complete &&
            [
              [58, 96],
              [128, 140],
              [70, 200],
              [120, 254],
            ].map(([cx, cy], i) => (
              <circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r="2.6"
                className="bnv-sparkle fill-accent"
                style={{ animationDelay: `${i * 0.35}s`, transformOrigin: `${cx}px ${cy}px` }}
              />
            ))}
        </svg>
      </div>

      {caption ? (
        <p className="mt-3 max-w-[220px] text-center text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}
