import { scoreSubmission } from '../controllers/chart';
import { getLeaderboardsForChart } from '../controllers/leaderboard';
import { Routes } from '../utils/types';

export const apiRoutes: Routes = {
  '/v1/chart/{chartHash}/play': {
    POST: {
      handler: scoreSubmission,
      requiresAuth: true,
      patternMatching: {
        chartHash: /[a-f0-9]{16}/,
      },
    },
  },
  '/v1/chart/{chartHash}/leaderboards': {
    GET: {
      handler: getLeaderboardsForChart,
      requiresAuth: true,
      patternMatching: {
        chartHash: /[a-f0-9]{16}/,
      },
    },
  }
};
