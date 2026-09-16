import { useEffect, useRef, useState } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { Link } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { useAuth } from '@shared/contexts/AuthContext';
import DispersionChart from '../components/DispersionChart';
import { DEMO_PLAYS, type DemoPlay } from '../data/dispersionDemoPlays';

const LOGO_URL = '/img/ITGolf_Logo-ArrowLeft_Large.png';
const LOGO_ASPECT_RATIO = 1346 / 199; // native aspect ratio, trimmed to the logo's visible glyph bbox

// --- "How scoring works" - ported from scripts/golf-announcement's ScoringSlide.tsx (same demo
// data/dispersion-chart algorithm, restyled from the slide deck's custom CSS into this app's
// Tailwind/DaisyUI conventions). Cycles through a few made-up example plays so the chart/stats are
// never static - not real submissions. ---
const CYCLE_MS = 4000;
const FADE_MS = 700;

interface Layer {
  id: number;
  play: DemoPlay;
}

function StatBlock({ value, label, colorClass }: { value: string | number; label: React.ReactNode; colorClass: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-3xl sm:text-4xl font-extrabold tabular-nums ${colorClass}`}>{value}</span>
      <span className="text-xs uppercase tracking-widest text-base-content/50">{label}</span>
    </div>
  );
}

function ScoringDemo() {
  const [layers, setLayers] = useState<Layer[]>(() => [{ id: 0, play: DEMO_PLAYS[0] }]);
  const nextId = useRef(1);
  const playIndex = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      playIndex.current = (playIndex.current + 1) % DEMO_PLAYS.length;
      const id = nextId.current++;
      setLayers((prev) => [...prev, { id, play: DEMO_PLAYS[playIndex.current] }]);
      setTimeout(() => {
        setLayers((prev) => (prev.length > 1 ? prev.slice(1) : prev));
      }, FADE_MS);
    }, CYCLE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
      <div className="flex flex-col items-center md:items-start gap-6 text-center md:text-left">
        <div className="relative h-20 w-64">
          {layers.map((layer, i) => (
            <div
              key={layer.id}
              className={`absolute inset-0 flex gap-8 justify-center md:justify-start transition-opacity duration-700 ${i < layers.length - 1 ? 'opacity-0' : 'opacity-100'}`}
            >
              <StatBlock
                value={(layer.play.totalStrokes / 1000).toFixed(2)}
                colorClass="text-base-content"
                label={<FormattedMessage defaultMessage="Strokes" id="b+V6VH" description="Stat label: strokes" />}
              />
              <StatBlock
                value={layer.play.aces}
                colorClass="text-accent"
                label={<FormattedMessage defaultMessage="Aces" id="6beSSk" description="Stat label: aces" />}
              />
              <StatBlock
                value={layer.play.ob}
                colorClass="text-error"
                label={<FormattedMessage defaultMessage="OB" id="Ky9IwW" description="Stat label: out of bounds" />}
              />
            </div>
          ))}
        </div>
        <p className="text-base-content/70 max-w-sm">
          <FormattedMessage
            defaultMessage="The closer your timing, the fewer strokes you take. Lowest total strokes wins - just like real golf."
            id="t7OqZ9"
            description="Scoring section description"
          />
        </p>
      </div>
      <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] shrink-0">
        {layers.map((layer, i) => (
          <div key={layer.id} className={`absolute inset-0 transition-opacity duration-700 ${i < layers.length - 1 ? 'opacity-0' : 'opacity-100'}`}>
            <DispersionChart noteStrokes={layer.play.noteStrokes} greenSeed={layer.play.greenSeed} greenVariant={layer.play.greenVariant} size={320} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- "Judging your hits" - ported from ScoringExamplesSlide.tsx, same real in-game HUD screenshots
// and captions, laid out as stacked rows instead of presenter-controlled steps (a scrolling page
// doesn't need "next" - everything can just be shown). ---
interface ExampleImage {
  src: string;
  caption: string;
}

const HIT_EXAMPLE_PAIRS: [ExampleImage, ExampleImage][] = [
  [
    { src: '/img/score-example-ace.png', caption: 'Aces - near perfect timing, no penalty' },
    { src: '/img/score-example-fantastic.png', caption: 'Fantastics still add some small penalty if not very precise' },
  ],
  [
    { src: '/img/score-example-excellent.png', caption: 'Penalties get worse as accuracy gets worse' },
    { src: '/img/score-example-great.png', caption: '' },
  ],
  [
    {
      src: '/img/score-example-way-off.png',
      caption: 'Maximum penalty is around the way off window. Misses, mines hit, dropped holds, all assigned maximum penalty.',
    },
    { src: '/img/score-example-miss.png', caption: '' },
  ],
];

function HitExamples() {
  const { formatMessage } = useIntl();
  const fallbackAlt = formatMessage({
    defaultMessage: 'Score example screenshot',
    id: 'jh9x6l',
    description: 'Fallback alt text for a hit-example screenshot with no caption',
  });

  return (
    <div className="flex flex-col gap-10 w-full">
      {HIT_EXAMPLE_PAIRS.map((pair, i) => {
        const nonEmptyCaptions = pair.map((image) => image.caption).filter(Boolean);
        const sharedCaption = nonEmptyCaptions.length === 1 ? nonEmptyCaptions[0] : null;
        return (
          <div key={i} className="flex flex-col items-center gap-3">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center w-full">
              {pair.map((image) => (
                <div key={image.src} className="flex flex-col items-center gap-2 flex-1 max-w-sm">
                  <img
                    src={image.src}
                    alt={image.caption || fallbackAlt}
                    className="w-full aspect-[3/2] object-cover rounded-xl shadow-lg ring-1 ring-base-content/10"
                  />
                  {!sharedCaption && image.caption && <p className="text-sm text-base-content/70 text-center">{image.caption}</p>}
                </div>
              ))}
            </div>
            {sharedCaption && <p className="text-sm text-base-content/70 text-center max-w-xl">{sharedCaption}</p>}
          </div>
        );
      })}
      <p className="text-xs text-base-content/50 text-center italic">
        <FormattedMessage
          defaultMessage="Draft implementation of scoring system, values subject to change after beta testing."
          id="pATOrk"
          description="Disclaimer under the hit-example screenshots"
        />
      </p>
    </div>
  );
}

// --- "Event rules" - same 5 bullets as scripts/golf-announcement's RulesSlide.tsx. ---
const RULES = [
  'This is a golf themed ITG event, using a custom "golf" scoring system!',
  'Charts are available in a variety of "courses" (packs), each course has 18 "holes" (songs)!',
  'Leaderboards per hole and per course',
  'Each course has a different theme, ranging from easy to difficult, simple to technical.',
  'Courses are curated by community volunteers',
];

// --- Section wrapper - the translucent/blurred "card" every section's content sits in, so text
// stays legible over GradientBackground.tsx's moving blobs regardless of exactly where they've
// drifted to. ---
function Section({ id, heading, children }: { id: string; heading: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="card bg-base-100/70 backdrop-blur-md shadow-xl ring-1 ring-base-content/10 p-8 sm:p-12 w-full max-w-4xl">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center mb-8">{heading}</h2>
        {children}
      </div>
    </section>
  );
}

const HomePage = () => {
  const { formatMessage } = useIntl();
  const { user } = useAuth();
  return (
    <div className="flex flex-col">
      {/* --- Hero --- */}
      <section id="hero" className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
        <img
          src={LOGO_URL}
          alt={formatMessage({ defaultMessage: 'In The Golf', id: 'LAWbk8', description: 'Alt text for In The Golf logo' })}
          className="w-full max-w-md drop-shadow-lg"
          style={{ aspectRatio: LOGO_ASPECT_RATIO }}
        />
        <p className="text-base-content/70 max-w-md">
          <FormattedMessage
            defaultMessage="A golf-themed scoring event for ITG - custom courses, custom scoring, lowest strokes wins."
            id="ePKK8Q"
            description="Homepage tagline describing the event"
          />
        </p>
        <p className="text-sm text-base-content/50">
          <FormattedMessage
            defaultMessage="Beta launches mid-October · Full launch in December"
            id="QXrIY8"
            description="Homepage timing note for beta and full launch"
          />
        </p>

        {user ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-base-content/70">
              <FormattedMessage
                defaultMessage="Welcome back, {alias}."
                id="XNU1VG"
                description="Logged-in welcome message on homepage"
                values={{ alias: <span className="font-semibold text-base-content">{user.alias}</span> }}
              />
            </p>
            <Link to="/submit" className="btn btn-accent gap-2">
              <Flag className="w-4 h-4" />
              <FormattedMessage defaultMessage="Submit a Chart" id="yIaF8D" description="Submit chart CTA button on homepage" />
            </Link>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-base-content/70">
              <FormattedMessage defaultMessage="Login to submit a chart." id="1aS/pR" description="Call to action for logged-out users on homepage" />
            </p>
            <Link to="/login" className="btn btn-accent gap-2">
              <FormattedMessage defaultMessage="Login" id="+ANEqj" description="Login button on homepage" />
            </Link>
          </div>
        )}
      </section>

      {/* --- How scoring works --- */}
      <Section id="scoring" heading={<FormattedMessage defaultMessage="How scoring works" id="msFSPa" description="Scoring section heading" />}>
        <ScoringDemo />
      </Section>

      {/* --- Judging your hits --- */}
      <Section id="examples" heading={<FormattedMessage defaultMessage="Judging your hits" id="GOoi+3" description="Hit-examples section heading" />}>
        <HitExamples />
      </Section>

      {/* --- Event rules --- */}
      <Section id="rules" heading={<FormattedMessage defaultMessage="Event rules" id="KFJE3g" description="Rules section heading" />}>
        <ul className="flex flex-col gap-3 max-w-2xl mx-auto">
          {RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-3 text-base-content/85">
              <Flag className="w-4 h-4 mt-1 text-accent shrink-0" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* --- Beta / launch timeline --- */}
      <Section id="timeline" heading={<FormattedMessage defaultMessage="What's next" id="1twu8c" description="Timeline section heading" />}>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="card bg-base-200/70 p-6 flex flex-col items-center text-center gap-2">
            <span className="text-sm uppercase tracking-widest text-accent font-semibold">
              <FormattedMessage defaultMessage="Beta" id="4vg1IP" description="Beta milestone label" />
            </span>
            <span className="text-2xl font-extrabold">
              <FormattedMessage defaultMessage="Mid-October" id="poB0kA" description="Beta milestone date" />
            </span>
          </div>
          <div className="card bg-base-200/70 p-6 flex flex-col items-center text-center gap-2">
            <span className="text-sm uppercase tracking-widest text-accent font-semibold">
              <FormattedMessage defaultMessage="Full Launch" id="cNdbRM" description="Launch milestone label" />
            </span>
            <span className="text-2xl font-extrabold">
              <FormattedMessage defaultMessage="December" id="JjAQk8" description="Launch milestone date" />
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default HomePage;
