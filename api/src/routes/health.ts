import { authCheck, healthCheck, mailCheck, postCheck } from '../controllers/health';
import { Routes } from '../utils/types';

export const healthRoutes: Routes = {
  '/': {
    GET: {
      handler: healthCheck,
      requiresAuth: false,
    },
  },
  '/auth-check': {
    // diagnostic route
    GET: {
      handler: authCheck,
      requiresAuth: true,
    },
  },
  '/post-check': {
    // diagnostic route
    POST: {
      handler: postCheck,
      requiresAuth: true,
    },
  },
  '/mail-check': {
    // diagnostic route
    POST: {
      handler: mailCheck,
      requiresAuth: true,
    },
  },
};
