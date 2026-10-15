import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
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
  DescribeEquivalences,
  EvaluateSupportOffer,
  FIXED_INCOME_ANNUAL_RATE_PERCENT,
} from '@modules/awareness/index.js';
import { OpenFinanceCategoryAverageReader } from '@modules/awareness/infrastructure/open-finance-category-average-reader.js';
import { OpenFinanceMonthlyBetSpendReader } from '@modules/awareness/infrastructure/open-finance-monthly-bet-spend-reader.js';
import { PrismaReferenceItemRepository } from '@modules/awareness/infrastructure/prisma-reference-item.repository.js';
import { AwarenessController } from '@modules/awareness/http/awareness.controller.js';
import {
  ClassificationLookup,
  ClassifyTransaction,
  ForgetUserClassifications,
  ReclassifyTransaction,
  RevertReclassification,
  SummariseBetting,
  BetClassificationOverridden,
  BetTransactionDetected,
} from '@modules/bet-detection/index.js';
import { AwarenessEquivalenceReader } from '@modules/bet-detection/infrastructure/awareness-equivalence-reader.js';
import { AwarenessYieldCalculator as DetectionYieldCalculator } from '@modules/bet-detection/infrastructure/awareness-yield-calculator.js';
import { OpenFinanceBettingLedger } from '@modules/bet-detection/infrastructure/open-finance-betting-ledger.js';
import { OpenFinanceTransactionReader } from '@modules/bet-detection/infrastructure/open-finance-transaction-reader.js';
import { PrismaBookmakerIdentityQuery } from '@modules/bet-detection/infrastructure/bookmaker-identity.query.js';
import { PrismaBookmakerRepository } from '@modules/bet-detection/infrastructure/prisma-bookmaker.repository.js';
import { PrismaTransactionClassificationRepository } from '@modules/bet-detection/infrastructure/prisma-transaction-classification.repository.js';
import { BetDetectionController } from '@modules/bet-detection/http/bet-detection.controller.js';
import {
  betSummaryQuerySchema,
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
  PrismaBettingWindowQuery,
  PrismaCategorySpendQuery,
  PrismaMonthlyBetSpendQuery,
  PurgeUserFinancialData,
  SummariseSpendByMonth,
  SyncStatusLookup,
  TransactionAmountLookup,
  TransactionsIngested,
} from '@modules/open-finance/index.js';
import { CompleteAuthorisation } from '@modules/open-finance/application/complete-authorisation.use-case.js';
import { ConsentAccessTokens } from '@modules/open-finance/application/consent-access-tokens.js';
import { GetCurrentConsent } from '@modules/open-finance/application/get-current-consent.use-case.js';
import { OPEN_FINANCE_MESSAGES } from '@modules/open-finance/application/open-finance.messages.js';
import { RequestConsent } from '@modules/open-finance/application/request-consent.use-case.js';
import { RevokeConsent as RevokeOpenFinanceConsent } from '@modules/open-finance/application/revoke-consent.use-case.js';
import { StatementSynchronisation } from '@modules/open-finance/application/statement-synchronisation.js';
import { SynchroniseConsent } from '@modules/open-finance/application/synchronise-consent.use-case.js';
import { AesGcmTokenCipher } from '@modules/open-finance/infrastructure/aes-gcm-token-cipher.js';
import { AwarenessYieldCalculator } from '@modules/open-finance/infrastructure/awareness-yield-calculator.js';
import { BetDetectionClassificationReader } from '@modules/open-finance/infrastructure/bet-detection-classification-reader.js';
import { BetDetectionTransactionClassifier } from '@modules/open-finance/infrastructure/bet-detection-transaction-classifier.js';
import { CryptoAuthorisationSecrets } from '@modules/open-finance/infrastructure/crypto-authorisation-secrets.js';
import { PrismaAuthorisationRequestRepository } from '@modules/open-finance/infrastructure/prisma-authorisation-request.repository.js';
import { PrismaConnectedAccountRepository } from '@modules/open-finance/infrastructure/prisma-connected-account.repository.js';
import { PrismaConsentRepository } from '@modules/open-finance/infrastructure/prisma-consent.repository.js';
import { PrismaConsentTokenVault } from '@modules/open-finance/infrastructure/prisma-consent-token-vault.js';
import { PrismaMonthlySpendQuery } from '@modules/open-finance/infrastructure/monthly-spend.query.js';
import { PrismaTransactionLedgerQuery } from '@modules/open-finance/infrastructure/transaction-ledger.query.js';
import { PrismaTransactionRepository } from '@modules/open-finance/infrastructure/prisma-transaction.repository.js';
import {
  SandboxBankDataHolder,
  type DataHolderConnection,
} from '@modules/open-finance/infrastructure/sandbox-bank-data-holder.js';
import { OpenFinanceController } from '@modules/open-finance/http/open-finance.controller.js';
import { DataHolderNoticeController } from '@modules/open-finance/http/data-holder-notice.controller.js';
import { requireDataHolder } from '@modules/open-finance/http/data-holder-authentication.js';
import { SynchroniseNotifiedConsent } from '@modules/open-finance/application/synchronise-notified-consent.use-case.js';
import {
  authorisationCallbackBodySchema,
  consentParamsSchema,
  dataHolderNoticeBodySchema,
  listTransactionsQuerySchema,
  monthlySummaryQuerySchema,
} from '@modules/open-finance/http/open-finance.schemas.js';
import { openFinanceFailures } from '@modules/open-finance/application/open-finance.failures.js';
import { AccessTokenIntrospection } from '@modules/sandbox-bank/application/access-token-introspection.js';
import { AuthorisationRequestCheck } from '@modules/sandbox-bank/application/authorisation-request-check.js';
import { CreateConsent } from '@modules/sandbox-bank/application/create-consent.use-case.js';
import { DecideAuthorisation } from '@modules/sandbox-bank/application/decide-authorisation.use-case.js';
import { DemoAccountOpening } from '@modules/sandbox-bank/application/demo-account-opening.js';
import { DescribeAuthorisationRequest } from '@modules/sandbox-bank/application/describe-authorisation-request.use-case.js';
import { IssueToken } from '@modules/sandbox-bank/application/issue-token.use-case.js';
import { ListBookableAccounts } from '@modules/sandbox-bank/application/list-bookable-accounts.use-case.js';
import { ListCustomerAccounts } from '@modules/sandbox-bank/application/list-customer-accounts.use-case.js';
import { ListSharedAccounts } from '@modules/sandbox-bank/application/list-shared-accounts.use-case.js';
import { ListSharedTransactions } from '@modules/sandbox-bank/application/list-shared-transactions.use-case.js';
import type { RegisteredClient } from '@modules/sandbox-bank/application/ports/client-registry.port.js';
import { RecordLedgerEntry } from '@modules/sandbox-bank/application/record-ledger-entry.use-case.js';
import { RevokeConsent as RevokeSandboxConsent } from '@modules/sandbox-bank/application/revoke-consent.use-case.js';
import { sandboxBankFailures } from '@modules/sandbox-bank/application/sandbox-bank.failures.js';
import { SANDBOX_BANK_MESSAGES } from '@modules/sandbox-bank/application/sandbox-bank.messages.js';
import { TokenIssuance } from '@modules/sandbox-bank/application/token-issuance.js';
import { ConfiguredClientRegistry } from '@modules/sandbox-bank/infrastructure/configured-client-registry.js';
import { CryptoBankSecrets } from '@modules/sandbox-bank/infrastructure/crypto-bank-secrets.js';
import { HttpDataRecipientNotifier } from '@modules/sandbox-bank/infrastructure/http-data-recipient-notifier.js';
import { PrismaAuthorisationCodeRepository } from '@modules/sandbox-bank/infrastructure/prisma-authorisation-code.repository.js';
import { PrismaBankAccountRepository } from '@modules/sandbox-bank/infrastructure/prisma-bank-account.repository.js';
import { PrismaIssuedTokenRepository } from '@modules/sandbox-bank/infrastructure/prisma-issued-token.repository.js';
import { PrismaLedgerEntryRepository } from '@modules/sandbox-bank/infrastructure/prisma-ledger-entry.repository.js';
import { PrismaSandboxConsentRepository } from '@modules/sandbox-bank/infrastructure/prisma-sandbox-consent.repository.js';
import { bankTokenGuard } from '@modules/sandbox-bank/http/bank-token-guard.js';
import { openFinanceErrorEnvelope } from '@modules/sandbox-bank/http/protocol-error-envelopes.js';
import { SandboxBankAppController } from '@modules/sandbox-bank/http/sandbox-bank-app.controller.js';
import { SandboxBankProtocolController } from '@modules/sandbox-bank/http/sandbox-bank-protocol.controller.js';
import {
  authorisationDecisionBodySchema,
  authorisationQuerySchema,
  consentParamsSchema as sandboxConsentParamsSchema,
  createConsentBodySchema,
  CONSENT_URN_PREFIX,
  customerAccountParamsSchema,
  customerLedgerParamsSchema,
  customerParamsSchema,
  ledgerEntryBodySchema,
  sharedAccountParamsSchema,
  sharedTransactionsQuerySchema,
  tokenRequestSchema,
} from '@modules/sandbox-bank/http/sandbox-bank.schemas.js';
import type { SandboxBankRouteDependencies } from '@modules/sandbox-bank/http/sandbox-bank.routes.js';
import { SessionCallerResolver } from '@modules/identity/http/session-caller-resolver.js';
import { AnnounceIngestedTransactions, CreateInbox } from '@modules/notifications/index.js';
import { NotificationDelivery } from '@modules/notifications/application/notification-delivery.js';
import { NOTIFICATIONS_MESSAGES } from '@modules/notifications/application/notifications.messages.js';
import { notificationsFailures } from '@modules/notifications/application/notifications.failures.js';
import { ReplayNotifications } from '@modules/notifications/application/replay-notifications.use-case.js';
import { SendDemoNotification } from '@modules/notifications/application/send-demo-notification.use-case.js';
import { AwarenessYieldCalculator as NotificationsYieldCalculator } from '@modules/notifications/infrastructure/awareness-yield-calculator.js';
import { InProcessNotificationStream } from '@modules/notifications/infrastructure/in-process-notification-stream.js';
import { PrismaInboxRepository } from '@modules/notifications/infrastructure/prisma-inbox.repository.js';
import { PrismaNotificationRepository } from '@modules/notifications/infrastructure/prisma-notification.repository.js';
import { NotificationsController } from '@modules/notifications/http/notifications.controller.js';
import {
  demoNotificationBodySchema,
  recipientParamsSchema,
} from '@modules/notifications/http/notifications.schemas.js';
import type { NotificationsRouteDependencies } from '@modules/notifications/http/notifications.routes.js';
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
import type { AppDependencies } from './create-app.js';

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
  readonly consentCommandsPerHour: number;
  readonly sandboxLedgerEntriesPerHour: number;
  /** The demonstration console's sends, so a script cannot flood somebody's screen. */
  readonly demoNotificationsPerHour: number;
}

