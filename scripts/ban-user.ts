import { PrismaClient } from '../api/prisma/generated/client';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const prisma = new PrismaClient();
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });

interface BanUserOptions {
  userId: string;
  reason?: string;
  deleteData?: boolean; // If true, delete all user data; if false, just ban
}

async function sendSuspensionEmail(email: string, alias: string): Promise<void> {
  const fromEmail = process.env.FROM_EMAIL_ADDRESS || 'noreply@arrowcloud.dance';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Account Suspended - Arrow Cloud</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc3545; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .reason { background: #fff; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Account Suspended</h1>
            </div>
            <div class="content">
                <p>Dear <strong>${alias}</strong>,</p>
                
                <p>Your Arrow Cloud account has been permanently suspended.</p>
                
                <p>You cannot appeal this decision. You are not permitted to sign up again at any point in the future.</p>
                
                <p>Regards,<br><strong>The Arrow Cloud Team</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message, please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
  `;

  const textContent = `
Account Suspended

Dear ${alias},

Your Arrow Cloud account has been suspended due to a violation of our terms of service.

If you believe this action was taken in error, please contact our support team.

Thank you,
The Arrow Cloud Team

This is an automated message, please do not reply to this email.
  `;

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: 'Account Suspended - Arrow Cloud',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlContent,
          Charset: 'UTF-8',
        },
        Text: {
          Data: textContent,
          Charset: 'UTF-8',
        },
      },
    },
  });

  await sesClient.send(command);
}

interface BanUserOptions {
  userId: string;
  reason?: string;
  deleteData?: boolean; // If true, delete all user data; if false, just ban
}

async function banUser({ userId, reason = 'Violation of terms of service', deleteData = true }: BanUserOptions) {
  console.log(`Starting ban process for user ID: ${userId}`);
  console.log(`Reason: ${reason}`);
  console.log(`Delete user data: ${deleteData}`);

  try {
    // First, check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        alias: true,
        banned: true,
      },
    });

    if (!user) {
      console.error(`User with ID ${userId} not found`);
      return;
    }

    if (user.banned) {
      console.log(`User ${user.alias} (${user.email}) is already banned`);
      return;
    }

    console.log(`Found user: ${user.alias} (${user.email})`);

    if (deleteData) {
      console.log('Deleting user data...');

      // Delete in correct order to respect foreign key constraints

      // 1. Delete API keys
      const deletedApiKeys = await prisma.apiKey.deleteMany({
        where: { userId },
      });
      console.log(`Deleted ${deletedApiKeys.count} API keys`);

      // 2. Delete passkeys
      const deletedPasskeys = await prisma.passkey.deleteMany({
        where: { userId },
      });
      console.log(`Deleted ${deletedPasskeys.count} passkeys`);

      // 3. Delete user preferred leaderboards
      const deletedPrefs = await prisma.userPreferredLeaderboard.deleteMany({
        where: { userId },
      });
      console.log(`Deleted ${deletedPrefs.count} preferred leaderboards`);

      // 4. Delete rival relationships (both directions)
      const deletedRivalsAsUser = await prisma.userRival.deleteMany({
        where: { userId },
      });
      const deletedRivalsAsRival = await prisma.userRival.deleteMany({
        where: { rivalUserId: userId },
      });
      console.log(`Deleted ${deletedRivalsAsUser.count} rival relationships as user`);
      console.log(`Deleted ${deletedRivalsAsRival.count} rival relationships as rival`);

      // 5. Delete user roles
      const deletedRoles = await prisma.userRole.deleteMany({
        where: { userId },
      });
      console.log(`Deleted ${deletedRoles.count} user roles`);

      // 6. Delete user permissions
      const deletedPermissions = await prisma.userPermission.deleteMany({
        where: { userId },
      });
      console.log(`Deleted ${deletedPermissions.count} user permissions`);

      // 7. Delete plays (this will cascade to lifebars and play leaderboards)
      const deletedPlays = await prisma.play.deleteMany({
        where: { userId },
      });
      console.log(`Deleted ${deletedPlays.count} plays`);

      // 8. Delete event registrations
      const deletedEventRegistrations = await prisma.eventRegistration.deleteMany({
        where: { userId },
      });
      console.log(`Deleted ${deletedEventRegistrations.count} event registrations`);
    }

    // Ban the user
    await prisma.user.update({
      where: { id: userId },
      data: {
        banned: true,
        shadowBanned: false, // If they're banned outright, no need for shadow ban
      },
    });

    // Send suspension notification email
    try {
      await sendSuspensionEmail(user.email, user.alias, reason);
      console.log('Suspension notification email sent successfully');
    } catch (emailError) {
      console.warn('Failed to send suspension notification email:', emailError);
      // Don't fail the entire operation if email fails
    }

    console.log(`\n✅ User ${user.alias} (${user.email}) has been banned successfully`);
    if (deleteData) {
      console.log('All associated user data has been deleted');
    }
  } catch (error) {
    console.error('Error banning user:', error);
    throw error;
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
Usage: 
  npx tsx scripts/ban-user.ts <userId> [reason] [--keep-data]

Examples:
  npx tsx scripts/ban-user.ts user-123 "Cheating detected"
  npx tsx scripts/ban-user.ts user-123 "Spam" --keep-data
    `);
    process.exit(1);
  }

  const userId = args[0];
  const reason = args[1] || undefined;
  const keepData = args.includes('--keep-data');

  try {
    await banUser({
      userId,
      reason,
      deleteData: !keepData,
    });
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Only run main if this script is executed directly
if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

// Export function for potential reuse
export { banUser };
