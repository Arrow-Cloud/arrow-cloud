import { useEffect, useMemo, useState } from 'react';
import { crestLine, hillPath, makeCrest, snowPath, type Crest } from './terrain';
import { seededRandom } from './useScrollVars';
import { VARIANTS, type BackdropVariant, type Feature, type Landmark, type PlantKind, type Planting } from './variants';

// The land along the bottom of the page: three layers of hills, far to near, with things on them - plants, pin flags
// on little greens, a landmark or a fence, faint mowing stripes - as the variant says (variants.ts).
//
// Everything is drawn at the viewport's real pixel size (see terrain.ts), so nothing is stretched, and each layer
// parallaxes on its own via --sp (useScrollVars). Things on a layer are children of that layer, so they ride up
// with it. Colours all come from CSS variables (App.css, per variant and theme), so this file has none of its own.

interface Plant {
  kind: PlantKind;
  x: number;
  y: number;
  h: number;
  /** How far toward the foliage tint (%) rather than the ground colour - varied a little per plant, so neighbours
   * that overlap stay distinguishable. */
  tone: number;
  /** Which of the variant's flower colours, 0-3. */
  hue: number;
  /** Saguaro arms: [height of the elbow, height of the tip] as fractions of the trunk, or null for no arm. */
  left: [number, number] | null;
  right: [number, number] | null;
}

// About how wide the page's content column is. The cards cover it, so anything planted behind them is wasted: most
// clumps go in the margins either side, where they can be seen, and a few go behind the content for the gaps.
const CONTENT_WIDTH = 1100;

// Plants come in clumps, as they stand in the wild. Each clump is a few plants of mixed height.
function plant(crest: Crest, width: number, { seed, kinds, size, every, spread = 90 }: Planting, avoid: number[]): Plant[] {
  const rand = seededRandom(seed);
  const plants: Plant[] = [];
  const margin = Math.max(0, (width - CONTENT_WIDTH) / 2);
  const clumps = Math.ceil(width / every);
  for (let c = 0; c < clumps; c++) {
    const inMargin = margin > 100 && rand() < 0.8;
    const centre = inMargin ? (rand() < 0.5 ? rand() * margin : width - rand() * margin) : rand() * width;
    const count = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const x = centre + (rand() - 0.5) * spread;
      if (avoid.some((a) => Math.abs(a - x) < 70)) continue;
      const elbowL = 0.32 + rand() * 0.22;
      const elbowR = 0.42 + rand() * 0.22;
      plants.push({
        kind: kinds[Math.floor(rand() * kinds.length)],
        x,
        y: crest(x) + 2,
        h: size[0] + rand() * (size[1] - size[0]),
        tone: 48 + rand() * 18,
        hue: Math.floor(rand() * 4),
        left: rand() > 0.2 ? [elbowL, elbowL + 0.16 + rand() * 0.16] : null,
        right: rand() > 0.2 ? [elbowR, elbowR + 0.16 + rand() * 0.18] : null,
      });
    }
  }
  return plants;
}

