import { z } from 'zod';

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  alias: z.string(),
  profileImageUrl: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  emailVerifiedAt: z.string().optional().nullable(),
  countryId: z.number().optional().nullable(),
  // Indicates whether the user has submitted at least one score (play)
  userHasSubmittedScore: z.boolean().optional(),
  unreadNotificationCount: z.number().optional(),
  country: z
    .object({
      id: z.number(),
      name: z.string(),
      code: z.string(),
    })
    .optional()
    .nullable(),
});

export const authResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
  permissions: z.array(z.string()).optional(),
});

export const getUserResponseSchema = z.object({
  user: userSchema.extend({
    preferredLeaderboards: z.array(z.number()).optional(),
    rivalUserIds: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
    userHasSubmittedScore: z.boolean().optional(),
    unreadNotificationCount: z.number().optional(),
  }),
});

export const passkeySchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable(),
  deviceType: z.string(),
  lastUsedAt: z.string().optional().nullable(),
  createdAt: z.string(),
  transports: z.array(z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])),
});

export const statCardSchema = z.object({
  title: z.string(),
  value: z.string(),
  description: z.string(),
  icon: z.string(),
});

export const statsResponseSchema = z.object({
  cards: z.array(statCardSchema),
});

export const updateProfileResponseSchema = z.object({
  user: userSchema,
  message: z.string(),
});

export const passkeysResponseSchema = z.object({
  passkeys: z.array(passkeySchema),
});

export const successResponseSchema = z.object({
  message: z.string(),
});

// API keys schemas
export const apiKeySchema = z.object({
  id: z.string(), // keyHash
  createdAt: z.string(),
  lastUsedAt: z.string().nullable().optional(),
  fingerprint: z.string(),
});

export const listApiKeysResponseSchema = z.object({
  apiKeys: z.array(apiKeySchema),
});

export const createApiKeyResponseSchema = z.object({
  apiKey: apiKeySchema,
  key: z.string(), // plaintext only on create
  message: z.string(),
});

export const bannerVariantsSchema = z
  .object({
    original: z.array(z.any()).optional(),
    md: z.array(z.any()).optional(),
    sm: z.array(z.any()).optional(),
    all: z.array(z.any()).optional(),
  })
  .optional()
  .nullable();

// Pack schemas
export const packListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  bannerUrl: z.string().nullable(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  simfileCount: z.number(),
  popularity: z.number().default(0),
  popularityUpdatedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listPacksResponseSchema = z.object({
  data: z.array(packListItemSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
    maxPopularity: z.number(),
  }),
  filters: z.object({
    search: z.string().optional(),
    orderBy: z.string(),
    orderDirection: z.string(),
  }),
});

// Pack detail schemas
export const packChartSchema = z.object({
  hash: z.string(),
  bannerUrl: z.string().nullable(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  title: z.string(),
  artist: z.string(),
  stepsType: z.string().nullable(),
  difficulty: z.string().nullable(),
  meter: z.number().nullable(),
});

export const packUserSchema = z.object({
  id: z.string(),
  alias: z.string(),
});

export const packLeaderboardSchema = z.object({
  leaderboard: z.string(),
  data: z.object({
    score: z.string(),
    grade: z.string().optional(),
  }),
});

export const packRecentPlaySchema = z.object({
  playId: z.number().optional(),
  chart: packChartSchema,
  user: packUserSchema,
  leaderboards: z.array(packLeaderboardSchema),
  createdAt: z.string(),
});

export const packLeaderboardDataSchema = z.object({
  generatedAt: z.string(),
  packId: z.number(),
  packName: z.string(),
  users: z.record(
    z.string(),
    z.object({
      alias: z.string(),
      profileImageUrl: z.string().nullable(),
    }),
  ),
  leaderboards: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        totalParticipants: z.number(),
        rankings: z.array(
          z.object({
            rank: z.number(),
            userId: z.string(),
            totalScore: z.number(),
            chartsPlayed: z.number(),
          }),
        ),
      }),
    ),
  ),
});

