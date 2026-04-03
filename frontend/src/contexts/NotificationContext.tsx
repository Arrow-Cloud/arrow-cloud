import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getNotifications as apiGetNotifications, markNotificationRead as apiMarkRead, markAllNotificationsRead as apiMarkAllRead } from '../services/api';
import { Notification } from '../schemas/apiSchemas';

interface NotificationContextType {
  unreadCount: number;
  notifications: Notification[];
  hasLoaded: boolean;
  isLoading: boolean;
  nextCursor: number | null;
  fetchNotifications: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Derive unread count from user object on initial load
  const effectiveUnreadCount = hasLoaded ? unreadCount : (user?.unreadNotificationCount ?? 0);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGetNotifications();
      setNotifications(data.notifications);
      setNextCursor(data.nextCursor);
      setHasLoaded(true);
      // Compute unread count from fetched data
      setUnreadCount(data.notifications.filter((n) => !n.readAt).length);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    try {
      const data = await apiGetNotifications(nextCursor);
      setNotifications((prev) => [...prev, ...data.notifications]);
      setNextCursor(data.nextCursor);
      setUnreadCount((prev) => prev + data.notifications.filter((n) => !n.readAt).length);
    } catch (err) {
      console.error('Failed to load more notifications', err);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading]);

  const markRead = useCallback(async (id: number) => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await apiMarkRead(id);
    } catch (err) {
      console.error('Failed to mark notification as read', err);
      // Revert on failure
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: null } : n)));
      setUnreadCount((prev) => prev + 1);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const previousNotifications = notifications;
    const previousCount = unreadCount;

    // Optimistic update
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);

    try {
      await apiMarkAllRead();
    } catch (err) {
      console.error('Failed to mark all notifications as read', err);
      // Revert on failure
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
    }
  }, [notifications, unreadCount]);

  const value: NotificationContextType = {
    unreadCount: effectiveUnreadCount,
    notifications,
    hasLoaded,
    isLoading,
    nextCursor,
    fetchNotifications,
    loadMore,
    markRead,
    markAllRead,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
