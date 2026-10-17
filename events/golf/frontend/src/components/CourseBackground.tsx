import { useSearchParams } from 'react-router-dom';
import Backdrop from './background/Backdrop';
import { useBackdropState } from './background/BackdropContext';
import BackdropSwitcher from './background/BackdropSwitcher';
import { useScrollVars } from './background/useScrollVars';
import { VARIANT_ALIASES } from './background/variants';

// The page backdrop. Pure CSS and SVG - no canvas - coloured from CSS variables that follow the light/dark theme.
// Which variant: `?bg=` (a letter A-E or a name) beats the test switcher, which beats what the page asked for.
// The switcher floats bottom-left in dev builds only.
export default function CourseBackground() {
  const [params] = useSearchParams();
  const { variant: fromPage, override } = useBackdropState();
  const variant = VARIANT_ALIASES[params.get('bg') ?? ''] ?? override ?? fromPage;
  useScrollVars();
  return (
    <>
      <div aria-hidden data-backdrop={variant} className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-base-100">
        <Backdrop variant={variant} />
      </div>
      {import.meta.env.DEV && <BackdropSwitcher />}
    </>
  );
}
