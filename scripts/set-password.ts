import { PrismaClient } from '../api/prisma/generated/client';
import { hashPassword, generateSalt } from '../api/src/utils/password';

const prisma = new PrismaClient();

// usage: npx tsx scripts/set-password.ts {email} {password}
(async () => {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/set-password.ts {email} {password}');
    process.exit(1);
  }

  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    // Generate salt and hash password
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);

    // Update user with password
    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        passwordSalt: salt,
      },
    });

    console.log(`Password set for user ${updatedUser.alias} (${updatedUser.email})`);
  } catch (error) {
    console.error('Error setting password:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
