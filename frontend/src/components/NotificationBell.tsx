import React, { useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';

const NotificationBell: React.FC = () => {
  const { formatMessage } = useIntl();
  const navigate = useNavigate();
  const { unreadCount, notifications, hasLoaded, isLoading, nextCursor, fetchNotifications, loadMore, markRead, markAllRead } = useNotifications();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening && !hasLoaded) {
      fetchNotifications();
    }
  };

  const handleNotificationClick = (notification: (typeof notifications)[0]) => {
    if (!notification.readAt) {
      markRead(notification.id);
    }
    setIsOpen(false);

    // Deep-link if data contains a route
    const data = notification.data as Record<string, unknown> | null | undefined;
    if (data?.route && typeof data.route === 'string') {
      navigate(data.route);
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)
      return formatMessage({ defaultMessage: 'just now', id: '9B4wqU', description: 'Relative time label for something that happened less than a minute ago' });
    if (mins < 60) return formatMessage({ defaultMessage: '{mins}m ago', id: 'VFIAsV', description: 'Relative time in minutes' }, { mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return formatMessage({ defaultMessage: '{hours}h ago', id: 'Q65E/O', description: 'Relative time in hours' }, { hours });
    const days = Math.floor(hours / 24);
    return formatMessage({ defaultMessage: '{days}d ago', id: 'hu83+j', description: 'Relative time in days' }, { days });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="btn btn-ghost btn-circle"
        onClick={handleToggle}
        aria-label={formatMessage({ defaultMessage: 'Notifications', id: '32y7tE', description: 'Aria label for the notification bell button' })}
      >
        <div className="indicator">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="indicator-item badge badge-primary badge-xs px-1 text-[10px] font-bold">
              {unreadCount > 99 ? formatMessage({ defaultMessage: '99+', id: 'jPEeJl', description: 'Notification count overflow indicator' }) : unreadCount}
            </span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 max-h-96 bg-base-100 rounded-box shadow-2xl border border-base-300 z-[1] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-base-300">
            <span className="font-semibold text-sm">
              {formatMessage({ defaultMessage: 'Notifications', id: 'cUwcuO', description: 'Notifications dropdown header' })}
            </span>
            {unreadCount > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={() => markAllRead()}>
                {formatMessage({ defaultMessage: 'Mark all read', id: 'oEDuz6', description: 'Button to mark all notifications as read' })}
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto flex-1">
            {!hasLoaded ? (
              <div className="flex justify-center py-6">
                <span className="loading loading-spinner loading-sm" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center text-base-content/60 py-6 text-sm">
                {formatMessage({ defaultMessage: 'No notifications', id: 'AOhW8E', description: 'Empty state for notification list' })}
              </div>
            ) : (
              <>
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    className={`w-full text-left px-4 py-3 hover:bg-base-200 transition-colors border-b border-base-300/50 last:border-b-0 ${
                      !n.readAt ? 'bg-base-200/50' : ''
                    }`}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      <div className={`flex-1 min-w-0 ${n.readAt ? 'ml-4' : ''}`}>
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        {n.body && <p className="text-xs text-base-content/70 mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-xs text-base-content/50 mt-1">{formatRelativeTime(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                ))}
                {nextCursor && (
                  <button className="w-full text-center py-2 text-xs text-primary hover:underline" onClick={loadMore} disabled={isLoading}>
                    {isLoading ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      formatMessage({ defaultMessage: 'Load more', id: 'd+xPoU', description: 'Button to load more notifications' })
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
