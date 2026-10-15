import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type {
  BookmakerIdentityQuery,
  BookmakerIdentityRow,
} from '../application/ports/bookmaker-identity.query.port.js';
import type { RegistryStatus } from '../domain/bookmaker-identity.js';

interface RawIdentityRow {
  readonly bookmaker_id: string;
  readonly bookmaker_name: string;
  readonly registry_status: RegistryStatus;
}

/**
 * One row per house in this reader's history, as a read model.
 *
 * `MIN(name)` rather than "the latest": two spellings of one unregistered house
 * share an id, and the name has to be the same on every request or the ranking
 * would appear to rename a row between two loads of the same screen.
 */
export class PrismaBookmakerIdentityQuery implements BookmakerIdentityQuery {
  constructor(private readonly client: PrismaTransactionClient) {}

  async forUserId(userId: string): Promise<readonly BookmakerIdentityRow[]> {
    const rows = await this.client.$queryRaw<RawIdentityRow[]>(Prisma.sql`
      SELECT c."bookmaker_id",
             MIN(c."bookmaker_name") AS bookmaker_name,
             MIN(c."registry_status"::text)::"bet_detection_registry_status" AS registry_status
        FROM "bet_detection_classifications" c
       WHERE c."user_id" = ${userId}::uuid
         AND c."bookmaker_id" IS NOT NULL
         AND c."bookmaker_name" IS NOT NULL
         AND c."registry_status" IS NOT NULL
       GROUP BY c."bookmaker_id"
    `);

    return rows.map((row) => ({
      bookmakerId: row.bookmaker_id,
      name: row.bookmaker_name,
      registryStatus: row.registry_status,
    }));
  }
}
