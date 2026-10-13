import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import type {
  AnnounceIngestedTransactionsInput,
  NotificationDto,
} from './dto/notification.dto.js';
import type { NotificationDelivery } from './notification-delivery.js';

/**
 * Reaction to `TransactionsIngested`: the statement changed, so the screens
 * showing it should read it again. It carries a count and nothing about the
 * movements — what they were is the statement's to say, behind the session.
 *
 * A run that ingested nothing announces nothing: an empty notification is
 * noise, and the frequency rule exists to keep these meaningful.
 */
export class AnnounceIngestedTransactions
  implements UseCase<AnnounceIngestedTransactionsInput, NotificationDto | null>
{
  constructor(private readonly delivery: NotificationDelivery) {}

  async execute(
    input: AnnounceIngestedTransactionsInput,
  ): Promise<Result<NotificationDto | null, AppError>> {
    if (input.ingestedCount === 0) {
      return ok(null);
    }

    return this.delivery.deliver(input.userId, {
      kind: 'TRANSACTIONS_INGESTED',
      ingestedCount: input.ingestedCount,
    });
  }
}
