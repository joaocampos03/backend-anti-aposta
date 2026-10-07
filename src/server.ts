import { createApp } from './app.js';
import { buildContainer } from './container.js';
import { env } from '@shared/infrastructure/env.js';
import { logger } from '@shared/infrastructure/logger.js';
import { prisma } from '@shared/infrastructure/prisma.js';

/** Process entry: the environment is already validated by importing `env`. */
const app = createApp(
  buildContainer({
    prisma,
    logger,
    frontendOrigin: env.FRONTEND_ORIGIN,
    settings: {
      consentPolicyVersion: env.REGISTRATION_CONSENT_POLICY_VERSION,
      sessionLifetimeInDays: env.SESSION_TTL_IN_DAYS,
      sessionRenewWithinDays: env.SESSION_RENEW_WITHIN_DAYS,
      registrationAttemptsPerHour: env.REGISTRATION_ATTEMPTS_PER_HOUR,
      registrationSuccessesPerHour: env.REGISTRATION_SUCCESSES_PER_HOUR,
      signInAttemptsPerQuarterHour: env.SIGN_IN_ATTEMPTS_PER_QUARTER_HOUR,
      passwordResetAttemptsPerHour: env.PASSWORD_RESET_ATTEMPTS_PER_HOUR,
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
