import { applyUserUpdate, type UserUpdatedMessage } from '../src/user-updates';

const mockSend = jest.fn();
const mockQueryState = jest.fn();

jest.mock('../src/shared', () => ({
  ddb: { send: (command: unknown) => mockSend(command) },
  queryState: (...args: unknown[]) => mockQueryState(...args),
  TABLE_NAME: 'state-table',
}));

const event: UserUpdatedMessage = {
  eventType: 'user-updated',
  userId: 'u1',
  changed: ['alias', 'profileImageUrl'],
  user: { alias: 'NewName', profileImageUrl: 'https://cdn/new.png', banned: false, updatedAt: '2026-10-14T10:00:00.000Z' },
};

/** Per-prefix item keys the mocked table returns for USER#u1. */
function table(items: Record<string, string[]>) {
  mockQueryState.mockImplementation(async (_pk: string, prefix: string) => (items[prefix] ?? []).map((sk) => ({ sk })));
}

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({});
  mockQueryState.mockReset();
});

describe('applyUserUpdate', () => {
  it('updates every PLAY, BEST and COURSE_STANDING item and nothing else', async () => {
    table({ 'PLAY#': ['PLAY#a#1', 'PLAY#a#2'], 'BEST#': ['BEST#a'], 'COURSE#': ['COURSE#beta-pines'] });

    const result = await applyUserUpdate(event);

    expect(result).toEqual({ updated: 4, skipped: 0 });
    expect(mockQueryState.mock.calls.map((c) => c[1])).toEqual(['PLAY#', 'BEST#', 'COURSE#']);
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('writes the new alias and avatar, keyed to the user, and stamps the version', async () => {
    table({ 'BEST#': ['BEST#a'] });

    await applyUserUpdate(event);

    const input = mockSend.mock.calls[0][0].input;
    expect(input.Key).toEqual({ pk: 'USER#u1', sk: 'BEST#a' });
    expect(input.ExpressionAttributeValues).toEqual({ ':alias': 'NewName', ':image': 'https://cdn/new.png', ':at': '2026-10-14T10:00:00.000Z' });
  });

  it('clears the avatar when the player removed it (null, not absent)', async () => {
    table({ 'BEST#': ['BEST#a'] });

    await applyUserUpdate({ ...event, user: { ...event.user, profileImageUrl: null } });

    expect(mockSend.mock.calls[0][0].input.ExpressionAttributeValues[':image']).toBeNull();
  });

  it('never creates an item and only applies over an older version', async () => {
    table({ 'BEST#': ['BEST#a'] });

    await applyUserUpdate(event);

    const condition: string = mockSend.mock.calls[0][0].input.ConditionExpression;
    expect(condition).toContain('attribute_exists(pk)');
    expect(condition).toContain('attribute_not_exists(identityAt) OR identityAt <= :at');
  });

  it('counts an item that already holds a newer version as skipped, not an error', async () => {
    table({ 'PLAY#': ['PLAY#a#1', 'PLAY#a#2'] });
    const stale = Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' });
    mockSend.mockResolvedValueOnce({}).mockRejectedValueOnce(stale);

    expect(await applyUserUpdate(event)).toEqual({ updated: 1, skipped: 1 });
  });

  it('fails the event on any other error so SQS retries it', async () => {
    table({ 'BEST#': ['BEST#a'] });
    mockSend.mockRejectedValue(Object.assign(new Error('throttled'), { name: 'ProvisionedThroughputExceededException' }));

    await expect(applyUserUpdate(event)).rejects.toThrow('throttled');
  });

  it('is a no-op for a player golf has never seen', async () => {
    table({});

    expect(await applyUserUpdate(event)).toEqual({ updated: 0, skipped: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
