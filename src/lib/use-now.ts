import { useEffect, useState } from "react";

/**
 * Horloge partagée : renvoie un `Date` rafraîchi à intervalle régulier afin que
 * les calculs dépendant du temps (promotions qui démarrent/expirent, gains de
 * roue qui expirent) se recalculent sans action de l'utilisateur.
 */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, intervalMs);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [intervalMs]);
  return now;
}
