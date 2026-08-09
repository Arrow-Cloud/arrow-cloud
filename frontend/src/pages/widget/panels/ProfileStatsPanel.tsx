import React from 'react';
import { ProfileAvatar } from '../../../components';
import type { WidgetDataResponse } from '../../../schemas/apiSchemas';
import { PROFILE_HEADER_H } from '../../../utils/widgetConfig';

interface Props {
  user: WidgetDataResponse['user'];
}

const SHADOW = '0 1px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.5)';
const MARQUEE_THRESHOLD = 16;

export const ProfileStatsPanel: React.FC<Props> = ({ user }) => {
  const isMarquee = user.alias.length > MARQUEE_THRESHOLD;

  return (
    <div style={{ height: PROFILE_HEADER_H, background: 'transparent' }} className="w-full flex items-center pl-2 pr-4 gap-2 flex-shrink-0">
      {/* Avatar — ring gives definition on any OBS background */}
      <div className="flex-shrink-0 ring-2 ring-white/20 rounded-full">
        <ProfileAvatar alias={user.alias} profileImageUrl={user.profileImageUrl ?? null} size="sm" />
      </div>

      {/* Alias — marquee for long names */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {isMarquee ? (
          <div className="overflow-hidden" style={{ WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent 100%)' }}>
            <span
              className="inline-block whitespace-nowrap text-sm font-bold text-white"
              style={{ animation: 'aliasMarquee 14s linear infinite', textShadow: SHADOW }}
            >
              {user.alias}
              <span className="inline-block w-12" aria-hidden="true" />
              {user.alias}
              <span className="inline-block w-12" aria-hidden="true" />
            </span>
          </div>
        ) : (
          <span className="block truncate text-sm font-bold text-white" style={{ textShadow: SHADOW }}>
            {user.alias}
          </span>
        )}
      </div>
    </div>
  );
};
