import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import type {
  AnnounceIngestedTransactionsInput,
  NotificationDto,
} from './dto/notification.dto.js';
import type { NotificationDelivery } from './notification-delivery.js';
import type { MovementReader } from './ports/movement-reader.port.js';

/** Enough to recognise what arrived; the statement holds the rest. */
export const MOVEMENT_LINES_KEPT = 5;

/**
 * Reaction to `TransactionsIngested`: the statement changed, so the screens
 * showing it should read it again. It carries a count and the ids of the newest
 * rows, and nothing about them: what they were is the statement's to say, behind
 * the session, which is where `ListNotifications` asks.
 *
 * A run that ingested nothing announces nothing: an empty notification is
 * noise, and the frequency rule exists to keep these meaningful.
 */
export class AnnounceIngestedTransactions
  implements UseCase<AnnounceIngestedTransactionsInput, NotificationDto | null>
{
  constructor(
    private readonly delivery: NotificationDelivery,
    private readonly movements: MovementReader,
  ) {}

  async execute(
    input: AnnounceIngestedTransactionsInput,
  ): Promise<Result<NotificationDto | null, AppError>> {
    if (input.transactionIds.length === 0) {
      return ok(null);
    }

    const newest = await this.movements.newestOf(
      input.userId,
      input.transactionIds,
      MOVEMENT_LINES_KEPT,
    );

    return this.delivery.deliver(input.userId, {
      kind: 'TRANSACTIONS_INGESTED',
      ingestedCount: input.transactionIds.length,
      transactionIds: newest.map((line) => line.transactionId),
    });
  }
}
