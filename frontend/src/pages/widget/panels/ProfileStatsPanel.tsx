import React from 'react';
import { ProfileAvatar } from '../../../components';
import type { WidgetDataResponse } from '../../../schemas/apiSchemas';
import { PANEL_WIDTH, PANEL_HEIGHT, COMPACT_HEIGHTS, HORIZONTAL_WIDTHS } from '../../../utils/widgetConfig';

interface Props {
  user: WidgetDataResponse['user'];
  orientation: 'horizontal' | 'vertical';
}

export const ProfileStatsPanel: React.FC<Props> = ({ user, orientation }) => {
  if (orientation === 'vertical') {
    return (
      <div
        style={{ width: PANEL_WIDTH, height: COMPACT_HEIGHTS.profile }}
        className="relative flex items-center gap-3 px-3 overflow-hidden bg-gradient-to-r from-base-200 via-base-300 to-base-200 border-b border-base-300/30"
      >
        <div className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-transparent via-primary/50 to-transparent" />
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-md" />
          <ProfileAvatar alias={user.alias} profileImageUrl={user.profileImageUrl ?? null} size="sm" />
        </div>
        <span className="text-sm font-bold text-primary truncate z-10">{user.alias}</span>
      </div>
    );
  }

  return (
    <div
      style={{ width: HORIZONTAL_WIDTHS.profile, height: PANEL_HEIGHT }}
      className="relative flex flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-br from-base-200 via-base-300 to-base-200"
    >
      <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <div className="relative z-10">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
        <ProfileAvatar alias={user.alias} profileImageUrl={user.profileImageUrl ?? null} size="lg" />
      </div>
      <div className="text-xl font-bold text-primary drop-shadow-lg text-center truncate w-full px-4 z-10">{user.alias}</div>
    </div>
  );
};
