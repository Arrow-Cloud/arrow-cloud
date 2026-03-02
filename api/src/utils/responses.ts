import { APIGatewayProxyResult } from 'aws-lambda';

export const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};

export interface ResponseOptions {
  omitDefaultHeaders?: boolean;
  headers?: Record<string, string>;
}

export function respond(statusCode = 200, data: any, options: ResponseOptions = {}): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...(!options.omitDefaultHeaders ? DEFAULT_HEADERS : {}),
      ...options.headers,
    },
    body: JSON.stringify(data),
  };
}

export function internalServerErrorResponse(data: any = { error: 'Internal server error' }, options: ResponseOptions = {}): APIGatewayProxyResult {
  return respond(500, data, options);
}

export function forbiddenResponse(data: any = { error: 'Forbidden' }, options: ResponseOptions = {}): APIGatewayProxyResult {
  return respond(403, data, options);
}

export function emptyResponse(statusCode = 204, options: ResponseOptions = {}): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...(!options.omitDefaultHeaders ? DEFAULT_HEADERS : {}),
      ...options.headers,
    },
    body: '',
  };
}

// Plain text responder (useful for .ini or other text files)
export function respondText(statusCode = 200, text: string, headers: Record<string, string> = {}): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...DEFAULT_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
      ...headers,
    },
    body: text,
  };
}
