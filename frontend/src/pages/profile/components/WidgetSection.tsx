import React, { useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { useAuth } from '../../../contexts/AuthContext';

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

const WIDGET_LEADERBOARDS = [
  { id: 'HardEX', label: 'H.EX' },
  { id: 'EX', label: 'EX' },
  { id: 'ITG', label: 'ITG' },
];

const WIDGET_FEATURES = [
  { id: 'main', label: 'Main Information', description: 'Your rank and points', disabled: true },
  { id: 'leaderboard', label: 'Overall Leaderboard', description: 'Show top players and rivals' },
  { id: 'lastPlayed', label: 'Last Played', description: 'Show your most recent song' },
];

export const WidgetSection: React.FC = () => {
  const { user } = useAuth();
  const [selectedTheme, setSelectedTheme] = useState('arrow-blue');
  const [selectedLeaderboards, setSelectedLeaderboards] = useState<string[]>(['HardEX', 'EX', 'ITG']);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['main', 'leaderboard', 'lastPlayed']);
  const [rotationDelay, setRotationDelay] = useState(30);
  const [compatMode, setCompatMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleLeaderboard = (id: string) => {
    setSelectedLeaderboards((prev) => {
      if (prev.includes(id)) {
        // Don't allow deselecting the last leaderboard
        if (prev.length === 1) return prev;
        return prev.filter((lb) => lb !== id);
      }
      return [...prev, id];
    });
  };

  const toggleFeature = (id: string) => {
    setSelectedFeatures((prev) => {
      if (prev.includes(id)) {
        return prev.filter((f) => f !== id);
      }
      return [...prev, id];
    });
  };

  // Build widget URL with all parameters
  const params = new URLSearchParams();
  if (user?.id) {
    params.set('userId', user.id.toString());
  }
  if (!compatMode) {
    params.set('theme', selectedTheme);
  }
  if (selectedLeaderboards.length > 0) {
    params.set('leaderboards', selectedLeaderboards.join(','));
  }
  params.set('delay', rotationDelay.toString());
  params.set('features', selectedFeatures.join(','));
  if (compatMode) {
    params.set('compat', 'true');
  }
  const widgetUrl = `${window.location.origin}/widget/streamer?${params.toString()}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate widget dimensions based on selected features
  const baseWidth = 260;
  const leaderboardWidth = selectedFeatures.includes('leaderboard') ? 260 : 0;
  const lastPlayedWidth = selectedFeatures.includes('lastPlayed') ? 240 : 0;
  const widgetWidth = baseWidth + leaderboardWidth + lastPlayedWidth;
  const widgetHeight = 300;

  return (
    <div className="space-y-6">
      {/* Compatibility Mode */}
      <div>
        <label className="label cursor-pointer justify-start gap-3">
          <input type="checkbox" className="checkbox checkbox-primary" checked={compatMode} onChange={(e) => setCompatMode(e.target.checked)} />
          <div>
            <span className="label-text font-semibold">
              <FormattedMessage defaultMessage="Compatibility Mode" description="Label for compatibility mode checkbox" id="THr3aV" />
            </span>
            <div className="text-sm text-base-content/60">
              <FormattedMessage
                defaultMessage="Use fallback colors for older OBS versions (disables theme selection)"
                description="Helper text for compatibility mode"
                id="A5yRgM"
              />
            </div>
          </div>
        </label>
      </div>

      {/* Theme Selector */}
      <div>
        <label className="label">
          <span className="label-text font-semibold">
            <FormattedMessage defaultMessage="Widget Theme" description="Label for widget theme selector" id="dDM60o" />
          </span>
        </label>
        <div className="flex gap-4">
          <select
            className="select select-bordered w-full max-w-xs"
            value={selectedTheme}
            onChange={(e) => setSelectedTheme(e.target.value)}
            disabled={compatMode}
          >
            {AVAILABLE_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Widget Features */}
      <div>
        <label className="label">
          <span className="label-text font-semibold">
            <FormattedMessage defaultMessage="Widget Features" description="Label for widget features selection" id="ZlE4+d" />
          </span>
        </label>
        <div className="space-y-2">
          {WIDGET_FEATURES.map((feature) => (
            <label
              key={feature.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition ${feature.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-base-200'}`}
            >
              <input
                type="checkbox"
                className="checkbox checkbox-primary mt-0.5"
                checked={selectedFeatures.includes(feature.id)}
                onChange={() => !feature.disabled && toggleFeature(feature.id)}
                disabled={feature.disabled}
              />
              <div className="flex-1">
                <div className="font-medium">{feature.label}</div>
                <div className="text-sm text-base-content/60">{feature.description}</div>
              </div>
            </label>
          ))}
        </div>
        <label className="label">
          <span className="label-text-alt text-base-content/60">
            <FormattedMessage defaultMessage="Choose what information to display in the widget" description="Helper text for feature selection" id="C9Lob8" />
          </span>
        </label>
      </div>

      {/* Leaderboard Selection */}
      <div>
        <label className="label">
          <span className="label-text font-semibold">
            <FormattedMessage defaultMessage="Leaderboards to Show" description="Label for leaderboard selection" id="dPQaz6" />
          </span>
        </label>
        <div className="flex gap-4">
          {WIDGET_LEADERBOARDS.map((lb) => (
            <label key={lb.id} className="label cursor-pointer gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={selectedLeaderboards.includes(lb.id)}
                onChange={() => toggleLeaderboard(lb.id)}
                disabled={selectedLeaderboards.length === 1 && selectedLeaderboards.includes(lb.id)}
              />
              <span className="label-text">{lb.label}</span>
            </label>
          ))}
        </div>
        <label className="label">
          <span className="label-text-alt text-base-content/60">
            <FormattedMessage
              defaultMessage="Select which leaderboards to cycle through (at least one required)"
              description="Helper text for leaderboard selection"
              id="CcMJR2"
            />
          </span>
        </label>
      </div>

      {/* Rotation Delay */}
      <div>
        <label className="label">
          <span className="label-text font-semibold">
            <FormattedMessage defaultMessage="Rotation Delay" description="Label for rotation delay slider" id="MZJzFb" />
          </span>
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="10"
            max="120"
            value={rotationDelay}
            onChange={(e) => setRotationDelay(Number(e.target.value))}
            className="range range-primary flex-1"
            step="5"
          />
          <span className="text-sm font-mono w-16 text-right">{rotationDelay}</span>
        </div>
        <label className="label">
          <span className="label-text-alt text-base-content/60">
            <FormattedMessage
              defaultMessage="How long to show each leaderboard before switching (10-120 seconds)"
              description="Helper text for rotation delay"
              id="di9f3h"
            />
          </span>
        </label>
      </div>

      {/* Widget Preview */}
      <div>
        <label className="label">
          <span className="label-text font-semibold">
            <FormattedMessage defaultMessage="Preview" description="Label for widget preview section" id="eRpp8o" />
          </span>
        </label>
        <div className="bg-base-200 rounded-lg p-4 flex items-center justify-center overflow-x-auto">
          <iframe src={widgetUrl} width={widgetWidth} height={widgetHeight} className="border-0 rounded shadow-xl" style={{ backgroundColor: 'transparent' }} />
        </div>
        <label className="label">
          <span className="label-text-alt text-base-content/60">
            <FormattedMessage
              defaultMessage="Widget dimensions: {width}×{height}px"
              description="Shows widget dimensions"
              id="X2YpwH"
              values={{ width: widgetWidth, height: widgetHeight }}
            />
          </span>
        </label>
      </div>

      {/* Widget URL */}
      <div>
        <label className="label">
          <span className="label-text font-semibold">
            <FormattedMessage defaultMessage="Widget URL" description="Label for widget URL" id="2d72YH" />
          </span>
        </label>
        <div className="flex gap-2">
          <input type="text" value={widgetUrl} readOnly className="input input-bordered flex-1 font-mono text-sm" />
          <button className="btn btn-primary" onClick={() => copyToClipboard(widgetUrl)}>
            {copied ? (
              <FormattedMessage defaultMessage="Copied!" description="Button text after copying" id="aS/YuY" />
            ) : (
              <FormattedMessage defaultMessage="Copy URL" description="Button text to copy URL" id="BAchyT" />
            )}
          </button>
        </div>
        <label className="label">
          <span className="label-text-alt text-base-content/60">
            <FormattedMessage defaultMessage="Use this URL in OBS as a Browser Source" description="Helper text for widget URL" id="ebpbUs" />
          </span>
        </label>
      </div>

      {/* Instructions */}
      <div className="alert alert-info">
        <div className="flex flex-col gap-2 text-sm">
          <div className="font-semibold">
            <FormattedMessage defaultMessage="How to use in OBS:" description="Instructions heading" id="Dya6QR" />
          </div>
          <div className="text-warning font-medium mb-1">
            <FormattedMessage
              defaultMessage="Note: OBS Studio version 31 or higher is required for proper display."
              description="OBS version requirement warning"
              id="71hxBe"
            />
          </div>
          <ol className="list-decimal list-inside space-y-1 text-base-content/80">
            <li>
              <FormattedMessage defaultMessage="Add a new Browser Source in OBS" description="OBS instruction step 1" id="mFXNP+" />
            </li>
            <li>
              <FormattedMessage defaultMessage="Paste the Widget URL above" description="OBS instruction step 2" id="ibF5yl" />
            </li>
            <li>
              <FormattedMessage
                defaultMessage="Set Width: {width}, Height: {height}"
                description="OBS instruction step 3"
                id="SsRETH"
                values={{ width: widgetWidth, height: widgetHeight }}
              />
            </li>
            <li>
              <FormattedMessage
                defaultMessage="Check 'Shutdown source when not visible' and 'Refresh browser when scene becomes active'"
                description="OBS instruction step 4"
                id="QYJaeC"
              />
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
