import type { DomainError } from '@shared/domain/domain-error.js';

export type NotificationsErrorCode = 'INVALID_NOTIFICATION';

/** A code and nothing else: the wording is the application layer's to choose. */
export class NotificationsError<TCode extends NotificationsErrorCode = NotificationsErrorCode>
  implements DomainError
{
  private constructor(readonly code: TCode) {}

  static invalidNotification(): NotificationsError<'INVALID_NOTIFICATION'> {
    return new NotificationsError('INVALID_NOTIFICATION');
  }
}