// Each plant is drawn in a unit box (1 tall, rooted at the origin) and scaled to size.
function Plant({ p, ground }: { p: Plant; ground: string }) {
  const color = `color-mix(in oklab, var(--land-foliage) ${p.tone.toFixed(0)}%, ${ground})`;
  const transform = `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.h.toFixed(1)})`;
  const stroked = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', stroke: color } as const;

  switch (p.kind) {
    case 'pine':
      // A trunk and three tiers that widen toward the ground.
      return (
        <g transform={transform} style={{ fill: color }}>
          <rect x="-0.035" y="-0.14" width="0.07" height="0.14" />
          <path d="M0,-1 L0.17,-0.68 L0.09,-0.68 L0.24,-0.42 L0.12,-0.42 L0.31,-0.14 L-0.31,-0.14 L-0.12,-0.42 L-0.24,-0.42 L-0.09,-0.68 L-0.17,-0.68 Z" />
        </g>
      );
    case 'birch':
      // A pale slim trunk with dark flecks and a light, airy crown.
      return (
        <g transform={transform}>
          <rect x="-0.03" y="-0.7" width="0.06" height="0.7" style={{ fill: 'var(--land-bark)' }} />
          <rect x="-0.03" y="-0.45" width="0.06" height="0.02" style={{ fill: 'var(--land-ink)' }} opacity="0.5" />
          <rect x="-0.03" y="-0.22" width="0.06" height="0.02" style={{ fill: 'var(--land-ink)' }} opacity="0.5" />
          <g style={{ fill: color }}>
            <circle cx="0" cy="-0.82" r="0.2" />
            <circle cx="-0.14" cy="-0.68" r="0.14" />
            <circle cx="0.14" cy="-0.7" r="0.15" />
          </g>
        </g>
      );
    case 'boulder':
      // A rounded rock with a lighter face catching the sun, and a smaller one tucked beside it.
      return (
        <g transform={transform}>
          <path d="M-0.5,0 C-0.55,-0.3 -0.3,-0.62 0.02,-0.6 C0.34,-0.6 0.58,-0.32 0.52,0 Z" style={{ fill: 'var(--land-rock)' }} />
          <path d="M-0.28,-0.36 C-0.22,-0.52 -0.05,-0.58 0.1,-0.55 C-0.05,-0.5 -0.2,-0.44 -0.28,-0.36 Z" style={{ fill: 'var(--land-rim)' }} opacity="0.5" />
          <path d="M0.4,0 C0.42,-0.2 0.6,-0.32 0.78,-0.22 C0.86,-0.1 0.84,-0.02 0.8,0 Z" style={{ fill: 'var(--land-rock)' }} />
        </g>
      );
    case 'flower':
      // A thin stem with a bright head, in one of the variant's flower colours.
      return (
        <g transform={transform}>
          <path d="M0,0 Q0.05,-0.5 0,-0.9" strokeWidth="0.07" {...stroked} />
          <circle cx="0" cy="-0.95" r="0.2" style={{ fill: `var(--flower-${p.hue + 1})` }} />
          <circle cx="0" cy="-0.95" r="0.07" style={{ fill: 'var(--land-ink)' }} opacity="0.4" />
        </g>
      );
    case 'tuft':
      // A few blades of grass fanning out from one point.
      return (
        <g transform={transform}>
          <path
            d="M0,0 Q-0.12,-0.5 -0.34,-0.9 M0,0 Q-0.03,-0.55 -0.06,-1 M0,0 Q0.06,-0.5 0.2,-0.85 M0,0 Q0.14,-0.4 0.36,-0.7"
            strokeWidth="0.07"
            {...stroked}
          />
        </g>
      );
    case 'wheat':
      // Tall stalks, each topped with a grain head, leaning a little as if in the wind.
      return (
        <g transform={transform}>
          <g {...stroked} strokeWidth="0.04">
            <path d="M-0.16,0 Q-0.2,-0.5 -0.15,-0.82 M0,0 Q0.02,-0.55 0.03,-0.95 M0.17,0 Q0.2,-0.5 0.15,-0.78" />
          </g>
          <g style={{ fill: color }}>
            <ellipse cx="-0.15" cy="-0.88" rx="0.045" ry="0.11" />
            <ellipse cx="0.03" cy="-1" rx="0.045" ry="0.11" />
            <ellipse cx="0.15" cy="-0.84" rx="0.045" ry="0.11" />
          </g>
        </g>
      );
    case 'barrel':
      // A squat ribbed barrel with a bloom on top.
      return (
        <g transform={transform}>
          <ellipse cx="0" cy="-0.2" rx="0.24" ry="0.2" style={{ fill: color }} />
          <circle cx="0" cy="-0.42" r="0.05" style={{ fill: 'var(--land-bloom)' }} />
        </g>
      );
    case 'saguaro': {
      // A rounded trunk with up to two arms, each an elbow out and a tip up. Stroked, so the ends are round.
      const arm = (side: 1 | -1, a: [number, number]) => `M0,${-a[0]} H${0.25 * side} V${-a[1]}`;
      return (
        <g transform={transform}>
          <path d="M0,0 V-1" strokeWidth="0.19" {...stroked} />
          {p.left && <path d={arm(-1, p.left)} strokeWidth="0.13" {...stroked} />}
          {p.right && <path d={arm(1, p.right)} strokeWidth="0.13" {...stroked} />}
        </g>
      );
    }
  }
}

