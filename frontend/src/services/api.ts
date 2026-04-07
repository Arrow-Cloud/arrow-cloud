import axios, { AxiosError } from 'axios';
import {
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
  ProfileImageUploadUrlRequest,
  UpdateProfileImageRequest,
} from '../types/api';
import {
  statsResponseSchema,
  authResponseSchema,
  updateProfileResponseSchema,
  passkeysResponseSchema,
  successResponseSchema,
  listPacksResponseSchema,
  listUsersResponseSchema,
  packDetailsSchema,
  listChartsResponseSchema,
  listSimfilesResponseSchema,
  chartDetailsSchema,
  chartLeaderboardResponseSchema,
  blueShiftResponseSchema,
  blueShiftAllPhasesResponseSchema,
  blueShiftOverallSummarySchema,
  userProfileResponseSchema,
  userProfileWithMetaResponseSchema,
  getUserResponseSchema,
  type StatsResponse as ValidatedStatsResponse,
  type AuthResponse as ValidatedAuthResponse,
  type UpdateProfileResponse as ValidatedUpdateProfileResponse,
  type PasskeysResponse,
  type SuccessResponse,
  type ListPacksResponse,
  type ListUsersResponse,
  type PackDetails,
  type ListChartsResponse,
  type ListSimfilesResponse,
  type ChartDetails,
  type ChartLeaderboardResponse,
  type UserProfileResponse,
  type GetUserResponse,
  type PreferredLeaderboards,
  type BlueShiftResponse,
  type BlueShiftAllPhasesResponse,
  type BlueShiftOverallSummary,
  type PackRecentPlay,
  listApiKeysResponseSchema,
  createApiKeyResponseSchema,
  type ListApiKeysResponse,
  type CreateApiKeyResponse,
  playDetailsSchema,
  type PlayDetails,
  type UserRecentPlaysMeta,
  widgetDataResponseSchema,
  type WidgetDataResponse,
  sessionDetailsSchema,
  type SessionDetails,
  notificationsResponseSchema,
  type NotificationsResponse,
} from '../schemas/apiSchemas';

const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'https://api.arrowcloud.dance';
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});
// Helper function to validate API responses with Zod
const validateResponse = <T>(schema: any, data: unknown, endpoint: string): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`API Response validation failed for ${endpoint}:`, result.error.issues);
    throw new Error(`Invalid response format from ${endpoint}`);
  }
  return result.data;
};

// Request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor for auth + error normalization
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent('auth:logout'));
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Pass through conflict errors so callers can inspect response data (e.g. duplicate detection)
    if (error.response?.status === 409) {
      throw error;
    }

    if (error.response?.data) {
      const data = error.response.data as any;
      if (data.error) throw new Error(data.error);
      if (data.message) throw new Error(data.message);
    }

    throw new Error(error.message || 'An unexpected error occurred');
  },
);

export const getStats = async (): Promise<ValidatedStatsResponse> => {
  const response = await api.get('/v1/stats');
  return validateResponse(statsResponseSchema, response.data, '/v1/stats');
};

export const login = async (credentials: LoginRequest): Promise<ValidatedAuthResponse> => {
  const response = await api.post('/login', credentials);
  return validateResponse(authResponseSchema, response.data, '/login');
};

export const register = async (credentials: RegisterRequest): Promise<ValidatedAuthResponse> => {
  const response = await api.post('/register', credentials);
  return validateResponse(authResponseSchema, response.data, '/register');
};

export const verifyEmail = async (data: { token: string }): Promise<ValidatedAuthResponse> => {
  const response = await api.post('/verify-email', data);
  return validateResponse(authResponseSchema, response.data, '/verify-email');
};

export const resendVerificationEmail = async (): Promise<void> => {
  await api.post('/resend-verification');
};

export const getUser = async (): Promise<GetUserResponse> => {
  const response = await api.get('/user');
  return validateResponse(getUserResponseSchema, response.data, '/user');
};

