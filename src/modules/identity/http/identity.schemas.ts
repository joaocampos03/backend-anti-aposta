import { z } from 'zod';
import { IDENTITY_FIELD_MESSAGES, IDENTITY_MESSAGES } from '../application/identity.messages.js';

/**
 * Shape only. The rules — a name of 2 to 80 characters, a valid address, a
 * password of at least 8 — belong to the domain, which is what gives a short
 * password its own `PASSWORD_TOO_SHORT` code instead of a generic validation
 * failure.
 *
 * The object is strict on purpose: `id`, `registeredAt`, `session` and
 * `registrationConsent.acceptedAt` are computed by the server, and a client that
 * could set `acceptedAt` could forge the consent record the LGPD story rests on.
 * A body carrying one of them is refused, not silently ignored.
 */
export const registerUserBodySchema = z.strictObject(
  {
    name: z.string({ error: IDENTITY_FIELD_MESSAGES.name }),
    email: z.string({ error: IDENTITY_FIELD_MESSAGES.email }),
    password: z.string({ error: IDENTITY_FIELD_MESSAGES.password }),
    passwordConfirmation: z.string({ error: IDENTITY_MESSAGES.passwordConfirmationMismatch }),
    acceptedRegistrationConsent: z
      .boolean({ error: IDENTITY_MESSAGES.consentRequired })
      .optional(),
  },
  { error: IDENTITY_FIELD_MESSAGES.unexpected },
);

export type RegisterUserBody = z.infer<typeof registerUserBodySchema>;

/**
 * Shape only, and **no minimum length on the password**. The form applies
 * `minLength={8}` because it shares one input component with the register
 * screen, but a length rule on an *existing* credential locks out whoever set a
 * shorter one before the policy existed. Validate that it is present, not that
 * it is good.
 *
 * Strict, because `session`, `user` and `openFinance` are computed by the server.
 */
export const signInBodySchema = z.strictObject(
  {
    email: z.string({ error: IDENTITY_FIELD_MESSAGES.email }),
    password: z.string({ error: IDENTITY_FIELD_MESSAGES.passwordMissing }),
  },
  { error: IDENTITY_FIELD_MESSAGES.unexpected },
);

export type SignInBody = z.infer<typeof signInBodySchema>;

/** The token travels in the body: this endpoint has no session to authenticate. */
export const resetPasswordBodySchema = z.strictObject(
  {
    token: z.string({ error: IDENTITY_MESSAGES.passwordResetTokenInvalid }),
    password: z.string({ error: IDENTITY_FIELD_MESSAGES.password }),
    passwordConfirmation: z.string({ error: IDENTITY_MESSAGES.passwordConfirmationMismatch }),
  },
  { error: IDENTITY_FIELD_MESSAGES.unexpected },
);

export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
