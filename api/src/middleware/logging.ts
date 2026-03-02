import { APIGatewayProxyEvent } from 'aws-lambda';
import { Middleware } from '../utils/types';

export const loggingMiddleware: Middleware = async (event: APIGatewayProxyEvent) => {
  console.log(`[LOGGING] ${event.httpMethod} ${event.path} - ${new Date().toISOString()}`);

  if (event.body) {
    console.log(`[LOGGING] Request body size: ${event.body.length} characters`);
  }

  // Return void to continue to next middleware/handler
  return;
};