export interface GetUserRecentPlaysParams {
  page?: number;
  limit?: number;
  search?: string;
  leaderboard?: string; // HardEX | EX | ITG
  minMeter?: number;
  maxMeter?: number;
  includeUnknown?: boolean;
  orderBy?: 'date' | 'score';
  orderDirection?: 'asc' | 'desc';
}

export const getUserById = async (
  userId: string,
  params: GetUserRecentPlaysParams = {},
): Promise<UserProfileResponse & { recentPlaysMeta?: UserRecentPlaysMeta }> => {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.append('page', String(params.page));
  if (params.limit) searchParams.append('limit', String(params.limit));
  if (params.search) searchParams.append('search', params.search);
  if (params.leaderboard) searchParams.append('leaderboard', params.leaderboard);
  if (typeof params.minMeter === 'number') searchParams.append('minMeter', String(params.minMeter));
  if (typeof params.maxMeter === 'number') searchParams.append('maxMeter', String(params.maxMeter));
  if (typeof params.includeUnknown === 'boolean') searchParams.append('includeUnknown', String(params.includeUnknown));
  if (params.orderBy) searchParams.append('orderBy', params.orderBy);
  if (params.orderDirection) searchParams.append('orderDirection', params.orderDirection);
  const qs = searchParams.toString();
  const response = await api.get(`/user/${userId}${qs ? `?${qs}` : ''}`);
  // Accept either legacy shape (no meta) or new shape (with recentPlaysMeta)
  const withMeta = userProfileWithMetaResponseSchema.safeParse(response.data);
  if (withMeta.success) {
    return withMeta.data as unknown as UserProfileResponse & { recentPlaysMeta?: UserRecentPlaysMeta };
  }
  return validateResponse(userProfileResponseSchema, response.data, `/user/${userId}`) as UserProfileResponse;
};

export const updatePreferredLeaderboards = async (leaderboardIds: PreferredLeaderboards): Promise<GetUserResponse['user']> => {
  const response = await api.put('/user/leaderboards', { leaderboardIds });
  const parsed = getUserResponseSchema.safeParse(response.data);
  if (parsed.success) {
    return parsed.data.user;
  }
  console.error('Failed to parse /user/leaderboards response', parsed.error?.issues, response.data);
  throw new Error('Invalid response from /user/leaderboards');
};

// Trophy types
export interface UserTrophy {
  id: number;
  name: string;
  description: string;
  tier: string;
  imageUrl: string | null;
  displayOrder: number | null;
  createdAt: string;
}

export interface GetUserTrophiesResponse {
  trophies: UserTrophy[];
}

export const getUserTrophies = async (): Promise<GetUserTrophiesResponse> => {
  const response = await api.get('/user/trophies');
  return response.data as GetUserTrophiesResponse;
};

export const updateTrophyOrder = async (trophyOrders: Array<{ trophyId: number; displayOrder: number | null }>): Promise<GetUserTrophiesResponse> => {
  const response = await api.put('/user/trophies', { trophyOrders });
  return response.data as GetUserTrophiesResponse;
};

export const updateProfile = async (data: UpdateProfileRequest): Promise<ValidatedUpdateProfileResponse> => {
  const response = await api.put('/user', data);
  return validateResponse(updateProfileResponseSchema, response.data, '/user');
};

export const requestPasswordReset = async (data: RequestPasswordResetRequest): Promise<void> => {
  await api.post('/request-password-reset', data);
};

export const resetPassword = async (data: ResetPasswordRequest): Promise<ValidatedAuthResponse> => {
  const response = await api.post('/reset-password', data);
  return validateResponse(authResponseSchema, response.data, '/reset-password');
};

// Passkey API functions
export const passkeyRegistrationStart = async (data: { name: string }): Promise<any> => {
  const response = await api.post('/passkey/register/start', data);
  return response.data;
};

export const passkeyRegistrationComplete = async (data: { credential: any; passkeyName: string }): Promise<SuccessResponse> => {
  const response = await api.post('/passkey/register/complete', data);
  return validateResponse(successResponseSchema, response.data, '/passkey/register/complete');
};

export const passkeyAuthenticationStart = async (): Promise<any> => {
  const response = await api.post('/passkey/auth/start', {});
  return response.data;
};

