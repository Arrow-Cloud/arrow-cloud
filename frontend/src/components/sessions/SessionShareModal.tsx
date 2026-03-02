import React, { useState, useEffect, useMemo } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Share2, Copy, Check, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { GradeImage } from '../GradeImage';
import { DifficultyChip } from '../DifficultyChip';
import { BannerImage } from '../ui';
import { getSession } from '../../services/api';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { backendNameFor, type LeaderboardId } from '../../types/leaderboards';
import type { SessionPlay } from '../../schemas/apiSchemas';

interface SessionShareModalProps {
  sessionId: number;
  isOpen: boolean;
  onClose: () => void;
}

const SHARE_SERVICE_URL = (import.meta as any).env?.VITE_SHARE_SERVICE_URL || 'https://share.arrowcloud.dance';
const MAX_SELECTED_PLAYS = 5;

type ModalStep = 'select' | 'preview';

/**
 * Get the leaderboard entry matching the active preference
 */
function getActiveLeaderboardEntry(play: SessionPlay, activeLeaderboard: 'HardEX' | 'EX' | 'ITG') {
  const names = backendNameFor(activeLeaderboard as LeaderboardId);
  for (const n of names) {
    const entry = play.leaderboards.find((lb) => lb.type === n || lb.type.toLowerCase().includes(n.toLowerCase()));
    if (entry) return entry;
  }
  const short = activeLeaderboard === 'ITG' ? 'Money' : activeLeaderboard;
  const entry = play.leaderboards.find((lb) => lb.type.toLowerCase().includes(short.toLowerCase()));
  if (entry) return entry;
  return play.leaderboards[0] || null;
}

/**
 * Map frontend leaderboard ID to share service system name
 */
function toShareSystem(leaderboard: 'HardEX' | 'EX' | 'ITG'): string {
  if (leaderboard === 'HardEX') return 'H.EX';
  return leaderboard;
}

/**
 * Compact play card for selection list
 */
