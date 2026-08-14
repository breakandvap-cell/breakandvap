import { ContactShadows } from "@react-three/drei";

/** Éclairage « vitrine premium » commun aux scènes du configurateur. */
export function ShowroomLights({ simple = false }: { simple?: boolean }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#bff3d8", "#050807", 0.6]} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} castShadow={false} />
      {!simple && <spotLight position={[-4, 4, 2]} angle={0.5} penumbra={1} intensity={30} color="#5ef2a8" />}
      <pointLight position={[0, -2, 3]} intensity={6} color="#7cffc4" />
    </>
  );
}

/** Sol réfléchissant discret sous les flacons. */
export function StageFloor({ y = -1.3, blur = 2.4, opacity = 0.45 }) {
  return (
    <ContactShadows
      position={[0, y, 0]}
      opacity={opacity}
      scale={10}
      blur={blur}
      far={4}
      resolution={256}
      color="#000000"
    />
  );
}