export const passkeyAuthenticationComplete = async (data: { credential: any }): Promise<ValidatedAuthResponse> => {
  const response = await api.post('/passkey/auth/complete', data);
  return validateResponse(authResponseSchema, response.data, '/passkey/auth/complete');
};

export const getUserPasskeys = async (): Promise<PasskeysResponse> => {
  const response = await api.get('/passkeys');
  return validateResponse(passkeysResponseSchema, response.data, '/passkeys');
};

export const deletePasskey = async (passkeyId: string): Promise<SuccessResponse> => {
  const response = await api.delete(`/passkey/${passkeyId}`);
  return validateResponse(successResponseSchema, response.data, `/passkey/${passkeyId}`);
};

// Pack management API functions
export const uploadPack = async (zipBlob: Blob, packName: string): Promise<any> => {
  const formData = new FormData();
  formData.append('packFile', zipBlob, `${packName}.zip`);

  const response = await api.post('/v1/pack/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

// New S3-based upload functions for large files
export type PackDuplicateDecision = 'confirm' | 'deny';

export interface PackDuplicateSummary {
  existingPack: { id: number; name: string } | null;
  duplicateDetected: boolean;
}

export const getPackUploadUrl = async (
  filename: string,
  options?: {
    packName?: string;
    duplicateDecision?: PackDuplicateDecision;
  },
): Promise<{ uploadUrl?: string; uploadKey?: string; expiresIn?: number; cancelled?: boolean; duplicateSummary?: PackDuplicateSummary }> => {
  const response = await api.post('/pack/upload-url', {
    filename,
    contentType: 'application/zip',
    packName: options?.packName,
    duplicateDecision: options?.duplicateDecision,
  });
  return response.data;
};

export const uploadPackToS3 = async (uploadUrl: string, zipBlob: Blob, onProgress?: (progress: number) => void): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('S3 upload failed: Network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('S3 upload was aborted'));
    });

    // Start the upload
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.send(zipBlob);
  });
};

// Pack API functions
export interface ListPacksParams {
  page?: number;
  limit?: number;
  search?: string;
  orderBy?: 'name' | 'createdAt' | 'updatedAt' | 'simfileCount' | 'popularity';
  orderDirection?: 'asc' | 'desc';
}

export const listPacks = async (params: ListPacksParams = {}): Promise<ListPacksResponse> => {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.search) searchParams.append('search', params.search);
  if (params.orderBy) searchParams.append('orderBy', params.orderBy);
  if (params.orderDirection) searchParams.append('orderDirection', params.orderDirection);

  const response = await api.get(`/packs?${searchParams.toString()}`);
  return validateResponse(listPacksResponseSchema, response.data, '/packs');
};

// User list API functions
export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  countryId?: number;
  orderBy?: 'alias' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}

export const listUsers = async (params: ListUsersParams = {}): Promise<ListUsersResponse> => {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.search) searchParams.append('search', params.search);
  if (params.countryId) searchParams.append('countryId', params.countryId.toString());
  if (params.orderBy) searchParams.append('orderBy', params.orderBy);
  if (params.orderDirection) searchParams.append('orderDirection', params.orderDirection);

  const response = await api.get(`/users?${searchParams.toString()}`);
  return validateResponse(listUsersResponseSchema, response.data, '/users');
};

export const getPack = async (packId: number): Promise<PackDetails> => {
  const response = await api.get(`/pack/${packId}`);
  return validateResponse(packDetailsSchema, response.data, `/pack/${packId}`);
};

export interface GetPackRecentPlaysParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface GetPackRecentPlaysResponse {
  data: PackRecentPlay[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters: {
    search: string | null;
  };
}

export const getPackRecentPlays = async (packId: number, params: GetPackRecentPlaysParams = {}): Promise<GetPackRecentPlaysResponse> => {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.search) searchParams.append('search', params.search);

  const response = await api.get(`/pack/${packId}/recent-plays?${searchParams.toString()}`);
  return response.data as GetPackRecentPlaysResponse;
};

