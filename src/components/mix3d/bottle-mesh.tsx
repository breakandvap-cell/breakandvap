import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

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
};

const BODY_H = 1.5;
const BODY_R = 0.42;

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
}: BottleMeshProps) {
  const group = useRef<Group>(null);
  const t0 = useRef(Math.random() * 10);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    if (spin) g.rotation.y += spin * delta;
    if (float) {
      const t = state.clock.elapsedTime + t0.current;
      g.position.y = Math.sin(t * 0.9) * 0.06;
    }
  });

  const liquidH = Math.max(0.001, BODY_H * Math.max(0, Math.min(1, fill)));
  const liquidY = -BODY_H / 2 + liquidH / 2;

  return (
    <group scale={scale}>
      {/* Halo de sélection (hors rotation) */}
      {highlight && (
        <mesh position={[0, 0, -0.75]}>
          <ringGeometry args={[0.78, 0.9, 64]} />
          <meshBasicMaterial color={from} transparent opacity={0.55} toneMapped={false} />
        </mesh>
      )}
      <group ref={group}>
      {/* Liquide */}
      {!ghost && fill > 0.001 && (
        <mesh position={[0, liquidY, 0]}>
          <cylinderGeometry args={[BODY_R * 0.93, BODY_R * 0.93, liquidH, 40]} />
          <meshStandardMaterial
            color={from}
            emissive={to}
            emissiveIntensity={0.35}
            roughness={0.15}
            metalness={0}
            transparent
            opacity={0.92}
          />
        </mesh>
      )}

      {/* Corps en verre */}
      <mesh>
        <cylinderGeometry args={[BODY_R, BODY_R, BODY_H, 48]} />
        {simple || ghost ? (
          <meshStandardMaterial
            color={ghost ? "#7c8a86" : "#cfe9df"}
            roughness={0.1}
            metalness={0.1}
            transparent
            opacity={ghost ? 0.18 : 0.28}
          />
        ) : (
          <meshPhysicalMaterial
            color="#eaf7f1"
            transmission={0.92}
            thickness={0.5}
            roughness={0.08}
            ior={1.45}
            transparent
            opacity={0.85}
          />
        )}
      </mesh>

      {/* Épaule */}
      <mesh position={[0, BODY_H / 2 + 0.09, 0]}>
        <cylinderGeometry args={[0.16, BODY_R, 0.18, 40]} />
        <meshStandardMaterial
          color={ghost ? "#7c8a86" : "#dff1e9"}
          transparent
          opacity={ghost ? 0.16 : 0.35}
          roughness={0.15}
        />
      </mesh>

      {/* Col */}
      <mesh position={[0, BODY_H / 2 + 0.26, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.18, 28]} />
        <meshStandardMaterial
          color={ghost ? "#6f7c78" : "#cbe4da"}
          transparent
          opacity={ghost ? 0.16 : 0.4}
        />
      </mesh>

      {/* Bouchon */}
      <mesh position={[0, BODY_H / 2 + 0.44, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.2, 28]} />
        <meshStandardMaterial
          color={ghost ? "#4a534f" : "#20302a"}
          roughness={0.55}
          metalness={0.25}
          transparent={ghost}
          opacity={ghost ? 0.25 : 1}
        />
      </mesh>

      {/* Étiquette */}
      <mesh position={[0, -0.18, 0]}>
        <cylinderGeometry args={[BODY_R + 0.012, BODY_R + 0.012, 0.52, 48, 1, true]} />
        <meshStandardMaterial
          color={ghost ? "#39433f" : "#0f1512"}
          roughness={0.85}
          transparent
          opacity={ghost ? 0.3 : 0.92}
        />
      </mesh>

      </group>
    </group>
  );
}
