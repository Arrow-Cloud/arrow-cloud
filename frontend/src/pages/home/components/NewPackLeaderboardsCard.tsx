import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

const EXPIRY = new Date('2026-07-14T00:00:00');

const PACKS = [
  {
    id: 346,
    name: 'Flow Actualized 2',
    bannerUrl: 'https://assets.arrowcloud.dance/packs/1782760248022_flow_actualized_2/pack-banner.png',
  },
  {
    id: 348,
    name: 'Notice Me Benpai 3',
    bannerUrl: 'https://assets.arrowcloud.dance/packs/1782787280744_notice_me_benpai_3/pack-banner.png',
  },
];

export const NewPackLeaderboardsCard: React.FC = () => {
  if (new Date() >= EXPIRY) return null;

  return (
    <div className="card bg-gradient-to-br from-base-100 via-base-100/90 to-accent/10 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-accent/20 mb-6 border border-accent/20 hover:border-accent/40 transition-all duration-500 overflow-hidden">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-gradient-to-br from-accent/20 to-accent/10 rounded-md">
            <Trophy className="w-3.5 h-3.5 text-accent flex-shrink-0" />
          </div>
          <span className="text-sm font-bold bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent uppercase tracking-wide">
            <FormattedMessage id="ej/v5A" defaultMessage="New Pack Leaderboards" description="New pack leaderboards announcement heading" />
          </span>
        </div>
        <div className="flex gap-3">
          {PACKS.map((pack) => (
            <Link
              key={pack.id}
              to={`/pack/${pack.id}`}
              className="flex-1 group rounded-lg overflow-hidden border border-accent/10 hover:border-accent/40 transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-accent/10"
            >
              <div className="relative aspect-[256/60] overflow-hidden bg-base-300">
                <img src={pack.bannerUrl} alt={pack.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
              <div className="px-2 py-1.5 bg-base-100">
                <div className="text-xs font-semibold text-base-content truncate">{pack.name}</div>
                <div className="text-[10px] text-accent/80 font-medium">
                  <FormattedMessage id="1iIKai" defaultMessage="View leaderboard →" description="Link label to view pack leaderboard" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