// Chart API functions
export interface ListChartsParams {
  page?: number;
  limit?: number;
  search?: string;
  stepsType?: string;
  difficulty?: string;
  packId?: number;
  orderBy?: 'songName' | 'artist' | 'createdAt' | 'updatedAt' | 'rating' | 'length' | 'meter';
  orderDirection?: 'asc' | 'desc';
}

export const listCharts = async (params: ListChartsParams = {}): Promise<ListChartsResponse> => {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.search) searchParams.append('search', params.search);
  if (params.stepsType) searchParams.append('stepsType', params.stepsType);
  if (params.difficulty) searchParams.append('difficulty', params.difficulty);
  if (params.packId) searchParams.append('packId', params.packId.toString());
  if (params.orderBy) searchParams.append('orderBy', params.orderBy);
  if (params.orderDirection) searchParams.append('orderDirection', params.orderDirection);

  const response = await api.get(`/charts?${searchParams.toString()}`);
  return validateResponse(listChartsResponseSchema, response.data, '/charts');
};

export const getChart = async (chartHash: string): Promise<ChartDetails> => {
  const response = await api.get(`/chart/${chartHash}`);
  return validateResponse(chartDetailsSchema, response.data, `/chart/${chartHash}`);
};

export const getChartLeaderboards = async (chartHash: string, page?: number): Promise<ChartLeaderboardResponse> => {
  const q = page && page > 1 ? `?page=${page}` : '';
  const response = await api.get(`/chart/${chartHash}/leaderboards${q}`);
  return validateResponse(chartLeaderboardResponseSchema, response.data, `/chart/${chartHash}/leaderboards`);
};

export interface GetChartRecentPlaysParams {
  page?: number;
  limit?: number;
  search?: string;
  userIds?: string[];
}

export interface GetChartRecentPlaysResponse {
  data: PackRecentPlay[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters: {
    search: string | null;
  };
}

export const getChartRecentPlays = async (chartHash: string, params: GetChartRecentPlaysParams = {}): Promise<GetChartRecentPlaysResponse> => {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.search) searchParams.append('search', params.search);
  if (params.userIds && params.userIds.length > 0) searchParams.append('userIds', params.userIds.join(','));

  const response = await api.get(`/chart/${chartHash}/recent-plays?${searchParams.toString()}`);
  return response.data as GetChartRecentPlaysResponse;
};

// Global recent scores
export interface GlobalRecentScore {
  playId?: number;
  chart: {
    hash: string;
    bannerUrl: string | null;
    mdBannerUrl?: string | null;
    smBannerUrl?: string | null;
    bannerVariants?: {
      original?: { url: string; format: string; width: number; height: number }[];
      md?: { url: string; format: string; width: number; height: number }[];
      sm?: { url: string; format: string; width: number; height: number }[];
    };
    title: string;
    artist: string;
    stepsType: string | null;
    difficulty: string | null;
    meter: number | null;
  };
  user: {
    id: string;
    alias: string;
    profileImageUrl?: string | null;
  };
  leaderboards: {
    leaderboard: string;
    data: { score: string; grade?: string };
  }[];
  createdAt: string;
}

export interface GetGlobalRecentScoresParams {
  page?: number;
  limit?: number;
  rivalsOnly?: boolean;
}

export interface GetGlobalRecentScoresResponse {
  data: GlobalRecentScore[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export const getGlobalRecentScores = async (params: GetGlobalRecentScoresParams = {}): Promise<GetGlobalRecentScoresResponse> => {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.rivalsOnly) searchParams.append('rivalsOnly', 'true');

  const response = await api.get(`/scores/recent?${searchParams.toString()}`);
  return response.data as GetGlobalRecentScoresResponse;
};

// Individual play (score)
export const getPlay = async (playId: number): Promise<PlayDetails> => {
  const response = await api.get(`/play/${playId}`);
  return validateResponse(playDetailsSchema, response.data, `/play/${playId}`);
};

export const deletePlay = async (playId: number): Promise<{ message: string; deletedPlayId: number }> => {
  const response = await api.delete(`/play/${playId}`);
  return response.data;
};

// Session API functions
export interface GetSessionParams {
  page?: number;
  limit?: number;
  pbOnly?: boolean;
  leaderboard?: 'EX' | 'ITG' | 'HardEX';
}

export const getSession = async (sessionId: number, params: GetSessionParams = {}): Promise<SessionDetails> => {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.pbOnly) searchParams.append('pbOnly', 'true');
  if (params.leaderboard) searchParams.append('leaderboard', params.leaderboard);

