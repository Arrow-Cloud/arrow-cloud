import { config } from 'dotenv';
import { postDiscordMessage } from './utils/discord';

(async () => {
  config();
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_BOT_ADMIN_CHANNEL_ID;
  const msg = process.argv.slice(2).join(' ') || 'Hello from Arrow Cloud (local test)';

  if (!token) {
    console.error('Missing DISCORD_BOT_TOKEN');
    process.exit(1);
  }
  if (!channelId) {
    console.error('Missing DISCORD_BOT_ADMIN_CHANNEL_ID');
    process.exit(1);
  }

  try {
    const res = await postDiscordMessage({
      channelId,
      botToken: token,
      payload: { content: msg },
    });
    console.log('Sent message:', res?.id || '(no id)');
  } catch (err: any) {
    console.error('Failed to send message');
    if (err?.status) console.error('Status:', err.status);
    if (err?.body) console.error('Body:', err.body);
    else console.error(err);
    process.exit(2);
  }
})();
