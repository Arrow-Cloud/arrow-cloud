import React from 'react';
import { HomePageNew } from './HomePageNew';

/**
 * HomePage component that renders the home page for all users.
 *
 * For logged-in users: Shows Recent Scores and Recent Packs
 * For logged-out users: Also shows Welcome, Get Set Up, and Support sections
 */
export const HomePage: React.FC = () => {
  return <HomePageNew />;
};
