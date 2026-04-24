import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { AuthenticatedEvent } from '../utils/types';
import { respondText, internalServerErrorResponse } from '../utils/responses';
import { issueApiKeyForUser } from '../services/apiKeys';

// Generates a new API key for the requesting user and returns an ArrowCloud.ini file
export const downloadArrowCloudIni = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const { key } = await issueApiKeyForUser(prisma, event.user.id);

    const ini = `[ArrowCloud]\nApiKey=${key}\n`;

    // Return as a file download
    return respondText(200, ini, {
      'Content-Disposition': 'attachment; filename="ArrowCloud.ini"',
      // No caching to avoid reusing old generated files
      'Cache-Control': 'no-store',
      // Prevent content sniffing issues that can trigger unsafe warnings
      'X-Content-Type-Options': 'nosniff',
    });
  } catch (err) {
    console.error('Error generating ArrowCloud.ini', err);
    return internalServerErrorResponse();
  }
};
