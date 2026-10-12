import type { PrismaClient } from '@prisma/client';
import { CreateBadgeCollection, StartStreak } from '@modules/gamification/index.js';
import { UserRegistered } from '@modules/identity/index.js';
import { RegisterUser } from '@modules/identity/application/register-user.use-case.js';
import { ResetPassword } from '@modules/identity/application/reset-password.use-case.js';
import { ResolveSession } from '@modules/identity/application/resolve-session.use-case.js';
import { SignIn } from '@modules/identity/application/sign-in.use-case.js';
import { SignOut } from '@modules/identity/application/sign-out.use-case.js';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/argon2-password-hasher.js';
import { CryptoSessionTokenGenerator } from '@modules/identity/infrastructure/crypto-session-token-generator.js';
import { OpenFinanceAuthorisedConsentLookup } from '@modules/identity/infrastructure/open-finance-authorised-consent-lookup.js';
import { PrismaIdentityUnitOfWork } from '@modules/identity/infrastructure/prisma-identity-unit-of-work.js';
import { PrismaPasswordResetTokenRepository } from '@modules/identity/infrastructure/prisma-password-reset-token.repository.js';
import { PrismaSessionRepository } from '@modules/identity/infrastructure/prisma-session.repository.js';
import { PrismaSignInThrottleRepository } from '@modules/identity/infrastructure/prisma-sign-in-throttle.repository.js';
import { PrismaUserRepository } from '@modules/identity/infrastructure/prisma-user.repository.js';
import { IdentityController } from '@modules/identity/http/identity.controller.js';
import {
  registerUserBodySchema,
  resetPasswordBodySchema,
  signInBodySchema,
} from '@modules/identity/http/identity.schemas.js';
import { identityFailures } from '@modules/identity/application/identity.failures.js';
import { IDENTITY_MESSAGES } from '@modules/identity/application/identity.messages.js';
import {
  AmountReframing,
  EvaluateSupportOffer,
  FIXED_INCOME_ANNUAL_RATE_PERCENT,
} from '@modules/awareness/index.js';
import { OpenFinanceMonthlyBetSpendReader } from '@modules/awareness/infrastructure/open-finance-monthly-bet-spend-reader.js';
import { AwarenessController } from '@modules/awareness/http/awareness.controller.js';
import {
  ClassificationLookup,
  ForgetUserClassifications,
  ReclassifyTransaction,
  RevertReclassification,
  BetClassificationOverridden,
  BetTransactionDetected,
} from '@modules/bet-detection/index.js';
import { AwarenessYieldCalculator as DetectionYieldCalculator } from '@modules/bet-detection/infrastructure/awareness-yield-calculator.js';
import { OpenFinanceTransactionReader } from '@modules/bet-detection/infrastructure/open-finance-transaction-reader.js';
import { PrismaBookmakerRepository } from '@modules/bet-detection/infrastructure/prisma-bookmaker.repository.js';
import { PrismaTransactionClassificationRepository } from '@modules/bet-detection/infrastructure/prisma-transaction-classification.repository.js';
import { BetDetectionController } from '@modules/bet-detection/http/bet-detection.controller.js';
import {
  classificationOverrideBodySchema,
  transactionIdParamsSchema,
} from '@modules/bet-detection/http/bet-detection.schemas.js';
import { betDetectionFailures } from '@modules/bet-detection/application/bet-detection.failures.js';
import { BET_DETECTION_MESSAGES } from '@modules/bet-detection/application/bet-detection.messages.js';
import {
  ConsentRevoked,
  ListConnectedAccounts,
  ListTransactions,
  ProjectClassification,
  PrismaMonthlyBetSpendQuery,
  PurgeUserFinancialData,
  SummariseSpendByMonth,
  TransactionAmountLookup,
} from '@modules/open-finance/index.js';
import { AwarenessYieldCalculator } from '@modules/open-finance/infrastructure/awareness-yield-calculator.js';
import { BetDetectionClassificationReader } from '@modules/open-finance/infrastructure/bet-detection-classification-reader.js';
import { PrismaConnectedAccountRepository } from '@modules/open-finance/infrastructure/prisma-connected-account.repository.js';
import { PrismaConsentRepository } from '@modules/open-finance/infrastructure/prisma-consent.repository.js';
import { PrismaMonthlySpendQuery } from '@modules/open-finance/infrastructure/monthly-spend.query.js';
import { PrismaTransactionLedgerQuery } from '@modules/open-finance/infrastructure/transaction-ledger.query.js';
import { PrismaTransactionRepository } from '@modules/open-finance/infrastructure/prisma-transaction.repository.js';
import { OpenFinanceController } from '@modules/open-finance/http/open-finance.controller.js';
import {
  listTransactionsQuerySchema,
  monthlySummaryQuerySchema,
} from '@modules/open-finance/http/open-finance.schemas.js';
import { openFinanceFailures } from '@modules/open-finance/application/open-finance.failures.js';
import { SessionCallerResolver } from '@modules/identity/http/session-caller-resolver.js';
import { CreateInbox } from '@modules/notifications/index.js';
import { PrismaInboxRepository } from '@modules/notifications/infrastructure/prisma-inbox.repository.js';
import { PrismaBadgeCollectionRepository } from '@modules/gamification/infrastructure/prisma-badge-collection.repository.js';
import { PrismaStreakRepository } from '@modules/gamification/infrastructure/prisma-streak.repository.js';
import { AuthorisedConsentQuery } from '@modules/open-finance/index.js';
import type { Clock } from '@shared/application/clock.port.js';
import { InProcessEventBus } from '@shared/infrastructure/in-process-event-bus.js';
import type { Logger } from '@shared/infrastructure/logger.js';
import { SystemClock } from '@shared/infrastructure/system-clock.js';
import { UuidV7IdGenerator } from '@shared/infrastructure/uuid-v7-id-generator.js';
import { windowedRateLimit } from '@shared/http/rate-limit.js';
import { Calendar } from '@shared/domain/calendar.js';
import { requireSession } from '@shared/http/require-session.js';
import { validateBody, validateParams, validateQuery } from '@shared/http/validate.js';
import type { AppDependencies } from './app.js';

