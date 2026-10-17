import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import type { Calendar } from '@shared/domain/calendar.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BettingCeiling } from '../domain/betting-ceiling.js';
import type { BettingCeilingRepository } from '../domain/betting-ceiling.repository.js';
import { CeilingAmount } from '../domain/ceiling-amount.js';
import { CeilingDestination } from '../domain/ceiling-destination.js';
import { ConcurrentModificationError } from '../domain/gamification.errors.js';
import { termsInView } from './ceiling-view.js';
import type { SetBettingCeilingInput, SetBettingCeilingOutput } from './dto/betting-ceiling.dto.js';
import { gamificationFailures } from './gamification.failures.js';

export interface SetBettingCeilingDependencies {
  readonly ceilings: BettingCeilingRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly calendar: Calendar;
  readonly events: EventPublisher;
}

type ParsedChoice = { readonly amount: CeilingAmount; readonly destination: CeilingDestination | null };

/**
 * The user adopts a ceiling. It never moves the month under way — a
 * replacement waits for the next one, and the answer says from when — so no
 * outcome the person is living through is rewritten by the button that set it.
 */
export class SetBettingCeiling implements UseCase<SetBettingCeilingInput, SetBettingCeilingOutput> {
  constructor(private readonly dependencies: SetBettingCeilingDependencies) {}

  async execute(input: SetBettingCeilingInput): Promise<Result<SetBettingCeilingOutput, AppError>> {
    const choice = this.parse(input);

    if (!choice.ok) {
      return choice;
    }

    const now = this.dependencies.clock.now();
    const currentMonth = this.dependencies.calendar.monthKeyOf(now);
    const ceiling = await this.ceilingOf(input.userId, now);
    const effectiveFromMonthKey = ceiling.choose({
      termId: this.dependencies.idGenerator.generate(),
      ...choice.value,
      setAt: now,
      currentMonth,
      nextMonth: this.dependencies.calendar.monthKeyAfter(currentMonth),
    });

    const saved = await this.saved(ceiling);

    if (!saved.ok) {
      return saved;
    }

    await this.dependencies.events.publish(ceiling.pullEvents());

    return ok({ ...termsInView(ceiling, currentMonth), effectiveFromMonthKey });
  }

  private parse(input: SetBettingCeilingInput): Result<ParsedChoice, AppError> {
    const amount = CeilingAmount.fromCents(input.amountInCents);

    if (!amount.ok) {
      return fail(gamificationFailures.invalidField('amount.amountInCents', amount.error.code));
    }

    const destination = CeilingDestination.create(input.destination);

    if (!destination.ok) {
      return fail(gamificationFailures.invalidField('destination', destination.error.code));
    }

    return ok({ amount: amount.value, destination: destination.value });
  }

  private async ceilingOf(userId: string, now: Date): Promise<BettingCeiling> {
    const owner = UniqueEntityId.restore(userId);
    const existing = await this.dependencies.ceilings.findByUserId(owner);

    return (
      existing ??
      BettingCeiling.open({ id: this.dependencies.idGenerator.generate(), userId: owner, createdAt: now })
    );
  }

  private async saved(ceiling: BettingCeiling): Promise<Result<void, AppError>> {
    try {
      await this.dependencies.ceilings.save(ceiling);

      return ok(undefined);
    } catch (cause) {
      if (cause instanceof ConcurrentModificationError) {
        return fail(gamificationFailures.ceilingModifiedConcurrently());
      }

      throw cause;
    }
  }
}
