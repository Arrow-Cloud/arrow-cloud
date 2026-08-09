import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Maximize2 } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

// Hide the card after this date.
const EXPIRY = new Date('2026-09-30T00:00:00');

// The single pack we're launching a leaderboard for.
const PACK = {
  id: 371,
  name: "Snap's Schmoovement Saga 2",
  bannerUrl: 'https://assets.arrowcloud.dance/packs/1786317614867_snap-s_schmoovement_saga_2/pack-banner.png',
};

// Trailer video (YouTube).
const TRAILER_YOUTUBE_ID = 'H6-xPgjeM0c';
// Minimal player chrome — hide related-video clutter, annotations, keyboard.
// Flip controls=1 if you want the scrub/play bar back.
const TRAILER_PARAMS = 'rel=0&modestbranding=1&controls=0&iv_load_policy=3&disablekb=1&playsinline=1';

export const NewPackLeaderboardsCard: React.FC = () => {
  const { formatMessage } = useIntl();
  const trailerRef = useRef<HTMLIFrameElement>(null);

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

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Banner left — links to the pack leaderboard */}
          <Link
            to={`/pack/${PACK.id}`}
            className="group flex-1 flex flex-col bg-base-100 rounded-lg overflow-hidden border border-accent/10 hover:border-accent/40 transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-accent/10"
          >
            <div className="relative shrink-0 aspect-[2508/984] overflow-hidden bg-base-300">
              <img src={PACK.bannerUrl} alt={PACK.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-3 bg-base-100">
              <span className="btn btn-sm btn-accent w-full shadow-sm">
                <FormattedMessage defaultMessage="View" id="JU34ji" description="Link label to view pack leaderboard" />
              </span>
            </div>
          </Link>

          {/* Trailer right */}
          <div className="relative flex-1 self-start w-full rounded-lg overflow-hidden border border-accent/10 shadow-md aspect-video bg-black">
            <iframe
              ref={trailerRef}
              src={`https://www.youtube-nocookie.com/embed/${TRAILER_YOUTUBE_ID}?${TRAILER_PARAMS}`}
              title={formatMessage(
                { defaultMessage: '{packName} trailer', id: '/Za2Vx', description: 'Accessible title for the embedded pack trailer video' },
                { packName: PACK.name },
              )}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            <button
              type="button"
              onClick={() => trailerRef.current?.requestFullscreen?.()}
              aria-label={formatMessage({
                defaultMessage: 'Play trailer fullscreen',
                id: 'Rh1sdR',
                description: 'Accessible label for the trailer fullscreen button',
              })}
              className="absolute bottom-5 right-2 p-1.5 rounded-md bg-black/50 text-white/90 hover:bg-black/70 hover:text-white cursor-pointer transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