/** This platform as a DataRecipient: its key for tokens at rest, and its enrolment. */
export interface OpenFinanceSettings {
  readonly tokenEncryptionKey: string;
  readonly dataHolder: DataHolderConnection;
}

/** The simulated institution: the one client it has enrolled, and whether it takes new entries. */
export interface SandboxBankSettings {
  readonly client: RegisteredClient;
  readonly clientSecret: string;
  readonly ledgerWritesEnabled: boolean;
}

export interface ContainerInput {
  readonly prisma: PrismaClient;
  readonly logger: Logger;
  readonly frontendOrigin: string;
  /** Express `trust proxy`: which hop may report the client address. */
  readonly trustProxy: string | false;
  readonly settings: ContainerSettings;
  readonly openFinance: OpenFinanceSettings;
  readonly sandboxBank: SandboxBankSettings;
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

  // notifications: stored first, then pushed to whichever streams the
  // recipient has open. The stream and the delivery share one fan-out.
  const inboxes = new PrismaInboxRepository(input.prisma);
  const notificationRecords = new PrismaNotificationRepository(input.prisma);
  const notificationStream = new InProcessNotificationStream();
  const notificationDelivery = new NotificationDelivery({
    inboxes,
    notifications: notificationRecords,
    channel: notificationStream,
    idGenerator,
    clock,
  });

