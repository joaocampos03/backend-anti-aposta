/**
 * The policy ported verbatim from the frontend's `app/(auth)/_password-strength.ts`,
 * which is where the strength meter runs while the person types. Two
 * implementations of the same pure function is the accepted cost: the meter must
 * not make a round trip per keystroke, and the shared test vectors are what keep
 * the two honest.
 *
 * Only PASSWORD_MINIMUM_LENGTH is a gate. Everything else is advice: refusing a
 * password for being "weak" would be the server scolding somebody who did nothing
 * wrong, and strength is never a reason to answer 422.
 */
export const PASSWORD_MINIMUM_LENGTH = 8;
export const PASSWORD_MAXIMUM_LENGTH = 128;
const PASSPHRASE_LENGTH = 16;
const COMFORTABLE_LENGTH = 12;
const VARIETY_REQUIRED_FOR_STRONG = 3;
const RUN_LENGTH = 4;

const PREDICTABLE_FRAGMENTS = [
  'senha',
  'password',
  'antiaposta',
  'aposta',
  '123456',
  'qwerty',
  'asdfgh',
] as const;

export type PasswordStrength = 'EMPTY' | 'WEAK' | 'FAIR' | 'STRONG';

export const PASSWORD_STRENGTH_LABELS: Readonly<Record<PasswordStrength, string>> = {
  EMPTY: '',
  WEAK: 'Senha fraca',
  FAIR: 'Senha razoável',
  STRONG: 'Senha forte',
};

const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/] as const;

function countCharacterClasses(password: string): number {
  return CHARACTER_CLASSES.filter((characterClass) => characterClass.test(password)).length;
}

function hasPredictableFragment(password: string): boolean {
  const lowercased = password.toLowerCase();

  return PREDICTABLE_FRAGMENTS.some((fragment) => lowercased.includes(fragment));
}

function hasRepeatedRun(password: string): boolean {
  let run = 1;

  for (let index = 1; index < password.length; index += 1) {
    run = password[index] === password[index - 1] ? run + 1 : 1;

    if (run >= RUN_LENGTH) {
      return true;
    }
  }

  return false;
}

/** Length outranks character variety: a passphrase beats `P4ssw0rd!`. */
export function assessPassword(password: string): PasswordStrength {
  if (password.length === 0) {
    return 'EMPTY';
  }

  if (
    password.length < PASSWORD_MINIMUM_LENGTH ||
    hasPredictableFragment(password) ||
    hasRepeatedRun(password)
  ) {
    return 'WEAK';
  }

  if (password.length >= PASSPHRASE_LENGTH) {
    return 'STRONG';
  }

  if (
    password.length >= COMFORTABLE_LENGTH &&
    countCharacterClasses(password) >= VARIETY_REQUIRED_FOR_STRONG
  ) {
    return 'STRONG';
  }

  return 'FAIR';
}