const MINUTES_IN_AN_HOUR = 60;
const MINUTES_IN_A_QUARTER_HOUR = 15;

export interface ContainerSettings {
  readonly consentPolicyVersion: string;
  /** Day and month boundaries, which for this product are never UTC. */
  readonly timeZone: string;
  readonly classificationOverridesPerHour: number;
  readonly sessionLifetimeInDays: number;
  readonly sessionRenewWithinDays: number;
  readonly registrationAttemptsPerHour: number;
  readonly registrationSuccessesPerHour: number;
  readonly signInAttemptsPerQuarterHour: number;
  readonly passwordResetAttemptsPerHour: number;
}

export interface ContainerInput {
  readonly prisma: PrismaClient;
  readonly logger: Logger;
  readonly frontendOrigin: string;
  /** Express `trust proxy`: which hop may report the client address. */
  readonly trustProxy: string | false;
  readonly settings: ContainerSettings;
  /** Overridden in tests so an issued session always lands on the same instant. */
  readonly clock?: Clock;
}

/**
 * The composition root: the only file that wires a port to an adapter, and the
 * only place that knows which context reacts to which event.
 */
export function buildContainer(input: ContainerInput): AppDependencies {
  const clock = input.clock ?? new SystemClock();
  const idGenerator = new UuidV7IdGenerator(clock);
  const eventBus = new InProcessEventBus(input.logger);
  const sessionTokens = new CryptoSessionTokenGenerator();
  const passwords = new Argon2PasswordHasher();
  const unitOfWork = new PrismaIdentityUnitOfWork(input.prisma);
  const users = new PrismaUserRepository(input.prisma);
  const sessions = new PrismaSessionRepository(input.prisma);
  const openFinanceConsents = new OpenFinanceAuthorisedConsentLookup(
    new AuthorisedConsentQuery(input.prisma, clock),
  );
  const sessionLifetime = {
    lifetimeInDays: input.settings.sessionLifetimeInDays,
    renewWithinDays: input.settings.sessionRenewWithinDays,
  };

  const registerUser = new RegisterUser(
    unitOfWork,
    passwords,
    sessionTokens,
    idGenerator,
    clock,
    eventBus,
    {
      consentPolicyVersion: input.settings.consentPolicyVersion,
      sessionLifetimeInDays: input.settings.sessionLifetimeInDays,
    },
  );

  const signIn = new SignIn({
    unitOfWork,
    users,
    signInThrottles: new PrismaSignInThrottleRepository(input.prisma),
    passwordVerifier: passwords,
    sessionTokens,
    idGenerator,
    clock,
    events: eventBus,
    openFinanceConsents,
    sessionLifetimeInDays: input.settings.sessionLifetimeInDays,
  });

  const signOut = new SignOut(sessions, sessionTokens, clock, eventBus);

  const resolveSession = new ResolveSession(
    sessions,
    users,
    sessionTokens,
    openFinanceConsents,
    clock,
    sessionLifetime,
  );

  const resetPassword = new ResetPassword({
    unitOfWork,
    users,
    passwordResetTokens: new PrismaPasswordResetTokenRepository(input.prisma),
    passwordHasher: passwords,
    sessionTokens,
    clock,
    events: eventBus,
  });

  subscribeToRegistration({
    eventBus,
    startStreak: new StartStreak(new PrismaStreakRepository(input.prisma), idGenerator, clock),
    createBadgeCollection: new CreateBadgeCollection(
      new PrismaBadgeCollectionRepository(input.prisma),
      idGenerator,
      clock,
    ),
    createInbox: new CreateInbox(new PrismaInboxRepository(input.prisma), idGenerator, clock),
  });

  // ---------------------------------------------------------------------
  // open-finance, bet-detection and awareness
  //
  // Three contexts, one statement. The split is load-bearing: open-finance
  // owns the movement, bet-detection owns the verdict and the raw statement
  // line it reads, and awareness owns the rate. They meet only through the
  // ports wired here.
  // ---------------------------------------------------------------------
  const calendar = new Calendar(input.settings.timeZone);
  const reframing = new AmountReframing(FIXED_INCOME_ANNUAL_RATE_PERCENT);
  const consents = new PrismaConsentRepository(input.prisma);
  const connectedAccounts = new PrismaConnectedAccountRepository(input.prisma);
  const transactions = new PrismaTransactionRepository(input.prisma, () => clock.now());
  const classifications = new PrismaTransactionClassificationRepository(input.prisma);
  const bookmakers = new PrismaBookmakerRepository(input.prisma);

  const listTransactions = new ListTransactions({
    consents,
    accounts: connectedAccounts,
    ledger: new PrismaTransactionLedgerQuery(input.prisma),
    yields: new AwarenessYieldCalculator(reframing),
    calendar,
    clock,
  });

  const summariseSpendByMonth = new SummariseSpendByMonth({
    consents,
    monthlySpend: new PrismaMonthlySpendQuery(input.prisma, input.settings.timeZone),
    calendar,
    clock,
  });

  const listConnectedAccounts = new ListConnectedAccounts(consents, connectedAccounts, clock);

  const reclassifyTransaction = new ReclassifyTransaction({
    classifications,
    clock,
    events: eventBus,
  });

  const revertReclassification = new RevertReclassification({
    classifications,
    bookmakers,
    transactions: new OpenFinanceTransactionReader(new TransactionAmountLookup(transactions)),
    yields: new DetectionYieldCalculator(reframing),
    clock,
    events: eventBus,
  });

  const evaluateSupportOffer = new EvaluateSupportOffer(
    new OpenFinanceMonthlyBetSpendReader(
      new PrismaMonthlyBetSpendQuery(input.prisma, input.settings.timeZone),
    ),
    calendar,
    clock,
  );

  subscribeToClassificationChanges({
    eventBus,
    projectClassification: new ProjectClassification(
      transactions,
      new BetDetectionClassificationReader(new ClassificationLookup(classifications)),
    ),
  });

  subscribeToRevocation({
    eventBus,
    purgeFinancialData: new PurgeUserFinancialData(transactions, connectedAccounts),
    forgetClassifications: new ForgetUserClassifications(classifications),
  });

  const queries = {
    listTransactions: validateQuery(
      listTransactionsQuerySchema,
      openFinanceFailures.transactionsFilterInvalid,
    ),
    monthlySummary: validateQuery(
      monthlySummaryQuerySchema,
      openFinanceFailures.chartsFilterInvalid,
    ),
    transactionIdParams: validateParams(
      transactionIdParamsSchema,
      betDetectionFailures.validationFailed,
    ),
  };

  const overrideBody = validateBody(
    classificationOverrideBodySchema,
    betDetectionFailures.validationFailed,
  );

  const sessionGuard = requireSession(new SessionCallerResolver(resolveSession));

  const bodies = {
    registerUser: validateBody(registerUserBodySchema, identityFailures.validationFailed),
    signIn: validateBody(signInBodySchema, identityFailures.validationFailed),
    resetPassword: validateBody(resetPasswordBodySchema, identityFailures.validationFailed),
  };

  return {
    logger: input.logger,
    frontendOrigin: input.frontendOrigin,
    trustProxy: input.trustProxy,
    health: {
      isDatabaseReachable: async () => {
        await input.prisma.$queryRaw`SELECT 1`;

        return true;
      },
    },
    identity: {
      controller: new IdentityController(
        { registerUser, signIn, signOut, resolveSession, resetPassword },
        bodies,
      ),
      validateRegisterUserBody: bodies.registerUser.middleware,
      validateSignInBody: bodies.signIn.middleware,
      validateResetPasswordBody: bodies.resetPassword.middleware,
      registrationRateLimits: [
        windowedRateLimit({
          code: 'TOO_MANY_REQUESTS',
          message: IDENTITY_MESSAGES.tooManyRegistrationAttempts,
          limit: input.settings.registrationAttemptsPerHour,
          windowInMinutes: MINUTES_IN_AN_HOUR,
        }),
        windowedRateLimit({
          code: 'TOO_MANY_REQUESTS',
          message: IDENTITY_MESSAGES.tooManyRegistrationAttempts,
          limit: input.settings.registrationSuccessesPerHour,
          windowInMinutes: MINUTES_IN_AN_HOUR,
          countSuccessesOnly: true,
        }),
      ],
      // The per-IP net. The window that protects one account from guessing is
      // the domain's `SignInThrottle`, which this cannot see and must not
      // replace: it is keyed by address, so spraying across many addresses from
      // one host would slip past it.
      signInRateLimits: [
        windowedRateLimit({
          code: 'TOO_MANY_ATTEMPTS',
          message: IDENTITY_MESSAGES.tooManySignInAttempts,
          limit: input.settings.signInAttemptsPerQuarterHour,
          windowInMinutes: MINUTES_IN_A_QUARTER_HOUR,
        }),
      ],
      passwordResetRateLimits: [
        windowedRateLimit({
          code: 'TOO_MANY_ATTEMPTS',
          message: IDENTITY_MESSAGES.tooManySignInAttempts,
          limit: input.settings.passwordResetAttemptsPerHour,
          windowInMinutes: MINUTES_IN_AN_HOUR,
        }),
      ],
    },
    openFinance: {
      controller: new OpenFinanceController(
        { listTransactions, summariseSpendByMonth, listConnectedAccounts },
        { listTransactions: queries.listTransactions, monthlySummary: queries.monthlySummary },
      ),
      requireSession: sessionGuard,
      validateListTransactionsQuery: queries.listTransactions.middleware,
      validateMonthlySummaryQuery: queries.monthlySummary.middleware,
    },
    betDetection: {
      controller: new BetDetectionController(
        reclassifyTransaction,
        revertReclassification,
        overrideBody,
        queries.transactionIdParams,
      ),
      requireSession: sessionGuard,
      validateTransactionIdParams: queries.transactionIdParams.middleware,
      validateOverrideBody: overrideBody.middleware,
      overrideRateLimits: [
        windowedRateLimit({
          code: 'TOO_MANY_ATTEMPTS',
          message: BET_DETECTION_MESSAGES.tooManyAttempts,
          limit: input.settings.classificationOverridesPerHour,
          windowInMinutes: MINUTES_IN_AN_HOUR,
        }),
      ],
    },
    awareness: {
      controller: new AwarenessController(evaluateSupportOffer),
      requireSession: sessionGuard,
    },
  };
}

