import { prisma } from '../src/shared/infrastructure/prisma.js';

/**
 * Synthetic data only. No real CPF, CNPJ, name, address or bank movement ever
 * enters this repository — seeding an account here would also mean seeding a
 * password hash, so registration is exercised through the endpoint instead.
 */
async function seed(): Promise<void> {
  const users = await prisma.user.count();

  process.stdout.write(`identity_users rows: ${users}\n`);
}

await seed();
await prisma.$disconnect();
