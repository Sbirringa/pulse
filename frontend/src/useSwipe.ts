import { useRef } from "react";

/**
 * Riconosce uno swipe orizzontale con il dito (a sinistra o a destra) senza bloccare lo scorrimento
 * verticale della pagina. Si ignora dentro campi di testo e dentro elementi con data-noswipe
 * (es. caroselli che hanno già il loro scorrimento).
 */
export function useSwipe({ onLeft, onRight, min = 70 }: { onLeft?: () => void; onRight?: () => void; min?: number }) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart(e: React.TouchEvent) {
      const el = e.target as HTMLElement;
      if (e.touches.length !== 1 || el.closest("input, textarea, select, [data-noswipe]")) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    },
    onTouchEnd(e: React.TouchEvent) {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - s.t > 800) return;
      if (dx < 0) onLeft?.();
      else onRight?.();
    },
  };
}
