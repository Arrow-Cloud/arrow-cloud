import { useState, useEffect, useRef } from 'react';

export function useRotatingIndex(length: number, intervalMs = 5000): number {
  const [idx, setIdx] = useState(0);
  const lengthRef = useRef(length);
  lengthRef.current = length;

  useEffect(() => {
    if (length <= 1) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % lengthRef.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [length, intervalMs]);

  return idx;
}
