import React, { useState, useEffect } from 'react';
import { FormattedMessage } from 'react-intl';

interface Theme {
  value: string;
  label: string;
}

const ThemeController: React.FC = () => {
  const [theme, setTheme] = useState<string>(localStorage.getItem('theme') || 'arrow-blue');

  useEffect(() => {
    // Set initial theme on mount
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const themes: Theme[] = [
    { value: 'arrow-blue', label: 'Default (Dark)' },
    { value: 'winter', label: 'Default (Light)' },
    { value: 'arrow-red', label: 'Arrow Red' },
    { value: 'cyberpunk', label: 'Cyberpunk' },
    { value: 'dark', label: 'Dark' },
    { value: 'cupcake', label: 'Cupcake' },
    { value: 'retro', label: 'Retro' },
    { value: 'lofi', label: 'Lofi' },
    { value: 'synthwave', label: 'Synthwave' },
    { value: 'valentine', label: 'Valentine' },
    { value: 'halloween', label: 'Halloween' },
    { value: 'garden', label: 'Garden' },
    { value: 'forest', label: 'Forest' },
    { value: 'business', label: 'Business' },
    { value: 'acid', label: 'Acid' },
    { value: 'luxury', label: 'Luxury' },
    { value: 'dracula', label: 'Dracula' },
    { value: 'night', label: 'Night' },
    { value: 'coffee', label: 'Coffee' },
    { value: 'bumblebee', label: 'Bumblebee' },
  ];

  return (
    <div className="w-full max-h-64 overflow-y-auto">
      <div className="text-xs font-semibold text-base-content/60 px-3 py-2 border-b border-base-300">
        <FormattedMessage
          defaultMessage="Select Theme"
          id="7/fQHG"
          description="small header displayed above the list of available color themes for the site"
        />
      </div>
      {themes.map((themeOption) => (
        <label key={themeOption.value} className="flex items-center gap-2 px-3 py-2 hover:bg-base-200 cursor-pointer transition-colors">
          <input
            type="radio"
            name="theme-selector"
            className="radio radio-xs"
            value={themeOption.value}
            checked={themeOption.value === theme}
            onChange={() => setTheme(themeOption.value)}
          />
          <span className="text-sm">{themeOption.label}</span>
        </label>
      ))}
    </div>
  );
};

export default ThemeController;
