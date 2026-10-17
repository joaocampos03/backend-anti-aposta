import { beforeEach } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';

const TABLES = [
  'identity_sessions',
  'identity_password_reset_tokens',
  'identity_sign_in_attempts',
  'identity_users',
  'bet_detection_classifications',
  'bet_detection_bookmakers',
  'awareness_reference_items',
  'open_finance_transactions',
  'open_finance_connected_accounts',
  'gamification_badges',
  'gamification_badge_collections',
  'gamification_streaks',
  'gamification_goal_movements',
  'gamification_savings_goals',
  'gamification_ceiling_terms',
  'gamification_betting_ceilings',
  'notifications_notifications',
  'notifications_inboxes',
  'open_finance_authorisation_requests',
  'open_finance_consent_tokens',
  'open_finance_consents',
  'sandbox_bank_ledger_entries',
  'sandbox_bank_accounts',
  'sandbox_bank_authorisation_codes',
  'sandbox_bank_issued_tokens',
  'sandbox_bank_consents',
] as const;

/** Every test starts from an empty database, so no test depends on another. */
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
});
