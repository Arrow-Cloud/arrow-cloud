import { PrismaClient } from '../prisma/generated/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

interface DatabaseSecret {
  username: string;
  password: string;
  engine: string;
  host: string;
  port: number;
  dbname: string;
}

async function getDatabaseUrl(): Promise<string> {
  const secretArn = process.env.DATABASE_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DATABASE_SECRET_ARN environment variable is required');
  }

  const client = new SecretsManagerClient();
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const result = await client.send(command);

  if (!result.SecretString) {
    throw new Error('Failed to retrieve database secret');
  }

  const secret: DatabaseSecret = JSON.parse(result.SecretString);
  return `postgresql://${secret.username}:${secret.password}@${secret.host}:${secret.port}/${secret.dbname}`;
}

/**
 * Calculate popularity scores for all packs using SQL-based approach
 */
async function calculatePackPopularity(prisma: PrismaClient): Promise<void> {
  console.log('Starting pack popularity calculation using SQL...');

  const startTime = Date.now();

  try {
    // Use raw SQL to calculate and update popularity scores in one operation
    const result = await prisma.$executeRaw`
      UPDATE "Pack" 
      SET 
        popularity = pack_popularity.weighted_popularity,
        "popularityUpdatedAt" = NOW()
      FROM (
        SELECT 
          p.id,
          ROUND(
            COALESCE(
              SUM(
                GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - pl."createdAt")) / (24 * 60 * 60 * 90)))
              ), 
              0
            ), 
            2
          ) as weighted_popularity
        FROM "Pack" p
        LEFT JOIN "Simfile" s ON s."packId" = p.id
        LEFT JOIN "SimfileChart" sc ON sc."simfileId" = s.id
        LEFT JOIN "Chart" c ON c.hash = sc."chartHash"
        LEFT JOIN "Play" pl ON pl."chartHash" = c.hash 
          AND pl."createdAt" >= NOW() - INTERVAL '90 days'
        GROUP BY p.id
      ) pack_popularity
      WHERE "Pack".id = pack_popularity.id;
    `;

    const duration = Date.now() - startTime;
    console.log(`Pack popularity calculation completed. Updated ${result} packs in ${duration}ms`);
  } catch (error) {
    console.error('Error in SQL-based popularity calculation:', error);
    throw error;
  }
}

/**
 * Lambda handler for scheduled pack popularity calculation
 */
export async function handler(): Promise<void> {
  let prisma: PrismaClient;

  try {
    const databaseUrl = await getDatabaseUrl();
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    await calculatePackPopularity(prisma);

    console.log('Pack popularity calculation completed successfully');
  } catch (error) {
    console.error('Error in pack popularity calculation:', error);
    throw error;
  } finally {
    if (prisma!) {
      await prisma.$disconnect();
    }
  }
}