// A windmill: a tapering tower, and four blades turning slowly about the hub.
function Windmill({ x, y, size }: { x: number; y: number; size: number }) {
  const hubY = -size * 0.82;
  const blade = size * 0.42;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} style={{ fill: 'var(--land-wood)' }}>
      <path d={`M${-size * 0.1},3 L${size * 0.1},3 L${size * 0.05},${hubY} L${-size * 0.05},${hubY} Z`} />
      <g className="bg-windmill" style={{ transformOrigin: `0px ${hubY}px` }}>
        {[0, 90, 180, 270].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 0 ${hubY})`}>
            <rect x={-1.5} y={hubY - blade} width="3" height={blade} />
            <rect x="1.5" y={hubY - blade} width={size * 0.1} height={blade * 0.62} style={{ fill: 'var(--land-wool)' }} opacity="0.85" />
          </g>
        ))}
      </g>
      <circle cx="0" cy={hubY} r={size * 0.035} style={{ fill: 'var(--land-ink)' }} />
    </g>
  );
}

// A fence along a crest, for each stretch it covers. Sampled at the same function as the hill, so it hugs it.
function Line({ feature, crest, width }: { feature: Feature; crest: Crest; width: number }) {
  const parts = feature.ranges.map(([from, to], i) => {
    const x0 = from * width;
    const x1 = to * width;
    const points: [number, number][] = [];
    for (let x = x0; x <= x1; x += 6) points.push([x, crest(x)]);
    // Fence: posts every so often, with two rails strung between them that follow the ground.
    const rail = (lift: number) => `M${points.map(([x, y]) => `${x.toFixed(1)},${(y - lift).toFixed(1)}`).join('L')}`;
    const posts = points.filter((_, k) => k % 7 === 0);
    return (
      <g key={i} style={{ stroke: 'var(--land-wood)' }}>
        <path d={rail(8)} fill="none" strokeWidth="1.6" />
        <path d={rail(15)} fill="none" strokeWidth="1.6" />
        {posts.map(([x, y]) => (
          <line key={x} x1={x} x2={x} y1={y + 1} y2={y - 19} strokeWidth="3" strokeLinecap="round" />
        ))}
      </g>
    );
  });
  return <g>{parts}</g>;
}

// How far below the crest line a flag is planted, px. At zero the green perches on the edge of the hill; sunk a little,
// it sits on the hillside itself and the whole patch is on grass.
const FLAG_DROP = 16;

// A pin flag on a small green: a patch of different grass, a pole, and a pennant that ripples.
function Flag({ x, y, height }: { x: number; y: number; height: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <ellipse cx="0" cy="3" rx="46" ry="5.5" style={{ fill: 'var(--land-green)' }} opacity="0.7" />
      <rect x="-1" y={-height} width="2" height={height + 3} rx="1" style={{ fill: 'color-mix(in oklab, var(--color-base-content) 55%, transparent)' }} />
      <g className="bg-flag" style={{ transformBox: 'fill-box' }}>
        <path d={`M1,${-height} L${1 + 22},${-height + 7} L1,${-height + 14} Z`} style={{ fill: 'var(--color-error)' }} opacity="0.92" />
      </g>
    </g>
  );
}

// Mowing stripes in perspective: wedges fanning out from a vanishing point above the horizon, as the lines of a
// mown fairway do when they run away from you. Kept to a few percent contrast - the effect is a hint of texture.
function Stripes({ width, height, vy, clipId }: { width: number; height: number; vy: number; clipId: string }) {
  const vx = width / 2;
  const reach = height - vy;
  const step = 2.4; // degrees per wedge
  const wedges: string[] = [];
  const count = Math.ceil(90 / step);
  for (let i = -count; i < count; i += 2) {
    const a = Math.tan((i * step * Math.PI) / 180);
    const b = Math.tan(((i + 1) * step * Math.PI) / 180);
    wedges.push(`M${vx},${vy}L${(vx + reach * a).toFixed(1)},${height}L${(vx + reach * b).toFixed(1)},${height}Z`);
  }
  return (
    <g clipPath={`url(#${clipId})`}>
      <path d={wedges.join('')} style={{ fill: 'var(--color-base-100)' }} opacity="0.1" />
    </g>
  );
}

