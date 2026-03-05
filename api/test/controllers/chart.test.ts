import 'aws-sdk-client-mock-jest';

import { APIGatewayProxyEvent } from 'aws-lambda';
import { scoreSubmission } from '../../src/controllers/chart';
import { AuthenticatedEvent } from '../../src/utils/types';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/* eslint-disable @typescript-eslint/no-require-imports */
const fullScore = require('../util/scoring/fixtures/full-score.json');
/* eslint-enable @typescript-eslint/no-require-imports */

// Mock the S3 client
const s3Mock = mockClient(S3Client);

// Mock the play processor
jest.mock('../../src/utils/play-processor', () => ({
  processSinglePlay: jest.fn().mockResolvedValue(undefined),
}));

// Mock the events utility
jest.mock('../../src/utils/events', () => ({
  publishScoreSubmissionEvent: jest.fn().mockResolvedValue(undefined),
  EVENT_TYPES: {
    SCORE_SUBMITTED: 'score-submitted',
    SCORE_DELETED: 'score-deleted',
  },
}));

jest.mock('../../prisma/generated/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    chart: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    play: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  })),
}));

import { PrismaClient, User } from '../../prisma/generated/client';
import { processSinglePlay } from '../../src/utils/play-processor';
import { publishScoreSubmissionEvent } from '../../src/utils/events';

// Get the mocked functions
const mockProcessSinglePlay = processSinglePlay as jest.MockedFunction<typeof processSinglePlay>;
const mockPublishScoreSubmissionEvent = publishScoreSubmissionEvent as jest.MockedFunction<typeof publishScoreSubmissionEvent>;

