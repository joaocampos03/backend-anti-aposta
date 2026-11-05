import type { ForgetUserClassifications } from '@modules/bet-detection/index.js';
import type { ForgetGamificationAccount } from '@modules/gamification/index.js';
import type { ForgetNotifications } from '@modules/notifications/index.js';
import type { EraseOpenFinanceAccount } from '@modules/open-finance/index.js';
import type { AppError } from '@shared/application/app-error.js';
import type { Result } from '@shared/domain/result.js';
import type { Logger } from '@shared/infrastructure/logger.js';
import type { AccountErasure } from '../application/ports/account-erasure.port.js';

export interface ModularAccountErasureDependencies {
  readonly forgetClassifications: ForgetUserClassifications;
  readonly forgetGamification: ForgetGamificationAccount;
  readonly forgetNotifications: ForgetNotifications;
  readonly eraseOpenFinance: EraseOpenFinanceAccount;
  readonly logger: Logger;
}

type Erasure = (input: { readonly userId: string }) => Promise<Result<void, AppError>>;

/**
 * The seam between `identity` and every context holding something about a person.
 * `sandbox-bank` is not here: it is a foreign institution, and what it keeps is
 * its own ledger. Open Finance tells it the consent is over, as revocation does.
 *
 * `open-finance` runs last because it is the step that calls out of the process.
 * Each step is idempotent, so a retry simply starts from the top.
 */
export class ModularAccountErasure implements AccountErasure {
  constructor(private readonly dependencies: ModularAccountErasureDependencies) {}

  async eraseEverythingOf(userId: string): Promise<boolean> {
    try {
      await this.eraseInEveryContext(userId);

      return true;
    } catch (cause) {
      // Handled, not swallowed: the caller keeps the row and the next run retries.
      this.dependencies.logger.error(
        { userId, cause: cause instanceof Error ? cause.message : 'unknown' },
        'account erasure failed',
      );

      return false;
    }
  }

  private async eraseInEveryContext(userId: string): Promise<void> {
    const { forgetClassifications, forgetGamification, forgetNotifications, eraseOpenFinance } =
      this.dependencies;
    const erasures: readonly Erasure[] = [
      (input) => forgetClassifications.execute(input),
      (input) => forgetGamification.execute(input),
      (input) => forgetNotifications.execute(input),
      (input) => eraseOpenFinance.execute(input),
    ];

    for (const erase of erasures) {
      const erased = await erase({ userId });

      if (!erased.ok) {
        throw new Error(erased.error.code);
      }
    }
  }
}