  const queryString = searchParams.toString();
  const url = queryString ? `/session/${sessionId}?${queryString}` : `/session/${sessionId}`;
  const response = await api.get(url);
  return validateResponse(sessionDetailsSchema, response.data, `/session/${sessionId}`);
};

// Session summary for list views
export interface SessionSummary {
  id: number;
  userId: string;
  userAlias: string;
  userProfileImageUrl: string | null;
  startedAt: string;
  endedAt: string;
  isOngoing: boolean;
  playCount: number;
  stepsHit: number;
}

export interface GetRecentSessionsParams {
  page?: number;
  limit?: number;
  rivalsOnly?: boolean;
}

export interface GetRecentSessionsResponse {
  data: SessionSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export const getRecentSessions = async (params: GetRecentSessionsParams = {}): Promise<GetRecentSessionsResponse> => {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.rivalsOnly) searchParams.append('rivalsOnly', 'true');

  const response = await api.get(`/sessions/recent?${searchParams.toString()}`);
  return response.data as GetRecentSessionsResponse;
};

export interface GetUserSessionsParams {
  page?: number;
  limit?: number;
}

export const getUserSessions = async (userId: string, params: GetUserSessionsParams = {}): Promise<GetRecentSessionsResponse> => {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());

  const response = await api.get(`/user/${userId}/sessions?${searchParams.toString()}`);
  return response.data as GetRecentSessionsResponse;
};

// Simfile API functions
export interface ListSimfilesParams {
  page?: number;
  limit?: number;
  search?: string;
  packId?: number;
  orderBy?: 'title' | 'artist';
  orderDirection?: 'asc' | 'desc';
}

export const listSimfiles = async (params: ListSimfilesParams = {}): Promise<ListSimfilesResponse> => {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.search) searchParams.append('search', params.search);
  if (params.packId) searchParams.append('packId', params.packId.toString());
  if (params.orderBy) searchParams.append('orderBy', params.orderBy);
  if (params.orderDirection) searchParams.append('orderDirection', params.orderDirection);

  const response = await api.get(`/simfiles?${searchParams.toString()}`);
  return validateResponse(listSimfilesResponseSchema, response.data, '/simfiles');
};

// Blue Shift API functions
export const getBlueShiftData = async (limit?: number | null): Promise<BlueShiftResponse> => {
  const params = new URLSearchParams();
  if (limit !== undefined) {
    params.append('limit', limit === null ? 'null' : String(limit));
  }
  const queryString = params.toString();
  const response = await api.get(`/blueshift${queryString ? `?${queryString}` : ''}`);
  return validateResponse(blueShiftResponseSchema, response.data, '/blueshift');
};

export const getBlueShiftAllPhases = async (limit?: number | null): Promise<BlueShiftAllPhasesResponse> => {
  const params = new URLSearchParams();
  if (limit !== undefined) {
    params.append('limit', limit === null ? 'null' : String(limit));
  }
  const queryString = params.toString();
  const response = await api.get(`/blueshift/all-phases${queryString ? `?${queryString}` : ''}`);
  return validateResponse(blueShiftAllPhasesResponseSchema, response.data, '/blueshift/all-phases');
};

export const getBlueShiftOverallSummary = async (): Promise<BlueShiftOverallSummary> => {
  // Fetch directly from S3/CloudFront
  const cdnUrl = 'https://assets.arrowcloud.dance/json/blueshift-overall-summary.json';
  const response = await axios.get(cdnUrl);
  return validateResponse(blueShiftOverallSummarySchema, response.data, 'blueshift-overall-summary.json');
};

// Profile Image API functions
export const getProfileImageUploadUrl = async (data: ProfileImageUploadUrlRequest): Promise<any> => {
  const response = await api.post('/profile-image/upload-url', data);
  return response.data;
};

