import React, { useState, useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
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
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react';

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

const LB_LABELS: Record<LeaderboardKey, string> = { HardEX: 'H.EX', EX: 'EX', ITG: 'ITG' };
const ALL_LB_KEYS: LeaderboardKey[] = ['HardEX', 'EX', 'ITG'];
const DIFF_LABELS: Record<PackLeaderboardDifficulty, string> = { medium: 'Medium', hard: 'Hard', challenge: 'Challenge' };

const LB_ID_MAP: Record<number, LeaderboardKey> = { 4: 'HardEX', 2: 'EX', 3: 'ITG' };

function getDefaultLeaderboards(user: any): LeaderboardKey[] {
  const prefs: number[] = user?.preferredLeaderboards ?? [];
  const mapped = prefs.map((id: number) => LB_ID_MAP[id]).filter(Boolean) as LeaderboardKey[];
  return mapped.length > 0 ? mapped : ['EX'];
}

function bestBannerUrl(pack: PackListItem): string | null {
  return pack.mdBannerUrl ?? pack.bannerUrl ?? null;
}

function featureLabel(f: WidgetFeatureConfig): string {
  if (f.type === 'profile') return 'Profile';
  if (f.type === 'recentPlays') return 'Recent Plays';
  if (f.type === 'packLeaderboard') return `Pack Leaderboard — ${f.packName || f.packId}`;
  return 'Unknown';
}

// ---- Feature card sub-components ----

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
              if (checked && selected.length === 1) return; // keep at least 1
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
}> = ({ feature, packs, onChange }) => {
  const intl = useIntl();
  return (
    <div className="space-y-3 mt-2">
      <div>
        <label className="text-xs font-semibold text-base-content/70 mb-1 block">
          {intl.formatMessage({ id: 'mFmFwY', defaultMessage: 'Pack', description: 'Pack select label in widget config' })}
        </label>
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
        <label className="text-xs font-semibold text-base-content/70 mb-1 block">
          {intl.formatMessage({ id: 'Ju1dPo', defaultMessage: 'Difficulty', description: 'Difficulty select label in widget config' })}
        </label>
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
        <label className="text-xs font-semibold text-base-content/70 mb-1 block">
          {intl.formatMessage({ id: 'RCi2iU', defaultMessage: 'Scoring Systems', description: 'Scoring systems label in widget pack leaderboard config' })}
        </label>
        <LeaderboardCheckboxes selected={feature.leaderboards} onChange={(keys) => onChange({ ...feature, leaderboards: keys })} />
      </div>
    </div>
  );
};

