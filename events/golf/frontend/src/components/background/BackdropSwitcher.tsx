import { useBackdropState } from './BackdropContext';
import { VARIANTS, VARIANT_ORDER, variantLetter } from './variants';

// A floating test control for flipping between backdrops without touching the URL. Dev builds only (see
// CourseBackground.tsx). Clicking the active letter again hands the choice back to the page.
export default function BackdropSwitcher() {
  const { variant: pageVariant, override, setOverride } = useBackdropState();
  const active = override ?? pageVariant;
  return (
    <div className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full bg-base-100/90 py-1 pl-1 pr-3 shadow-lg ring-1 ring-base-content/15 backdrop-blur">
      <div className="join">
        {VARIANT_ORDER.map((v) => (
          <button
            key={v}
            type="button"
            title={VARIANTS[v].name}
            aria-pressed={v === active}
            className={`join-item btn btn-sm ${v === active ? 'btn-primary' : ''}`}
            onClick={() => setOverride(v === override ? null : v)}
          >
            {variantLetter(v)}
          </button>
        ))}
      </div>
      <span className="font-display text-sm">{VARIANTS[active].name}</span>
    </div>
  );
}
