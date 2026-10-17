import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { createApp } from '@src/create-app.js';
import {
  buildContainer,
  type ContainerSettings,
  type OpenFinanceSettings,
  type SandboxBankSettings,
} from '@src/container.js';
import { logger } from '@shared/infrastructure/logger.js';
import { prisma } from '@shared/infrastructure/prisma.js';
import { INTEGRATION_ENVIRONMENT } from './environment.js';

const DEFAULT_SETTINGS: ContainerSettings = {
  consentPolicyVersion: '2026-10-01',
  timeZone: 'America/Sao_Paulo',
  sessionLifetimeInDays: 14,
  sessionRenewWithinDays: 7,
  registrationAttemptsPerHour: 10_000,
  registrationSuccessesPerHour: 10_000,
  signInAttemptsPerQuarterHour: 10_000,
  passwordResetAttemptsPerHour: 10_000,
  classificationOverridesPerHour: 10_000,
  consentCommandsPerHour: 10_000,
  goalCommandsPerHour: 10_000,
  sandboxLedgerEntriesPerHour: 10_000,
  demoNotificationsPerHour: 10_000,
};

/** Nothing listens here either: `startTestServer` points the bank's notices at itself. */
const UNREACHABLE_NOTICE_URI = 'http://127.0.0.1:9/api/v1/data-holder-notices';

export const TEST_CLIENT = {
  clientId: 'anti-aposta',
  displayName: 'anti-aposta',
  redirectUri: 'http://localhost:3000/api/open-finance/callback',
  noticeUri: UNREACHABLE_NOTICE_URI,
} as const;

const CLIENT_SECRET = INTEGRATION_ENVIRONMENT['OPEN_FINANCE_CLIENT_SECRET'] ?? '';

/**
 * Nothing listens here: a test that only drives `/api/v1` never reaches the
 * DataHolder, and one that does uses `startTestServer`, which points this at
 * itself.
 */
const UNREACHABLE_DATA_HOLDER = 'http://127.0.0.1:9/sandbox/open-finance/v2';

export const TEST_OPEN_FINANCE: OpenFinanceSettings = {
  tokenEncryptionKey: INTEGRATION_ENVIRONMENT['OPEN_FINANCE_TOKEN_KEY'] ?? '',
  dataHolder: {
    baseUrl: UNREACHABLE_DATA_HOLDER,
    authorisationScreenUrl: 'http://localhost:3000/sandbox/authorize',
    clientId: TEST_CLIENT.clientId,
    clientSecret: CLIENT_SECRET,
    redirectUri: TEST_CLIENT.redirectUri,
  },
};

const TEST_SANDBOX_BANK: SandboxBankSettings = {
  client: TEST_CLIENT,
  clientSecret: CLIENT_SECRET,
  ledgerWritesEnabled: true,
};

export interface TestAppOptions {
  readonly trustProxy?: string | false;
  readonly dataHolderBaseUrl?: string;
  readonly ledgerWritesEnabled?: boolean;
  /** Where the sandbox bank posts its "resources changed" notices. */
  readonly noticeUri?: string;
}

/**
 * The real app: real middleware, real error funnel, real Postgres. A test that
 * stubs the middleware proves nothing about the endpoint.
 */
export function createTestApp(
  settings: Partial<ContainerSettings> = {},
  options: TestAppOptions = {},
): Express {
  return createApp(
    buildContainer({
      prisma,
      logger,
      frontendOrigin: 'http://localhost:3000',
      // Supertest connects over loopback, exactly as the Next.js server does locally.
      trustProxy: options.trustProxy ?? 'loopback',
      settings: { ...DEFAULT_SETTINGS, ...settings },
      openFinance: {
        ...TEST_OPEN_FINANCE,
        dataHolder: {
          ...TEST_OPEN_FINANCE.dataHolder,
          baseUrl: options.dataHolderBaseUrl ?? UNREACHABLE_DATA_HOLDER,
        },
      },
      sandboxBank: {
        ...TEST_SANDBOX_BANK,
        client: { ...TEST_CLIENT, noticeUri: options.noticeUri ?? TEST_CLIENT.noticeUri },
        ledgerWritesEnabled: options.ledgerWritesEnabled ?? TEST_SANDBOX_BANK.ledgerWritesEnabled,
      },
    }),
  );
}

export interface RunningTestServer {
  readonly server: Server;
  readonly baseUrl: string;
  close(): Promise<void>;
}

/**
 * The app listening on a real port, with `open-finance` pointed at its own
 * sandbox over HTTP — the same round trip production makes, through the
 * network stack rather than a function call.
 */
export interface TestServerOptions {
  /** False points the bank's notices at nothing, as when the platform is down. */
  readonly noticeReachable?: boolean;
}

export async function startTestServer(
  options: TestServerOptions = {},
): Promise<RunningTestServer> {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const app = createTestApp(
    {},
    {
      dataHolderBaseUrl: `${baseUrl}/sandbox/open-finance/v2`,
      noticeUri:
        options.noticeReachable === false
          ? TEST_CLIENT.noticeUri
          : `${baseUrl}/api/v1/data-holder-notices`,
    },
  );
  server.on('request', app);

  return {
    server,
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((cause) => {
          if (cause === undefined) {
            resolve();

            return;
          }

          reject(cause);
        });
      });
    },
  };
}

export const VALID_REGISTRATION = {
  name: 'Ana',
  email: 'ana@exemplo.com',
  password: 'quatro palavras comuns',
  passwordConfirmation: 'quatro palavras comuns',
  acceptedRegistrationConsent: true,
} as const;
