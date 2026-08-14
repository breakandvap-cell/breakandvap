import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { BottleMesh } from "./bottle-mesh";
import { ShowroomLights } from "./scene-bits";
import { useIsMobile } from "@/hooks/use-mobile";

export type CarouselItem = {
  id: string;
  /** Échelle relative (déjà calculée par l'appelant, ex. racine cubique du volume). */
  size?: number;
  from: string;
  to: string;
  fill?: number;
};

type Props = {
  items: CarouselItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Silhouettes vides « bientôt disponible ». */
  ghost?: boolean;
  height?: number;
};

function CarouselItemMesh({
  item,
  offset,
  selected,
  simple,
  ghost,
  onSelect,
}: {
  item: CarouselItem;
  offset: number;
  selected: boolean;
  simple: boolean;
  ghost?: boolean;
  onSelect: () => void;
}) {
  const group = useRef<Group>(null);
  const targetX = offset * (simple ? 1.5 : 1.8);
  const base = item.size ?? 1;
  const targetScale = base * (selected ? 1.25 : 0.82);
  const targetOpacityZ = selected ? 0.35 : -Math.min(1.1, Math.abs(offset) * 0.5);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const k = 1 - Math.pow(0.004, delta);
    g.position.x += (targetX - g.position.x) * k;
    g.position.z += (targetOpacityZ - g.position.z) * k;
    g.scale.x += (targetScale - g.scale.x) * k;
    g.scale.y = g.scale.z = g.scale.x;
  });

  return (
    <group
      ref={group}
      position={[targetX, 0, targetOpacityZ]}
      scale={targetScale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <BottleMesh
        from={item.from}
        to={item.to}
        fill={item.fill ?? (ghost ? 0 : 0.55)}
        spin={selected ? 0.25 : 0.5}
        float
        simple={simple}
        ghost={ghost}
        highlight={selected}
      />
    </group>
  );
}

/** Carrousel 3D horizontal de flacons flottants. */
export default function BottleCarousel3D({
  items,
  selectedId,
  onSelect,
  ghost = false,
  height = 260,
}: Props) {
  const isMobile = useIsMobile();
  const index = Math.max(0, items.findIndex((i) => i.id === selectedId));

  return (
    <div style={{ height }} className="w-full">
      <Canvas
        dpr={[1, isMobile ? 1.25 : 1.8]}
        camera={{ position: [0, 0.15, 6.2], fov: 36 }}
        gl={{ antialias: !isMobile, powerPreference: "high-performance" }}
      >
        <ShowroomLights simple={isMobile} />
        {items.map((item, i) => (
          <CarouselItemMesh
            key={item.id}
            item={item}
            offset={i - index}
            selected={item.id === selectedId}
            simple={isMobile}
            ghost={ghost}
            onSelect={() => onSelect(item.id)}
          />
        ))}
      </Canvas>
    </div>
  );
}
