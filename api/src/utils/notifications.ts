import { PrismaClient, Prisma } from '../../prisma/generated/client';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Prisma.InputJsonValue;
}

export async function createNotification(prisma: PrismaClient, input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: input.data ?? undefined,
      channel: 'in_app',
    },
  });
}
