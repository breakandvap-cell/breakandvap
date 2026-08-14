/** Éclairage « vitrine cinématique » : spot principal, ambiance froide, contre-jour vert. */
export function ShowroomLights({ simple = false }: { simple?: boolean }) {
  return (
    <>
      {/* Ambiance froide douce : évite les noirs absolus */}
      <ambientLight intensity={0.22} color="#9fd8ff" />
      <hemisphereLight args={["#bff3d8", "#02040300", 0.25]} />

      {/* Spot principal venant du dessus */}
      <spotLight
        position={[0.6, 6.2, 2.6]}
        angle={0.62}
        penumbra={0.85}
        intensity={simple ? 120 : 220}
        distance={22}
        decay={2}
        color="#ffffff"
        castShadow={!simple}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
      />

      {/* Contre-jour vert (rimlight) marque */}
      <spotLight
        position={[-3.4, 1.6, -3.2]}
        angle={0.9}
        penumbra={1}
        intensity={simple ? 45 : 90}
        color="#4dffab"
      />
      <pointLight position={[3.2, -0.6, -2.4]} intensity={22} color="#2fe39a" />

      {/* Léger fill frontal pour lire les étiquettes */}
      <directionalLight position={[0.5, 0.4, 5]} intensity={simple ? 0.7 : 0.9} color="#eaf7f1" />
    </>
  );
}

/** Ombre douce projetée sous un flacon en lévitation. */
export function FloatShadow({
  y = -1.05,
  radius = 0.55,
  opacity = 0.45,
}: {
  y?: number;
  radius?: number;
  opacity?: number;
}) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 48]} />
      <meshBasicMaterial color="#000000" transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
