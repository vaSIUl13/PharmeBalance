import { useEffect, useEffectEvent } from "react";

const refreshIntervalMs = 60_000;

export function useRefreshWhileVisible(reload: () => void) {
  const refresh = useEffectEvent(() => {
    if (document.visibilityState === "visible") reload();
  });
  useEffect(() => {
    const tick = () => refresh();
    const timer = window.setInterval(tick, refreshIntervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
}
