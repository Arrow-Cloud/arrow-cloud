import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

interface DatabaseCredentials {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

interface JwtSecret {
  JWT_SECRET: string;
}

let cachedDbCredentials: DatabaseCredentials | null = null;
let cachedJwtSecret: string | null = null;

export async function getDatabaseUrl(): Promise<string> {
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

export async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  const secretArn = process.env.JWT_SECRET_ARN;
  if (!secretArn) {
    throw new Error('JWT_SECRET_ARN environment variable not set');
  }

  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      throw new Error('JWT secret value is empty');
    }

    const jwtSecretData = JSON.parse(response.SecretString) as JwtSecret;
    cachedJwtSecret = jwtSecretData.JWT_SECRET;
    return cachedJwtSecret;
  } catch (error) {
    console.error('Error fetching JWT secret:', error);
    throw new Error('Failed to fetch JWT secret');
  }
}

function buildDatabaseUrl(credentials: DatabaseCredentials): string {
  return `postgresql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.dbname}?schema=public`;
}
