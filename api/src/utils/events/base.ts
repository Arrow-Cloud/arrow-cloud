import type { PrismaClient } from '../../../prisma/generated/client';

/**
 * Base configuration interface for events
 */
export interface EventConfig {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  chartHashes: string[];
  leaderboardIds: number[];

  /**
   * Check if the event is currently active
   */
  isActive(): boolean;

  /**
   * Check if the event is active for a specific user (allows for test user bypass)
   */
  isActiveForUser?(userId: string): boolean;

  /**
   * Check if a chart is eligible for this event
   */
  isEligibleChart(chartHash: string): boolean;

  /**
   * Get event-specific leaderboard entries for calculation
   * @param chartHash Optional chart hash to filter results to a single chart
   */
  getLeaderboardEntries(prisma: PrismaClient, chartHash?: string): Promise<LeaderboardEntry[]>;

  /**
   * Calculate points for a given rank using event-specific logic
   */
  calculatePointsForRank(rank: number): number;

  /**
   * Map leaderboard type name to leaderboard ID
   */
  getLeaderboardIdForType(leaderboardType: string): number | undefined;

  /**
   * Generate prioritized messages for a submission. Returns an array of messages (top first), up to 3 items.
   * Default implementation provided by BaseEventConfig but events may override.
   * @param playCount Total number of plays the user has made on this chart
   */
  generateMessages(
    prisma: PrismaClient,
    chartHash: string,
    userId: string,
    beforeSnapshots: Map<number, LeaderboardSnapshot[]>,
    afterLeaderboards: EventLeaderboardData[],
    rivalUserIds: string[],
    playCount: number,
  ): Promise<string[]>;
}

/**
 * Response structure for event leaderboards returned to clients
 */
export interface EventLeaderboardResponse {
  eventId: string;
  eventName: string;
  leaderboards: EventLeaderboardData[];
  messages: string[];
}

/**
 * Leaderboard data for a specific scoring system within an event
 */
export interface EventLeaderboardData {
  type: string;
  leaderboardId: number;
  entries: EventLeaderboardEntry[];
}

/**
 * Individual leaderboard entry with delta information
 */
export interface EventLeaderboardEntry {
  rank: number;
  userId: string;
  userAlias: string;
  userProfileImageUrl: string | null;
  chartHash: string;
  score: string;
  grade: string;
  points: number;
  delta: number; // Point change from this submission (+/- or 0)
  isSelf: boolean;
  isRival: boolean;
}

/**
 * Snapshot of a user's leaderboard position before score submission
 */
export interface LeaderboardSnapshot {
  userId: string;
  userAlias: string;
  rank: number;
  points: number;
  grade: string;
}

/**
 * Standard leaderboard entry format used across the system
 */
export interface LeaderboardEntry {
  rank: number;
  data: any; // JSON data from the leaderboard (score, grade, judgments, etc.)
  userAlias: string;
  userId: string;
  userProfileImageUrl: string | null;
  chartHash: string;
  leaderboardType: string;
}

/**
 * Base implementation of EventConfig with common functionality
 */
