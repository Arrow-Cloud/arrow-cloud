import { useIntl, FormattedMessage } from 'react-intl';
import { Link, useLocation } from 'react-router-dom';
import { Download, LogIn } from 'lucide-react';
import CurrentlyOnCourse from './CurrentlyOnCourse';

const GLASS_CARD = 'card pop-card';
const PLACEHOLDER_BOX =
  'rounded-box border-[3px] border-dashed border-primary/25 bg-primary/5 flex items-center justify-center text-sm text-base-content/50 text-center';

// How-it-works example images: fill the grid column at a fixed square, same footprint as the
// placeholder boxes, so every card lines up regardless of the source file's pixel size.
// object-cover crops (rather than squashes) any future image that isn't square.
const EVENT_IMG = 'w-full aspect-square object-cover rounded-box border-2 border-base-content/10';

const EventLogo = () => {
  const { formatMessage } = useIntl();
  return (
    <div className="flex items-center gap-3">
      <img
        src="/img/ITGolf_Logo-ArrowLeft_Large.png"
        alt={formatMessage({ defaultMessage: 'In The Golf', id: 'LAWbk8', description: 'Alt text for In The Golf logo' })}
        className="h-16 w-auto"
      />
    </div>
  );
};

// Logged-out home: pitch the event and get the visitor to log in. Layout only for now - the
// dashed boxes mark content that hasn't been designed yet.
const GuestHome = () => {
  const { formatMessage } = useIntl();
  const location = useLocation();

  const loginButton = (
    <Link to="/login" state={{ from: location }} className="btn btn-accent gap-2">
      <LogIn className="w-4 h-4" />
      <FormattedMessage defaultMessage="Log in to Arrow Cloud" id="CQunxs" description="Login button on the logged-out home page" />
    </Link>
  );

  return (
    <div className="flex flex-col items-center gap-20 pt-28 pb-20 px-4">
      {/* --- Hero: event pitch + live feed --- */}
      <section className="grid gap-10 md:grid-cols-2 items-center w-full max-w-5xl">
        <div className="flex flex-col items-start gap-4">
          <span className="eyebrow">
            <FormattedMessage defaultMessage="Arrow Cloud Presents" id="StJNbC" description="Eyebrow text above the event name on the logged-out home page" />
          </span>
          <EventLogo />
          <p className="text-lg text-base-content/70 max-w-md">
            <FormattedMessage
              defaultMessage="A timing focused event where you compete with a novel ms-based scoring system."
              id="4xgID6"
              description="Event tagline on the logged-out home page"
            />
          </p>
          {loginButton}
        </div>
        <CurrentlyOnCourse />
      </section>

      {/* --- How it works --- */}
      <section className="flex flex-col items-center gap-6 w-full max-w-5xl">
        <h2 className="trail text-3xl sm:text-4xl font-bold">
          <FormattedMessage defaultMessage="How it works" id="pgJOPR" description="Heading of the how-it-works section on the logged-out home page" />
        </h2>
        <div className={`${GLASS_CARD} p-6 grid gap-6 sm:grid-cols-3 w-full`}>
          <div className="flex flex-col gap-3">
            {/* A looping WebM rather than the original GIF (~600 KB vs ~4.3 MB). muted + playsInline are
                required for browsers (iOS especially) to autoplay it; <video> has no alt, so it's
                exposed to screen readers as an image with a label instead. */}
            <video
              src="/img/home-timing.webm"
              autoPlay
              loop
              muted
              playsInline
              role="img"
              aria-label={formatMessage({
                defaultMessage: 'Animation showing note timing during an event play',
                id: 'UlVq3d',
                description: 'Alt text for the how-timing-works example animation on the logged-out home page',
              })}
              className={EVENT_IMG}
            />
            <p className="text-sm text-base-content/70">
              <FormattedMessage
                defaultMessage="Each arrow hit is assigned strokes based on precision"
                id="nkAuTZ"
                description="How-it-works step 1 caption (placeholder)"
              />
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <img
              src="/img/home-scoring.png"
              alt={formatMessage({
                defaultMessage: 'Image showing scorebox from an event play',
                id: 'sn4LBE',
                description: 'Alt text for the how-scoring-works example image on the logged-out home page',
              })}
              className={EVENT_IMG}
              loading="lazy"
              decoding="async"
            />
            <p className="text-sm text-base-content/70">
              <FormattedMessage
                defaultMessage="Your sum total of strokes is your score per chart and course"
                id="ZGceF7"
                description="How-it-works step 2 caption (placeholder)"
              />
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className={`${PLACEHOLDER_BOX} aspect-square`} />
            <p className="text-sm text-base-content/70">
              <FormattedMessage defaultMessage="Lowest total score wins!" id="9TvIV1" description="How-it-works step 3 caption (placeholder)" />
            </p>
          </div>
        </div>
      </section>

      {/* --- Event information --- */}
      <section className={`${GLASS_CARD} p-6 sm:p-8 w-full max-w-5xl flex flex-col gap-4`}>
        <h2 className="text-2xl font-bold text-center">
          <FormattedMessage defaultMessage="Event information" id="PspLzW" description="Heading of the event information section on the logged-out home page" />
        </h2>
        <ul className="list-disc pl-5 flex flex-col gap-2 text-base-content/80">
          <li>
            <FormattedMessage
              defaultMessage="This is a golf themed ITG event, using a custom “golf” scoring system."
              id="episzZ"
              description="Event information bullet: what the event is"
            />
          </li>
          <li>
            <FormattedMessage
              defaultMessage="Charts are available in a variety of “courses” (packs). Each course has 18 “holes” (songs)."
              id="EM+kJD"
              description="Event information bullet: courses are packs and holes are songs. Keep the golf terms in quotes."
            />
          </li>
          <li>
            <FormattedMessage defaultMessage="Each course and hole has its own leaderboard." id="xaIfVa" description="Event information bullet: leaderboards" />
          </li>
          <li>
            <FormattedMessage
              defaultMessage="Each course has a different theme, ranging from easy to difficult and simple to technical."
              id="E3aJZ7"
              description="Event information bullet: course themes and difficulty range"
            />
          </li>
        </ul>
      </section>

      {/* --- Closing call to action --- */}
      <section className="flex flex-col items-center gap-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold">
          <FormattedMessage defaultMessage="Ready to golf?" id="0ezDme" description="Closing call-to-action heading on the logged-out home page" />
        </h2>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-16">
          {loginButton}
          <div className="flex flex-col items-center gap-1">
            {/* TODO: point at the packs download once it exists. */}
            <button type="button" className="btn btn-outline gap-2">
              <Download className="w-4 h-4" />
              <FormattedMessage defaultMessage="Download Packs" id="4GSap7" description="Button to download the event's packs on the logged-out home page" />
            </button>
            <span className="text-xs text-base-content/50">
              <FormattedMessage
                defaultMessage="Download size TBD"
                id="f7UJmz"
                description="Placeholder for the packs download size under the download button"
              />
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GuestHome;
