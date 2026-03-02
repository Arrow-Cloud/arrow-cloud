import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

interface DatabaseCredentials {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

let cachedDbCredentials: DatabaseCredentials | null = null;

export async function getDatabaseUrl(): Promise<string> {
  // If running locally with DATABASE_URL env var, use it directly
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (cachedDbCredentials) {
    return buildDatabaseUrl(cachedDbCredentials);
  }

  const secretArn = process.env.DATABASE_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DATABASE_SECRET_ARN environment variable not set');
  }

  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      throw new Error('Database secret value is empty');
    }

    cachedDbCredentials = JSON.parse(response.SecretString) as DatabaseCredentials;
    return buildDatabaseUrl(cachedDbCredentials);
  } catch (error) {
    console.error('Error fetching database credentials:', error);
    throw new Error('Failed to fetch database credentials');
  }
}

function buildDatabaseUrl(credentials: DatabaseCredentials): string {
  return `postgresql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.dbname}?schema=public`;
}
