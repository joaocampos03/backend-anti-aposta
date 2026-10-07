/**
 * The integration suite runs against a real Postgres from `docker-compose.yml`,
 * in its own database, truncated between tests. The credentials are that
 * container's throwaway ones; override the whole URL with TEST_DATABASE_URL.
 *
 * The rate limits are deliberately out of the way: the suite registers far more
 * than twenty accounts, and the limit itself has its own test.
 */
export const INTEGRATION_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5434/antiapostadb_test?schema=public';

export const INTEGRATION_ENVIRONMENT: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  DATABASE_URL: INTEGRATION_DATABASE_URL,
  FRONTEND_ORIGIN: 'http://localhost:3000',
  REGISTRATION_CONSENT_POLICY_VERSION: '2026-10-01',
  SESSION_TTL_IN_DAYS: '14',
  REGISTRATION_ATTEMPTS_PER_HOUR: '10000',
  REGISTRATION_SUCCESSES_PER_HOUR: '10000',
  LOG_LEVEL: 'silent',
};