export abstract class BaseEventConfig implements EventConfig {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly startDate: Date,
    public readonly endDate: Date,
    public readonly chartHashes: string[],
    public readonly leaderboardIds: number[],
  ) {}

  isActive(): boolean {
    const now = new Date();
    return now >= this.startDate && now <= this.endDate;
  }

  isEligibleChart(chartHash: string): boolean {
    return this.chartHashes.includes(chartHash);
  }

  /**
   * Default point calculation using exponential decay
   * Events can override this for custom point systems
   */
  calculatePointsForRank(rank: number, maxPoints: number = 10000, decayRate: number = 0.08): number {
    if (rank <= 0) return 0;

    // Exponential decay formula: maxPoints * e^(-decayRate * (rank - 1))
    const points = maxPoints * Math.exp(-decayRate * (rank - 1));

    // Round to nearest integer and ensure minimum of 1 point for any valid rank
    return Math.max(1, Math.round(points));
  }

  /**
   * Default message generation logic for submissions. Events may override this.
   */
  async generateMessages(
    prisma: PrismaClient,
    chartHash: string,
    userId: string,
    beforeSnapshots: Map<number, LeaderboardSnapshot[]>,
    afterLeaderboards: EventLeaderboardData[],
    rivalUserIds: string[],
    playCount: number,
  ): Promise<string[]> {
    const messages: string[] = [];
    const rivalSet = new Set(rivalUserIds || []);

    // Helper to format ordinal
    const ordinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    // Helper to map leaderboard type to display name
    const getLeaderboardDisplayName = (lbType: string): string => {
      const normalized = lbType.toLowerCase();
      if (normalized.includes('hardex') || normalized.includes('hard ex') || normalized.includes('h.ex')) {
        return 'Hard EX';
      } else if (normalized.includes('money') || normalized.includes('itg')) {
        return 'ITG';
      } else if (normalized.includes('ex')) {
        return 'EX';
      }
      return lbType; // fallback to original
    };

    // Helper to get priority for leaderboard (lower = higher priority)
    const getLeaderboardPriority = (lbType: string): number => {
      const normalized = lbType.toLowerCase();
      if (normalized.includes('hardex') || normalized.includes('hard ex') || normalized.includes('h.ex')) {
        return 1; // Hard EX is highest priority
      } else if (normalized.includes('ex')) {
        return 2; // EX is second
      } else if (normalized.includes('money') || normalized.includes('itg')) {
        return 3; // ITG is third
      }
      return 999; // unknown types have lowest priority
    };

    // Track message candidates per leaderboard for prioritization
    interface MessageCandidate {
      type: 'worldRecord' | 'beatRival' | 'firstClear' | 'personalBest';
      leaderboardType: string;
      leaderboardPriority: number;
      rivalAlias?: string; // For beatRival messages
    }
    const messageCandidates: MessageCandidate[] = [];

    for (const lb of afterLeaderboards) {
      const afterEntry = lb.entries.find((e) => e.userId === userId);
      if (!afterEntry) continue;

      const before = beforeSnapshots.get(lb.leaderboardId) || [];
      const beforeTop = before.length ? before[0] : undefined;
      const beforeEntry = before.find((b) => b.userId === userId);

      const priority = getLeaderboardPriority(lb.type);

      // New World Record: now rank 1 and wasn't rank 1 before (or there was no previous top)
      // AND the user actually improved (has more points than before)
      if (afterEntry.rank === 1 && (!beforeTop || beforeTop.userId !== userId)) {
        // Only show world record if user improved their score (or had no previous entry)
        if (!beforeEntry || afterEntry.points > beforeEntry.points) {
          messageCandidates.push({
            type: 'worldRecord',
            leaderboardType: lb.type,
            leaderboardPriority: priority,
          });
        }
      }

      // First Clear: user had no prior entry, OR previous entry was a failing grade and this is not
      if ((!beforeEntry && afterEntry.grade !== 'F') || (beforeEntry && beforeEntry.grade === 'F' && afterEntry.grade !== 'F')) {
        messageCandidates.push({
          type: 'firstClear',
          leaderboardType: lb.type,
          leaderboardPriority: priority,
        });
      } else if (beforeEntry && afterEntry.points > beforeEntry.points) {
        // New personal best
        messageCandidates.push({
          type: 'personalBest',
          leaderboardType: lb.type,
          leaderboardPriority: priority,
        });
      }

      // Beat your rivals: any rival on this leaderboard that the user now outranks
      // AND didn't already outrank them before
      const rivalEntries = lb.entries.filter((e) => rivalSet.has(e.userId));
      if (rivalEntries.length && afterEntry) {
        for (const r of rivalEntries) {
          const rivalBeforeEntry = before.find((b) => b.userId === r.userId);
          // Only show if user now beats rival AND either:
          // 1. User didn't have an entry before, OR
          // 2. User had an entry but rival was ranked higher before
          if (afterEntry.rank < r.rank) {
            const shouldShowMessage = !beforeEntry || !rivalBeforeEntry || beforeEntry.rank > rivalBeforeEntry.rank;
            if (shouldShowMessage) {
              messageCandidates.push({
                type: 'beatRival',
                leaderboardType: lb.type,
                leaderboardPriority: priority,
                rivalAlias: r.userAlias,
              });
            }
          }
        }
      }
    }

    // Sort message candidates by type priority, then leaderboard priority
    const typePriority: Record<MessageCandidate['type'], number> = {
      worldRecord: 1,
      beatRival: 2,
      firstClear: 3,
      personalBest: 4,
    };

    messageCandidates.sort((a, b) => {
      const typeComparison = typePriority[a.type] - typePriority[b.type];
      if (typeComparison !== 0) return typeComparison;
      return a.leaderboardPriority - b.leaderboardPriority;
    });

    // Generate messages based on prioritized candidates
    const addedTypes = new Set<string>();

    for (const candidate of messageCandidates) {
      // Only add one message per candidate type
      const key = candidate.type;
      if (addedTypes.has(key)) continue;

      const lbName = getLeaderboardDisplayName(candidate.leaderboardType);

      switch (candidate.type) {
        case 'worldRecord':
          messages.push(`New ${lbName} World Record!`);
          addedTypes.add(key);
          break;
        case 'beatRival':
          if (candidate.rivalAlias) {
            messages.push(`You took ${candidate.rivalAlias}'s ${lbName} score!`);
          } else {
            messages.push(`You took a rival's ${lbName} score!`);
          }
          addedTypes.add(key);
          break;
        case 'firstClear':
          messages.push('First play!');
          addedTypes.add(key);
          break;
        case 'personalBest':
          messages.push(`New ${lbName} Personal Best!`);
          addedTypes.add(key);
          break;
      }

      // Stop after 2 messages (we'll add play count separately if needed)
      if (messages.length >= 2) break;
    }

    // Add play count if there's room and not redundant with first clear
    const hasFirstClear = addedTypes.has('firstClear');
    if (messages.length < 2 && playCount > 1 && !hasFirstClear) {
      messages.push(`${ordinal(playCount)} play!`);
    }

    // Return top 2 messages
    return messages.slice(0, 2);
  }

  // Abstract methods that must be implemented by specific events
  abstract getLeaderboardEntries(prisma: PrismaClient, chartHash?: string): Promise<LeaderboardEntry[]>;
  abstract getLeaderboardIdForType(leaderboardType: string): number | undefined;
}

