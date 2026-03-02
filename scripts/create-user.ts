import { PrismaClient } from '../api/prisma/generated/client';

const prisma = new PrismaClient();

// usage: npx tsx scripts/create-user.ts {username} {email}
(async () => {
  const username = process.argv[2];
  const email = process.argv[3];
  if (!username || !email) {
    console.error('Usage: npx tsx scripts/create-user.ts {username} {email}');
    process.exit(1);
  }
  const user = await prisma.user.create({
    data: {
      alias: username,
      email,
    },
  });
  console.log(`Created user (${user.id}) ${user.alias} with email: ${user.email}`);
})();
