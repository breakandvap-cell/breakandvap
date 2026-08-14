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
};

/** Flacon central « en construction », posé sur un podium avec reflet. */
export default function MixStage3D({
  fill,
  from,
  to,
  size = 1,
  complete = false,
  height = 300,
}: Props) {
  const isMobile = useIsMobile();
  return (
    <div style={{ height }} className="w-full">
      <Canvas
        dpr={[1, isMobile ? 1.25 : 1.8]}
        camera={{ position: [0, 0.25, 5.4], fov: 36 }}
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
          />
        </group>
        {/* Podium */}
        <mesh position={[0, -1.28, 0]}>
          <cylinderGeometry args={[0.62, 0.72, 0.1, 56]} />
          <meshStandardMaterial color="#101a16" roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0, -1.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.63, 0.7, 64]} />
          <meshBasicMaterial color={from} transparent opacity={0.5} toneMapped={false} />
        </mesh>
      </Canvas>
    </div>
  );
}
