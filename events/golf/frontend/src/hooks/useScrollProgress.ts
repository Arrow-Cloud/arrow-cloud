import { useEffect, useRef } from 'react';

/**
 * 0-1 fraction of the page's total scroll range, exposed via a ref rather than state - a consumer
 * that already repaints every animation frame (GradientBackground.tsx) just reads whatever the
 * latest value is on its own tick, rather than this hook forcing a React re-render on every scroll
 * event too.
 */
export function useScrollProgress(): React.RefObject<number> {
  const progressRef = useRef(0);

  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progressRef.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return progressRef;
}
