import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

// Hide the card after this date. Deliberately timezone-naive, like the previous packs' cards - it
// resolves to each viewer's own local midnight rather than a single UTC cutoff that would drop the
// card mid-day for some players.
const EXPIRY = new Date('2026-11-01T00:00:00');

// The single pack we're launching a leaderboard for. Not sourced from THC4_PACK_ID-style shared
// constants the way the previous card was: that constant exists because THC4 needed a difficulty
// override keyed by id, and this pack is plain medium/hard/challenge with nothing else referencing it.
const PACK = {
  id: 387,
  name: "Kerpa's Simfiles Playlist 5",
  // The pack's own banner, straight off the CDN. This pack has no _md/_sm or webp/avif variants
  // (bannerVariants is null), so there's no smaller version to prefer - see this file's git history
  // if an optimized upload is added later.
  bannerUrl: 'https://assets.arrowcloud.dance/packs/1790891242672_kerpa-s_simfiles_playlist_5/pack-banner.png',
  // Native dimensions, for the aspect box below - keeps the image from reflowing the page as it loads.
  bannerAspect: '2007/783',
};

/**
 * Home page promo for a newly-launched pack leaderboard. Previous packs (Saga 2, THC4) paired the
 * banner with a YouTube trailer embed; this pack has no trailer, so the layout is banner + name +
 * CTA instead of the old two-column banner/video split. The trailer markup is in this file's git
 * history if a future pack ships with one.
 */
export const NewPackLeaderboardsCard: React.FC = () => {
  const { formatMessage } = useIntl();

  if (new Date() >= EXPIRY) return null;

  return (
    <div className="card bg-gradient-to-br from-base-100 via-base-100/90 to-accent/10 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-accent/20 mb-6 border border-accent/20 hover:border-accent/40 transition-all duration-500 overflow-hidden">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-gradient-to-br from-accent/20 to-accent/10 rounded-md">
            <Trophy className="w-3.5 h-3.5 text-accent flex-shrink-0" />
          </div>
          <span className="text-sm font-bold bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent uppercase tracking-wide">
            <FormattedMessage defaultMessage="New Pack Leaderboard" id="QwD6xb" description="New pack leaderboard announcement heading" />
          </span>
        </div>

        {/* One click target for the whole card body, as the previous version also did (the "View"
            button is a styled span inside the Link, not a nested interactive element). */}
        <Link
          to={`/pack/${PACK.id}`}
          className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-base-100 rounded-lg overflow-hidden border border-accent/10 hover:border-accent/40 transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-accent/10"
        >
          <div className="relative w-full sm:flex-[3] shrink-0 overflow-hidden bg-base-300" style={{ aspectRatio: PACK.bannerAspect }}>
            <img
              src={PACK.bannerUrl}
              alt={formatMessage(
                { defaultMessage: '{packName} pack banner', id: 'jXPfv7', description: 'Alt text for the pack banner image on the new pack leaderboard card' },
                { packName: PACK.name },
              )}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>

          <div className="flex flex-col gap-3 px-3 pb-3 sm:flex-[2] sm:py-3 sm:pr-4 sm:pl-0">
            <h3 className="text-lg sm:text-xl font-bold leading-snug group-hover:text-accent transition-colors">{PACK.name}</h3>
            <span className="btn btn-sm btn-accent shadow-sm self-start">
              <FormattedMessage defaultMessage="View" id="JU34ji" description="Link label to view pack leaderboard" />
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
};
