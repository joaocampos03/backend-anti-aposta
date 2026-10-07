import { Prisma, PrismaClient } from '@prisma/client';
import { env } from './env.js';

/** The single client instance. No module reaches it outside its own `infrastructure/`. */
export const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type PrismaTransactionClient = Prisma.TransactionClient;

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** True when a write lost to a unique index on the given column. */
export function isUniqueViolationOn(cause: unknown, column: string): boolean {
  if (!(cause instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (cause.code !== UNIQUE_CONSTRAINT_VIOLATION) {
    return false;
  }

  const target = cause.meta?.['target'];

  if (Array.isArray(target)) {
    return target.includes(column);
  }

  return typeof target === 'string' && target.includes(column);
}
