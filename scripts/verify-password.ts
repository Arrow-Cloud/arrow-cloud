import { PrismaClient } from '../api/prisma/generated/client';
import { verifyPassword } from '../api/src/utils/password';

const prisma = new PrismaClient();

// usage: npx tsx scripts/verify-password.ts {email} {password}
(async () => {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/verify-password.ts {email} {password}');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    if (!user.passwordHash || !user.passwordSalt) {
      console.error(`User ${user.alias} does not have a password set`);
      process.exit(1);
    }

    const isValid = verifyPassword(password, user.passwordSalt, user.passwordHash);

    if (isValid) {
      console.log(`✓ Password is correct for user ${user.alias}`);
    } else {
      console.log(`✗ Password is incorrect for user ${user.alias}`);
    }
  } catch (error) {
    console.error('Error verifying password:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
