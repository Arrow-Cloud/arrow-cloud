export type DiscordEmbedField = { name: string; value: string; inline?: boolean };
export type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  image?: { url: string };
  thumbnail?: { url: string };
  footer?: { text: string; icon_url?: string };
};

export type DiscordMessagePayload = {
  content?: string;
  embeds?: DiscordEmbed[];
};

export class DiscordError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'DiscordError';
  }
}

function clampContent(content?: string): string | undefined {
  if (typeof content !== 'string') return undefined;
  return content.length > 2000 ? content.slice(0, 2000) : content;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Post a message to a Discord channel via Bot token using Discord REST API v10.
 * - Requires: channelId, botToken
 * - Payload may include content and/or embeds
 * - Handles a single 429 retry using Retry-After/X-RateLimit-Reset-After
 */
export async function postDiscordMessage(params: { channelId: string; botToken: string; payload: DiscordMessagePayload }): Promise<any> {
  // Node 18+ has fetch globally; for older versions, consumers must polyfill if needed.
  const _fetch: any = (globalThis as any).fetch;
  if (typeof _fetch !== 'function') {
    throw new Error('global fetch is not available; use Node 18+ or polyfill fetch');
  }
  const { channelId, botToken } = params;
  const body: DiscordMessagePayload = {
    content: clampContent(params.payload.content),
    embeds: params.payload.embeds,
  };

  if (!body.content && (!body.embeds || body.embeds.length === 0)) {
    throw new DiscordError('Discord requires content or at least one embed');
  }

  const doRequest = async () =>
    _fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  let resp: any = await doRequest();
  if (resp.status === 429) {
    const retryAfterHeader = resp.headers.get('retry-after');
    const resetAfterHeader = resp.headers.get('x-ratelimit-reset-after');
    const retryAfterSec = Number(retryAfterHeader || resetAfterHeader || '1');
    await sleep(Math.min(5000, Math.max(0, retryAfterSec * 1000)));
    resp = await doRequest(); // single retry
  }

  if (!resp.ok) {
    let errorBody: unknown;
    try {
      errorBody = await resp.json();
    } catch {
      try {
        errorBody = await resp.text();
      } catch {
        errorBody = undefined;
      }
    }
    throw new DiscordError(`Discord API error ${resp.status}`, resp.status, errorBody);
  }

  try {
    return await resp.json();
  } catch {
    return undefined;
  }
}