export const uploadProfileImageToS3 = async (uploadUrl: string, imageFile: File, onProgress?: (progress: number) => void): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Profile image S3 upload failed: Network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Profile image S3 upload was aborted'));
    });

    // Start the upload
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', imageFile.type);
    xhr.send(imageFile);
  });
};

export const updateProfileImage = async (data: UpdateProfileImageRequest): Promise<any> => {
  const response = await api.put('/profile-image', data);
  return response.data;
};

export const deleteProfileImage = async (): Promise<any> => {
  const response = await api.delete('/profile-image');
  return response.data;
};

// Countries API functions
export interface Country {
  id: number;
  name: string;
  code: string;
}

export const getCountries = async (): Promise<{ countries: Country[] }> => {
  const response = await api.get('/countries');
  return response.data;
};

// Rivals API
export interface RivalEntry {
  userId: string;
  alias: string;
  profileImageUrl: string | null;
  createdAt?: string; // returned by list
}

export const listRivals = async (): Promise<{ rivals: RivalEntry[] }> => {
  const response = await api.get('/rivals');
  return response.data;
};

export const addRival = async (payload: { rivalUserId?: string; rivalAlias?: string }): Promise<{ rival: RivalEntry }> => {
  const response = await api.post('/rivals', payload);
  return response.data;
};

export const deleteRival = async (rivalUserId: string): Promise<void> => {
  await api.delete(`/rival/${rivalUserId}`);
};

// User banning API
export interface BanUserRequest {
  reason?: string;
  deleteData?: boolean;
}

export interface BanUserResponse {
  message: string;
  user: {
    id: string;
    alias: string;
    email: string;
  };
  reason: string;
  dataDeleted: boolean;
}

export const banUser = async (userId: string, request: BanUserRequest = {}): Promise<BanUserResponse> => {
  const response = await api.post(`/user/${userId}/ban`, request);
  return response.data;
};

export const autocompleteUsers = async (query: string): Promise<{ users: RivalEntry[] }> => {
  const response = await api.get(`/users/autocomplete?query=${encodeURIComponent(query)}`);
  return response.data;
};

// API Keys
export const listApiKeys = async (): Promise<ListApiKeysResponse> => {
  const response = await api.get('/api-keys');
  return validateResponse(listApiKeysResponseSchema, response.data, '/api-keys');
};

export const createApiKey = async (): Promise<CreateApiKeyResponse> => {
  const response = await api.post('/api-keys', {});
  return validateResponse(createApiKeyResponseSchema, response.data, '/api-keys');
};

export const deleteApiKey = async (keyId: string): Promise<SuccessResponse> => {
  const response = await api.delete(`/api-key/${keyId}`);
  return validateResponse(successResponseSchema, response.data, `/api-key/${keyId}`);
};

// ArrowCloud.ini download (generates a new API key)
export const downloadArrowCloudIni = async (): Promise<Blob> => {
  const response = await api.get('/arrowcloud.ini', {
    responseType: 'blob',
  });
  return response.data as Blob;
};

// Widget data
export const getWidgetData = async (userId: string, features?: string): Promise<WidgetDataResponse> => {
  const params = new URLSearchParams({ userId });
  if (features) {
    params.append('features', features);
  }
  const response = await api.get(`/widget/blueshift/data?${params.toString()}`);
  return validateResponse(widgetDataResponseSchema, response.data, '/widget/blueshift/data');
};

// Notifications
export const getNotifications = async (cursor?: number): Promise<NotificationsResponse> => {
  const params = new URLSearchParams();
  if (cursor) params.append('cursor', cursor.toString());
  const query = params.toString();
  const url = query ? `/notifications?${query}` : '/notifications';
  const response = await api.get(url);
  return validateResponse(notificationsResponseSchema, response.data, '/notifications');
};

export const markNotificationRead = async (notificationId: number): Promise<void> => {
  await api.put(`/notifications/${notificationId}/read`);
};

export const markAllNotificationsRead = async (): Promise<void> => {
  await api.put('/notifications/read-all');
};