interface RegistrationSubscribers {
  readonly eventBus: InProcessEventBus;
  readonly startStreak: StartStreak;
  readonly createBadgeCollection: CreateBadgeCollection;
  readonly createInbox: CreateInbox;
}

/**
 * `UserRegistered` bootstraps an empty aggregate in each reacting context, so no
 * first-run screen has to tell "no aggregate" from "empty aggregate". The streak
 * starts at zero days, and nothing is pushed to the notification stream.
 *
 * Nothing subscribes to `UserSignedIn`, `UserSignedOut` or `PasswordChanged`:
 * they are recorded for audit, and **no notification is ever sent for a
 * sign-in** — a "novo acesso à sua conta" push would put an alarming message on
 * a lock screen for a routine event.
 */
function subscribeToRegistration(subscribers: RegistrationSubscribers): void {
  subscribers.eventBus.subscribe(UserRegistered.NAME, async (event) => {
    if (!(event instanceof UserRegistered)) {
      return;
    }

    const { userId } = event.payload;

    await subscribers.startStreak.execute({ userId });
    await subscribers.createBadgeCollection.execute({ userId });
    await subscribers.createInbox.execute({ userId });
  });
}

interface ClassificationSubscribers {
  readonly eventBus: InProcessEventBus;
  readonly projectClassification: ProjectClassification;
}

