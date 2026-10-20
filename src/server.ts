import { createApp } from './create-app.js';
import { buildContainer } from './container.js';
import { env, sandboxLedgerWritesEnabled } from '@shared/infrastructure/env.js';
import { logger } from '@shared/infrastructure/logger.js';
import { prisma } from '@shared/infrastructure/prisma.js';

/**
 * Process entry: the environment is already validated by importing `env`.
 * On Vercel it runs compiled, loaded by the root `server.js`.
 */
const app = createApp(
  buildContainer({
    prisma,
    logger,
    frontendOrigin: env.FRONTEND_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
    settings: {
      consentPolicyVersion: env.REGISTRATION_CONSENT_POLICY_VERSION,
      timeZone: env.TIME_ZONE,
      sessionLifetimeInDays: env.SESSION_TTL_IN_DAYS,
      sessionRenewWithinDays: env.SESSION_RENEW_WITHIN_DAYS,
      registrationAttemptsPerHour: env.REGISTRATION_ATTEMPTS_PER_HOUR,
      registrationSuccessesPerHour: env.REGISTRATION_SUCCESSES_PER_HOUR,
      signInAttemptsPerQuarterHour: env.SIGN_IN_ATTEMPTS_PER_QUARTER_HOUR,
      passwordResetAttemptsPerHour: env.PASSWORD_RESET_ATTEMPTS_PER_HOUR,
      classificationOverridesPerHour: env.CLASSIFICATION_OVERRIDES_PER_HOUR,
      consentCommandsPerHour: env.CONSENT_COMMANDS_PER_HOUR,
      goalCommandsPerHour: env.GOAL_COMMANDS_PER_HOUR,
      sandboxLedgerEntriesPerHour: env.SANDBOX_BANK_LEDGER_ENTRIES_PER_HOUR,
      demoNotificationsPerHour: env.DEMO_NOTIFICATIONS_PER_HOUR,
    },
    openFinance: {
      tokenEncryptionKey: env.OPEN_FINANCE_TOKEN_KEY,
      dataHolder: {
        baseUrl: env.SANDBOX_BANK_BASE_URL,
        authorisationScreenUrl: env.SANDBOX_BANK_AUTHORISATION_URL,
        clientId: env.OPEN_FINANCE_CLIENT_ID,
        clientSecret: env.OPEN_FINANCE_CLIENT_SECRET,
        redirectUri: env.OPEN_FINANCE_REDIRECT_URI,
      },
    },
    // The sandbox enrols this platform with the same id, secret and redirect
    // the platform presents: two sides of one registration.
    sandboxBank: {
      client: {
        clientId: env.OPEN_FINANCE_CLIENT_ID,
        displayName: 'anti-aposta',
        redirectUri: env.OPEN_FINANCE_REDIRECT_URI,
        noticeUri: env.OPEN_FINANCE_NOTICE_URI,
      },
      clientSecret: env.OPEN_FINANCE_CLIENT_SECRET,
      ledgerWritesEnabled: sandboxLedgerWritesEnabled(env),
    },
  }),
);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'api listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close();
  await prisma.$disconnect();
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
