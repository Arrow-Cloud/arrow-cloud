import { useMemo } from 'react';
import { seededRandom } from './useScrollVars';

// The sun by day and the moon by night - one slot in the sky, swapped by theme - and the night's stars.

/** Sun: a warm disc with a soft halo and a ring of rays turning very slowly. Moon: a pale disc with a few craters. */
export function CelestialBody({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute size-36 ${className}`}>
      {/* Rays (day only). The conic gradient is masked down to a ring around the disc. */}
      <div className="bg-spin absolute -inset-12 rounded-full opacity-60 dark:hidden [background:repeating-conic-gradient(from_0deg,color-mix(in_oklab,var(--color-warning)_70%,transparent)_0_6deg,transparent_6deg_18deg)] [mask-image:radial-gradient(circle,transparent_44%,black_46%,black_62%,transparent_72%)]" />
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-warning to-orange-300 shadow-[0_0_80px_26px] shadow-warning/50 dark:from-base-content/95 dark:to-base-content/70 dark:shadow-base-content/15" />
      {/* Craters (night only). */}
      <div className="absolute inset-0 hidden overflow-hidden rounded-full dark:block">
        <span className="absolute left-[18%] top-[24%] size-7 rounded-full bg-base-100/15" />
        <span className="absolute left-[52%] top-[14%] size-4 rounded-full bg-base-100/12" />
        <span className="absolute left-[44%] top-[52%] size-10 rounded-full bg-base-100/15" />
        <span className="absolute left-[74%] top-[58%] size-5 rounded-full bg-base-100/12" />
        <span className="absolute left-[16%] top-[64%] size-4 rounded-full bg-base-100/10" />
      </div>
    </div>
  );
}

/** Night only. A scatter of twinkling stars, a few larger and brighter than the rest. */
export function Stars({ count = 80, seed = 7 }: { count?: number; seed?: number }) {
  const stars = useMemo(() => {
    const rand = seededRandom(seed);
    return Array.from({ length: count }, () => {
      const big = rand() > 0.85;
      return { x: rand() * 100, y: rand() * 58, size: big ? 3 + rand() * 1.5 : 1.5 + rand() * 1.5, seconds: 2.5 + rand() * 4, delay: -rand() * 6 };
    });
  }, [count, seed]);
  return (
    <div className="absolute inset-0 hidden dark:block">
      {stars.map((s, i) => (
        <span
          key={i}
          className="bg-star absolute rounded-full bg-base-content shadow-[0_0_6px_1px] shadow-base-content/40"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, animationDuration: `${s.seconds}s`, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}
