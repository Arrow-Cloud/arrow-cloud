import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls window to top whenever the pathname changes.
 * Does not interfere with hash navigation (if a hash exists we let browser handle it).
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return; // allow in-page anchor navigation to work naturally
    // Using instant to avoid user waiting for long pages; change to 'smooth' if desired.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