const RecentPlaysConfig: React.FC<{
  feature: Extract<WidgetFeatureConfig, { type: 'recentPlays' }>;
  onChange: (f: Extract<WidgetFeatureConfig, { type: 'recentPlays' }>) => void;
}> = ({ feature, onChange }) => {
  const intl = useIntl();
  return (
    <div className="mt-2">
      <label className="text-xs font-semibold text-base-content/70 mb-1 block">
        {intl.formatMessage({ id: 'r8saR8', defaultMessage: 'Scoring Systems', description: 'Scoring systems label in widget recent plays config' })}
      </label>
      <LeaderboardCheckboxes selected={feature.leaderboards} onChange={(keys) => onChange({ ...feature, leaderboards: keys })} />
    </div>
  );
};

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
  const intl = useIntl();
  const hasConfig = feature.type !== 'profile';
  const [expanded, setExpanded] = useState(hasConfig);

  return (
    <div className="border border-base-300/50 rounded-lg bg-base-200/40">
      <div className="flex items-center gap-2 p-3">
        <button type="button" className="flex-1 text-left text-sm font-medium" onClick={() => hasConfig && setExpanded((e) => !e)}>
          <span className="text-base-content/50 mr-2 text-xs">
            {intl.formatMessage({ id: 'uj5W+N', defaultMessage: '#{rank}', description: 'Feature position indicator' }, { rank: index + 1 })}
          </span>
          {featureLabel(feature)}
          {hasConfig && (
            <span className="ml-2 text-xs text-base-content/40">
              {expanded ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-xs" onClick={onMoveUp} disabled={index === 0}>
            <ChevronUp className="w-3 h-3" />
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onMoveDown} disabled={index === total - 1}>
            <ChevronDown className="w-3 h-3" />
          </button>
          <button type="button" className="btn btn-ghost btn-xs text-error" onClick={onRemove}>
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      {expanded && hasConfig && (
        <div className="px-3 pb-3 border-t border-base-300/30 pt-2">
          {feature.type === 'recentPlays' && <RecentPlaysConfig feature={feature} onChange={(f) => onChange(f)} />}
          {feature.type === 'packLeaderboard' && <PackLeaderboardConfig feature={feature} packs={packs} onChange={(f) => onChange(f)} />}
        </div>
      )}
    </div>
  );
};

// ---- Main wizard component ----

export const WidgetSection: React.FC = () => {
  const { user } = useAuth();
  const intl = useIntl();
  const [selectedTheme, setSelectedTheme] = useState('arrow-blue');
  const [compatMode, setCompatMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const [features, setFeatures] = useState<WidgetFeatureConfig[]>([{ type: 'profile' }]);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [packs, setPacks] = useState<PackListItem[]>([]);

  // Close add menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load eligible packs once, filtering to known eligible IDs client-side as a safety net
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

  const hasProfile = features.some((f) => f.type === 'profile');
  const hasRecentPlays = features.some((f) => f.type === 'recentPlays');
  const featureCount = features.length;

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

  const removeFeature = (i: number) => {
    setFeatures(features.filter((_, idx) => idx !== i));
  };

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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(widgetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const defaultPack = packs[0];

  return (
    <div className="space-y-6">
      {/* Global Settings */}
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap items-end">
          {/* Orientation */}
          <div>
            <label className="label py-0 mb-1">
              <span className="label-text font-semibold text-sm">
                {intl.formatMessage({ id: 'Jhvn5z', defaultMessage: 'Orientation', description: 'Widget orientation label' })}
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`btn btn-sm ${orientation === 'horizontal' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setOrientation('horizontal')}
              >
                {intl.formatMessage({ id: 'EXu3i+', defaultMessage: 'Horizontal', description: 'Horizontal orientation option' })}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${orientation === 'vertical' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setOrientation('vertical')}
              >
                {intl.formatMessage({ id: 'TTN+1v', defaultMessage: 'Vertical', description: 'Vertical orientation option' })}
              </button>
            </div>
          </div>

          {/* Theme */}
          <div className="flex-1 min-w-[160px]">
            <label className="label py-0 mb-1">
              <span className="label-text font-semibold text-sm">
                {intl.formatMessage({ id: '7Ha4j8', defaultMessage: 'Theme', description: 'Widget theme label' })}
              </span>
            </label>
            <select
              className="select select-bordered select-sm w-full"
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              disabled={compatMode}
            >
              {AVAILABLE_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Compat */}
          <div>
            <label className="label cursor-pointer justify-start gap-2 py-0">
              <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={compatMode} onChange={(e) => setCompatMode(e.target.checked)} />
              <span className="label-text text-sm">
                {intl.formatMessage({ id: 'Qa4UgA', defaultMessage: 'Compatibility Mode', description: 'Compat mode checkbox label' })}
              </span>
            </label>
            <div className="text-xs text-base-content/50 ml-6">
              {intl.formatMessage({ id: '1JZBtk', defaultMessage: 'For OBS older than v31', description: 'Compat mode hint text' })}
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div>
        <label className="label py-0 mb-2">
          <span className="label-text font-semibold">
            {intl.formatMessage({ id: 'z5zM6j', defaultMessage: 'Features', description: 'Features section label' })}
          </span>
        </label>
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
        </div>

        {/* Add Feature */}
        {featureCount < 5 && (
          <div className="relative mt-2" ref={addMenuRef}>
            <button type="button" className="btn btn-sm btn-outline gap-1" onClick={() => setShowAddMenu((v) => !v)}>
              <Plus className="w-3.5 h-3.5" />
              {intl.formatMessage({ id: 'jPoSOu', defaultMessage: 'Add Feature', description: 'Add feature button label' })}
            </button>
            {showAddMenu && (
              <div className="absolute top-full left-0 mt-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-10 min-w-[220px] py-1">
                <button
                  type="button"
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-base-200 transition ${hasProfile ? 'opacity-40 cursor-not-allowed' : ''}`}
                  onClick={() => !hasProfile && addFeature({ type: 'profile' })}
                >
                  {intl.formatMessage({ id: 'ndGG1t', defaultMessage: 'Profile', description: 'Profile feature name in add menu' })}
                  {hasProfile && (
                    <span className="ml-2 text-xs text-base-content/50">
                      {intl.formatMessage({ id: 'pT7MXb', defaultMessage: 'already added', description: 'Already added indicator in feature menu' })}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-base-200 transition ${hasRecentPlays ? 'opacity-40 cursor-not-allowed' : ''}`}
                  onClick={() => !hasRecentPlays && addFeature({ type: 'recentPlays', leaderboards: getDefaultLeaderboards(user) })}
                >
                  {intl.formatMessage({ id: '/PBHyq', defaultMessage: 'Recent Plays', description: 'Recent plays feature name in add menu' })}
                  {hasRecentPlays && (
                    <span className="ml-2 text-xs text-base-content/50">
                      {intl.formatMessage({ id: 'pT7MXb', defaultMessage: 'already added', description: 'Already added indicator in feature menu' })}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-base-200 transition ${!defaultPack ? 'opacity-40 cursor-not-allowed' : ''}`}
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
                  {intl.formatMessage({ id: 'B6ktnP', defaultMessage: 'Pack Leaderboard', description: 'Pack leaderboard feature name in add menu' })}
                  {!defaultPack && (
                    <span className="ml-2 text-xs text-base-content/50">
                      {intl.formatMessage({ id: 'VlCXVh', defaultMessage: 'no packs available', description: 'No packs available indicator' })}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
        {featureCount >= 5 && (
          <p className="text-xs text-base-content/50 mt-2">
            {intl.formatMessage({ id: 'TL6lMm', defaultMessage: 'Maximum of 5 features reached.', description: 'Max features reached message' })}
          </p>
        )}
      </div>

      {/* Preview */}
      <div>
        <label className="label py-0 mb-2">
          <span className="label-text font-semibold">
            {intl.formatMessage({ id: 'Lh3mLz', defaultMessage: 'Preview', description: 'Preview section label' })}
          </span>
        </label>
        <div className="bg-base-200 rounded-lg p-4 flex items-center justify-center overflow-auto">
          <iframe src={widgetUrl} width={widgetWidth} height={widgetHeight} className="border-0 rounded shadow-xl" style={{ backgroundColor: 'transparent' }} />
        </div>
      </div>

      {/* OBS Setup */}
      <div className="alert alert-info">
        <div className="flex flex-col gap-2 text-sm w-full">
          <div className="font-semibold">{intl.formatMessage({ id: '0a8qQn', defaultMessage: 'OBS Setup', description: 'OBS setup section heading' })}</div>
          {!compatMode && (
            <div className="text-warning font-medium">
              {intl.formatMessage({ id: 'pilwMh', defaultMessage: 'OBS Studio v31 or higher required for themes.', description: 'OBS version warning' })}
            </div>
          )}
          <div className="flex flex-col gap-1 text-base-content/80">
            <div>{intl.formatMessage({ id: 'xHjitK', defaultMessage: '1. Add a Browser Source in OBS', description: 'OBS setup step 1' })}</div>
            <div>{intl.formatMessage({ id: 'FBSgTm', defaultMessage: '2. Paste the URL below', description: 'OBS setup step 2' })}</div>
            <div>
              {intl.formatMessage(
                { id: 'a9j6HF', defaultMessage: '3. Set Width: {width}px, Height: {height}px', description: 'OBS setup step 3 with dimensions' },
                { width: widgetWidth, height: widgetHeight },
              )}
            </div>
            <div>
              {intl.formatMessage({
                id: 'D06P28',
                defaultMessage: '4. Enable "Shutdown source when not visible" and "Refresh browser when scene becomes active"',
                description: 'OBS setup step 4',
              })}
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            <input type="text" value={widgetUrl} readOnly className="input input-sm input-bordered flex-1 font-mono text-xs" />
            <button className="btn btn-sm btn-primary" onClick={copyToClipboard}>
              {copied
                ? intl.formatMessage({ id: 'EDgCxn', defaultMessage: 'Copied!', description: 'URL copied confirmation' })
                : intl.formatMessage({ id: 'DsKB1w', defaultMessage: 'Copy URL', description: 'Copy URL button label' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
