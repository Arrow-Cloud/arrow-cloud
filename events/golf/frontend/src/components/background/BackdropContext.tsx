import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_VARIANT, VARIANT_ORDER, type BackdropVariant } from './variants';

// Which backdrop the page is wearing. The backdrop itself is mounted once, above the routes, so a page asks for a
// variant with useBackdrop() and the provider swaps it; leaving the page puts the default back.
//
// `override` is for testing: the floating switcher (BackdropSwitcher.tsx) sets it to trump whatever the page asked
// for, and it is remembered so it survives navigation and reloads. null means "let the page decide".
interface BackdropState {
  variant: BackdropVariant;
  setVariant: (variant: BackdropVariant) => void;
  override: BackdropVariant | null;
  setOverride: (variant: BackdropVariant | null) => void;
}

const BackdropContext = createContext<BackdropState>({ variant: DEFAULT_VARIANT, setVariant: () => {}, override: null, setOverride: () => {} });

const STORAGE_KEY = 'golf-backdrop-override';

function storedOverride(): BackdropVariant | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VARIANT_ORDER.find((v) => v === stored) ?? null;
  } catch {
    return null;
  }
}

export function BackdropProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<BackdropVariant>(DEFAULT_VARIANT);
  const [override, setOverrideState] = useState<BackdropVariant | null>(storedOverride);
  const setOverride = useCallback((next: BackdropVariant | null) => {
    setOverrideState(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private mode: the choice just does not persist.
    }
  }, []);
  return <BackdropContext.Provider value={{ variant, setVariant, override, setOverride }}>{children}</BackdropContext.Provider>;
}

export function useBackdropState(): BackdropState {
  return useContext(BackdropContext);
}

/** Wear this variant while the calling component is on screen. */
export function useBackdrop(variant: BackdropVariant): void {
  const { setVariant } = useContext(BackdropContext);
  useEffect(() => {
    setVariant(variant);
    return () => setVariant(DEFAULT_VARIANT);
  }, [variant, setVariant]);
}
