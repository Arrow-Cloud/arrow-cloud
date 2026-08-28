/* eslint-disable formatjs/no-literal-string-in-jsx */
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { listPacks } from '../../../services/api';
import type { PackListItem } from '../../../schemas/apiSchemas';
import {
  encodeWidgetConfig,
  getWidgetDimensions,
  ELIGIBLE_PACK_IDS,
  type WidgetConfig,
  type WidgetFeatureConfig,
  type LeaderboardKey,
  type PackLeaderboardDifficulty,
} from '../../../utils/widgetConfig';
import { ChevronUp, ChevronDown, X, Plus, Check, ArrowRight, ArrowLeft, Copy, CheckCheck } from 'lucide-react';

const WIGGLE_KEYFRAMES = `
  @keyframes dimWiggle {
    0%, 100% { transform: rotate(0deg) translateY(0); }
    15%  { transform: rotate(-5deg) translateY(-3px); }
    30%  { transform: rotate(5deg)  translateY(-3px); }
    45%  { transform: rotate(-4deg) translateY(-2px); }
    60%  { transform: rotate(4deg)  translateY(-2px); }
    75%  { transform: rotate(-2deg) translateY(-1px); }
    90%  { transform: rotate(1deg)  translateY(0); }
  }
`;

const AVAILABLE_THEMES = [
  { id: 'arrow-blue', label: 'Arrow Blue (Default)' },
  { id: 'arrow-red', label: 'Arrow Red' },
  { id: 'winter', label: 'Winter (Light)' },
  { id: 'dark', label: 'Dark' },
  { id: 'cupcake', label: 'Cupcake' },
  { id: 'retro', label: 'Retro' },
  { id: 'lofi', label: 'Lo-Fi' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'synthwave', label: 'Synthwave' },
  { id: 'valentine', label: 'Valentine' },
  { id: 'halloween', label: 'Halloween' },
  { id: 'garden', label: 'Garden' },
  { id: 'forest', label: 'Forest' },
  { id: 'business', label: 'Business' },
  { id: 'acid', label: 'Acid' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'night', label: 'Night' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'bumblebee', label: 'Bumblebee' },
];

const LB_LABELS: Record<LeaderboardKey, string> = { HardEX: 'H.EX', EX: 'EX', ITG: 'ITG', ITGRate: 'ITG (Rate)', EXRate: 'EX (Rate)' };
const ALL_LB_KEYS: LeaderboardKey[] = ['HardEX', 'EX', 'ITG', 'ITGRate', 'EXRate'];
const DIFF_LABELS: Record<PackLeaderboardDifficulty, string> = { medium: 'Medium', hard: 'Hard', challenge: 'Challenge' };
const LB_ID_MAP: Record<number, LeaderboardKey> = { 4: 'HardEX', 2: 'EX', 3: 'ITG', 18: 'ITGRate', 19: 'EXRate' };

const FEATURE_DESCRIPTIONS: Record<WidgetFeatureConfig['type'], string> = {
  recentPlays: 'Cycles through your 3 most recent scores',
  packLeaderboard: 'Shows your rank in a specific pack',
  currentSession: 'Live session timer with play count, charts, and steps hit',
};

function getDefaultLeaderboards(user: any): LeaderboardKey[] {
  const prefs: number[] = user?.preferredLeaderboardsWebsite ?? [];
  const mapped = prefs.map((id: number) => LB_ID_MAP[id]).filter(Boolean) as LeaderboardKey[];
  return mapped.length > 0 ? mapped : ['EX'];
}

function bestBannerUrl(pack: PackListItem): string | null {
  return pack.mdBannerUrl ?? pack.bannerUrl ?? null;
}

function featureLabel(f: WidgetFeatureConfig): string {
  if (f.type === 'recentPlays') return 'Recent Plays';
  if (f.type === 'packLeaderboard') return `Pack Leaderboard — ${f.packName || f.packId}`;
  if (f.type === 'currentSession') return 'Current Session';
  return 'Unknown';
}

// ---- Step indicator ----

type WizardStep = 1 | 2 | 3 | 4;
const STEP_LABELS: Record<WizardStep, string> = { 1: 'Layout', 2: 'Features', 3: 'Appearance', 4: 'Setup Stream' };

