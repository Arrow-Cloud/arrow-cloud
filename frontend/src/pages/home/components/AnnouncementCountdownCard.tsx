import React, { useEffect, useState } from 'react';
import { Twitch } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

const TWITCH_URL = 'https://www.twitch.tv/waflesitg';
// Icon-only mark (no wordmark) - same asset used for the site favicon, at its largest size since
// it's blown up well past its natural display size here.
const AC_LOGO_URL = 'https://assets.arrowcloud.dance/favicon/android-chrome-512x512.png';

// Returns how far `timeZone`'s wall clock reads ahead of UTC at `date`, in ms (e.g. -5h for
// America/Chicago in CDT) - computed from the actual IANA rules via Intl rather than a hardcoded
// offset, since Chicago's UTC offset depends on whether the target date falls in daylight or
// standard time.
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - date.getTime();
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

// 8:00 PM Central time, Monday September 14, 2026 - the announcement this counts down to. What it
// actually is stays unrevealed here on purpose.
const TARGET = zonedTimeToUtc(2026, 9, 14, 20, 0, 'America/Chicago');
// TARGET is a fixed instant regardless of timezone - only the *caption* needs to adapt, and
// omitting `timeZone` here (unlike the computation above) is what makes toLocaleString render it in
// whatever zone the viewer's own computer is set to, not Central.
const TARGET_CAPTION = TARGET.toLocaleString('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(): TimeLeft {
  const totalSeconds = Math.max(0, Math.floor((TARGET.getTime() - Date.now()) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

// Keeps the card up for a while after the target passes so anyone loading the page right around
// announcement time still gets pointed at the stream, instead of the card just vanishing at 0:00
// and leaving them to go find it themselves.
const LIVE_WINDOW_MS = 20 * 60 * 1000;

type Phase = 'countdown' | 'live' | 'done';

function getPhase(): Phase {
  const now = Date.now();
  if (now < TARGET.getTime()) return 'countdown';
  if (now < TARGET.getTime() + LIVE_WINDOW_MS) return 'live';
  return 'done';
}

// Shared chrome (rounded card, watermark, ambient glow) between the countdown and live phases -
// only the content inside changes.
const CardShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative isolate overflow-hidden rounded-2xl bg-base-100 shadow-2xl mb-8 ring-1 ring-secondary/30">
    {/* Arrow Cloud watermark, rotating almost imperceptibly slowly - a background presence, not a
        focal element (hence aria-hidden and very low opacity). */}
    <img
      src={AC_LOGO_URL}
      alt=""
      aria-hidden="true"
      className="pointer-events-none select-none absolute left-1/2 top-1/2 w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.07] animate-[spin_140s_linear_infinite]"
    />
    {/* Slow ambient glow breathing behind the content. */}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-secondary/15 via-transparent to-primary/15 animate-[pulse_7s_ease-in-out_infinite]" />
    <div className="relative py-10 px-6 flex flex-col items-center text-center">{children}</div>
  </div>
);

const TwitchCta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <a
    href={TWITCH_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#9146FF] text-white font-bold shadow-lg hover:bg-[#7d2ff0] hover:scale-105 hover:shadow-xl hover:shadow-[#9146FF]/40 transition-all duration-300"
  >
    <Twitch className="w-5 h-5" />
    {children}
  </a>
);

export const AnnouncementCountdownCard: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(getTimeLeft);
  const [phase, setPhase] = useState<Phase>(getPhase);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft());
      setPhase(getPhase());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (phase === 'done') return null;

  if (phase === 'live') {
    return (
      <CardShell>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-base-content">
          <FormattedMessage defaultMessage="We're live!" id="4rP3FA" description="homepage announcement card heading once the stream has started" />
        </h2>
        <p className="text-sm sm:text-base text-base-content/60 py-6 max-w-md">
          <FormattedMessage
            defaultMessage="The Off-Season Event Announcement is happening right now."
            id="KARkJR"
            description="homepage announcement card body once the stream has started"
          />
        </p>
        <TwitchCta>
          <FormattedMessage
            defaultMessage="Watch live on twitch.tv/WaflesITG"
            id="FB2Wi3"
            description="CTA link to the live Twitch stream, shown once the announcement has started"
          />
        </TwitchCta>
      </CardShell>
    );
  }

  const units: { key: keyof TimeLeft; label: React.ReactNode }[] = [
    { key: 'days', label: <FormattedMessage defaultMessage="Days" id="P0mOkg" description="countdown unit label on the homepage announcement card" /> },
    { key: 'hours', label: <FormattedMessage defaultMessage="Hours" id="SfZXHj" description="countdown unit label on the homepage announcement card" /> },
    { key: 'minutes', label: <FormattedMessage defaultMessage="Minutes" id="XAIBL9" description="countdown unit label on the homepage announcement card" /> },
    { key: 'seconds', label: <FormattedMessage defaultMessage="Seconds" id="8JtNrT" description="countdown unit label on the homepage announcement card" /> },
  ];

  return (
    <CardShell>
      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-base-content">
        <FormattedMessage defaultMessage="Off-Season Event Announcement" id="72qFpi" description="homepage announcement countdown card heading" />
      </h2>

      <div className="flex items-center gap-1.5 sm:gap-3 py-8">
        {units.map(({ key, label }, i) => (
          <React.Fragment key={key}>
            {i > 0 && (
              <span className="text-2xl sm:text-3xl font-black text-base-content/20 pb-5" aria-hidden="true">
                <FormattedMessage defaultMessage=":" id="xMkdu7" description="decorative separator between countdown units" />
              </span>
            )}
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-base-300/70 backdrop-blur-sm ring-1 ring-base-content/10 shadow-lg">
                <span className="font-mono text-3xl sm:text-4xl font-bold tabular-nums text-base-content">{String(timeLeft[key]).padStart(2, '0')}</span>
              </div>
              <span className="mt-2 text-[0.65rem] sm:text-xs uppercase tracking-widest text-base-content/45">{label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <p className="text-xs sm:text-sm text-base-content/50 mb-6">{TARGET_CAPTION}</p>

      <TwitchCta>
        <FormattedMessage
          defaultMessage="On twitch.tv/WaflesITG"
          id="8+EXJN"
          description="CTA link (doubles as the URL text) to the Twitch channel streaming the announcement"
        />
      </TwitchCta>
    </CardShell>
  );
};
