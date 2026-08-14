import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, type Group } from "three";
import { FloatShadow } from "./scene-bits";

export type BottleMeshProps = {
  /** Couleurs du liquide. */
  from: string;
  to: string;
  /** Taux de remplissage 0 → 1. */
  fill?: number;
  /** Échelle globale (proportionnelle à la contenance). */
  scale?: number;
  /** Rotation lente continue (produit en vitrine). */
  spin?: number;
  /** Léger flottement vertical. */
  float?: boolean;
  /** Rendu allégé (mobile) : pas de réfraction du verre. */
  simple?: boolean;
  /** Silhouette vide « bientôt disponible ». */
  ghost?: boolean;
  /** Halo de sélection. */
  highlight?: boolean;
  /** Texte principal de l'étiquette (ex. « 60 ml »). */
  label?: string;
  /** Ligne secondaire de l'étiquette. */
  sublabel?: string;
};

const BODY_H = 1.5;
const BODY_R = 0.42;

/** Étiquette dessinée en canvas puis appliquée sur le corps du flacon. */
function useLabelTexture(label?: string, sublabel?: string, accent = "#2fe39a") {
  return useMemo(() => {
    if (typeof document === "undefined" || !label) return null;
    const w = 1024;
    const h = 512;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;

    // Fond sombre + bande verte marque
    ctx.fillStyle = "#0b1310";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 46);
    ctx.fillRect(0, h - 46, w, 46);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Marque
    ctx.fillStyle = "#d8fbe9";
    ctx.font = "600 52px Helvetica, Arial, sans-serif";
    ctx.letterSpacing = "10px";
    ctx.fillText("BREAK VAP & CBD", w / 2, 118);

    // Contenance en gros
    ctx.letterSpacing = "2px";
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 168px Helvetica, Arial, sans-serif";
    ctx.fillText(label.toUpperCase(), w / 2, 262);

    // Sous-titre
    if (sublabel) {
      ctx.fillStyle = accent;
      ctx.font = "600 56px Helvetica, Arial, sans-serif";
      ctx.letterSpacing = "6px";
      ctx.fillText(sublabel.toUpperCase().slice(0, 26), w / 2, 386);
    }

    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [label, sublabel, accent]);
}

/** Flacon stylisé en primitives : corps, épaule, col, bouchon, liquide interne. */
export function BottleMesh({
  from,
  to,
  fill = 0,
  scale = 1,
  spin = 0,
  float = false,
  simple = false,
  ghost = false,
  highlight = false,
  label,
  sublabel,
}: BottleMeshProps) {
  const group = useRef<Group>(null);
  const lift = useRef<Group>(null);
  const t0 = useRef(Math.random() * 10);
  const labelTex = useLabelTexture(ghost ? undefined : label, sublabel);

  useFrame((state, delta) => {
    const g = group.current;
    if (g && spin) g.rotation.y += spin * delta;
    const l = lift.current;
    if (l && float) {
      const t = state.clock.elapsedTime + t0.current;
      l.position.y = 0.16 + Math.sin(t * 0.8) * 0.07;
      l.rotation.z = Math.sin(t * 0.45) * 0.012;
    }
  });

  const liquidH = Math.max(0.001, BODY_H * Math.max(0, Math.min(1, fill)));
  const liquidY = -BODY_H / 2 + liquidH / 2;

  return (
    <group scale={scale}>
      {/* Halo de sélection (hors rotation) */}
      {highlight && (
        <mesh position={[0, 0.16, -0.75]}>
          <ringGeometry args={[0.78, 0.9, 64]} />
          <meshBasicMaterial color={from} transparent opacity={0.55} toneMapped={false} />
        </mesh>
      )}

      {/* Ombre douce de lévitation */}
      <FloatShadow y={-1.12} radius={highlight ? 0.6 : 0.5} opacity={ghost ? 0.2 : 0.38} />

      <group ref={lift} position={[0, 0.16, 0]}>
        <group ref={group}>
          {/* Liquide */}
          {!ghost && fill > 0.001 && (
            <mesh position={[0, liquidY, 0]}>
              <cylinderGeometry args={[BODY_R * 0.93, BODY_R * 0.93, liquidH, 40]} />
              <meshStandardMaterial
                color={from}
                emissive={to}
                emissiveIntensity={0.45}
                roughness={0.12}
                metalness={0}
                transparent
                opacity={0.94}
              />
            </mesh>
          )}

          {/* Corps en verre */}
          <mesh castShadow={!simple}>
            <cylinderGeometry args={[BODY_R, BODY_R, BODY_H, 64]} />
            {ghost ? (
              <meshStandardMaterial
                color="#7c8a86"
                roughness={0.1}
                metalness={0.1}
                transparent
                opacity={0.18}
              />
            ) : (
              <meshPhysicalMaterial
                color="#eef9f4"
                transmission={simple ? 0.6 : 0.96}
                thickness={simple ? 0.25 : 0.65}
                roughness={simple ? 0.16 : 0.05}
                metalness={0}
                ior={1.5}
                clearcoat={1}
                clearcoatRoughness={0.04}
                reflectivity={0.75}
                specularIntensity={1}
                iridescence={simple ? 0 : 0.25}
                envMapIntensity={1.4}
                transparent
                opacity={simple ? 0.55 : 0.95}
              />
            )}
          </mesh>

          {/* Épaule */}
          <mesh position={[0, BODY_H / 2 + 0.09, 0]}>
            <cylinderGeometry args={[0.16, BODY_R, 0.18, 48]} />
            <meshPhysicalMaterial
              color={ghost ? "#7c8a86" : "#e7f6ee"}
              transmission={ghost ? 0 : 0.8}
              thickness={0.3}
              roughness={0.12}
              clearcoat={1}
              transparent
              opacity={ghost ? 0.16 : 0.85}
            />
          </mesh>

          {/* Col */}
          <mesh position={[0, BODY_H / 2 + 0.26, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.18, 32]} />
            <meshStandardMaterial
              color={ghost ? "#6f7c78" : "#cbe4da"}
              roughness={0.2}
              metalness={0.3}
              transparent
              opacity={ghost ? 0.16 : 0.6}
            />
          </mesh>

          {/* Bouchon */}
          <mesh position={[0, BODY_H / 2 + 0.44, 0]} castShadow={!simple}>
            <cylinderGeometry args={[0.17, 0.17, 0.2, 32]} />
            <meshStandardMaterial
              color={ghost ? "#4a534f" : "#16221d"}
              roughness={0.4}
              metalness={0.55}
              transparent={ghost}
              opacity={ghost ? 0.25 : 1}
            />
          </mesh>

          {/* Étiquette */}
          <mesh position={[0, -0.16, 0]}>
            <cylinderGeometry args={[BODY_R + 0.014, BODY_R + 0.014, 0.66, 64, 1, true]} />
            {labelTex ? (
              <meshStandardMaterial
                map={labelTex}
                roughness={0.62}
                metalness={0.06}
                transparent={false}
                side={2}
              />
            ) : (
              <meshStandardMaterial
                color={ghost ? "#39433f" : "#0f1512"}
                roughness={0.85}
                transparent
                opacity={ghost ? 0.3 : 0.92}
                side={2}
              />
            )}
          </mesh>
        </group>
      </group>
    </group>
  );
}
