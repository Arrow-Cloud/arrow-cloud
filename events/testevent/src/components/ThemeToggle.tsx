import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const ThemeToggle = () => {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('event-theme');
    if (saved) return saved === 'lofi-dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const theme = dark ? 'lofi-dark' : 'silk-light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('event-theme', theme);
  }, [dark]);

  return (
    <button
      className="btn btn-ghost btn-circle"
      onClick={() => setDark(!dark)}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

export default ThemeToggle;
