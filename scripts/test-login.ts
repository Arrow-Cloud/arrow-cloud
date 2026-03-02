import { login } from '../api/src/controllers/auth';
import { PrismaClient } from '../api/prisma/generated/client';
import { APIGatewayProxyEvent } from 'aws-lambda';

const prisma = new PrismaClient();

// usage: npx tsx scripts/test-login.ts {email} {password}
(async () => {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/test-login.ts {email} {password}');
    process.exit(1);
  }

  const mockEvent: APIGatewayProxyEvent = {
    path: '/login',
    httpMethod: 'POST',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    body: JSON.stringify({ email, password }),
    isBase64Encoded: false,
  };

  try {
    const result = await login(mockEvent, prisma);
    console.log('Status:', result.statusCode);
    console.log('Headers:', result.headers);
    console.log('Body:', result.body);
  } catch (error) {
    console.error('Error testing login:', error);
  } finally {
    await prisma.$disconnect();
  }
})();