/**
 * `open-finance` keeps a copy of the verdict so the statement can be filtered
 * and totalled in one query. The copy is refreshed by **re-reading**
 * `bet-detection` rather than from the payload: the events carry ids only,
 * which is what stops a financial judgement being laundered through a bus.
 */
function subscribeToClassificationChanges(subscribers: ClassificationSubscribers): void {
  const project = async (userId: string, transactionId: string): Promise<void> => {
    await subscribers.projectClassification.execute({ userId, transactionId });
  };

  subscribers.eventBus.subscribe(BetTransactionDetected.NAME, async (event) => {
    if (!(event instanceof BetTransactionDetected)) {
      return;
    }

    await project(event.payload.userId, event.payload.transactionId);
  });

  subscribers.eventBus.subscribe(BetClassificationOverridden.NAME, async (event) => {
    if (!(event instanceof BetClassificationOverridden)) {
      return;
    }

    await project(event.payload.userId, event.payload.transactionId);
  });
}

interface RevocationSubscribers {
  readonly eventBus: InProcessEventBus;
  readonly purgeFinancialData: PurgeUserFinancialData;
  readonly forgetClassifications: ForgetUserClassifications;
}

/**
 * Revocation deletes the derived data, not just the token: the transactions,
 * the accounts and the classifications — which is where the only copy of the
 * raw statement line lived. LGPD art. 18, as a use case with tests rather than
 * a manual script.
 */
function subscribeToRevocation(subscribers: RevocationSubscribers): void {
  subscribers.eventBus.subscribe(ConsentRevoked.NAME, async (event) => {
    if (!(event instanceof ConsentRevoked)) {
      return;
    }

    await subscribers.purgeFinancialData.execute({ userId: event.payload.userId });
    await subscribers.forgetClassifications.execute({ userId: event.payload.userId });
  });
}
