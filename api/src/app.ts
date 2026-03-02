import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../prisma/generated/client';
import { RouteConfig, Routes } from './utils/types';
import { composeMiddleware } from './utils/middleware';
import { getDatabaseUrl } from './utils/secrets';
import { healthRoutes } from './routes/health';
import { webRoutes } from './routes/web';
import { apiRoutes } from './routes/api';

let prisma: PrismaClient | undefined;

async function getPrismaClient(): Promise<PrismaClient> {
  if (!prisma) {
    const databaseUrl = await getDatabaseUrl();
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  return prisma;
}

const routes: Routes = {
  ...healthRoutes,
  ...webRoutes,
  ...apiRoutes,
};

const route = (method: string, path: string): RouteConfig | void => {
  // Fast lookup for static routes
  if (routes[path] && routes[path][method] && !routes[path][method].patternMatching) {
    return routes[path][method];
  }

  // Check for dynamic routes like /v1/chart/{chartHash}/play
  for (const routePath in routes) {
    const routeConfig = routes[routePath];
    if (routeConfig[method]) {
      const patternMatching = routeConfig[method].patternMatching;
      if (patternMatching) {
        // Replace path parameters with regex patterns
        let regexPath = routePath;

        for (const param in patternMatching) {
          const regex = patternMatching[param];
          // Use a named capture group to extract parameters
          regexPath = regexPath.replace(`{${param}}`, `(?<${param}>${regex.source})`);
        }

        // Test the path against the regex
        const regex = new RegExp(`^${regexPath}$`);
        if (regex.test(path)) {
          // Extract path parameters if they exist
          const matches = path.match(regex);

          return {
            ...routeConfig[method],
            patternMatching: routeConfig[method].patternMatching,
            routeParameters: matches ? matches.groups : {},
          };
        }
      }
    }
  }

  return;
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const path = event.path;
  const method = event.httpMethod;

  console.log(`Received request: ${method} ${path}`);

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      },
      body: '',
    };
  }

  const routeConfig = route(method, path);
  if (routeConfig) {
    const extendedEvent = {
      ...event,
      routeParameters: routeConfig.routeParameters || {},
    };
    const prismaClient = await getPrismaClient();
    const composedHandler = composeMiddleware(routeConfig, prismaClient);
    return await composedHandler(extendedEvent);
  }

  return {
    statusCode: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: '',
  };
};
