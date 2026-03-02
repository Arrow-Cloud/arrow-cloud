import React, { useState, useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Share2, Copy, Check, Loader2 } from 'lucide-react';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import type { PlayDetails } from '../../schemas/apiSchemas';

interface ShareDialogProps {
  play: PlayDetails;
  isOpen: boolean;
  onClose: () => void;
}

const SHARE_SERVICE_URL = (import.meta as any).env?.VITE_SHARE_SERVICE_URL || 'https://share.arrowcloud.dance';

const SHARE_SETTINGS_LS_KEY = 'shareDialogSettings';

type ShareSystem = 'H.EX' | 'EX' | 'ITG';

interface ShareSettings {
  primary: ShareSystem;
  secondary: ShareSystem;
}

const getStoredShareSettings = (): ShareSettings | null => {
  try {
    const stored = localStorage.getItem(SHARE_SETTINGS_LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.primary && parsed.secondary) {
        return parsed as ShareSettings;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

const saveShareSettings = (primary: ShareSystem, secondary: ShareSystem) => {
  localStorage.setItem(SHARE_SETTINGS_LS_KEY, JSON.stringify({ primary, secondary }));
};

// Map frontend leaderboard IDs to share service system names
const toShareSystem = (leaderboardId: string): ShareSystem => {
  if (leaderboardId === 'HardEX') return 'H.EX';
  return leaderboardId as 'EX' | 'ITG';
};

export const ShareDialog: React.FC<ShareDialogProps> = ({ play, isOpen, onClose }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const { formatMessage } = useIntl();

  // Initialize from localStorage if available, otherwise use active leaderboard
  const [primarySystem, setPrimarySystem] = useState<ShareSystem>(() => {
    const stored = getStoredShareSettings();
    return stored?.primary ?? toShareSystem(activeLeaderboard);
  });
  const [secondarySystem, setSecondarySystem] = useState<ShareSystem>(() => {
    const stored = getStoredShareSettings();
    if (stored?.secondary) return stored.secondary;
    const primary = toShareSystem(activeLeaderboard);
    return primary === 'EX' ? 'ITG' : 'EX';
  });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    saveShareSettings(primarySystem, secondarySystem);
  }, [primarySystem, secondarySystem]);

  if (!isOpen) return null;

  // Only include query params if not using defaults (p=EX&s=ITG)
  const isDefault = primarySystem === 'EX' && secondarySystem === 'ITG';
  const queryParams = isDefault ? '' : `?p=${primarySystem}&s=${secondarySystem}`;
  const shareUrl = `${SHARE_SERVICE_URL}/play/${play.id}${queryParams}`;
  const imageUrl = `${SHARE_SERVICE_URL}/image/${play.id}?p=${primarySystem}&s=${secondarySystem}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-xl">
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Share2 size={20} />
          <FormattedMessage defaultMessage="Share Play" id="xGl07L" description="Title for share dialog" />
        </h3>
        <p className="text-sm text-base-content/70 mb-4">
          <FormattedMessage
            defaultMessage="Images may take a few seconds to generate for the first time"
            id="beNMGy"
            description="Subtitle explaining image generation delay"
          />
        </p>

        {/* Leaderboard Selection - Compact */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label py-1">
              <span className="label-text text-sm">
                <FormattedMessage defaultMessage="Primary" id="urteJe" description="Label for primary leaderboard" />
              </span>
            </label>
            <select
              className="select select-bordered select-sm w-full"
              value={primarySystem}
              onChange={(e) => {
                const newPrimary = e.target.value as ShareSystem;
                setPrimarySystem(newPrimary);
                // If secondary matches new primary, switch it to something else
                if (secondarySystem === newPrimary) {
                  const alternatives: ShareSystem[] = ['H.EX', 'EX', 'ITG'];
                  const otherOption = alternatives.find((s) => s !== newPrimary)!;
                  setSecondarySystem(otherOption);
                }
                setImageLoading(true);
              }}
            >
              <option value="H.EX" disabled={secondarySystem === 'H.EX'}>
                {formatMessage({ defaultMessage: 'H.EX', id: 'Gdrt7M', description: 'H.EX scoring system name' })}
              </option>
              <option value="EX" disabled={secondarySystem === 'EX'}>
                {formatMessage({ defaultMessage: 'EX', id: 'gE+yeP', description: 'EX scoring system name' })}
              </option>
              <option value="ITG" disabled={secondarySystem === 'ITG'}>
                {formatMessage({ defaultMessage: 'ITG', id: 'vgg5G0', description: 'ITG scoring system name' })}
              </option>
            </select>
          </div>
          <div>
            <label className="label py-1">
              <span className="label-text text-sm">
                <FormattedMessage defaultMessage="Secondary" id="ypbD+D" description="Label for secondary leaderboard" />
              </span>
            </label>
            <select
              className="select select-bordered select-sm w-full"
              value={secondarySystem}
              onChange={(e) => {
                const newSecondary = e.target.value as ShareSystem;
                setSecondarySystem(newSecondary);
                // If primary matches new secondary, switch it to something else
                if (primarySystem === newSecondary) {
                  const alternatives: ShareSystem[] = ['H.EX', 'EX', 'ITG'];
                  const otherOption = alternatives.find((s) => s !== newSecondary)!;
                  setPrimarySystem(otherOption);
                }
                setImageLoading(true);
              }}
            >
              <option value="H.EX" disabled={primarySystem === 'H.EX'}>
                {formatMessage({ defaultMessage: 'H.EX', id: 'Gdrt7M', description: 'H.EX scoring system name' })}
              </option>
              <option value="EX" disabled={primarySystem === 'EX'}>
                {formatMessage({ defaultMessage: 'EX', id: 'gE+yeP', description: 'EX scoring system name' })}
              </option>
              <option value="ITG" disabled={primarySystem === 'ITG'}>
                {formatMessage({ defaultMessage: 'ITG', id: 'vgg5G0', description: 'ITG scoring system name' })}
              </option>
            </select>
          </div>
        </div>

        {/* Image Preview */}
        <div className="mb-4">
          <div className="relative rounded-lg overflow-hidden bg-base-200" style={{ minHeight: '400px' }}>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-base-200">
                <Loader2 size={32} className="animate-spin text-primary" />
              </div>
            )}
            <img
              src={imageUrl}
              alt={formatMessage({ defaultMessage: 'Share preview', id: 'gXxTKr', description: 'Alt text for share image preview' })}
              className="w-full h-full"
              onLoad={() => setImageLoading(false)}
              onError={() => setImageLoading(false)}
            />
          </div>
        </div>

        {/* Action Buttons - Compact */}
        <div className="flex gap-2 mb-4">
          <button className="btn btn-primary btn-sm gap-2 flex-1" onClick={handleCopyUrl}>
            {copiedUrl ? <Check size={16} /> : <Copy size={16} />}
            {copiedUrl ? (
              <FormattedMessage defaultMessage="Copied!" id="yhBoww" description="Text shown after copying" />
            ) : (
              <FormattedMessage defaultMessage="Copy URL" id="/tnCO4" description="Copy URL button text" />
            )}
          </button>
        </div>

        {/* URL Display - Compact */}
        <div className="mb-4">
          <input
            type="text"
            className="input input-bordered input-sm w-full font-mono text-xs"
            value={shareUrl}
            readOnly
            onClick={(e) => e.currentTarget.select()}
          />
        </div>

        {/* Close Button */}
        <div className="modal-action mt-2">
          <button className="btn btn-sm" onClick={onClose}>
            <FormattedMessage defaultMessage="Close" id="4BH2f8" description="Close button text" />
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
};
