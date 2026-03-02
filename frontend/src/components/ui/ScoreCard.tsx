import React from 'react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { GradeImage, DifficultyBadge, ProfileAvatar } from '../../components';
import { BannerImage } from '../../components/ui';

interface ScoreCardProps {
  score: {
    playId?: number | null;
    createdAt: string;
    chart: {
      hash: string;
      title: string | null;
      artist: string | null;
      difficulty: string | null;
      meter: number | null;
      bannerVariants?: any;
      mdBannerUrl?: string | null;
      smBannerUrl?: string | null;
      bannerUrl?: string | null;
    };
    user?: {
      id: string;
      alias: string;
      profileImageUrl?: string | null;
    };
  };
  grade: string;
  scoreValue: string;
  showPlayer?: boolean;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({ score, grade, scoreValue, showPlayer }) => {
  const { formatDate } = useIntl();
  const title = score.chart.title ?? 'Unknown';
  const artist = score.chart.artist ?? 'Unknown Artist';
  const difficulty = score.chart.difficulty ?? 'N/A';
  const meter = score.chart.meter ?? 0;

  return (
    <div className="bg-base-200/30 rounded-lg p-4 border border-base-content/10">
      {/* Chart Info */}
      <Link to={`/chart/${score.chart.hash}`} className="block mb-3 hover:opacity-80 transition-opacity">
        {/* Banner */}
        <div className="mb-2">
          <BannerImage
            bannerVariants={score.chart.bannerVariants}
            mdBannerUrl={score.chart.mdBannerUrl}
            smBannerUrl={score.chart.smBannerUrl}
            bannerUrl={score.chart.bannerUrl}
            alt={`${title} banner`}
            className="w-full rounded-lg shadow-lg"
            style={{ aspectRatio: '2.56' }}
          />
        </div>

        {/* Title and Artist */}
        <div className="mb-2">
          <div className="font-medium text-base-content text-sm truncate">{title}</div>
          <div className="text-xs text-base-content/60 truncate">{artist}</div>
        </div>

        {/* Difficulty Badge */}
        <div>
          <DifficultyBadge difficulty={difficulty} meter={meter} />
        </div>
      </Link>

      {/* Player Info (optional) */}
      {showPlayer && score.user && (
        <Link
          to={`/user/${score.user.id}`}
          className="flex items-center gap-2 mb-3 py-2 px-3 -mx-3 bg-base-300/30 rounded hover:bg-base-300/50 transition-colors"
        >
          <ProfileAvatar profileImageUrl={score.user.profileImageUrl} alias={score.user.alias} size="sm" />
          <span className="font-medium text-sm text-base-content">{score.user.alias}</span>
        </Link>
      )}

      {/* Score and Date Info */}
      <div className="space-y-2">
        {/* Grade and Score */}
        <div className="flex items-center justify-between">
          <div>
            <GradeImage grade={grade} className="w-8 h-8 object-contain" />
          </div>
          <div className="text-right">
            <div className="text-xs text-base-content/60">
              <FormattedMessage defaultMessage="Score" id="oGL1Ha" description="label for the score a user earned on a particular chart" />
            </div>
            {typeof score.playId === 'number' ? (
              <Link to={`/play/${score.playId}`} className="font-bold text-lg text-primary">
                {scoreValue}
              </Link>
            ) : (
              <div className="font-bold text-lg text-primary">{scoreValue}</div>
            )}
          </div>
        </div>

        {/* Date */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-base-content/60">
            <FormattedMessage defaultMessage="Date" id="/eiyYH" description="label for the date a user earned a particular score" />
          </span>
          <div className="text-right">
            <span className="text-base-content/70">
              {formatDate(score.createdAt, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span className="text-base-content/50 ml-2">
              {formatDate(score.createdAt, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