describe('Chart Controller', () => {
  let mockEvent: APIGatewayProxyEvent;
  let mockAuthenticatedEvent: AuthenticatedEvent;
  let mockUser: User;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    s3Mock.reset();

    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      alias: 'testuser',
      profileImageUrl: null,
      timezone: null,
      emailVerifiedAt: null,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
      passwordResetToken: null,
      passwordResetTokenExpiry: null,
      countryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordHash: null,
      passwordSalt: null,
      banned: false,
      shadowBanned: false,
      stats: null,
    };

    const chartHash = '1234567890abcdef';

    mockEvent = {
      path: `/v1/chart/${chartHash}/play`,
      httpMethod: 'POST',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: JSON.stringify(fullScore),
      isBase64Encoded: false,
    };

    mockAuthenticatedEvent = {
      ...mockEvent,
      user: mockUser,
      routeParameters: {
        chartHash,
      },
    };

    mockPrisma = new PrismaClient();

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    // Reset all mocks
    mockProcessSinglePlay.mockResolvedValue(undefined);
    mockPublishScoreSubmissionEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('scoreSubmission', () => {
    describe('successful score submission', () => {
      it('should return 204 response for valid score submission', async () => {
        const mockPlay = {
          id: 12345,
          userId: mockUser.id,
          chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
          rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        };

        const mockTransaction = {
          chart: {
            findUnique: jest.fn().mockResolvedValue(null), // Chart doesn't exist
            create: jest.fn().mockResolvedValue({}),
          },
          play: {
            create: jest.fn().mockResolvedValue(mockPlay),
          },
        };

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
          return await callback(mockTransaction);
        });

        const result = await scoreSubmission(mockAuthenticatedEvent, mockPrisma);

        expect(result).toEqual(
          expect.objectContaining({
            statusCode: 204,
            body: '',
          }),
        );

        // Verify transaction was called
        expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));

        // Verify chart.findUnique was called within transaction
        expect(mockTransaction.chart.findUnique).toHaveBeenCalledWith({
          where: { hash: mockAuthenticatedEvent.routeParameters?.chartHash },
          select: { hash: true },
        });

        // Verify chart.create was called within transaction (since chart doesn't exist)
        expect(mockTransaction.chart.create).toHaveBeenCalledWith({
          data: {
            hash: mockAuthenticatedEvent.routeParameters?.chartHash,
            songName: 'Air Nad Adrian',
            artist: 'The Flashbulb',
            rating: 10,
            length: '1:33',
            stepartist: 'mute',
          },
        });

        // Verify play.create was called within transaction
        expect(mockTransaction.play.create).toHaveBeenCalledWith({
          data: {
            userId: mockUser.id,
            chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
            rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
            modifiers: expect.any(Object),
            engineName: 'ITGMania',
            engineVersion: undefined,
          },
        });

        // Verify S3 upload
        expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
          Bucket: 'arrow-cloud-scores',
          Key: expect.stringMatching(/^scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          Body: expect.any(String),
          ContentType: 'application/json',
        });

        // Verify play processing was called
        expect(mockProcessSinglePlay).toHaveBeenCalledWith(
          mockPlay,
          mockPrisma,
          expect.any(S3Client),
          expect.objectContaining({
            songName: 'Air Nad Adrian',
            artist: 'The Flashbulb',
          }),
        );

        // Verify SNS event was published
        expect(mockPublishScoreSubmissionEvent).toHaveBeenCalledWith({
          eventType: 'score-submitted',
          timestamp: mockPlay.createdAt.toISOString(),
          userId: mockUser.id,
          chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
          play: {
            id: mockPlay.id.toString(),
            rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          },
        });
      });

      it('should store _engineName and _engineVersion in S3 payload', async () => {
        const submissionWithEngine = {
          ...fullScore,
          _engineName: 'DeadSync',
          _engineVersion: '2.1.0',
        };

        const eventWithEngine: AuthenticatedEvent = {
          ...mockAuthenticatedEvent,
          body: JSON.stringify(submissionWithEngine),
        };

        const mockPlay = {
          id: 99999,
          userId: mockUser.id,
          chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
          rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        };

        const mockTransaction = {
          chart: {
            findUnique: jest.fn().mockResolvedValue({ hash: mockAuthenticatedEvent.routeParameters?.chartHash }),
            create: jest.fn(),
          },
          play: {
            create: jest.fn().mockResolvedValue(mockPlay),
          },
        };

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
          return await callback(mockTransaction);
        });

        const result = await scoreSubmission(eventWithEngine, mockPrisma);
        expect(result.statusCode).toBe(204);

        // Verify the S3 payload includes the engine fields
        const s3Calls = s3Mock.commandCalls(PutObjectCommand);
        expect(s3Calls.length).toBe(1);

        const uploadedBody = JSON.parse(s3Calls[0].args[0].input.Body as string);
        expect(uploadedBody._engineName).toBe('DeadSync');
        expect(uploadedBody._engineVersion).toBe('2.1.0');

        // Verify play.create was called with the engine fields
        expect(mockTransaction.play.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            engineName: 'DeadSync',
            engineVersion: '2.1.0',
          }),
        });
      });

      it('should default _engineName to ITGMania when not provided', async () => {
        // fullScore fixture does not include _engineName or _engineVersion
        const mockPlay = {
          id: 88888,
          userId: mockUser.id,
          chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
          rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        };

        const mockTransaction = {
          chart: {
            findUnique: jest.fn().mockResolvedValue({ hash: mockAuthenticatedEvent.routeParameters?.chartHash }),
            create: jest.fn(),
          },
          play: {
            create: jest.fn().mockResolvedValue(mockPlay),
          },
        };

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
          return await callback(mockTransaction);
        });

        const result = await scoreSubmission(mockAuthenticatedEvent, mockPrisma);
        expect(result.statusCode).toBe(204);

        // Verify the S3 payload defaults _engineName to ITGMania
        const s3Calls = s3Mock.commandCalls(PutObjectCommand);
        expect(s3Calls.length).toBe(1);

        const uploadedBody = JSON.parse(s3Calls[0].args[0].input.Body as string);
        expect(uploadedBody._engineName).toBe('ITGMania');
        expect(uploadedBody._engineVersion).toBeUndefined();
      });

      it('should use pendingDate with user timezone as createdAt/updatedAt when wasPending is true', async () => {
        // pendingDate is naive local time (no Z), user has America/New_York timezone (UTC-4 in June/DST)
        const pendingDate = '2024-06-15T14:30:00';
        const submissionWithPending = {
          ...fullScore,
          wasPending: true,
          pendingDate,
        };

        const userWithTimezone = { ...mockUser, timezone: 'America/New_York' };
        const eventWithPending: AuthenticatedEvent = {
          ...mockAuthenticatedEvent,
          user: userWithTimezone,
          body: JSON.stringify(submissionWithPending),
        };

        // 14:30 ET in June (EDT = UTC-4) => 18:30 UTC
        const expectedTimestamp = new Date('2024-06-15T18:30:00.000Z');
        const mockPlay = {
          id: 77777,
          userId: mockUser.id,
          chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
          rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          createdAt: expectedTimestamp,
          updatedAt: expectedTimestamp,
        };

        const mockTransaction = {
          chart: {
            findUnique: jest.fn().mockResolvedValue({ hash: mockAuthenticatedEvent.routeParameters?.chartHash }),
            create: jest.fn(),
          },
          play: {
            create: jest.fn().mockResolvedValue(mockPlay),
          },
        };

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
          return await callback(mockTransaction);
        });

        const result = await scoreSubmission(eventWithPending, mockPrisma);
        expect(result.statusCode).toBe(204);

        // Verify play.create was called with the timezone-converted pendingDate
        expect(mockTransaction.play.create).toHaveBeenCalledWith({
          data: {
            userId: mockUser.id,
            chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
            rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
            modifiers: expect.any(Object),
            engineName: 'ITGMania',
            engineVersion: undefined,
            createdAt: expectedTimestamp,
            updatedAt: expectedTimestamp,
          },
        });
      });

      it('should treat pendingDate as UTC when user has no timezone set', async () => {
        // pendingDate is naive local time, user has no timezone => treated as UTC
        const pendingDate = '2024-06-15T14:30:00';
        const submissionWithPending = {
          ...fullScore,
          wasPending: true,
          pendingDate,
        };

        const eventWithPending: AuthenticatedEvent = {
          ...mockAuthenticatedEvent,
          body: JSON.stringify(submissionWithPending),
        };

        // No timezone => assumed UTC
        const expectedTimestamp = new Date('2024-06-15T14:30:00.000Z');
        const mockPlay = {
          id: 77778,
          userId: mockUser.id,
          chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
          rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          createdAt: expectedTimestamp,
          updatedAt: expectedTimestamp,
        };

        const mockTransaction = {
          chart: {
            findUnique: jest.fn().mockResolvedValue({ hash: mockAuthenticatedEvent.routeParameters?.chartHash }),
            create: jest.fn(),
          },
          play: {
            create: jest.fn().mockResolvedValue(mockPlay),
          },
        };

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
          return await callback(mockTransaction);
        });

        const result = await scoreSubmission(eventWithPending, mockPrisma);
        expect(result.statusCode).toBe(204);

        // Verify play.create was called with pendingDate treated as UTC
        expect(mockTransaction.play.create).toHaveBeenCalledWith({
          data: {
            userId: mockUser.id,
            chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
            rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
            modifiers: expect.any(Object),
            engineName: 'ITGMania',
            engineVersion: undefined,
            createdAt: expectedTimestamp,
            updatedAt: expectedTimestamp,
          },
        });
      });

      it('should not set createdAt/updatedAt when wasPending is false', async () => {
        const submissionNotPending = {
          ...fullScore,
          wasPending: false,
          pendingDate: '2024-06-15T14:30:00',
        };

        const eventNotPending: AuthenticatedEvent = {
          ...mockAuthenticatedEvent,
          body: JSON.stringify(submissionNotPending),
        };

        const mockPlay = {
          id: 66666,
          userId: mockUser.id,
          chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
          rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        };

        const mockTransaction = {
          chart: {
            findUnique: jest.fn().mockResolvedValue({ hash: mockAuthenticatedEvent.routeParameters?.chartHash }),
            create: jest.fn(),
          },
          play: {
            create: jest.fn().mockResolvedValue(mockPlay),
          },
        };

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
          return await callback(mockTransaction);
        });

        const result = await scoreSubmission(eventNotPending, mockPrisma);
        expect(result.statusCode).toBe(204);

        // Verify play.create was called WITHOUT createdAt/updatedAt overrides
        expect(mockTransaction.play.create).toHaveBeenCalledWith({
          data: {
            userId: mockUser.id,
            chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
            rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
            modifiers: expect.any(Object),
            engineName: 'ITGMania',
            engineVersion: undefined,
          },
        });
      });

      it('should handle existing chart correctly', async () => {
        // Mock the transaction with existing chart
        const mockPlay = {
          id: 12345,
          userId: mockUser.id,
          chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
          rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        };

        const mockTransaction = {
          chart: {
            findUnique: jest.fn().mockResolvedValue({ hash: mockAuthenticatedEvent.routeParameters?.chartHash }), // Chart exists
            create: jest.fn(),
          },
          play: {
            create: jest.fn().mockResolvedValue(mockPlay),
          },
        };

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
          return await callback(mockTransaction);
        });

        const result = await scoreSubmission(mockAuthenticatedEvent, mockPrisma);

        expect(result).toEqual(
          expect.objectContaining({
            statusCode: 204,
            body: '',
          }),
        );

        // Verify chart.findUnique was called
        expect(mockTransaction.chart.findUnique).toHaveBeenCalledWith({
          where: { hash: mockAuthenticatedEvent.routeParameters?.chartHash },
          select: { hash: true },
        });

        // Verify chart.create was NOT called (since chart exists)
        expect(mockTransaction.chart.create).not.toHaveBeenCalled();

        // Verify play.create was still called
        expect(mockTransaction.play.create).toHaveBeenCalledWith({
          data: {
            userId: mockUser.id,
            chartHash: mockAuthenticatedEvent.routeParameters?.chartHash,
            rawTimingDataUrl: expect.stringMatching(/^s3:\/\/arrow-cloud-scores\/scores\/1234567890abcdef\/user-123\/\d+\.json$/),
            modifiers: expect.any(Object),
            engineName: 'ITGMania',
            engineVersion: undefined,
          },
        });
      });
    });

    describe('validation failures', () => {
      it('should return 400 error when chartHash missing', async () => {
        const eventWithMissingData = {
          ...mockAuthenticatedEvent,
          routeParameters: undefined,
        };

        const result = await scoreSubmission(eventWithMissingData, mockPrisma);

        expect(result).toEqual(
          expect.objectContaining({
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid score submission format' }),
          }),
        );
      });
    });
  });

  describe('validation scenarios', () => {
    it('should fail when missing chartHash', async () => {
      const eventWithoutChartHash = {
        ...mockAuthenticatedEvent,
        routeParameters: {},
      };

      const result = await scoreSubmission(eventWithoutChartHash, mockPrisma);

      expect(result.statusCode).toBe(400);
    });
  });
});