  subscribeToRegistration({
    eventBus,
    startStreak: new StartStreak(new PrismaStreakRepository(input.prisma), idGenerator, clock),
    createBadgeCollection: new CreateBadgeCollection(
      new PrismaBadgeCollectionRepository(input.prisma),
      idGenerator,
      clock,
    ),
    createInbox: new CreateInbox(inboxes, idGenerator, clock),
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

  // The betting screen. `bet-detection` owns it and composes the other two
  // through their public APIs: the movements and the income are
  // `open-finance`'s, the rate and the equivalence catalogue are `awareness`'s,
  // and the grouping, the counts and the tallies are its own.
  const describeEquivalences = new DescribeEquivalences({
    items: new PrismaReferenceItemRepository(input.prisma),
    averages: new OpenFinanceCategoryAverageReader(
      new PrismaCategorySpendQuery(input.prisma, calendar, input.settings.timeZone),
    ),
    calendar,
    clock,
  });

  const summariseBetting = new SummariseBetting({
    ledger: new OpenFinanceBettingLedger(
      new PrismaBettingWindowQuery(input.prisma),
      new SyncStatusLookup(consents, clock),
    ),
    identities: new PrismaBookmakerIdentityQuery(input.prisma),
    equivalences: new AwarenessEquivalenceReader(describeEquivalences),
    yields: new DetectionYieldCalculator(reframing),
    calendar,
    clock,
  });

  subscribeToClassificationChanges({
    eventBus,
    projectClassification: new ProjectClassification(
      transactions,
      new BetDetectionClassificationReader(new ClassificationLookup(classifications)),
    ),
  });

  // The consent flow. `open-finance` reaches the DataHolder over HTTP through
  // `SandboxBankDataHolder` — the anti-corruption layer — never by importing
  // `sandbox-bank`, even though the sandbox is wired a few lines below.
  const tokenCipher = new AesGcmTokenCipher(input.openFinance.tokenEncryptionKey);
  const authorisationRequests = new PrismaAuthorisationRequestRepository(input.prisma, tokenCipher);
  const tokenVault = new PrismaConsentTokenVault(input.prisma, tokenCipher);
  const dataHolder = new SandboxBankDataHolder(input.openFinance.dataHolder, clock);
  const authorisationSecrets = new CryptoAuthorisationSecrets();
  const statementSynchronisation = new StatementSynchronisation({
    dataHolder,
    consents,
    accounts: connectedAccounts,
    transactions,
    classifier: new BetDetectionTransactionClassifier(
      new ClassifyTransaction({ classifications, bookmakers, clock, events: eventBus }),
    ),
    idGenerator,
    events: eventBus,
  });

  const consentUseCases = {
    requestConsent: new RequestConsent({
      consents,
      authorisationRequests,
      dataHolder,
      secrets: authorisationSecrets,
      idGenerator,
      clock,
    }),
    completeAuthorisation: new CompleteAuthorisation({
      consents,
      authorisationRequests,
      dataHolder,
      secrets: authorisationSecrets,
      vault: tokenVault,
      synchronisation: statementSynchronisation,
      clock,
      events: eventBus,
    }),
    synchroniseConsent: new SynchroniseConsent(
      consents,
      new ConsentAccessTokens(tokenVault, dataHolder),
      statementSynchronisation,
      clock,
    ),
    revokeConsent: new RevokeOpenFinanceConsent(consents, dataHolder, clock, eventBus),
    getCurrentConsent: new GetCurrentConsent(consents, clock),
  };

  subscribeToRevocation({
    eventBus,
    purgeFinancialData: new PurgeUserFinancialData({
      transactions,
      accounts: connectedAccounts,
      tokens: tokenVault,
      authorisationRequests,
    }),
    forgetClassifications: new ForgetUserClassifications(classifications),
  });

  subscribeToIngestion({
    eventBus,
    announceIngestedTransactions: new AnnounceIngestedTransactions(notificationDelivery),
  });

  const synchroniseNotifiedConsent = new SynchroniseNotifiedConsent(
    consents,
    new ConsentAccessTokens(tokenVault, dataHolder),
    statementSynchronisation,
    clock,
  );
  const dataHolderNotice = validateBody(
    dataHolderNoticeBodySchema,
    openFinanceFailures.dataHolderNoticeInvalid,
  );

  const queries = {
    listTransactions: validateQuery(
      listTransactionsQuerySchema,
      openFinanceFailures.transactionsFilterInvalid,
    ),
    monthlySummary: validateQuery(
      monthlySummaryQuerySchema,
      openFinanceFailures.chartsFilterInvalid,
    ),
    consentParams: validateParams(consentParamsSchema, openFinanceFailures.consentRequestInvalid),
    authorisationCallback: validateBody(
      authorisationCallbackBodySchema,
      openFinanceFailures.consentRequestInvalid,
    ),
    transactionIdParams: validateParams(
      transactionIdParamsSchema,
      betDetectionFailures.validationFailed,
    ),
    betSummary: validateQuery(betSummaryQuerySchema, betDetectionFailures.betsPeriodInvalid),
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
        { listTransactions, summariseSpendByMonth, listConnectedAccounts, ...consentUseCases },
        {
          listTransactions: queries.listTransactions,
          monthlySummary: queries.monthlySummary,
          consentParams: queries.consentParams,
          authorisationCallback: queries.authorisationCallback,
        },
      ),
      noticeController: new DataHolderNoticeController(synchroniseNotifiedConsent, dataHolderNotice),
      requireDataHolder: requireDataHolder({
        clientId: input.openFinance.dataHolder.clientId,
        clientSecret: input.openFinance.dataHolder.clientSecret,
      }),
      validateDataHolderNotice: dataHolderNotice.middleware,
      requireSession: sessionGuard,
      validateListTransactionsQuery: queries.listTransactions.middleware,
      validateMonthlySummaryQuery: queries.monthlySummary.middleware,
      validateConsentParams: queries.consentParams.middleware,
      validateAuthorisationCallback: queries.authorisationCallback.middleware,
      consentCommandRateLimits: [
        windowedRateLimit({
          code: 'TOO_MANY_ATTEMPTS',
          message: OPEN_FINANCE_MESSAGES.tooManyConsentCommands,
          limit: input.settings.consentCommandsPerHour,
          windowInMinutes: MINUTES_IN_AN_HOUR,
        }),
      ],
    },
    sandboxBank: buildSandboxBank({ input, clock, idGenerator, sessionGuard }),
    betDetection: {
      controller: new BetDetectionController(
        reclassifyTransaction,
        revertReclassification,
        summariseBetting,
        overrideBody,
        queries.transactionIdParams,
        queries.betSummary,
      ),
      requireSession: sessionGuard,
      validateTransactionIdParams: queries.transactionIdParams.middleware,
      validateOverrideBody: overrideBody.middleware,
      validateBetSummaryQuery: queries.betSummary.middleware,
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
    notifications: buildNotifications({
      input,
      delivery: notificationDelivery,
      stream: notificationStream,
      notifications: notificationRecords,
      yields: new NotificationsYieldCalculator(reframing),
      sessionGuard,
    }),
  };
}

interface NotificationsWiring {
  readonly input: ContainerInput;
  readonly delivery: NotificationDelivery;
  readonly stream: InProcessNotificationStream;
  readonly notifications: PrismaNotificationRepository;
  readonly yields: NotificationsYieldCalculator;
  readonly sessionGuard: RequestHandler;
}

/**
 * The stream is always there. The console that sends to a person by id rides
 * on the same switch as the sandbox's ledger writes: a demonstration tool,
 * never mounted in production.
 */
function buildNotifications(wiring: NotificationsWiring): NotificationsRouteDependencies {
  const inputs = {
    recipientParams: validateParams(recipientParamsSchema, notificationsFailures.validationFailed),
    demoNotificationBody: validateBody(
      demoNotificationBodySchema,
      notificationsFailures.validationFailed,
    ),
  };

  return {
    controller: new NotificationsController(
      {
        replayNotifications: new ReplayNotifications(wiring.notifications),
        sendDemoNotification: new SendDemoNotification(wiring.delivery, wiring.yields),
      },
      inputs,
      wiring.stream,
    ),
    requireSession: wiring.sessionGuard,
    validateRecipientParams: inputs.recipientParams.middleware,
    validateDemoNotificationBody: inputs.demoNotificationBody.middleware,
    demoRateLimits: wiring.input.sandboxBank.ledgerWritesEnabled
      ? [
          windowedRateLimit({
            code: 'TOO_MANY_ATTEMPTS',
            message: NOTIFICATIONS_MESSAGES.tooManyDemoNotifications,
            limit: wiring.input.settings.demoNotificationsPerHour,
            windowInMinutes: MINUTES_IN_AN_HOUR,
          }),
        ]
      : null,
  };
}

interface SandboxBankWiring {
  readonly input: ContainerInput;
  readonly clock: Clock;
  readonly idGenerator: UuidV7IdGenerator;
  readonly sessionGuard: RequestHandler;
}

/**
 * The simulated institution. It shares the process and the database with the
 * platform and nothing else: its own tables, its own clients and tokens, and
 * an HTTP surface that `open-finance` calls like any other DataHolder's.
 */
function buildSandboxBank({
  input,
  clock,
  idGenerator,
  sessionGuard,
}: SandboxBankWiring): SandboxBankRouteDependencies {
  const secrets = new CryptoBankSecrets();
  const clients = new ConfiguredClientRegistry(
    input.sandboxBank.client,
    input.sandboxBank.clientSecret,
  );
  const accounts = new PrismaBankAccountRepository(input.prisma);
  const ledger = new PrismaLedgerEntryRepository(input.prisma);
  const consents = new PrismaSandboxConsentRepository(input.prisma);
  const codes = new PrismaAuthorisationCodeRepository(input.prisma);
  const tokens = new PrismaIssuedTokenRepository(input.prisma);
  const demoAccounts = new DemoAccountOpening(accounts, secrets, idGenerator);
  const requests = new AuthorisationRequestCheck(clients, consents);
  const introspection = new AccessTokenIntrospection(tokens, secrets, clock);

  const inputs = {
    tokenRequest: validateBody(tokenRequestSchema, sandboxBankFailures.invalidTokenRequest),
    createConsentBody: validateBody(createConsentBodySchema, sandboxBankFailures.validationFailed),
    consentParams: validateParams(sandboxConsentParamsSchema, sandboxBankFailures.validationFailed),
    sharedAccountParams: validateParams(
      sharedAccountParamsSchema,
      sandboxBankFailures.validationFailed,
    ),
    sharedTransactionsQuery: validateQuery(
      sharedTransactionsQuerySchema,
      sandboxBankFailures.validationFailed,
    ),
    consentsToken: bankTokenGuard(introspection, 'CONSENTS'),
    accountsToken: bankTokenGuard(introspection, 'ACCOUNTS'),
    authorisationQuery: validateQuery(authorisationQuerySchema, sandboxBankFailures.validationFailed),
    authorisationDecision: validateBody(
      authorisationDecisionBodySchema,
      sandboxBankFailures.validationFailed,
    ),
    customerAccountParams: validateParams(
      customerAccountParamsSchema,
      sandboxBankFailures.validationFailed,
    ),
    ledgerEntryBody: validateBody(ledgerEntryBodySchema, sandboxBankFailures.validationFailed),
    customerParams: validateParams(customerParamsSchema, sandboxBankFailures.validationFailed),
    customerLedgerParams: validateParams(
      customerLedgerParamsSchema,
      sandboxBankFailures.validationFailed,
    ),
  };

  const protocol = new SandboxBankProtocolController(
    {
      issueToken: new IssueToken({
        clients,
        consents,
        codes,
        tokens,
        issuance: new TokenIssuance(tokens, secrets, idGenerator),
        secrets,
        clock,
      }),
      createConsent: new CreateConsent(consents, idGenerator, clock),
      revokeConsent: new RevokeSandboxConsent(consents, tokens, clock),
      listSharedAccounts: new ListSharedAccounts(consents, accounts, clock),
      listSharedTransactions: new ListSharedTransactions(consents, ledger, clock),
    },
    inputs,
    clock,
  );

  const app = new SandboxBankAppController(
    {
      describeAuthorisationRequest: new DescribeAuthorisationRequest(requests, demoAccounts, clock),
      decideAuthorisation: new DecideAuthorisation({
        requests,
        consents,
        accounts,
        codes,
        secrets,
        idGenerator,
        clock,
      }),
      listCustomerAccounts: new ListCustomerAccounts(demoAccounts, clock),
      recordLedgerEntry: new RecordLedgerEntry({
        accounts,
        ledger,
        consents,
        clients,
        notifier: new HttpDataRecipientNotifier(
          { consentUrnPrefix: CONSENT_URN_PREFIX, clientSecret: input.sandboxBank.clientSecret },
          input.logger,
        ),
        idGenerator,
        clock,
      }),
      listBookableAccounts: new ListBookableAccounts(accounts),
    },
    inputs,
  );

  return {
    protocol,
    app,
    requireSession: sessionGuard,
    validateTokenRequest: inputs.tokenRequest.middleware,
    validateCreateConsentBody: inputs.createConsentBody.middleware,
    validateConsentParams: inputs.consentParams.middleware,
    validateSharedAccountParams: inputs.sharedAccountParams.middleware,
    validateSharedTransactionsQuery: inputs.sharedTransactionsQuery.middleware,
    requireConsentsToken: inputs.consentsToken.middleware,
    requireAccountsToken: inputs.accountsToken.middleware,
    openFinanceErrors: openFinanceErrorEnvelope(clock),
    validateAuthorisationQuery: inputs.authorisationQuery.middleware,
    validateAuthorisationDecision: inputs.authorisationDecision.middleware,
    validateCustomerAccountParams: inputs.customerAccountParams.middleware,
    validateLedgerEntryBody: inputs.ledgerEntryBody.middleware,
    validateCustomerParams: inputs.customerParams.middleware,
    validateCustomerLedgerParams: inputs.customerLedgerParams.middleware,
    ledgerWriteRateLimits: input.sandboxBank.ledgerWritesEnabled
      ? [
          windowedRateLimit({
            code: 'TOO_MANY_ATTEMPTS',
            message: SANDBOX_BANK_MESSAGES.tooManyLedgerEntries,
            limit: input.settings.sandboxLedgerEntriesPerHour,
            windowInMinutes: MINUTES_IN_AN_HOUR,
          }),
        ]
      : null,
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

interface IngestionSubscribers {
  readonly eventBus: InProcessEventBus;
  readonly announceIngestedTransactions: AnnounceIngestedTransactions;
}

/**
 * New movements reached the statement — after the button, after the first
 * synchronisation of a consent, or after the institution's notice — so the
 * person's open screens are told to read it again. A count travels, never a
 * movement: the statement says what they were, behind the session.
 */
function subscribeToIngestion(subscribers: IngestionSubscribers): void {
  subscribers.eventBus.subscribe(TransactionsIngested.NAME, async (event) => {
    if (!(event instanceof TransactionsIngested)) {
      return;
    }

    await subscribers.announceIngestedTransactions.execute({
      userId: event.payload.userId,
      ingestedCount: event.payload.transactionIds.length,
    });
  });
}
