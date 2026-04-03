import {
  login,
  register,
  verifyEmail,
  resendVerificationEmail,
  getUser,
  requestPasswordReset,
  resetPassword,
  passkeyRegistrationStart,
  passkeyRegistrationComplete,
  passkeyAuthenticationStart,
  passkeyAuthenticationComplete,
  getUserPasskeys,
  deletePasskey,
} from '../controllers/auth';
import { getPack, listPacks, getPackRecentPlays } from '../controllers/pack';
import { listUsers } from '../controllers/users';
import { getPackUploadUrl } from '../controllers/pack-upload';
import { getSimfile, listSimfiles } from '../controllers/simfile';
import { updateProfile, getUserById, updateUserPreferredLeaderboards, banUser, getUserTrophiesHandler, updateUserTrophyOrder } from '../controllers/profile';
import { getProfileImageUploadUrl, updateProfileImage, deleteProfileImage } from '../controllers/profile-image';
import { statsRenderer } from '../controllers/stats';
import { Routes } from '../utils/types';
import { getChart, listCharts, getChartRecentPlays } from '../controllers/chart';
import { getLeaderboardsForChartPublic } from '../controllers/leaderboard';
import { blueShift, blueShiftAllPhases } from '../controllers/blueshift';
import { getCountries } from '../controllers/countries';
import { listRivals, addRival, deleteRival, autocompleteUsers } from '../controllers/rivals';
import { listApiKeys, createApiKey, deleteApiKey } from '../controllers/api-keys';
import { downloadArrowCloudIni } from '../controllers/arrowcloud-ini';
import { getPlay as getPlayController, deletePlay as deletePlayController } from '../controllers/play';
import { getSession, getRecentSessions, getUserSessions } from '../controllers/session';
import { getWidgetData } from '../controllers/widget';
import { getGlobalRecentScores } from '../controllers/global-scores';
import { listNotifications, markRead, markAllRead } from '../controllers/notifications';

