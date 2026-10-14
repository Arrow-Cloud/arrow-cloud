import { useMemo } from 'react';
import Landscape from './Landscape';
import { CelestialBody, Stars } from './Sky';
import { seededRandom } from './useScrollVars';
import { VARIANTS, type BackdropVariant } from './variants';

// The page backdrop for one variant: a sky that moves over land that parallaxes. By day, clouds drift across and the
// sun glows; at night the moon replaces it, stars twinkle and, where the variant has them, fireflies float over the
// grass. By day a meadow gets butterflies. The
// land is in Landscape.tsx; what differs per variant is in variants.ts and, for colour, App.css.
// Butterflies cross the meadow by day: one animation drifts them across, another bobs them up and down, a third flaps
// the wings. Colours are the variant's flower colours.
const BUTTERFLIES = [
  { top: '48%', seconds: 70, delay: -12, bob: 3.4, hue: 1 },
  { top: '58%', seconds: 95, delay: -55, bob: 4.2, hue: 3 },
  { top: '40%', seconds: 120, delay: -80, bob: 3.8, hue: 2 },
  { top: '64%', seconds: 85, delay: -30, bob: 3, hue: 4 },
];

const CLOUDS = [
  { top: '9%', width: 150, seconds: 140, delay: -30 },
  { top: '18%', width: 100, seconds: 190, delay: -120 },
  { top: '27%', width: 130, seconds: 165, delay: -70 },
  { top: '13%', width: 80, seconds: 220, delay: -10 },
];

export default function Backdrop({ variant }: { variant: BackdropVariant }) {
  const spec = VARIANTS[variant];
  const fireflies = useMemo(() => {
    const rand = seededRandom(11);
    return Array.from({ length: 16 }, () => ({ x: rand() * 100, y: 62 + rand() * 30, seconds: 5 + rand() * 6, delay: -rand() * 8 }));
  }, []);

  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, var(--sky-top), var(--sky-mid) 45%, var(--sky-horizon))' }} />

      <CelestialBody className="top-20 right-[7%]" />
      <Stars count={spec.stars} />

      {/* Clouds, day only (faint at night). */}
      {CLOUDS.slice(0, spec.clouds.count).map((c, i) => (
        <svg
          key={i}
          viewBox="0 0 120 50"
          className="bg-cloud absolute left-0 dark:!opacity-[0.07]"
          style={{
            top: c.top,
            width: c.width * (spec.clouds.scale ?? 1),
            opacity: spec.clouds.opacity,
            animationDuration: `${c.seconds}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          <path className="fill-base-100" d="M25 44a16 16 0 0 1-1-32 22 22 0 0 1 42-4 18 18 0 0 1 28 14 14 14 0 0 1 1 22z" />
        </svg>
      ))}

      <Landscape variant={variant} />

      {/* Butterflies, day only. */}
      {spec.butterflies &&
        BUTTERFLIES.map((b, i) => (
          <div
            key={i}
            className="bg-butterfly absolute left-0 dark:hidden"
            style={{ top: b.top, animationDuration: `${b.seconds}s`, animationDelay: `${b.delay}s` }}
          >
            <div className="bg-bob" style={{ animationDuration: `${b.bob}s` }}>
              <svg viewBox="0 0 24 16" className="bg-flap w-5" style={{ fill: `var(--flower-${b.hue})` }}>
                <path d="M12,8 C6,-1 0,2 2,9 C3,14 9,13 12,8Z M12,8 C18,-1 24,2 22,9 C21,14 15,13 12,8Z" />
                <rect x="11.4" y="4" width="1.2" height="8" rx="0.6" style={{ fill: 'var(--land-ink)' }} />
              </svg>
            </div>
          </div>
        ))}

      {/* Fireflies, night only. */}
      {spec.fireflies && (
        <div className="absolute inset-0 hidden dark:block">
          {fireflies.map((f, i) => (
            <span
              key={i}
              className="bg-firefly absolute size-1.5 rounded-full bg-warning shadow-[0_0_8px_2px] shadow-warning/70"
              style={{ left: `${f.x}%`, top: `${f.y}%`, animationDuration: `${f.seconds}s`, animationDelay: `${f.delay}s` }}
            />
          ))}
        </div>
      )}
    </>
  );
}