const StepIndicator: React.FC<{ current: WizardStep; onGoTo: (s: WizardStep) => void }> = ({ current, onGoTo }) => (
  <div className="flex items-center mb-6">
    {([1, 2, 3, 4] as WizardStep[]).map((s, i) => (
      <React.Fragment key={s}>
        <button
          type="button"
          onClick={() => s < current && onGoTo(s)}
          className={`flex items-center gap-1.5 ${s < current ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition ${
              s < current
                ? 'bg-primary text-primary-content'
                : s === current
                  ? 'border-2 border-primary text-primary'
                  : 'border-2 border-base-300 text-base-content/40'
            }`}
          >
            {s < current ? <Check className="w-3.5 h-3.5" /> : s}
          </div>
          <span
            className={`text-xs font-medium hidden sm:block ${s === current ? 'text-base-content' : s < current ? 'text-primary' : 'text-base-content/40'}`}
          >
            {STEP_LABELS[s]}
          </span>
        </button>
        {i < 3 && <div className="flex-1 h-px mx-2 bg-base-300/60" />}
      </React.Fragment>
    ))}
  </div>
);

// ---- Preview block ----

const WidgetPreview: React.FC<{ url: string; width: number; height: number }> = ({ url, width, height }) => (
  <div>
    <div className="text-sm font-semibold text-base-content mb-2">Preview</div>
    {/* Dark background simulates an OBS scene — transparent areas of the widget show through */}
    <div
      className="rounded-lg p-4 flex items-center justify-center overflow-auto min-h-[100px]"
      style={{
        background: '#0f172a',
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* allowTransparency sets the iframe's BaseBackgroundColor to alpha-0 so the dark grid shows through transparent areas */}
      <iframe allowTransparency src={url} width={width} height={height} className="border-0 block" style={{ backgroundColor: 'transparent' }} />
    </div>
  </div>
);

// ---- Shared sub-components ----

const LeaderboardCheckboxes: React.FC<{
  selected: LeaderboardKey[];
  onChange: (keys: LeaderboardKey[]) => void;
}> = ({ selected, onChange }) => (
  <div className="flex gap-3 flex-wrap">
    {ALL_LB_KEYS.map((key) => {
      const checked = selected.includes(key);
      return (
        <label
          key={key}
          className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded border text-sm transition ${checked ? 'bg-primary text-primary-content border-primary' : 'border-base-300 hover:bg-base-200'}`}
        >
          <input
            type="checkbox"
            className="hidden"
            checked={checked}
            onChange={() => {
              if (checked && selected.length === 1) return;
              onChange(checked ? selected.filter((k) => k !== key) : [...selected, key]);
            }}
          />
          {LB_LABELS[key]}
        </label>
      );
    })}
  </div>
);

const PackLeaderboardConfig: React.FC<{
  feature: Extract<WidgetFeatureConfig, { type: 'packLeaderboard' }>;
  packs: PackListItem[];
  onChange: (f: Extract<WidgetFeatureConfig, { type: 'packLeaderboard' }>) => void;
}> = ({ feature, packs, onChange }) => (
  <div className="space-y-3 mt-2">
    <div>
      <label className="text-xs font-semibold text-base-content/70 mb-1 block">Pack</label>
      <select
        className="select select-sm select-bordered w-full"
        value={feature.packId}
        onChange={(e) => {
          const pack = packs.find((p) => p.id === parseInt(e.target.value, 10));
          if (pack) onChange({ ...feature, packId: pack.id, packName: pack.name, bannerUrl: bestBannerUrl(pack) });
        }}
      >
        {packs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
    <div>
      <label className="text-xs font-semibold text-base-content/70 mb-1 block">Difficulty</label>
      <div className="flex gap-2">
        {(['medium', 'hard', 'challenge'] as PackLeaderboardDifficulty[]).map((d) => (
          <button
            key={d}
            type="button"
            className={`btn btn-xs ${feature.difficulty === d ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onChange({ ...feature, difficulty: d })}
          >
            {DIFF_LABELS[d]}
          </button>
        ))}
      </div>
    </div>
    <div>
      <label className="text-xs font-semibold text-base-content/70 mb-1 block">Scoring Systems</label>
      <LeaderboardCheckboxes selected={feature.leaderboards} onChange={(keys) => onChange({ ...feature, leaderboards: keys })} />
    </div>
  </div>
);

const RecentPlaysConfig: React.FC<{
  feature: Extract<WidgetFeatureConfig, { type: 'recentPlays' }>;
  onChange: (f: Extract<WidgetFeatureConfig, { type: 'recentPlays' }>) => void;
}> = ({ feature, onChange }) => (
  <div className="mt-2">
    <label className="text-xs font-semibold text-base-content/70 mb-1 block">Scoring Systems</label>
    <LeaderboardCheckboxes selected={feature.leaderboards} onChange={(keys) => onChange({ ...feature, leaderboards: keys })} />
  </div>
);

interface FeatureCardProps {
  feature: WidgetFeatureConfig;
  index: number;
  total: number;
  packs: PackListItem[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: (f: WidgetFeatureConfig) => void;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ feature, index, total, packs, onMoveUp, onMoveDown, onRemove, onChange }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-base-300/50 rounded-lg bg-base-200/40">
      <div className="flex items-center gap-2 p-3">
        <button type="button" className="flex-1 text-left text-sm font-medium" onClick={() => setExpanded((e) => !e)}>
          <span className="text-base-content/50 mr-2 text-xs">#{index + 1}</span>
          {featureLabel(feature)}
          <span className="ml-2 text-xs text-base-content/40">
            {expanded ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onMoveUp} disabled={index === 0}>
            <ChevronUp className="w-4 h-4" />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onMoveDown} disabled={index === total - 1}>
            <ChevronDown className="w-4 h-4" />
          </button>
          <button type="button" className="btn btn-ghost btn-sm text-error hover:bg-error/10" onClick={onRemove}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (feature.type === 'recentPlays' || feature.type === 'packLeaderboard') && (
        <div className="px-3 pb-3 border-t border-base-300/30 pt-2">
          {feature.type === 'recentPlays' && <RecentPlaysConfig feature={feature} onChange={(f) => onChange(f)} />}
          {feature.type === 'packLeaderboard' && <PackLeaderboardConfig feature={feature} packs={packs} onChange={(f) => onChange(f)} />}
        </div>
      )}
    </div>
  );
};