export const webRoutes: Routes = {
  '/login': {
    POST: {
      handler: login,
      requiresAuth: false,
    },
  },
  '/register': {
    POST: {
      handler: register,
      requiresAuth: false,
    },
  },
  '/verify-email': {
    POST: {
      handler: verifyEmail,
      requiresAuth: false,
    },
  },
  '/resend-verification': {
    POST: {
      handler: resendVerificationEmail,
      requiresAuth: true,
    },
  },
  '/request-password-reset': {
    POST: {
      handler: requestPasswordReset,
      requiresAuth: false,
    },
  },
  '/reset-password': {
    POST: {
      handler: resetPassword,
      requiresAuth: false,
    },
  },
  '/user': {
    GET: {
      handler: getUser,
      requiresAuth: true,
    },
    PUT: {
      handler: updateProfile,
      requiresAuth: true,
    },
  },
  '/user/leaderboards': {
    PUT: {
      handler: updateUserPreferredLeaderboards,
      requiresAuth: true,
    },
  },
  '/user/trophies': {
    GET: {
      handler: getUserTrophiesHandler,
      requiresAuth: true,
    },
    PUT: {
      handler: updateUserTrophyOrder,
      requiresAuth: true,
    },
  },
  '/user/{userId}': {
    GET: {
      handler: getUserById,
      requiresAuth: false,
      patternMatching: {
        userId: /[a-f0-9-]{36}/,
      },
    },
  },
  '/user/{userId}/ban': {
    POST: {
      handler: banUser,
      requiresAuth: true,
      requiresPermissions: ['users.ban'],
      patternMatching: {
        userId: /[a-f0-9-]{36}/,
      },
    },
  },
  '/v1/stats': {
    GET: {
      handler: statsRenderer,
      requiresAuth: false,
    },
  },
  '/passkey/register/start': {
    POST: {
      handler: passkeyRegistrationStart,
      requiresAuth: true,
    },
  },
  '/passkey/register/complete': {
    POST: {
      handler: passkeyRegistrationComplete,
      requiresAuth: true,
    },
  },
  '/passkey/auth/start': {
    POST: {
      handler: passkeyAuthenticationStart,
      requiresAuth: false,
    },
  },
  '/passkey/auth/complete': {
    POST: {
      handler: passkeyAuthenticationComplete,
      requiresAuth: false,
    },
  },
  '/passkeys': {
    GET: {
      handler: getUserPasskeys,
      requiresAuth: true,
    },
  },
  '/passkey/{passkeyId}': {
    DELETE: {
      handler: deletePasskey,
      requiresAuth: true,
      patternMatching: {
        passkeyId: /[a-f0-9-]{36}/,
      },
    },
  },
  '/profile-image/upload-url': {
    POST: {
      handler: getProfileImageUploadUrl,
      requiresAuth: true,
    },
  },
  '/profile-image': {
    PUT: {
      handler: updateProfileImage,
      requiresAuth: true,
    },
    DELETE: {
      handler: deleteProfileImage,
      requiresAuth: true,
    },
  },
  '/pack/upload-url': {
    POST: {
      handler: getPackUploadUrl,
      requiresAuth: true,
      requiresPermissions: ['packs.upload'],
    },
  },
  '/packs': {
    GET: {
      handler: listPacks,
      requiresAuth: false,
    },
  },
  '/pack/{packId}': {
    GET: {
      handler: getPack,
      requiresAuth: false,
      patternMatching: {
        packId: /\d+/,
      },
    },
  },
  '/pack/{packId}/recent-plays': {
    GET: {
      handler: getPackRecentPlays,
      requiresAuth: false,
      patternMatching: {
        packId: /\d+/,
      },
    },
  },
  '/simfiles': {
    GET: {
      handler: listSimfiles,
      requiresAuth: false,
    },
  },
  '/simfile/{simfileId}': {
    GET: {
      handler: getSimfile,
      requiresAuth: false,
      patternMatching: {
        simfileId: /\d+/,
      },
    },
  },
  '/charts': {
    GET: {
      handler: listCharts,
      requiresAuth: false,
    },
  },
  '/users': {
    GET: {
      handler: listUsers,
      requiresAuth: false,
    },
  },
  '/chart/{chartHash}': {
    GET: {
      handler: getChart,
      requiresAuth: false,
      patternMatching: {
        chartHash: /[a-f0-9]{16}/,
      },
    },
  },
  '/chart/{chartHash}/recent-plays': {
    GET: {
      handler: getChartRecentPlays,
      requiresAuth: false,
      patternMatching: {
        chartHash: /[a-f0-9]{16}/,
      },
    },
  },
  '/chart/{chartHash}/leaderboards': {
    GET: {
      handler: getLeaderboardsForChartPublic,
      requiresAuth: false,
      patternMatching: {
        chartHash: /[a-f0-9]{16}/,
      },
    },
  },
  '/play/{playId}': {
    GET: {
      handler: getPlayController,
      requiresAuth: false,
      patternMatching: {
        playId: /\d+/, // numeric play ID
      },
    },
    DELETE: {
      handler: deletePlayController,
      requiresAuth: true,
      patternMatching: {
        playId: /\d+/, // numeric play ID
      },
    },
  },
  '/session/{sessionId}': {
    GET: {
      handler: getSession,
      requiresAuth: false,
      patternMatching: {
        sessionId: /\d+/, // numeric session ID
      },
    },
  },
  '/sessions/recent': {
    GET: {
      handler: getRecentSessions,
      optionalAuth: true, // Auth is optional - used for rivals filter
    },
  },
  '/user/{userId}/sessions': {
    GET: {
      handler: getUserSessions,
      requiresAuth: false,
      patternMatching: {
        userId: /[a-f0-9-]{36}/,
      },
    },
  },
  '/blueshift': {
    GET: {
      handler: blueShift,
      requiresAuth: false,
    },
  },
  '/blueshift/all-phases': {
    GET: {
      handler: blueShiftAllPhases,
      requiresAuth: false,
    },
  },
  '/countries': {
    GET: {
      handler: getCountries,
      requiresAuth: false,
    },
  },
  '/rivals': {
    GET: {
      handler: listRivals,
      requiresAuth: true,
    },
    POST: {
      handler: addRival,
      requiresAuth: true,
    },
  },
  '/rival/{userId}': {
    DELETE: {
      handler: deleteRival,
      requiresAuth: true,
      patternMatching: {
        userId: /[a-f0-9-]{36}/,
      },
    },
  },
  '/users/autocomplete': {
    GET: {
      handler: autocompleteUsers,
      requiresAuth: true,
    },
  },
  '/api-keys': {
    GET: {
      handler: listApiKeys,
      requiresAuth: true,
    },
    POST: {
      handler: createApiKey,
      requiresAuth: true,
    },
  },
  '/api-key/{keyId}': {
    DELETE: {
      handler: deleteApiKey,
      requiresAuth: true,
      patternMatching: {
        keyId: /[a-f0-9]{64}/, // sha256 hex
      },
    },
  },
  '/arrowcloud.ini': {
    GET: {
      handler: downloadArrowCloudIni,
      requiresAuth: true,
    },
  },
  '/widget/blueshift/data': {
    GET: {
      handler: getWidgetData,
      requiresAuth: false,
    },
  },
  '/scores/recent': {
    GET: {
      handler: getGlobalRecentScores,
      optionalAuth: true,
    },
  },
  '/notifications': {
    GET: {
      handler: listNotifications,
      requiresAuth: true,
    },
  },
  '/notifications/read-all': {
    PUT: {
      handler: markAllRead,
      requiresAuth: true,
    },
  },
  '/notifications/{notificationId}/read': {
    PUT: {
      handler: markRead,
      requiresAuth: true,
      patternMatching: {
        notificationId: /\d+/,
      },
    },
  },
};
