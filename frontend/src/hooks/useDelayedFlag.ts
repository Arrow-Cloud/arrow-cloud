import { useEffect, useState } from 'react';

/**
 * Returns `true` only after `flag` has been continuously true for `delayMs`.
 * Returns `false` as soon as `flag` becomes false.
 *
 * Used to avoid flashing busy indicators for fast requests.
 */
export const useDelayedFlag = (flag: boolean, delayMs: number): boolean => {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!flag) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(timer);
  }, [flag, delayMs]);

  return flag && delayed;
};