// ---- Dimension speech bubble with wiggle ----

const DimensionBubble: React.FC<{ width: number; height: number; postCopy?: boolean }> = ({ width, height, postCopy }) => {
  const [wiggleCount, setWiggleCount] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (wiggleCount >= 5) return;
    const delay = wiggleCount === 0 ? 800 : 3000;
    const t = setTimeout(() => setAnimating(true), delay);
    return () => clearTimeout(t);
  }, [wiggleCount]);

  return (
    <>
      <style>{WIGGLE_KEYFRAMES}</style>
      <div className="flex items-start gap-3">
        {/* Bubble + pointer */}
        <div className="relative flex-shrink-0 mt-0.5">
          <div
            className="bg-warning text-warning-content text-xs font-bold px-3 py-2 rounded-xl shadow-lg whitespace-nowrap leading-snug"
            style={animating ? { animation: 'dimWiggle 0.7s ease-in-out' } : undefined}
            onAnimationEnd={() => {
              setAnimating(false);
              setWiggleCount((c) => c + 1);
            }}
          >
            {postCopy ? (
              <>
                <div>Don't forget these —</div>
                <div>or it won't fit!</div>
              </>
            ) : (
              <>
                <div>Set these exact</div>
                <div>values in OBS!</div>
              </>
            )}
            {/* Tail pointing right */}
            <span
              className="absolute top-1/2 -translate-y-1/2 left-full"
              style={{
                width: 0,
                height: 0,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderLeft: '8px solid oklch(var(--wa))',
              }}
            />
          </div>
        </div>
        {/* Dimension values */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base-content/60 w-12">Width</span>
            <span className="font-mono font-bold bg-base-300 px-2.5 py-0.5 rounded-md text-base-content">{width}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base-content/60 w-12">Height</span>
            <span className="font-mono font-bold bg-base-300 px-2.5 py-0.5 rounded-md text-base-content">{height}</span>
          </div>
        </div>
      </div>
    </>
  );
};

// ---- Step 1: Layout ----

