import { Canvas } from "@react-three/fiber";
import { BottleMesh } from "./bottle-mesh";
import { ShowroomLights, StageFloor } from "./scene-bits";
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
        camera={{ position: [0, 0.5, 4.8], fov: 38 }}
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
        <mesh position={[0, -1.34, 0]}>
          <cylinderGeometry args={[0.95, 1.1, 0.14, 56]} />
          <meshStandardMaterial color="#0d1512" roughness={0.35} metalness={0.5} />
        </mesh>
        <StageFloor y={-1.26} opacity={isMobile ? 0.25 : 0.35} blur={2.8} />
      </Canvas>
    </div>
  );
}
