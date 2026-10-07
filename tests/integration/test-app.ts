import type { Express } from 'express';
import { createApp } from '@src/app.js';
import { buildContainer, type ContainerSettings } from '@src/container.js';
import { logger } from '@shared/infrastructure/logger.js';
import { prisma } from '@shared/infrastructure/prisma.js';

const DEFAULT_SETTINGS: ContainerSettings = {
  consentPolicyVersion: '2026-10-01',
  sessionLifetimeInDays: 14,
  sessionRenewWithinDays: 7,
  registrationAttemptsPerHour: 10_000,
  registrationSuccessesPerHour: 10_000,
  signInAttemptsPerQuarterHour: 10_000,
  passwordResetAttemptsPerHour: 10_000,
};

/**
 * The real app: real middleware, real error funnel, real Postgres. A test that
 * stubs the middleware proves nothing about the endpoint.
 */
export function createTestApp(settings: Partial<ContainerSettings> = {}): Express {
  return createApp(
    buildContainer({
      prisma,
      logger,
      frontendOrigin: 'http://localhost:3000',
      settings: { ...DEFAULT_SETTINGS, ...settings },
    }),
  );
}

export const VALID_REGISTRATION = {
  name: 'Ana',
  email: 'ana@exemplo.com',
  password: 'quatro palavras comuns',
  passwordConfirmation: 'quatro palavras comuns',
  acceptedRegistrationConsent: true,
} as const;
