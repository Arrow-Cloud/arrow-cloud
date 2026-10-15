import { buildUserUpdatedEvent, publishUserUpdatedEvent, EVENT_TYPES, type UserUpdatedEvent } from '../../src/utils/events';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => ({ send: (...args: unknown[]) => mockSend(...args) })),
  PublishCommand: jest.fn((input: unknown) => ({ input })),
}));

jest.mock('../../src/utils/s3', () => ({
  assetS3UrlToCloudFrontUrl: jest.fn((url: string | null) => (url ? url.replace('s3://assets-bucket', 'https://cdn.test') : null)),
}));

const UPDATED_AT = new Date('2026-10-14T12:00:00.000Z');

describe('buildUserUpdatedEvent', () => {
  it('is a snapshot of the user, with the stored s3 avatar turned into the public CloudFront URL', () => {
    const event = buildUserUpdatedEvent(
      { id: 'u1', alias: 'Nilo', profileImageUrl: 's3://assets-bucket/profile-images/u1/a.png', banned: false, updatedAt: UPDATED_AT },
      ['profileImageUrl'],
    );
    expect(event).toMatchObject({
      eventType: 'user-updated',
      userId: 'u1',
      changed: ['profileImageUrl'],
      user: { alias: 'Nilo', profileImageUrl: 'https://cdn.test/profile-images/u1/a.png', banned: false, updatedAt: '2026-10-14T12:00:00.000Z' },
    });
    expect(Date.parse(event.timestamp)).not.toBeNaN();
  });

  it('carries every field even when only one changed, so a consumer can apply it without knowing what came before', () => {
    const event = buildUserUpdatedEvent({ id: 'u1', alias: 'Renamed', profileImageUrl: null, banned: false, updatedAt: UPDATED_AT }, ['alias']);
    expect(event.changed).toEqual(['alias']);
    expect(Object.keys(event.user).sort()).toEqual(['alias', 'banned', 'profileImageUrl', 'updatedAt']);
  });

  it('sends a null avatar as null, not as a missing field', () => {
    const event = buildUserUpdatedEvent({ id: 'u1', alias: 'a', profileImageUrl: null, banned: false, updatedAt: UPDATED_AT }, ['profileImageUrl']);
    expect(event.user.profileImageUrl).toBeNull();
    expect(JSON.parse(JSON.stringify(event)).user).toHaveProperty('profileImageUrl', null);
  });

  it('treats an unknown ban state as not banned, and accepts an ISO string for updatedAt', () => {
    const event = buildUserUpdatedEvent({ id: 'u1', alias: 'a', profileImageUrl: null, banned: undefined, updatedAt: '2026-10-14T12:00:00.000Z' }, ['alias']);
    expect(event.user.banned).toBe(false);
    expect(event.user.updatedAt).toBe('2026-10-14T12:00:00.000Z');
  });

  it('reports a ban', () => {
    const event = buildUserUpdatedEvent({ id: 'u1', alias: 'a', profileImageUrl: null, banned: true, updatedAt: UPDATED_AT }, ['banned']);
    expect(event.user.banned).toBe(true);
    expect(event.changed).toEqual(['banned']);
  });
});

describe('publishUserUpdatedEvent', () => {
  const event: UserUpdatedEvent = buildUserUpdatedEvent({ id: 'u1', alias: 'Nilo', profileImageUrl: null, banned: false, updatedAt: UPDATED_AT }, ['alias']);
  const originalTopic = process.env.SCORE_SUBMISSION_TOPIC_ARN;

  beforeEach(() => {
    mockSend.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.SCORE_SUBMISSION_TOPIC_ARN = originalTopic;
    jest.restoreAllMocks();
  });

  it('publishes the event to the topic, filterable by eventType and with no chartHash attribute', async () => {
    process.env.SCORE_SUBMISSION_TOPIC_ARN = 'arn:aws:sns:us-east-2:111111111111:arrow-cloud-score-submissions';
    await publishUserUpdatedEvent(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const { input } = mockSend.mock.calls[0][0];
    expect(input.TopicArn).toBe('arn:aws:sns:us-east-2:111111111111:arrow-cloud-score-submissions');
    expect(JSON.parse(input.Message)).toEqual(event);
    expect(input.MessageAttributes.eventType).toEqual({ DataType: 'String', StringValue: EVENT_TYPES.USER_UPDATED });
    expect(input.MessageAttributes.userId.StringValue).toBe('u1');
    expect(input.MessageAttributes).not.toHaveProperty('chartHash');
  });

  it('does nothing when no topic is configured', async () => {
    delete process.env.SCORE_SUBMISSION_TOPIC_ARN;
    await publishUserUpdatedEvent(event);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('swallows a publish failure - the profile change is already saved, and the request must not fail over it', async () => {
    process.env.SCORE_SUBMISSION_TOPIC_ARN = 'arn:aws:sns:us-east-2:111111111111:arrow-cloud-score-submissions';
    mockSend.mockRejectedValue(new Error('SNS is down'));
    await expect(publishUserUpdatedEvent(event)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
