import { Suspense, lazy, useEffect, useState, type ComponentProps } from "react";

const Carousel = lazy(() => import("./bottle-carousel"));
const Stage = lazy(() => import("./mix-stage"));

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function Fallback({ height }: { height: number }) {
  return (
    <div
      style={{ height }}
      className="w-full animate-pulse rounded-xl bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_70%)]"
    />
  );
}

/** Carrousel 3D — rendu uniquement côté client (WebGL). */
export function BottleCarousel3DClient(props: ComponentProps<typeof Carousel>) {
  const mounted = useMounted();
  const h = props.height ?? 260;
  if (!mounted) return <Fallback height={h} />;
  return (
    <Suspense fallback={<Fallback height={h} />}>
      <Carousel {...props} />
    </Suspense>
  );
}

/** Scène centrale 3D — rendu uniquement côté client (WebGL). */
export function MixStage3DClient(props: ComponentProps<typeof Stage>) {
  const mounted = useMounted();
  const h = props.height ?? 300;
  if (!mounted) return <Fallback height={h} />;
  return (
    <Suspense fallback={<Fallback height={h} />}>
      <Stage {...props} />
    </Suspense>
  );
}
