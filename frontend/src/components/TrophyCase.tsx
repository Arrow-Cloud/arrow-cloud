import React from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { FormattedMessage } from 'react-intl';

export type TrophyTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface Trophy {
  id: string;
  name: string;
  description: string;
  tier: TrophyTier;
  iconUrl?: string;
  iconName?: string;
  unlockedAt?: Date;
}

interface TrophyProps {
  trophy: Trophy;
}

export const getTierStyles = (tier: TrophyTier) => {
  switch (tier) {
    case 'common':
      return {
        iconColor: 'text-base-content/60',
        glowColor: 'transparent',
        textColor: 'text-white font-semibold',
        glowSize: '0 0 0px',
        boxShadow: 'none',
        textShadow: 'none',
        backgroundColor: '#4a5568',
        borderColor: '#718096',
      };
    case 'rare':
      return {
        iconColor: 'text-blue-400',
        glowColor: 'rgba(59, 130, 246, 0.8)',
        textColor: 'text-white font-bold',
        glowSize: '0 0 20px',
        boxShadow: '0 0 15px rgba(59, 130, 246, 0.7), 0 0 30px rgba(59, 130, 246, 0.5), 0 0 45px rgba(59, 130, 246, 0.3)',
        boxShadowSubtle: '0 0 8px rgba(59, 130, 246, 0.4), 0 0 16px rgba(59, 130, 246, 0.2)',
        textShadow: '0 0 10px rgba(59, 130, 246, 0.7), 0 0 20px rgba(59, 130, 246, 0.4)',
        backgroundColor: '#1e40af',
        borderColor: '#60a5fa',
      };
    case 'epic':
      return {
        iconColor: 'text-purple-400',
        glowColor: 'rgba(192, 132, 252, 0.6)',
        textColor: 'text-white font-bold',
        glowSize: '0 0 40px',
        boxShadow: '0 0 20px rgba(192, 132, 252, 0.7), 0 0 40px rgba(192, 132, 252, 0.5), 0 0 60px rgba(192, 132, 252, 0.3)',
        boxShadowSubtle: '0 0 10px rgba(192, 132, 252, 0.4), 0 0 20px rgba(192, 132, 252, 0.2)',
        textShadow: '0 0 15px rgba(192, 132, 252, 0.6), 0 0 30px rgba(192, 132, 252, 0.3)',
        backgroundColor: '#581c87',
        borderColor: '#c084fc',
      };
    case 'legendary':
      return {
        iconColor: 'text-yellow-400',
        glowColor: 'rgba(250, 204, 21, 0.6)',
        textColor: 'text-white font-semibold',
        glowSize: '0 0 35px',
        boxShadow: '0 0 20px rgba(250, 204, 21, 0.7), 0 0 40px rgba(250, 204, 21, 0.5), 0 0 60px rgba(250, 204, 21, 0.3)',
        boxShadowSubtle: '0 0 10px rgba(250, 204, 21, 0.4), 0 0 20px rgba(250, 204, 21, 0.2)',
        textShadow: '0 0 8px rgba(250, 204, 21, 0.9), 0 0 20px rgba(250, 204, 21, 0.7), 0 0 40px rgba(250, 204, 21, 0.5)',
        backgroundColor: 'linear-gradient(135deg, #78350f 0%, #ca8a04 50%, #78350f 100%)',
        borderColor: '#fbbf24',
      };
  }
};

const TrophyCard: React.FC<TrophyProps> = ({ trophy, isHovered = false }) => {
  const styles = getTierStyles(trophy.tier);
  
  // Get the icon component dynamically
  const IconComponent = trophy.iconName 
    ? (LucideIcons[trophy.iconName as keyof typeof LucideIcons] as React.ComponentType<any>) || LucideIcons.Trophy
    : LucideIcons.Trophy;

  // Size based on hover state - 96px default, 256px on hover
  const imageSize = isHovered ? 'w-64 h-64' : 'w-24 h-24';
  const iconSize = isHovered ? 256 : 96;
  const borderWidth = isHovered ? 4 : 3;

  return (
    <div className="relative flex flex-col items-center p-2">
      {/* Large Trophy Icon */}
      <div 
        className={`${styles.iconColor} transition-all duration-300 rounded-lg overflow-hidden`}
        style={{
          boxShadow: isHovered ? styles.boxShadow : (styles.boxShadowSubtle || styles.boxShadow),
          border: `${borderWidth}px solid ${styles.borderColor}`,
        }}
      >
        {trophy.iconUrl ? (
          <img src={trophy.iconUrl} alt={trophy.name} className={`${imageSize} object-contain`} />
        ) : (
          <IconComponent 
            size={iconSize} 
            strokeWidth={trophy.tier === 'legendary' ? 2.5 : trophy.tier === 'epic' ? 2 : 1.5} 
            fill={trophy.tier === 'legendary' || trophy.tier === 'epic' ? 'currentColor' : 'none'}
            fillOpacity={trophy.tier === 'legendary' ? 0.3 : trophy.tier === 'epic' ? 0.2 : 0}
          />
        )}
      </div>
      
      {/* Trophy Name - always visible */}
      <div className="mt-3 w-full flex flex-col items-center">
        <div 
          className={`text-base leading-tight ${styles.textColor} mb-2 text-center px-3 py-1.5 rounded-md border-2`}
          style={{
            background: styles.backgroundColor,
            borderColor: styles.borderColor,
            textShadow: trophy.tier === 'legendary' || trophy.tier === 'epic' ? styles.textShadow : undefined,
          } as React.CSSProperties}
        >
          {trophy.name}
        </div>
        {/* Trophy Description - visible on hover on desktop, always visible on mobile */}
        <div 
          className={`text-center transition-all duration-200 rounded-md ${
            isHovered 
              ? 'text-base text-base-content/90 max-w-72 leading-relaxed px-4 py-2 bg-base-300/90' 
              : 'text-xs text-base-content/70 line-clamp-2 w-full px-2 opacity-100 sm:opacity-0'
          }`}
        >
          {trophy.description}
        </div>
      </div>
    </div>
  );
};