/**
 * Registry for managing active events
 */
export class EventRegistry {
  private static events: Map<string, EventConfig> = new Map();
  /**
   * Register an event configuration
   */
  static register(event: EventConfig): void {
    this.events.set(event.id, event);
  }

  /**
   * Get all registered events
   */
  static getAll(): EventConfig[] {
    return Array.from(this.events.values());
  }

  /**
   * Get events that are currently active
   */
  static getActive(): EventConfig[] {
    return this.getAll().filter((event) => event.isActive());
  }

  /**
   * Get events that include the specified chart
   */
  static getEventsForChart(chartHash: string): EventConfig[] {
    return this.getActive().filter((event) => event.isEligibleChart(chartHash));
  }

  /**
   * Get events that include the specified chart for a specific user
   * Allows events to override isActive() based on user context (e.g., test users)
   */
  static getEventsForChartAndUser(chartHash: string, userId: string): EventConfig[] {
    return this.getAll()
      .filter((event) => {
        // Use user-aware active check if available, otherwise use default
        if (event.isActiveForUser) {
          return event.isActiveForUser(userId);
        }
        return event.isActive();
      })
      .filter((event) => event.isEligibleChart(chartHash));
  }

  /**
   * Get a specific event by ID
   */
  static get(eventId: string): EventConfig | undefined {
    return this.events.get(eventId);
  }

  /**
   * Check if any active events include the specified chart
   */
  static hasActiveEventForChart(chartHash: string): boolean {
    return this.getEventsForChart(chartHash).length > 0;
  }

  static reset(): void {
    this.events.clear();
  }
}
