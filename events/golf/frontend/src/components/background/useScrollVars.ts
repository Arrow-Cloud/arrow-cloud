import { useEffect } from 'react';

// Publishes the page's scroll progress (0 at the top, 1 at the bottom) as the CSS variable `--sp` on <html>, so a
// background layer can parallax with a plain `transform: translateY(calc(var(--sp) * -120px))` and no React re-render
// per scroll event. One listener, one write per animation frame. Under reduced motion it never writes, so `--sp`
// stays at its fallback and everything sits still.
export function useScrollVars(): void {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      root.style.setProperty('--sp', String(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty('--sp');
    };
  }, []);
}

// A small seeded generator, so a scatter of stars or dots is the same on every load instead of reshuffling.
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