export const packDetailsSchema = z.object({
  id: z.number(),
  name: z.string(),
  bannerUrl: z.string().nullable(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  simfileCount: z.number(),
  recentPlays: z.array(packRecentPlaySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  packLeaderboard: packLeaderboardDataSchema.optional(),
});

export type User = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type GetUserResponse = z.infer<typeof getUserResponseSchema>;
export type Passkey = z.infer<typeof passkeySchema>;
export type StatCard = z.infer<typeof statCardSchema>;
export type StatsResponse = z.infer<typeof statsResponseSchema>;
export type UpdateProfileResponse = z.infer<typeof updateProfileResponseSchema>;
export type PasskeysResponse = z.infer<typeof passkeysResponseSchema>;
export type SuccessResponse = z.infer<typeof successResponseSchema>;
export type PackListItem = z.infer<typeof packListItemSchema>;
export type ListPacksResponse = z.infer<typeof listPacksResponseSchema>;

// User list schemas (for Browse Users)
export const userListItemSchema = z.object({
  id: z.string(),
  alias: z.string(),
  profileImageUrl: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.string(),
});

export const listUsersResponseSchema = z.object({
  data: z.array(userListItemSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
  filters: z.object({
    search: z.string().optional(),
    orderBy: z.string(),
    orderDirection: z.string(),
  }),
});

export type UserListItem = z.infer<typeof userListItemSchema>;
export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>;

// Chart list schemas
export const chartListItemSchema = z.object({
  hash: z.string(),
  songName: z.string().nullable(),
  artist: z.string().nullable(),
  rating: z.number().nullable(),
  length: z.string().nullable(),
  stepartist: z.string().nullable(),
  stepsType: z.string().nullable(),
  difficulty: z.string().nullable(),
  description: z.string().nullable(),
  meter: z.number().nullable(),
  chartName: z.string().nullable(),
  credit: z.string().nullable().optional(),
  bannerUrl: z.string().nullable(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  simfiles: z.array(
    z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      artist: z.string(),
      pack: z
        .object({
          id: z.number(),
          name: z.string(),
          bannerUrl: z.string().nullable(),
          mdBannerUrl: z.string().nullable().optional(),
          smBannerUrl: z.string().nullable().optional(),
          bannerVariants: z
            .object({
              original: z.array(z.any()).optional(),
              md: z.array(z.any()).optional(),
              sm: z.array(z.any()).optional(),
              all: z.array(z.any()).optional(),
            })
            .optional()
            .nullable(),
        })
        .nullable(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listChartsResponseSchema = z.object({
  data: z.array(chartListItemSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
  filters: z.object({
    search: z.string().optional(),
    stepsType: z.string().optional(),
    difficulty: z.string().optional(),
    packId: z.number().optional(),
    orderBy: z.string(),
    orderDirection: z.string(),
  }),
});

export type ChartListItem = z.infer<typeof chartListItemSchema>;
export type ListChartsResponse = z.infer<typeof listChartsResponseSchema>;

// Simfile schemas
export const simfileChartSchema = z.object({
  hash: z.string(), // Add hash for chart linking
  difficulty: z.string().nullable(),
  meter: z.number().nullable(),
  stepsType: z.string().nullable(),
});

export const simfilePackSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const simfileListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  artist: z.string(),
  genre: z.string().nullable(), // Can be null based on API response
  bannerUrl: z.string().nullable(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  backgroundUrl: z.string().nullable(),
  jacketUrl: z.string().nullable(),
  chartCount: z.number(), // API returns chartCount directly, not _count.charts
  pack: simfilePackSchema,
  charts: z.array(simfileChartSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listSimfilesResponseSchema = z.object({
  data: z.array(simfileListItemSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
  filters: z.object({
    search: z.string().optional(),
    packId: z.number().optional(),
    orderBy: z.string(),
    orderDirection: z.string(),
  }),
});

export type PackChart = z.infer<typeof packChartSchema>;
export type PackUser = z.infer<typeof packUserSchema>;
export type PackLeaderboard = z.infer<typeof packLeaderboardSchema>;
export type PackRecentPlay = z.infer<typeof packRecentPlaySchema>;
export type PackDetails = z.infer<typeof packDetailsSchema>;
export type PackLeaderboardData = z.infer<typeof packLeaderboardDataSchema>;
export type SimfileChart = z.infer<typeof simfileChartSchema>;
export type SimfilePack = z.infer<typeof simfilePackSchema>;
export type SimfileListItem = z.infer<typeof simfileListItemSchema>;
export type ListSimfilesResponse = z.infer<typeof listSimfilesResponseSchema>;

// Chart detail schemas
export const chartSimfileSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  artist: z.string(),
  genre: z.string().nullable(),
  credit: z.string().nullable().optional(),
  bannerUrl: z.string().nullable(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  backgroundUrl: z.string().nullable(),
  jacketUrl: z.string().nullable(),
  pack: z.object({
    id: z.number(),
    name: z.string(),
    bannerUrl: z.string().nullable(),
    mdBannerUrl: z.string().nullable().optional(),
    smBannerUrl: z.string().nullable().optional(),
    bannerVariants: z
      .object({
        original: z.array(z.any()).optional(),
        md: z.array(z.any()).optional(),
        sm: z.array(z.any()).optional(),
        all: z.array(z.any()).optional(),
      })
      .optional()
      .nullable(),
  }),
});

export const chartSimfileRelationSchema = z.object({
  chartName: z.string().nullable(),
  stepsType: z.string().nullable(),
  description: z.string().nullable(),
  difficulty: z.string().nullable(),
  meter: z.number().nullable(),
  credit: z.string().nullable().optional(),
  simfile: chartSimfileSchema,
});

export const chartRecentPlaySchema = z.object({
  playId: z.number().optional(),
  chart: packChartSchema,
  user: packUserSchema,
  leaderboards: z.array(
    z.object({
      leaderboard: z.string(),
      data: z.object({
        score: z.string(),
        grade: z.string().optional(),
      }),
    }),
  ),
  createdAt: z.string(),
});

export const chartDetailsSchema = z.object({
  hash: z.string(),
  songName: z.string().nullable(),
  artist: z.string().nullable(),
  rating: z.number().nullable(),
  length: z.string().nullable(),
  stepartist: z.string().nullable(),
  stepsType: z.string().nullable(),
  difficulty: z.string().nullable(),
  description: z.string().nullable(),
  meter: z.number().nullable(),
  chartName: z.string().nullable(),
  credit: z.string().nullable().optional(),
  radarValues: z.string().nullable(),
  chartBpms: z.string().nullable(),
  // Banner image fields for modern image support
  bannerUrl: z.string().nullable().optional(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  simfiles: z.array(chartSimfileRelationSchema),
  recentPlays: z.array(chartRecentPlaySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChartSimfile = z.infer<typeof chartSimfileSchema>;
export type ChartSimfileRelation = z.infer<typeof chartSimfileRelationSchema>;
export type ChartRecentPlay = z.infer<typeof chartRecentPlaySchema>;
export type ChartDetails = z.infer<typeof chartDetailsSchema>;

// Chart leaderboard schemas
export const chartLeaderboardScoreSchema = z.object({
  rank: z.string(),
  score: z.string(),
  grade: z.string(),
  alias: z.string(),
  userId: z.string(),
  date: z.string(),
  playId: z.number().optional(),
  isSelf: z.boolean().optional(),
  isRival: z.boolean().optional(),
});

export const blueShiftLeaderboardScoreSchema = z.object({
  rank: z.number(),
  score: z.string(),
  grade: z.string(),
  alias: z.string(),
  userId: z.string(),
  date: z.string(),
  playId: z.number().optional(),
  points: z.number(),
  isSelf: z.boolean().optional(),
  isRival: z.boolean().optional(),
});

export const chartLeaderboardTypeSchema = z.object({
  type: z.string(),
  scores: z.array(chartLeaderboardScoreSchema),
  // Pagination metadata (present on public route)
  page: z.number().optional(),
  perPage: z.number().optional(),
  hasNext: z.boolean().optional(),
  total: z.number().optional(),
  totalPages: z.number().optional(),
});

export const chartLeaderboardResponseSchema = z.object({
  hash: z.string(),
  leaderboards: z.array(chartLeaderboardTypeSchema),
  blueShiftLeaderboards: z
    .record(
      z.string(),
      z.object({
        scores: z.array(blueShiftLeaderboardScoreSchema),
      }),
    )
    .optional(),
});

export type ChartLeaderboardScore = z.infer<typeof chartLeaderboardScoreSchema>;
export type BlueShiftLeaderboardScore = z.infer<typeof blueShiftLeaderboardScoreSchema>;
export type ChartLeaderboardType = z.infer<typeof chartLeaderboardTypeSchema>;
export type ChartLeaderboardResponse = z.infer<typeof chartLeaderboardResponseSchema>;

// Blue Shift homepage schemas
export const blueShiftRecentPlaySchema = z.object({
  playId: z.number().optional(),
  chart: z.object({
    hash: z.string(),
    bannerVariants: z
      .object({
        original: z.array(z.any()).optional(),
        md: z.array(z.any()).optional(),
        sm: z.array(z.any()).optional(),
        all: z.array(z.any()).optional(),
      })
      .optional()
      .nullable(),
    title: z.string().nullable(),
    artist: z.string().nullable(),
    stepsType: z.string().nullable(),
    difficulty: z.string().nullable(),
    meter: z.number().nullable(),
  }),
  user: z.object({
    id: z.string(),
    alias: z.string(),
  }),
  leaderboards: z.array(
    z.object({
      leaderboard: z.string(),
      data: z.object({
        score: z.string(),
        grade: z.string(),
        judgments: z.record(z.string(), z.number()),
        radar: z.object({
          holdsHeld: z.number(),
          holdsTotal: z.number(),
          minesDodged: z.number(),
          minesTotal: z.number(),
          rollsHit: z.number(),
          rollsTotal: z.number(),
        }),
      }),
    }),
  ),
  createdAt: z.string(),
});

export const blueShiftResponseSchema = z.object({
  announcement: z.string(),
  announcementDownloadUrl: z.string().url().optional().nullable(),
  recentPlays: z.array(blueShiftRecentPlaySchema),
  charts: z.array(
    z.object({
      hash: z.string(),
      bannerVariants: z
        .object({
          original: z.array(z.any()).optional(),
          md: z.array(z.any()).optional(),
          sm: z.array(z.any()).optional(),
          all: z.array(z.any()).optional(),
        })
        .optional()
        .nullable(),
      title: z.string().nullable(),
      artist: z.string().nullable(),
      stepsType: z.string().nullable(),
      difficulty: z.string().nullable(),
      meter: z.number().nullable(),
      credit: z.string().nullable().optional(),
    }),
  ),
  overallLeaderboard: z
    .object({
      generatedAt: z.string(),
      pointsSystem: z.object({
        maxPoints: z.number(),
        decayRate: z.number(),
        description: z.string(),
      }),
      leaderboards: z.object({
        hardEX: z.object({
          totalParticipants: z.number(),
          rankings: z.array(
            z.object({
              rank: z.number(),
              userAlias: z.string(),
              userId: z.string(),
              userProfileImageUrl: z.string().nullable(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
        EX: z.object({
          totalParticipants: z.number(),
          rankings: z.array(
            z.object({
              rank: z.number(),
              userAlias: z.string(),
              userId: z.string(),
              userProfileImageUrl: z.string().nullable(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
        money: z.object({
          totalParticipants: z.number(),
          rankings: z.array(
            z.object({
              rank: z.number(),
              userAlias: z.string(),
              userId: z.string(),
              userProfileImageUrl: z.string().nullable(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
      }),
    })
    .nullable(),
});

export type BlueShiftRecentPlay = z.infer<typeof blueShiftRecentPlaySchema>;
export type BlueShiftResponse = z.infer<typeof blueShiftResponseSchema>;

// Blue Shift All Phases Response
export const blueShiftAllPhasesResponseSchema = z.object({
  phases: z.array(
    z.object({
      phaseNumber: z.number(),
      generatedAt: z.string(),
      pointsSystem: z.object({
        maxPoints: z.number(),
        decayRate: z.number().optional(),
        system: z.string().optional(),
        description: z.string(),
      }),
      leaderboards: z.object({
        hardEX: z.object({
          totalParticipants: z.number(),
          rankings: z.array(
            z.object({
              rank: z.number(),
              userAlias: z.string(),
              userId: z.string(),
              userProfileImageUrl: z.string().nullable(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
        EX: z.object({
          totalParticipants: z.number(),
          rankings: z.array(
            z.object({
              rank: z.number(),
              userAlias: z.string(),
              userId: z.string(),
              userProfileImageUrl: z.string().nullable(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
        money: z.object({
          totalParticipants: z.number(),
          rankings: z.array(
            z.object({
              rank: z.number(),
              userAlias: z.string(),
              userId: z.string(),
              userProfileImageUrl: z.string().nullable(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
      }),
    }),
  ),
});

export type BlueShiftAllPhasesResponse = z.infer<typeof blueShiftAllPhasesResponseSchema>;

// Blue Shift Overall Summary (from S3)
export const blueShiftOverallSummarySchema = z.object({
  generatedAt: z.string(),
  weightingSystem: z.object({
    bestPhase: z.number(),
    secondBestPhase: z.number(),
    worstPhase: z.number(),
  }),
  users: z.record(
    z.string(),
    z.object({
      alias: z.string(),
      profileImageUrl: z.string().nullable(),
    }),
  ),
  charts: z.record(
    z.string(),
    z.object({
      songName: z.string().nullable(),
      artist: z.string().nullable(),
      stepsType: z.string().nullable(),
      difficulty: z.string().nullable(),
      meter: z.number().nullable(),
      bannerUrl: z.string().nullable(),
      leaderboards: z.record(
        z.string(),
        z.array(
          z.object({
            rank: z.number(),
            userId: z.string(),
            score: z.string(),
            grade: z.string(),
          }),
        ),
      ),
    }),
  ),
  phases: z.object({
    phase1: z.object({
      startDate: z.string(),
      endDate: z.string(),
      chartHashes: z.array(z.string()),
      leaderboards: z.record(
        z.string(),
        z.object({
          rankings: z.array(
            z.object({
              userId: z.string(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
      ),
    }),
    phase2: z.object({
      startDate: z.string(),
      endDate: z.string(),
      chartHashes: z.array(z.string()),
      leaderboards: z.record(
        z.string(),
        z.object({
          rankings: z.array(
            z.object({
              userId: z.string(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
      ),
    }),
    phase3: z.object({
      startDate: z.string(),
      endDate: z.string(),
      chartHashes: z.array(z.string()),
      leaderboards: z.record(
        z.string(),
        z.object({
          rankings: z.array(
            z.object({
              userId: z.string(),
              totalPoints: z.number(),
              chartsPlayed: z.number(),
            }),
          ),
        }),
      ),
    }),
  }),
  overall: z.record(
    z.string(),
    z.object({
      rankings: z.array(
        z.object({
          userId: z.string(),
          totalWeightedPoints: z.number(),
          phaseRanks: z.object({
            phase1: z.number(),
            phase2: z.number(),
            phase3: z.number(),
          }),
          phasePoints: z.object({
            phase1: z.number(),
            phase2: z.number(),
            phase3: z.number(),
          }),
          phaseWeights: z.object({
            phase1: z.number(),
            phase2: z.number(),
            phase3: z.number(),
          }),
        }),
      ),
    }),
  ),
});

export type BlueShiftOverallSummary = z.infer<typeof blueShiftOverallSummarySchema>;

// User profile with recent plays schemas
export const userRecentPlayChartSchema = z.object({
  hash: z.string(),
  bannerUrl: z.string().nullable(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  title: z.string().nullable(),
  artist: z.string().nullable(),
  stepsType: z.string().nullable(),
  difficulty: z.string().nullable(),
  meter: z.number().nullable(),
});

export const userRecentPlayLeaderboardSchema = z.object({
  leaderboard: z.string(),
  data: z.object({
    score: z.string(),
    grade: z.string().optional(),
  }),
});

export const userRecentPlaySchema = z.object({
  playId: z.number().optional(),
  chart: userRecentPlayChartSchema,
  leaderboards: z.array(userRecentPlayLeaderboardSchema),
  createdAt: z.string(),
});

export const trophySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  tier: z.string(),
  imageUrl: z.string().nullable(),
  displayOrder: z.number().nullable(),
  createdAt: z.string(),
});

export const userProfileSchema = z.object({
  id: z.string(),
  alias: z.string(),
  profileImageUrl: z.string().optional().nullable(),
  countryId: z.number().optional().nullable(),
  country: z
    .object({
      id: z.number(),
      name: z.string(),
      code: z.string(),
    })
    .optional()
    .nullable(),
  stats: z
    .object({
      totalPlays: z.number().optional(),
      chartsPlayed: z.number().optional(),
      stepsHit: z.number().optional(),
      heatMap: z.record(z.string(), z.number()).optional(),
      quads: z.number().optional(),
      quints: z.number().optional(),
      hexes: z.number().optional(),
    })
    .optional()
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  blueShift: z.any().nullable().optional(), // Blue Shift event data (we're vibing a bit here, any is ok!)
  trophies: z.array(trophySchema).optional().default([]),
  recentPlays: z.array(userRecentPlaySchema),
});

export const userProfileResponseSchema = z.object({
  user: userProfileSchema.extend({ preferredLeaderboards: z.array(z.number()).optional() }),
});

// Pagination metadata for user recent plays (non-breaking optional)
export const userRecentPlaysMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  orderBy: z.string().optional(),
  orderDirection: z.string().optional(),
  search: z.string().optional(),
  leaderboard: z.string().optional(),
  minMeter: z.number().optional(),
  maxMeter: z.number().optional(),
  includeUnknown: z.boolean().optional(),
});

// Augment profile response with optional recent plays meta
export const userProfileWithMetaResponseSchema = z.object({
  user: userProfileSchema.extend({ preferredLeaderboards: z.array(z.number()).optional() }),
  recentPlaysMeta: userRecentPlaysMetaSchema.optional(),
});

// Augment base user schema for /user endpoint consumers (non-breaking addition)
export const userWithPrefsSchema = userSchema.extend({
  preferredLeaderboards: z.array(z.number()).optional(),
  rivalUserIds: z.array(z.string()).optional(),
});

export type UserRecentPlay = z.infer<typeof userRecentPlaySchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;
export type UserRecentPlaysMeta = z.infer<typeof userRecentPlaysMetaSchema>;
export type PreferredLeaderboards = number[];

// API keys types
export type ApiKey = z.infer<typeof apiKeySchema>;
export type ListApiKeysResponse = z.infer<typeof listApiKeysResponseSchema>;
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

// --- Play (Score) detail schema for individual score page ---
export const playLeaderboardEntrySchema = z.object({
  leaderboard: z.string(),
  data: z
    .object({
      score: z.string(),
      grade: z.string().optional().nullable(),
      judgments: z.record(z.string(), z.number()).optional().nullable(),
      radar: z
        .object({
          holdsHeld: z.number(),
          holdsTotal: z.number(),
          minesDodged: z.number(),
          minesTotal: z.number(),
          rollsHit: z.number(),
          rollsTotal: z.number(),
        })
        .optional()
        .nullable(),
    })
    .passthrough(),
});

export const timingDatumSchema = z.tuple([z.number(), z.union([z.number(), z.literal('Miss')])]);

export const playDetailsSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  user: z.object({ id: z.string(), alias: z.string(), profileImageUrl: z.string().nullable().optional() }),
  chart: z.object({
    hash: z.string(),
    title: z.string().nullable(),
    artist: z.string().nullable(),
    stepsType: z.string().nullable(),
    difficulty: z.string().nullable(),
    meter: z.number().nullable(),
    bannerUrl: z.string().nullable().optional(),
    mdBannerUrl: z.string().nullable().optional(),
    smBannerUrl: z.string().nullable().optional(),
    bannerVariants: bannerVariantsSchema,
  }),
  leaderboards: z.array(playLeaderboardEntrySchema),
  timingData: z.array(timingDatumSchema).optional().nullable(),
  lifebarInfo: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
      }),
    )
    .optional()
    .nullable(),
  npsData: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
      }),
    )
    .optional()
    .nullable(),
  modifiers: z
    .object({
      visualDelay: z.number().optional(),
      acceleration: z.array(z.unknown()).optional(),
      appearance: z.array(z.unknown()).optional(),
      effect: z.array(z.unknown()).optional(),
      mini: z.number().optional(),
      turn: z.string().optional(),
      disabledWindows: z.string().optional(),
      speed: z.object({ value: z.number(), type: z.string() }).optional(),
      perspective: z.string().optional(),
      noteskin: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export type PlayDetails = z.infer<typeof playDetailsSchema>;

// Session schemas
export const sessionPlaySchema = z.object({
  id: z.number(),
  playedAt: z.string(),
  modifiers: z
    .object({
      visualDelay: z.number().optional(),
      acceleration: z.array(z.unknown()).optional(),
      appearance: z.array(z.unknown()).optional(),
      effect: z.array(z.unknown()).optional(),
      mini: z.number().optional(),
      turn: z.string().optional(),
      disabledWindows: z.string().optional(),
      speed: z.object({ value: z.number(), type: z.string() }).optional(),
      perspective: z.string().optional(),
      noteskin: z.string().optional(),
    })
    .nullable(),
  chart: z.object({
    hash: z.string(),
    title: z.string().nullable(),
    artist: z.string().nullable(),
    stepsType: z.string().nullable(),
    difficulty: z.string().nullable(),
    meter: z.number().nullable(),
    packName: z.string().nullable(),
    bannerUrl: z.string().nullable(),
    mdBannerUrl: z.string().nullable(),
    smBannerUrl: z.string().nullable(),
    bannerVariants: bannerVariantsSchema,
  }),
  leaderboards: z.array(
    z.object({
      type: z.string(),
      score: z.string(),
      grade: z.string().nullable(),
      judgments: z.record(z.string(), z.number()),
      isPB: z.boolean().optional(),
      delta: z.number().nullable().optional(),
    }),
  ),
});

export const sessionDetailsSchema = z.object({
  id: z.number(),
  userId: z.string(),
  userAlias: z.string(),
  userProfileImageUrl: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string(),
  isOngoing: z.boolean(),
  durationMs: z.number(),
  playCount: z.number(),
  distinctCharts: z.number(),
  stepsHit: z.number(),
  quads: z.number().optional().default(0),
  quints: z.number().optional().default(0),
  hexes: z.number().optional().default(0),
  difficultyDistribution: z.array(
    z.object({
      meter: z.number(),
      count: z.number(),
    }),
  ),
  topPacks: z.array(
    z.object({
      packId: z.number(),
      packName: z.string(),
      chartCount: z.number(),
      bannerUrl: z.string().nullable(),
      mdBannerUrl: z.string().nullable().optional(),
      smBannerUrl: z.string().nullable().optional(),
      bannerVariants: bannerVariantsSchema,
    }),
  ),
  plays: z.array(sessionPlaySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    totalPlays: z.number(),
    totalPages: z.number(),
  }),
});

export type SessionPlay = z.infer<typeof sessionPlaySchema>;
export type SessionDetails = z.infer<typeof sessionDetailsSchema>;

// Widget schemas
export const widgetLeaderboardEntrySchema = z.object({
  rank: z.number(),
  alias: z.string(),
  points: z.number(),
  profileImageUrl: z.string().nullable(),
  chartsPlayed: z.number(),
  isSelf: z.boolean(),
  isRival: z.boolean(),
});

export const widgetUserStatsSchema = z.object({
  rank: z.number(),
  totalPoints: z.number(),
  chartsPlayed: z.number(),
  totalParticipants: z.number(),
});

export const widgetLeaderboardDataSchema = z.object({
  stats: widgetUserStatsSchema,
  entries: z.array(widgetLeaderboardEntrySchema),
});

export const widgetLastPlayedChartSchema = z.object({
  title: z.string(),
  artist: z.string(),
  bannerUrl: z.string(),
  mdBannerUrl: z.string().nullable().optional(),
  smBannerUrl: z.string().nullable().optional(),
  bannerVariants: bannerVariantsSchema,
  hash: z.string(),
  difficulty: z.string(),
  meter: z.number().nullable(),
});

export const widgetLastPlayedScoreSchema = z.object({
  lastScore: z.object({
    score: z.number(),
    grade: z.string(),
  }),
  pbScore: z.object({
    score: z.number(),
    grade: z.string(),
    rank: z.number(),
    totalPlayers: z.number(),
  }),
});

export const widgetDataResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    alias: z.string(),
    profileImageUrl: z.string().nullable(),
  }),
  leaderboards: z
    .object({
      HardEX: widgetLeaderboardDataSchema,
      EX: widgetLeaderboardDataSchema,
      ITG: widgetLeaderboardDataSchema,
    })
    .optional(),
  lastPlayed: z
    .object({
      chart: widgetLastPlayedChartSchema,
      scores: z.object({
        HardEX: widgetLastPlayedScoreSchema,
        EX: widgetLastPlayedScoreSchema,
        ITG: widgetLastPlayedScoreSchema,
      }),
    })
    .nullable()
    .optional(),
});

export type WidgetLeaderboardEntry = z.infer<typeof widgetLeaderboardEntrySchema>;
export type WidgetUserStats = z.infer<typeof widgetUserStatsSchema>;
export type WidgetLeaderboardData = z.infer<typeof widgetLeaderboardDataSchema>;
export type WidgetLastPlayedChart = z.infer<typeof widgetLastPlayedChartSchema>;
export type WidgetLastPlayedScore = z.infer<typeof widgetLastPlayedScoreSchema>;
export type WidgetDataResponse = z.infer<typeof widgetDataResponseSchema>;

// ----- Notification schemas -----

export const notificationSchema = z.object({
  id: z.number(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable().optional(),
  data: z.record(z.unknown()).nullable().optional(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  nextCursor: z.number().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;