const LayoutStep: React.FC<{
  orientation: 'horizontal' | 'vertical';
  setOrientation: (o: 'horizontal' | 'vertical') => void;
  onNext: () => void;
}> = ({ orientation, setOrientation, onNext }) => (
  <div className="space-y-6">
    <div>
      <div className="text-sm font-semibold text-base-content mb-3">Layout</div>
      <div className="grid grid-cols-2 gap-3">
        {(['horizontal', 'vertical'] as const).map((o) => {
          const isActive = orientation === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => setOrientation(o)}
              className={`border-2 rounded-xl p-4 flex flex-col items-center gap-3 transition ${isActive ? 'border-primary bg-primary/5' : 'border-base-300/50 hover:border-base-300 bg-base-200/30'}`}
            >
              {o === 'horizontal' ? (
                <div className="flex flex-col gap-1 h-14 w-28">
                  {/* Profile bar */}
                  <div className={`h-3 rounded ${isActive ? 'bg-primary/60' : 'bg-base-300'}`} />
                  {/* Feature panels side by side */}
                  <div className="flex gap-1 flex-1">
                    <div className={`flex-1 rounded ${isActive ? 'bg-primary/25' : 'bg-base-300/70'}`} />
                    <div className={`flex-1 rounded ${isActive ? 'bg-primary/20' : 'bg-base-300/50'}`} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1 w-20 h-14">
                  {/* Profile bar */}
                  <div className={`h-3 rounded ${isActive ? 'bg-primary/60' : 'bg-base-300'}`} />
                  {/* Stacked panels */}
                  <div className={`flex-1 rounded ${isActive ? 'bg-primary/25' : 'bg-base-300/70'}`} />
                  <div className={`h-4 rounded ${isActive ? 'bg-primary/20' : 'bg-base-300/50'}`} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-primary bg-primary' : 'border-base-300'}`}>
                  {isActive && <Check className="w-2.5 h-2.5 text-primary-content" />}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-base-content'}`}>
                  {o === 'horizontal' ? 'Horizontal' : 'Vertical'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-base-content/50 mt-2">
        {orientation === 'horizontal'
          ? 'Your profile above, panels side by side below — best for a corner overlay'
          : 'Your profile above, panels stacked below — best for a sidebar overlay'}
      </p>
    </div>

    <div className="flex justify-end pt-2">
      <button type="button" className="btn btn-primary gap-2" onClick={onNext}>
        Next: Add Features
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// ---- Step 2: Features ----

const FeaturesStep: React.FC<{
  features: WidgetFeatureConfig[];
  setFeatures: (f: WidgetFeatureConfig[]) => void;
  packs: PackListItem[];
  user: any;
  previewUrl: string;
  widgetWidth: number;
  widgetHeight: number;
  onBack: () => void;
  onNext: () => void;
}> = ({ features, setFeatures, packs, user, previewUrl, widgetWidth, widgetHeight, onBack, onNext }) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setShowAddMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const featureCount = features.length;
  const hasRecentPlays = features.some((f) => f.type === 'recentPlays');
  const hasCurrentSession = features.some((f) => f.type === 'currentSession');
  const defaultPack = packs[0];

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...features];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setFeatures(next);
  };

  const moveDown = (i: number) => {
    if (i === featureCount - 1) return;
    const next = [...features];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setFeatures(next);
  };

  const removeFeature = (i: number) => setFeatures(features.filter((_, idx) => idx !== i));

  const updateFeature = (i: number, f: WidgetFeatureConfig) => {
    const next = [...features];
    next[i] = f;
    setFeatures(next);
  };

  const addFeature = (f: WidgetFeatureConfig) => {
    if (featureCount >= 5) return;
    setFeatures([...features, f]);
    setShowAddMenu(false);
  };

  return (
    <div className="space-y-5">
      {/* Feature list */}
      <div className="space-y-2">
        {features.map((f, i) => (
          <FeatureCard
            key={i}
            feature={f}
            index={i}
            total={featureCount}
            packs={packs}
            onMoveUp={() => moveUp(i)}
            onMoveDown={() => moveDown(i)}
            onRemove={() => removeFeature(i)}
            onChange={(updated) => updateFeature(i, updated)}
          />
        ))}
        {features.length === 0 && (
          <div className="text-sm text-base-content/50 border border-dashed border-base-300 rounded-lg p-4 text-center">
            No features added yet — use the button below to get started.
          </div>
        )}
      </div>

      {/* Add feature button — prominent, above preview */}
      {featureCount < 5 ? (
        <div className="relative" ref={addMenuRef}>
          <button type="button" className="btn btn-secondary w-full gap-2 shadow-md" onClick={() => setShowAddMenu((v) => !v)}>
            <Plus className="w-4 h-4" />
            Add a Feature
          </button>
          {showAddMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-10 py-1">
              <button
                type="button"
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-base-200 transition ${hasRecentPlays ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() => !hasRecentPlays && addFeature({ type: 'recentPlays', leaderboards: getDefaultLeaderboards(user) })}
              >
                <div className="font-medium">Recent Plays</div>
                <div className="text-xs text-base-content/50">{FEATURE_DESCRIPTIONS.recentPlays}</div>
                {hasRecentPlays && <div className="text-xs text-warning mt-0.5">Already added</div>}
              </button>
              <button
                type="button"
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-base-200 transition ${!defaultPack ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() =>
                  defaultPack &&
                  addFeature({
                    type: 'packLeaderboard',
                    packId: defaultPack.id,
                    packName: defaultPack.name,
                    bannerUrl: bestBannerUrl(defaultPack),
                    difficulty: 'challenge',
                    leaderboards: getDefaultLeaderboards(user),
                  })
                }
              >
                <div className="font-medium">Pack Leaderboard</div>
                <div className="text-xs text-base-content/50">{FEATURE_DESCRIPTIONS.packLeaderboard}</div>
                {!defaultPack && <div className="text-xs text-base-content/40 mt-0.5">No eligible packs available</div>}
              </button>
              <button
                type="button"
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-base-200 transition ${hasCurrentSession ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() => !hasCurrentSession && addFeature({ type: 'currentSession' })}
              >
                <div className="font-medium">Current Session</div>
                <div className="text-xs text-base-content/50">{FEATURE_DESCRIPTIONS.currentSession}</div>
                {hasCurrentSession && <div className="text-xs text-warning mt-0.5">Already added</div>}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-base-content/50">Maximum of 5 features reached.</p>
      )}

      {/* Live preview */}
      {features.length > 0 && <WidgetPreview url={previewUrl} width={widgetWidth} height={widgetHeight} />}

      <div className="flex justify-between pt-2">
        <button type="button" className="btn btn-ghost gap-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button type="button" className="btn btn-primary gap-2" onClick={onNext} disabled={features.length === 0}>
          Next: Appearance
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ---- Step 3: Appearance ----

const AppearanceStep: React.FC<{
  selectedTheme: string;
  setSelectedTheme: (t: string) => void;
  compatMode: boolean;
  previewUrl: string;
  widgetWidth: number;
  widgetHeight: number;
  onBack: () => void;
  onNext: () => void;
}> = ({ selectedTheme, setSelectedTheme, compatMode, previewUrl, widgetWidth, widgetHeight, onBack, onNext }) => (
  <div className="space-y-5">
    <WidgetPreview url={previewUrl} width={widgetWidth} height={widgetHeight} />

    <div>
      <label className="text-sm font-semibold text-base-content block mb-2">Theme</label>
      <select className="select select-bordered w-full" value={selectedTheme} onChange={(e) => setSelectedTheme(e.target.value)} disabled={compatMode}>
        {AVAILABLE_THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {compatMode ? (
        <p className="text-xs text-base-content/50 mt-1">Theme is disabled in compatibility mode (set in Setup Stream)</p>
      ) : (
        <p className="text-xs text-base-content/50 mt-1">Light themes may show a white background in this preview — they display correctly in OBS.</p>
      )}
    </div>

    <div className="flex justify-between pt-2">
      <button type="button" className="btn btn-ghost gap-2" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>
      <button type="button" className="btn btn-primary gap-2" onClick={onNext}>
        Next: Setup Stream
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// ---- Step 4: Setup Stream ----

const SetupStreamStep: React.FC<{
  widgetUrl: string;
  widgetWidth: number;
  widgetHeight: number;
  compatMode: boolean;
  setCompatMode: (v: boolean) => void;
  previewUrl: string;
  onBack: () => void;
}> = ({ widgetUrl, widgetWidth, widgetHeight, compatMode, setCompatMode, previewUrl, onBack }) => {
  const [copied, setCopied] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [bubbleKey, setBubbleKey] = useState(0);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(widgetUrl);
    setCopied(true);
    setHasCopied(true);
    setBubbleKey((k) => k + 1);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <WidgetPreview url={previewUrl} width={widgetWidth} height={widgetHeight} />

      {/* Compat mode */}
      <div className="border border-base-300/40 rounded-lg p-3 bg-base-200/30">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-primary mt-0.5"
            checked={compatMode}
            onChange={(e) => setCompatMode(e.target.checked)}
          />
          <div>
            <div className="text-sm font-medium">Compatibility Mode</div>
            <div className="text-xs text-base-content/60 mt-0.5">
              Use if OBS Studio &lt; v31 or using Streamlabs. Themes will be disabled and replaced with a built-in dark style.
            </div>
          </div>
        </label>
      </div>

      {/* OBS Steps */}
      <div>
        <div className="text-sm font-semibold text-base-content mb-3">Add to OBS Studio</div>
        <ol className="space-y-5">
          <li className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-content text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              1
            </div>
            <div>
              <div className="text-sm font-medium">Add a Browser Source</div>
              <div className="text-xs text-base-content/60 mt-0.5">
                In OBS, click <strong>+</strong> in the Sources panel → select <strong>Browser</strong>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-content text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              2
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium mb-1.5">Paste the URL</div>
              <div className="flex gap-2">
                <input type="text" value={widgetUrl} readOnly className="input input-sm input-bordered flex-1 font-mono text-xs" />
                <button className="btn btn-sm btn-primary flex-shrink-0 gap-1.5" onClick={copyToClipboard}>
                  {copied ? (
                    <>
                      <CheckCheck className="w-3.5 h-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-content text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              3
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Set the dimensions</div>
              <DimensionBubble key={bubbleKey} width={widgetWidth} height={widgetHeight} postCopy={hasCopied} />
            </div>
          </li>
        </ol>
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" className="btn btn-ghost gap-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
    </div>
  );
};

// ---- Main component ----

export const WidgetSection: React.FC = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedTheme, setSelectedTheme] = useState('arrow-blue');
  const [compatMode, setCompatMode] = useState(false);
  const [features, setFeatures] = useState<WidgetFeatureConfig[]>([
    { type: 'currentSession' },
    { type: 'recentPlays', leaderboards: getDefaultLeaderboards(user) },
  ]);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [packs, setPacks] = useState<PackListItem[]>([]);

  useEffect(() => {
    listPacks({ eligibleOnly: true, limit: 100 })
      .then((res) => setPacks(res.data.filter((p) => ELIGIBLE_PACK_IDS.includes(p.id))))
      .catch(() => {});
  }, []);

  const config: WidgetConfig = { version: 1, orientation, features };
  const encodedConfig = encodeWidgetConfig(config);
  const { width: widgetWidth, height: widgetHeight } = getWidgetDimensions(config);

  const params = new URLSearchParams();
  if (user?.id) params.set('userId', user.id.toString());
  if (!compatMode) params.set('theme', selectedTheme);
  params.set('config', encodedConfig);
  if (compatMode) params.set('compat', 'true');
  const widgetUrl = `${window.location.origin}/widget/streamer?${params.toString()}`;

  return (
    <div>
      <StepIndicator current={step} onGoTo={setStep} />

      {step === 1 && <LayoutStep orientation={orientation} setOrientation={setOrientation} onNext={() => setStep(2)} />}
      {step === 2 && (
        <FeaturesStep
          features={features}
          setFeatures={setFeatures}
          packs={packs}
          user={user}
          previewUrl={widgetUrl}
          widgetWidth={widgetWidth}
          widgetHeight={widgetHeight}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <AppearanceStep
          selectedTheme={selectedTheme}
          setSelectedTheme={setSelectedTheme}
          compatMode={compatMode}
          previewUrl={widgetUrl}
          widgetWidth={widgetWidth}
          widgetHeight={widgetHeight}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <SetupStreamStep
          widgetUrl={widgetUrl}
          widgetWidth={widgetWidth}
          widgetHeight={widgetHeight}
          compatMode={compatMode}
          setCompatMode={setCompatMode}
          previewUrl={widgetUrl}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
};
