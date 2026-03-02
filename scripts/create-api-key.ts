import { PrismaClient } from '../api/prisma/generated/client';
import { generateApiKey, hashApiKey } from '../api/src/utils/auth';

const prisma = new PrismaClient();

// usage: npx tsx scripts/create-api-key.ts {username} {key}
(async () => {
  const username = process.argv[2];
  const key = process.argv[3];
  if (!username) {
    console.error('Usage: npx tsx scripts/create-api-key.ts {username} {?key}');
    process.exit(1);
  }
  const k = key || generateApiKey();
  const hashed = hashApiKey(k);
  await prisma.apiKey.create({
    data: {
      keyHash: hashed,
      user: {
        connect: {
          alias: username,
        },
      },
    },
  });
  console.log(`Created API Key for user ${username}: ${k}`);
})();
