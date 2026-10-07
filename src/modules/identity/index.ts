/**
 * The public API of `identity`. Other contexts import this file and nothing else
 * from here — `UserRegistered` is what `gamification` and `notifications` react
 * to, and the event carries no name and no e-mail.
 */
export { UserRegistered } from './domain/events/user-registered.js';
export type { UserRegisteredPayload } from './domain/events/user-registered.js';
export { UserSignedIn } from './domain/events/user-signed-in.js';
export type { UserSignedInPayload } from './domain/events/user-signed-in.js';
export { UserSignedOut } from './domain/events/user-signed-out.js';
export type { UserSignedOutPayload } from './domain/events/user-signed-out.js';
export { PasswordChanged } from './domain/events/password-changed.js';
export type { PasswordChangedPayload } from './domain/events/password-changed.js';
