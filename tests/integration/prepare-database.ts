import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { INTEGRATION_DATABASE_URL } from './environment.js';

const DATABASE_ALREADY_EXISTS = '42P04';

/** Connects to the maintenance database to create the test one if it is missing. */
async function createDatabase(url: URL): Promise<void> {
  const databaseName = url.pathname.replace('/', '');
  const maintenance = new URL(url.toString());
  maintenance.pathname = '/postgres';

  const client = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });

  try {
    await client.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  } catch (cause) {
    if (!String(cause).includes(DATABASE_ALREADY_EXISTS)) {
      throw cause;
    }
  } finally {
    await client.$disconnect();
  }
}

/**
 * The suite drives the real app against a real Postgres, so it runs the real
 * migrations — the same ones production will run.
 */
export default async function prepareDatabase(): Promise<void> {
  const url = new URL(INTEGRATION_DATABASE_URL);

  await createDatabase(url);

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: INTEGRATION_DATABASE_URL },
    stdio: 'ignore',
  });
}
