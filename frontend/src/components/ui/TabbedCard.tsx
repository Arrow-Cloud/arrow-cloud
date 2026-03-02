import React, { useState, useEffect, type ReactNode, useId } from 'react';
import { type LucideIcon } from 'lucide-react';

export interface Tab {
  id: string;
  /** Label for the tab - must be a string for tabs-lift style */
  label: string;
  content: ReactNode;
}

export interface TabbedCardProps {
  /** Icon to display in the card header */
  icon?: LucideIcon;
  /** Title of the card (shown above tabs) */
  title?: ReactNode;
  /** Array of tabs with id, label, and content */
  tabs: Tab[];
  /** Default active tab id (defaults to first tab) */
  defaultTab?: string;
  /** Optional localStorage key to persist the active tab */
  persistKey?: string;
  /** Optional additional controls to show next to tabs */
  headerControls?: (activeTab: string) => ReactNode;
  /** Additional className for the container */
  className?: string;
}

export const TabbedCard: React.FC<TabbedCardProps> = ({ icon: Icon, title, tabs, defaultTab, persistKey, headerControls, className = '' }) => {
  const uniqueId = useId();
  const tabGroupName = `tabs_${uniqueId.replace(/:/g, '')}`;

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (persistKey) {
      try {
        const stored = localStorage.getItem(persistKey);
        if (stored && tabs.some((t) => t.id === stored)) {
          return stored;
        }
      } catch {}
    }
    return defaultTab || tabs[0]?.id || '';
  });

  // Persist active tab to localStorage
  useEffect(() => {
    if (persistKey) {
      try {
        localStorage.setItem(persistKey, activeTab);
      } catch {}
    }
  }, [activeTab, persistKey]);

  return (
    <div className={`mb-8 ${className}`}>
      {/* Lifted tabs structure */}
      <div className="tabs tabs-lift w-full">
        {tabs.map((tab) => (
          <React.Fragment key={tab.id}>
            <input
              type="radio"
              name={tabGroupName}
              className="tab"
              aria-label={tab.label}
              checked={activeTab === tab.id}
              onChange={() => setActiveTab(tab.id)}
            />
            <div className="tab-content bg-base-100 border-base-300 p-6">
              {/* Header row with title and controls */}
              {(title || Icon || (headerControls && activeTab === tab.id)) && (
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  {/* Title and icon */}
                  {(title || Icon) && (
                    <div className="flex items-center gap-3">
                      {Icon && (
                        <div className="p-2 bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg">
                          <Icon className="w-6 h-6 text-accent" />
                        </div>
                      )}
                      {title && <h2 className="text-3xl font-bold bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">{title}</h2>}
                    </div>
                  )}
                  {/* Controls floated right */}
                  {headerControls && activeTab === tab.id && <div className="flex flex-wrap items-center gap-4 ml-auto">{headerControls(activeTab)}</div>}
                </div>
              )}

              {tab.content}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