export default function Landscape({ variant }: { variant: BackdropVariant }) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSize({ w: window.innerWidth, h: window.innerHeight }), 120);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, []);

  const spec = VARIANTS[variant];
  const flagLayer = spec.flagLayer ?? 1;
  const areaHeight = Math.round(Math.max(240, Math.min(380, size.h * 0.36)) * (spec.heightScale ?? 1));
  const bottom = areaHeight + 200;
  const scene = useMemo(() => {
    const layers = spec.layers(areaHeight);
    const crests = layers.map((l) => makeCrest(l.terrain));
    const flagX = spec.flags ? [size.w * 0.07, size.w * 0.93] : [];
    // Plants keep clear of the flags and of landmarks, both of which want open ground around them.
    const clear = [...flagX, ...spec.landmarks.map((m) => m.at * size.w)];
    return {
      layers,
      crests,
      flagX,
      paths: crests.map((c) => hillPath(c, size.w, bottom)),
      rims: crests.map((c) => crestLine(c, size.w)),
      snow: spec.snow ? snowPath(crests[spec.snow.layer], size.w, spec.snow.threshold * areaHeight, spec.snow.depth * areaHeight) : null,
      plants: [0, 1, 2].map((layer) =>
        spec.plantings.filter((p) => p.layer === layer).flatMap((p) => plant(crests[layer], size.w, p, p.avoidFlags ? clear : [])),
      ),
    };
  }, [spec, size.w, areaHeight, bottom]);

  const landmarksOn = (layer: number): Landmark[] => spec.landmarks.filter((m) => m.layer === layer);
  const featuresOn = (layer: number): Feature[] => spec.features.filter((f) => f.layer === layer);

  return (
    <svg className="absolute bottom-0 left-0 overflow-visible" width={size.w} height={areaHeight} viewBox={`0 0 ${size.w} ${areaHeight}`}>
      <defs>
        <clipPath id="bg-near-hill">
          <path d={scene.paths[2]} />
        </clipPath>
      </defs>
      {scene.layers.map((layer, i) => (
        <g key={i} className="will-change-transform" style={{ transform: `translateY(calc(var(--sp, 0) * -${layer.shift}px))` }}>
          <path d={scene.paths[i]} style={{ fill: `var(--land-${i + 1})` }} />
          <path d={scene.rims[i]} fill="none" strokeWidth="1.5" style={{ stroke: 'var(--land-rim)' }} opacity="0.35" />
          {scene.snow && spec.snow?.layer === i && <path d={scene.snow} style={{ fill: 'var(--land-snow)' }} />}
          {featuresOn(i).map((f, k) => (
            <Line key={k} feature={f} crest={scene.crests[i]} width={size.w} />
          ))}
          {scene.plants[i].map((p, k) => (
            // Planted things take their layer's colour, pulled toward the variant's foliage tint.
            <Plant key={k} p={p} ground={`var(--land-${i + 1})`} />
          ))}
          {landmarksOn(i).map((m) => (
            <Windmill key={m.kind} x={m.at * size.w} y={scene.crests[i](m.at * size.w)} size={m.size} />
          ))}
          {i === flagLayer && scene.flagX.map((x, k) => <Flag key={x} x={x} y={scene.crests[i](x) + FLAG_DROP} height={k === 0 ? 46 : 52} />)}
          {i === 2 && spec.stripes && <Stripes width={size.w} height={areaHeight + 200} vy={-areaHeight * 1.6} clipId="bg-near-hill" />}
        </g>
      ))}
    </svg>
  );
}
