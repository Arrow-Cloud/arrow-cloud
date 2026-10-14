import { useIntl } from 'react-intl';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

// |delta| under this many hundredths of a stroke counts as "at par" (gray dash); at or beyond it,
// a green down arrow (under par) or red up arrow (over par).
const NEAR_PAR_HUNDREDTHS = 25;

const SIZES = {
  sm: { text: 'text-xs', icon: 'w-3 h-3' },
  md: { text: 'text-sm', icon: 'w-4 h-4' },
  // Steps up inside an @container at least 24rem wide (the activity cards); smaller otherwise.
  lg: { text: 'text-lg @sm:text-2xl font-bold', icon: 'w-4 h-4 @sm:w-6 @sm:h-6' },
};

// Strokes over/under par, e.g. "↓ -23.00". Shared by the leaderboard and the activity feed so
// both read the same way.
export default function ParDelta({ totalStrokes, par, size = 'md' }: { totalStrokes: number; par: number; size?: keyof typeof SIZES }) {
  const { formatNumber } = useIntl();
  // Integer hundredths, so the arrow is chosen from the same rounded value that's displayed
  // (+0.249 shows "+0.25", and gets the arrow to match). `|| 0` turns -0 into 0 - no "-0.00".
  const hundredths = Math.round((totalStrokes - par * 1000) / 10) || 0;
  const { text, icon } = SIZES[size];
  // Birdie-green under par, flag-red over, a quiet pill at par - tinted so the verdict reads before the number does.
  const tone =
    hundredths <= -NEAR_PAR_HUNDREDTHS
      ? 'bg-success/20 text-success-content dark:text-success'
      : hundredths >= NEAR_PAR_HUNDREDTHS
        ? 'bg-error/15 text-error'
        : 'bg-base-content/10 text-base-content/70';

  return (
    <span className={`font-display inline-flex self-start items-center gap-1 rounded-full px-2 py-0.5 tabular-nums shrink-0 ${text} ${tone}`}>
      {hundredths <= -NEAR_PAR_HUNDREDTHS ? (
        <ArrowDown className={`${icon}`} aria-hidden />
      ) : hundredths >= NEAR_PAR_HUNDREDTHS ? (
        <ArrowUp className={`${icon}`} aria-hidden />
      ) : (
        <Minus className={`${icon}`} aria-hidden />
      )}
      {formatNumber(hundredths / 100, { signDisplay: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