interface TrophyCaseProps {
  trophies?: Trophy[];
  maxTrophies?: number;
  showManageButton?: boolean;
}

export const TrophyCase: React.FC<TrophyCaseProps> = ({ trophies = [], maxTrophies = 8, showManageButton = false }) => {
  const [hoveredTrophy, setHoveredTrophy] = React.useState<string | null>(null);

  // Take only the top trophies up to maxTrophies
  // Backend already returns trophies sorted by displayOrder, then createdAt
  const displayTrophies = trophies.slice(0, maxTrophies);

  const [hoveredTrophyRect, setHoveredTrophyRect] = React.useState<DOMRect | null>(null);
  
  // Get the hovered trophy object
  const hoveredTrophyObj = displayTrophies.find(t => t.id === hoveredTrophy);

  return (
    <>
      {/* Darkening overlay - always rendered, opacity animated */}
      {ReactDOM.createPortal(
        <div 
          className="fixed inset-0 bg-black pointer-events-none transition-opacity duration-300 ease-out"
          style={{ 
            zIndex: 9998,
            opacity: hoveredTrophy ? 0.7 : 0,
          }}
        />,
        document.body
      )}
      
      {/* Hovered trophy rendered through portal to appear above overlay */}
      {hoveredTrophy && hoveredTrophyObj && hoveredTrophyRect && ReactDOM.createPortal(
        <div
          className="fixed pointer-events-none animate-trophy-pop"
          style={{
            zIndex: 9999,
            left: hoveredTrophyRect.left + hoveredTrophyRect.width / 2,
            top: hoveredTrophyRect.top + hoveredTrophyRect.height / 2,
          }}
        >
          {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
          <style>{`
            @keyframes trophy-pop {
              0% {
                transform: translate(-50%, -50%) scale(0.4);
                filter: brightness(1);
              }
              100% {
                transform: translate(-50%, -50%) scale(1);
                filter: drop-shadow(0 20px 50px rgba(0, 0, 0, 0.5)) brightness(1.2);
              }
            }
            .animate-trophy-pop {
              animation: trophy-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
          `}</style>
          <TrophyCard trophy={hoveredTrophyObj} isHovered />
        </div>,
        document.body
      )}
      
      <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
        <div className="card-body">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold flex items-center gap-3">
              <LucideIcons.Trophy className="text-warning" size={24} />
              <FormattedMessage 
                defaultMessage="Trophy Case"
                id="vLwO8K"
                description="Title for the trophy case section"
              />
            </h3>
            {showManageButton && (
              <Link to="/profile#trophies" className="btn btn-xs btn-ghost gap-1">
                <LucideIcons.Settings className="w-3 h-3" />
                <FormattedMessage
                  defaultMessage="Manage"
                  id="+JMMEN"
                  description="Button to navigate to trophy management settings"
                />
              </Link>
            )}
          </div>

          {trophies.length === 0 ? (
            <div className="text-center py-12 text-base-content/50">
              <div className="text-lg font-medium mb-2">
                <FormattedMessage 
                  defaultMessage="No Trophies Yet"
                  id="MfLQN4"
                  description="Title shown when user has no trophies"
                />
              </div>
              <div className="text-sm text-base-content/60">
                <FormattedMessage
                  defaultMessage="Your unlocked trophies will display here."
                  id="9CoJA4"
                  description="Description shown when user has no trophies"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {displayTrophies.map((trophy) => {
                const isHovered = hoveredTrophy === trophy.id;
                
                return (
                  <div
                    key={trophy.id}
                    className="relative"
                    onMouseEnter={(e) => {
                      setHoveredTrophy(trophy.id);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredTrophyRect(rect);
                    }}
                    onMouseLeave={() => {
                      setHoveredTrophy(null);
                      setHoveredTrophyRect(null);
                    }}
                  >
                    <div 
                      style={{
                        visibility: isHovered ? 'hidden' : 'visible',
                      }}
                    >
                      <TrophyCard trophy={trophy} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
