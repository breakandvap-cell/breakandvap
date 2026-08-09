import { useEffect, useRef } from "react";

/**
 * Déconnexion automatique après une période d'inactivité (espace gérant).
 */
export function useIdleTimeout(minutes: number, onTimeout: () => void) {
  const cb = useRef(onTimeout);
  cb.current = onTimeout;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current(), minutes * 60_000);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
}