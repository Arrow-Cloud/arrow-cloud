import { PrismaClient } from '../../prisma/generated';
import { sendExampleEmail } from '../utils/email';
import { emptyResponse, respond } from '../utils/responses';
import type { RouteHandler, AuthenticatedRouteHandler, AuthenticatedEvent } from '../utils/types';

export const healthCheck: RouteHandler = async () => {
  return respond(200, { message: 'OK' });
};

export const authCheck: AuthenticatedRouteHandler = async (event: AuthenticatedEvent, prisma: PrismaClient) => {
  const user = event.user;

  const n = await prisma.user.count();
  return respond(200, { message: `Hello ${user.alias}! We currently have ${n} users.` });
};

export const postCheck: AuthenticatedRouteHandler = async (event: AuthenticatedEvent) => {
  const user = event.user;

  console.log(`Received POST request from user ${user.alias}:`, event.body);

  return emptyResponse();
};

export const mailCheck: AuthenticatedRouteHandler = async (event: AuthenticatedEvent) => {
  const user = event.user;

  console.log(`Received mail check request from user ${user.alias}:`, event.body);

  await sendExampleEmail(user.email);

  return respond(200, { message: `Mail sent to ${user.email}` });
};
