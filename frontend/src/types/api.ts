export interface StatCard {
  title: string;
  value: string;
  description: string;
  icon: string;
}

export interface StatsResponse {
  cards: StatCard[];
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  alias: string;
  password: string;
}

export interface UpdateProfileRequest {
  alias?: string;
  countryId?: number;
  timezone?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateProfileResponse {
  user: User;
  message: string;
}

export interface RequestPasswordResetRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  alias: string;
  profileImageUrl?: string | null;
  timezone?: string | null;
  emailVerifiedAt?: string;
  countryId?: number | null;
  country?: {
    id: number;
    name: string;
    code: string;
  } | null;
  stats?: {
    totalPlays?: number;
    chartsPlayed?: number;
  } | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ProfileImageUploadUrlRequest {
  filename: string;
  contentType: string;
}

export interface ProfileImageUploadUrlResponse {
  uploadUrl: string;
  uploadKey: string;
  expiresIn: number;
  profileImageUrl: string;
}

export interface UpdateProfileImageRequest {
  profileImageUrl: string;
}

export interface ProfileImageResponse {
  user: User;
  message: string;
}
