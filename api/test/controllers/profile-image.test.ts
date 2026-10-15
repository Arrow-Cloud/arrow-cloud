import { updateProfileImage, deleteProfileImage } from '../../src/controllers/profile-image';
import { publishUserUpdatedEvent } from '../../src/utils/events';
import { AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient, User } from '../../prisma/generated/client';

const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: (...args: unknown[]) => mockS3Send(...args) })),
  DeleteObjectCommand: jest.fn((input: unknown) => ({ input })),
  PutObjectCommand: jest.fn((input: unknown) => ({ input })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));
jest.mock('../../src/utils/s3', () => ({
  assetS3UrlToCloudFrontUrl: jest.fn((url: string | null) => (url ? url.replace('s3://', 'https://') : null)),
}));
// Keep the real event builder (its output is what these tests assert on); only the SNS publish is replaced.
jest.mock('../../src/utils/events', () => ({
  ...jest.requireActual('../../src/utils/events'),
  publishUserUpdatedEvent: jest.fn(),
}));
const mockPublish = publishUserUpdatedEvent as jest.MockedFunction<typeof publishUserUpdatedEvent>;

const UPDATED_AT = new Date('2026-10-14T12:00:00.000Z');
const NEW_URL = 's3://arrow-cloud-assets/profile-images/user-123/new.png';

function makeEvent(overrides: Partial<User> = {}, body?: unknown): AuthenticatedEvent {
  return {
    path: '/user/profile-image',
    httpMethod: 'PUT',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as never,
    resource: '',
    body: body === undefined ? null : JSON.stringify(body),
    isBase64Encoded: false,
    user: { id: 'user-123', alias: 'nilo', profileImageUrl: null, banned: false, ...overrides } as User,
  };
}

function makePrisma(row: Record<string, unknown>) {
  return {
    user: {
      update: jest
        .fn()
        .mockResolvedValue({ id: 'user-123', email: 'a@b.c', alias: 'nilo', emailVerifiedAt: null, createdAt: UPDATED_AT, updatedAt: UPDATED_AT, ...row }),
    },
  } as unknown as PrismaClient;
}

describe('profile image handlers publish a user-updated event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('updateProfileImage', () => {
    it('publishes a snapshot with the new avatar as a public URL', async () => {
      const prisma = makePrisma({ profileImageUrl: NEW_URL });
      const result = await updateProfileImage(makeEvent({}, { profileImageUrl: NEW_URL }), prisma);

      expect(result.statusCode).toBe(200);
      expect(mockPublish).toHaveBeenCalledTimes(1);
      expect(mockPublish.mock.calls[0][0]).toMatchObject({
        eventType: 'user-updated',
        userId: 'user-123',
        changed: ['profileImageUrl'],
        user: {
          alias: 'nilo',
          profileImageUrl: 'https://arrow-cloud-assets/profile-images/user-123/new.png',
          banned: false,
          updatedAt: '2026-10-14T12:00:00.000Z',
        },
      });
    });

    it('carries the ban state of the user making the change', async () => {
      const prisma = makePrisma({ profileImageUrl: NEW_URL });
      await updateProfileImage(makeEvent({ banned: true }, { profileImageUrl: NEW_URL }), prisma);
      expect(mockPublish.mock.calls[0][0].user.banned).toBe(true);
    });

    it('replaces an existing avatar, deleting the old file, and still publishes once', async () => {
      const prisma = makePrisma({ profileImageUrl: NEW_URL });
      await updateProfileImage(makeEvent({ profileImageUrl: 's3://arrow-cloud-assets/profile-images/user-123/old.png' }, { profileImageUrl: NEW_URL }), prisma);
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockPublish).toHaveBeenCalledTimes(1);
    });

    it("rejects another user's image URL without saving or publishing", async () => {
      const prisma = makePrisma({});
      const result = await updateProfileImage(makeEvent({}, { profileImageUrl: 's3://arrow-cloud-assets/profile-images/someone-else/x.png' }), prisma);

      expect(result.statusCode).toBe(403);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('rejects an invalid body without publishing', async () => {
      const result = await updateProfileImage(makeEvent({}, { profileImageUrl: 'not a url' }), makePrisma({}));
      expect(result.statusCode).toBe(422);
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('does not publish when saving fails', async () => {
      const prisma = { user: { update: jest.fn().mockRejectedValue(new Error('db down')) } } as unknown as PrismaClient;
      const result = await updateProfileImage(makeEvent({}, { profileImageUrl: NEW_URL }), prisma);
      expect(result.statusCode).toBe(500);
      expect(mockPublish).not.toHaveBeenCalled();
    });
  });

  describe('deleteProfileImage', () => {
    it('publishes a snapshot with no avatar', async () => {
      const prisma = makePrisma({ profileImageUrl: null });
      const result = await deleteProfileImage(makeEvent({ profileImageUrl: 's3://arrow-cloud-assets/profile-images/user-123/old.png' }), prisma);

      expect(result.statusCode).toBe(200);
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockPublish).toHaveBeenCalledTimes(1);
      expect(mockPublish.mock.calls[0][0]).toMatchObject({ userId: 'user-123', changed: ['profileImageUrl'], user: { alias: 'nilo', profileImageUrl: null } });
    });

    it('does not publish when saving fails', async () => {
      const prisma = { user: { update: jest.fn().mockRejectedValue(new Error('db down')) } } as unknown as PrismaClient;
      const result = await deleteProfileImage(makeEvent(), prisma);
      expect(result.statusCode).toBe(500);
      expect(mockPublish).not.toHaveBeenCalled();
    });
  });
});
