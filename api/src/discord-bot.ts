import type { SQSHandler, SQSRecord } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

type InboundMessage = {
  type?: string;
  content?: string;
  channelId?: string; // optional override
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
  }>;
};

const secrets = new SecretsManagerClient({});
const secretArn = process.env.DISCORD_SECRET_ARN!;
const envDefaultChannelId = process.env.DISCORD_DEFAULT_CHANNEL_ID; // optional env override

let cachedToken: string | undefined;
let cachedAdminChannelId: string | undefined;

async function getBotConfig() {
  if (!cachedToken) {
    const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const payload = res.SecretString ? JSON.parse(res.SecretString) : {};
    cachedToken = payload.botToken;
    // Note: we use adminChannelId instead of defaultChannelId per project convention
    cachedAdminChannelId = payload.adminChannelId;
  }
  return { token: cachedToken!, defaultChannelId: envDefaultChannelId || cachedAdminChannelId };
}

function clampContent(s?: string) {
  if (!s) return undefined;
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

async function postToDiscord(channelId: string, body: any) {
  const { token } = await getBotConfig();
  const _fetch: any = (globalThis as any).fetch;
  if (typeof _fetch !== 'function') throw new Error('fetch is not available in runtime');

  const exec = async () =>
    _fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  let resp: any = await exec();
  if (resp.status === 429) {
    const retryAfter = Number(resp.headers.get('retry-after') || resp.headers.get('x-ratelimit-reset-after') || '1');
    await new Promise((r) => setTimeout(r, Math.min(5000, Math.max(0, retryAfter * 1000))));
    resp = await exec();
  }
  if (!resp.ok) {
    let text: string | undefined;
    try {
      text = await resp.text();
    } catch {}
    throw new Error(`Discord API error ${resp.status}: ${text ?? ''}`);
  }
}

function parseRecord(rec: SQSRecord): { channelId: string; body: any } {
  const msg: InboundMessage = JSON.parse(rec.body);
  const chosenChannel = msg.channelId || envDefaultChannelId || cachedAdminChannelId;
  if (!chosenChannel) throw new Error('No channelId provided and no admin/default channel configured');
  return {
    channelId: chosenChannel,
    body: {
      content: clampContent(msg.content),
      embeds: msg.embeds,
    },
  };
}

export const handler: SQSHandler = async (event) => {
  // warm cache
  await getBotConfig();

  const failures: string[] = [];
  await Promise.all(
    event.Records.map(async (rec) => {
      try {
        const { channelId, body } = parseRecord(rec);
        await postToDiscord(channelId, body);
      } catch (err) {
        console.error('discord-bot failure', { err, messageId: rec.messageId });
        failures.push(rec.messageId);
      }
    }),
  );

  if (failures.length > 0) {
    return { batchItemFailures: failures.map((id) => ({ itemIdentifier: id })) };
  }
};
