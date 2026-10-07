import { beforeEach } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';

const TABLES = [
  'identity_sessions',
  'identity_password_reset_tokens',
  'identity_sign_in_attempts',
  'identity_users',
  'gamification_badges',
  'gamification_badge_collections',
  'gamification_streaks',
  'notifications_inboxes',
  'open_finance_consents',
] as const;

/** Every test starts from an empty database, so no test depends on another. */
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
});
