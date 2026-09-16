import React from 'react';
import { Twitch } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

const TWITCH_URL = 'https://www.twitch.tv/waflesitg';
// Bundled locally (frontend/public/img/) rather than the assets.arrowcloud.dance CDN this page
// otherwise uses (see the old AnnouncementCountdownCard's AC_LOGO_URL) - the golf branding hasn't
// been uploaded there, and this is a same PNG already used for the golf result cards/announcement
// slideshow (api/assets/golf/, scripts/golf-announcement/public/brand/).
const LOGO_URL = '/img/ITGolf_Logo-ArrowLeft_Large.png';
const LOGO_ASPECT_RATIO = 1346 / 199; // native aspect ratio, trimmed to the logo's visible glyph bbox

// The real announcement VOD: https://www.twitch.tv/videos/2874469317
const TWITCH_VOD_ID = '2874469317';

/**
 * Replaces AnnouncementCountdownCard once the stream has happened - the countdown/live states are
 * done being useful, so this shows the recorded announcement instead. AnnouncementCountdownCard.tsx
 * itself is left in place (not deleted) until this has actually shipped, in case the live card is
 * still needed a bit longer.
 */
export const AnnouncementVideoCard: React.FC = () => {
  const { formatMessage } = useIntl();

  return (
    <div className="relative isolate overflow-hidden rounded-2xl bg-base-100 shadow-2xl mb-8 ring-1 ring-secondary/30">
      <div className="relative py-10 px-6 flex flex-col items-center text-center gap-6">
        <img
          src={LOGO_URL}
          alt={formatMessage({ defaultMessage: 'In The Golf', id: 'TE78Kp', description: 'Alt text for the In The Golf logo' })}
          className="h-14 sm:h-20 w-auto"
          style={{ aspectRatio: LOGO_ASPECT_RATIO }}
        />

        <div className="w-full max-w-2xl aspect-video rounded-xl overflow-hidden shadow-lg ring-1 ring-base-content/10 bg-black">
          <iframe
            className="w-full h-full"
            // Twitch's embed player requires `parent` to exactly match the embedding page's own
            // hostname (a security requirement, not optional) - computed at render time so this
            // works unchanged on localhost during dev preview and on the real domain once deployed,
            // rather than a hostname hardcoded for just one of those. `time` skips the pre-reveal
            // preamble - the actual announcement starts 10 minutes in.
            src={`https://player.twitch.tv/?video=${TWITCH_VOD_ID}&parent=${window.location.hostname}&autoplay=false&time=10m0s`}
            title={formatMessage({
              defaultMessage: 'In The Golf announcement',
              id: 'UFxY/H',
              description: 'Title attribute for the embedded announcement video iframe',
            })}
            allowFullScreen
          />
        </div>

        <p className="text-sm sm:text-base text-base-content/60 max-w-md">
          <FormattedMessage
            defaultMessage="Missed the announcement? Watch the full reveal above, or catch the replay on our Twitch channel."
            id="NIAEOZ"
            description="homepage announcement card body once the recording is available"
          />
        </p>

        <a
          href={TWITCH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#9146FF] text-white font-bold shadow-lg hover:bg-[#7d2ff0] hover:scale-105 hover:shadow-xl hover:shadow-[#9146FF]/40 transition-all duration-300"
        >
          <Twitch className="w-5 h-5" />
          <FormattedMessage
            defaultMessage="More on twitch.tv/WaflesITG"
            id="zxRtLn"
            description="CTA link to the Twitch channel, shown once the announcement recording is available"
          />
        </a>
      </div>
    </div>
  );
};