const SelectablePlayCard: React.FC<{
  play: SessionPlay;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
  activeLeaderboard: 'HardEX' | 'EX' | 'ITG';
}> = ({ play, isSelected, onToggle, disabled, activeLeaderboard }) => {
  const { formatNumber, formatMessage } = useIntl();

  // Get score for currently active leaderboard
  const entry = useMemo(() => getActiveLeaderboardEntry(play, activeLeaderboard), [play, activeLeaderboard]);
  const score = entry?.score;
  const grade = entry?.grade;

  // Score color based on leaderboard
  const scoreColor = activeLeaderboard === 'HardEX' ? '#FF69B4' : activeLeaderboard === 'EX' ? '#21CCE8' : '#FFFFFF';

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-primary/20 border-2 border-primary'
          : disabled
            ? 'bg-base-200/30 opacity-50 cursor-not-allowed'
            : 'bg-base-200/50 hover:bg-base-200/80 border-2 border-transparent'
      }`}
      onClick={() => !disabled && onToggle()}
    >
      {/* Checkbox */}
      <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={isSelected} onChange={onToggle} disabled={disabled} />

      {/* Banner thumbnail */}
      <div className="w-20 h-8 rounded overflow-hidden flex-shrink-0">
        <BannerImage
          bannerVariants={play.chart.bannerVariants}
          mdBannerUrl={play.chart.mdBannerUrl}
          smBannerUrl={play.chart.smBannerUrl}
          bannerUrl={play.chart.bannerUrl}
          alt={play.chart.title || 'Chart'}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Chart info */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{play.chart.title || formatMessage({ defaultMessage: 'Unknown', id: 'sKHFB+', description: 'Fallback for unknown chart title' })}</div>
        <div className="text-xs text-base-content/60 truncate">{play.chart.artist || formatMessage({ defaultMessage: 'Unknown Artist', id: '8QTMIv', description: 'Fallback for unknown chart artist' })}</div>
      </div>

      {/* Difficulty */}
      <DifficultyChip stepsType={play.chart.stepsType} difficulty={play.chart.difficulty} meter={play.chart.meter} />

      {/* Grade & Score */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {grade && <GradeImage grade={grade} className="h-6 w-auto" />}
        {score && (
          <span className="text-sm font-bold tabular-nums" style={{ color: scoreColor }}>
            {formatNumber(parseFloat(score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
    </div>
  );
};

export const SessionShareModal: React.FC<SessionShareModalProps> = ({ sessionId, isOpen, onClose }) => {
  const { formatMessage } = useIntl();
  const { activeLeaderboard } = useLeaderboardView();
  const [step, setStep] = useState<ModalStep>('select');
  const [selectedPlayIds, setSelectedPlayIds] = useState<number[]>([]);
  const [allPlays, setAllPlays] = useState<SessionPlay[]>([]);
  const [playsLoading, setPlaysLoading] = useState(false);
  const [playsError, setPlaysError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Fetch all plays when modal opens
  useEffect(() => {
    if (isOpen && allPlays.length === 0 && !playsLoading) {
      const fetchAllPlays = async () => {
        setPlaysLoading(true);
        setPlaysError(null);
        try {
          const data = await getSession(sessionId, { limit: 100 });
          setAllPlays(data.plays);
        } catch (err) {
          console.error('Error fetching session plays:', err);
          setPlaysError('Failed to load plays');
        } finally {
          setPlaysLoading(false);
        }
      };
      fetchAllPlays();
    }
  }, [isOpen, sessionId, allPlays.length, playsLoading]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('select');
      setSelectedPlayIds([]);
      setCopiedUrl(false);
      setImageLoading(true);
      setAllPlays([]);
      setPlaysError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const togglePlay = (playId: number) => {
    setSelectedPlayIds((prev) => {
      if (prev.includes(playId)) {
        return prev.filter((id) => id !== playId);
      }
      if (prev.length >= MAX_SELECTED_PLAYS) {
        return prev; // Don't add more than max
      }
      return [...prev, playId];
    });
  };

  const canProceed = selectedPlayIds.length > 0;

  // Build share URL with selected plays using active leaderboard
  const playIdsParam = selectedPlayIds.join(',');
  const systemParam = toShareSystem(activeLeaderboard);
  const shareUrl = `${SHARE_SERVICE_URL}/session/${sessionId}?plays=${playIdsParam}&system=${systemParam}`;
  const imageUrl = `${SHARE_SERVICE_URL}/session/image/${sessionId}?plays=${playIdsParam}&system=${systemParam}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleNext = () => {
    setStep('preview');
    setImageLoading(true);
  };

  const handleBack = () => {
    setStep('select');
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        {/* Header */}
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Share2 size={20} />
          <FormattedMessage defaultMessage="Share Session" id="JY41Vf" description="Title for session share dialog" />
        </h3>

        {step === 'select' ? (
          <>
            {/* Step 1: Play Selection */}
            <p className="text-sm text-base-content/70 mb-4">
              <FormattedMessage
                defaultMessage="Select up to {max} plays to highlight in your session share image"
                id="aNmvzp"
                description="Instructions for selecting plays to share"
                values={{ max: MAX_SELECTED_PLAYS }}
              />
            </p>

            {/* Selection count */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">
                <FormattedMessage
                  defaultMessage="{count} of {max} plays selected"
                  id="lz1Jbz"
                  description="Count of selected plays"
                  values={{ count: selectedPlayIds.length, max: MAX_SELECTED_PLAYS }}
                />
              </span>
              {selectedPlayIds.length > 0 && (
                <button className="btn btn-ghost btn-xs" onClick={() => setSelectedPlayIds([])}>
                  <FormattedMessage defaultMessage="Clear Selection" id="H7XAcz" description="Button to clear play selection" />
                </button>
              )}
            </div>

            {/* Play list with checkboxes */}
            <div className="max-h-96 overflow-y-auto space-y-2 mb-4 pr-1">
              {playsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : playsError ? (
                <div className="text-center py-8 text-error">{playsError}</div>
              ) : allPlays.length === 0 ? (
                <div className="text-center py-8 text-base-content/60">
                  <FormattedMessage defaultMessage="No plays found" id="2cIaAb" description="Message when no plays in session" />
                </div>
              ) : (
                allPlays.map((play) => {
                  const isSelected = selectedPlayIds.includes(play.id);
                  const canSelect = isSelected || selectedPlayIds.length < MAX_SELECTED_PLAYS;

                  return (
                    <SelectablePlayCard
                      key={play.id}
                      play={play}
                      isSelected={isSelected}
                      onToggle={() => togglePlay(play.id)}
                      disabled={!canSelect}
                      activeLeaderboard={activeLeaderboard}
                    />
                  );
                })
              )}
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2">
              <button className="btn btn-sm" onClick={onClose}>
                <FormattedMessage defaultMessage="Cancel" id="qz9XeG" description="Cancel button" />
              </button>
              <button className="btn btn-primary btn-sm gap-1" onClick={handleNext} disabled={!canProceed}>
                <FormattedMessage defaultMessage="Next" id="8diw/q" description="Next button to proceed to preview" />
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Preview & Share */}
            <p className="text-sm text-base-content/70 mb-4">
              <FormattedMessage
                defaultMessage="Images may take a few seconds to generate for the first time"
                id="beNMGy"
                description="Subtitle explaining image generation delay"
              />
            </p>

            {/* Image Preview */}
            <div className="mb-4">
              <div className="relative rounded-lg overflow-hidden bg-base-200" style={{ minHeight: '300px' }}>
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-base-200">
                    <Loader2 size={32} className="animate-spin text-primary" />
                  </div>
                )}
                <img
                  src={imageUrl}
                  alt={formatMessage({
                    defaultMessage: 'Session share preview',
                    id: 'NF25+d',
                    description: 'Alt text for session share image preview',
                  })}
                  className="w-full h-full"
                  onLoad={() => setImageLoading(false)}
                  onError={() => setImageLoading(false)}
                />
              </div>
            </div>

            {/* Copy URL Button */}
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

            {/* URL Display */}
            <div className="mb-4">
              <input
                type="text"
                className="input input-bordered input-sm w-full font-mono text-xs"
                value={shareUrl}
                readOnly
                onClick={(e) => e.currentTarget.select()}
              />
            </div>

            {/* Action buttons */}
            <div className="flex justify-between">
              <button className="btn btn-sm gap-1" onClick={handleBack}>
                <ChevronLeft size={16} />
                <FormattedMessage defaultMessage="Back" id="GxaXj9" description="Back button to return to play selection" />
              </button>
              <button className="btn btn-sm" onClick={onClose}>
                <FormattedMessage defaultMessage="Close" id="4BH2f8" description="Close button text" />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
};

export default SessionShareModal;
