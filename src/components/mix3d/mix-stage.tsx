import { Canvas } from "@react-three/fiber";
import { BottleMesh } from "./bottle-mesh";
import { ShowroomLights } from "./scene-bits";
import { useIsMobile } from "@/hooks/use-mobile";

type Props = {
  fill: number;
  from: string;
  to: string;
  /** Échelle proportionnelle au volume réel. */
  size?: number;
  complete?: boolean;
  height?: number;
  /** Étiquette du flacon central. */
  label?: string;
  sublabel?: string;
  /** Photo produit appliquée en texture sur le flacon. */
  photoUrl?: string | null;
};

/** Flacon central « en construction », posé sur un podium avec reflet. */
export default function MixStage3D({
  fill,
  from,
  to,
  size = 1,
  complete = false,
  height = 300,
  label,
  sublabel,
  photoUrl,
}: Props) {
  const isMobile = useIsMobile();
  return (
    <div style={{ height }} className="w-full">
      <Canvas
        dpr={[1, isMobile ? 1.25 : 1.8]}
        shadows={!isMobile}
        camera={{ position: [0, -1.05, 5.1], fov: isMobile ? 50 : 44 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.5, 0)}
        gl={{ antialias: !isMobile, powerPreference: "high-performance" }}
      >
        <ShowroomLights simple={isMobile} />
        <group position={[0, 0.15, 0]}>
          <BottleMesh
            from={from}
            to={to}
            fill={fill}
            scale={size}
            spin={complete ? 0.35 : 0.15}
            float
            simple={isMobile}
            highlight={complete}
            label={label}
            sublabel={sublabel}
            photoUrl={photoUrl}
          />
        </group>
        {/* Podium */}
        <mesh position={[0, -1.42, 0]} receiveShadow>
          <cylinderGeometry args={[0.62, 0.72, 0.1, 56]} />
          <meshStandardMaterial color="#101a16" roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0, -1.36, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.63, 0.7, 64]} />
          <meshBasicMaterial color={from} transparent opacity={0.5} toneMapped={false} />
        </mesh>
      </Canvas>
    </div>
  );
}
