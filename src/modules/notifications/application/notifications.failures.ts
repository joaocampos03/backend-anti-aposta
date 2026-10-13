import { AppError, type AppErrorDetails } from '@shared/application/app-error.js';
import { assertNever } from '@shared/domain/assert-never.js';
import type { NotificationsError } from '../domain/notifications.errors.js';
import { NOTIFICATIONS_MESSAGES } from './notifications.messages.js';

/** The only place a notifications error code becomes a status and a sentence. */
export const notificationsFailures = {
  /** No inbox means nobody registered under that id: there is no one to deliver to. */
  recipientNotFound: (): AppError =>
    new AppError('RECIPIENT_NOT_FOUND', NOTIFICATIONS_MESSAGES.recipientNotFound, 404),

  validationFailed: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', NOTIFICATIONS_MESSAGES.validationFailed, 422, details),

  fromDomain: (error: NotificationsError): AppError => {
    switch (error.code) {
      case 'INVALID_NOTIFICATION':
        return new AppError(
          'INVALID_NOTIFICATION',
          NOTIFICATIONS_MESSAGES.invalidNotification,
          422,
        );
      default:
        return assertNever(error.code);
    }
  },
} as const;
