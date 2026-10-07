import { describe, expect, it } from 'vitest';
import { assessPassword, PASSWORD_STRENGTH_LABELS } from './password-policy.js';

/**
 * These are the vectors shared with the frontend's `_password-strength.ts`. The
 * meter runs in the browser while the person types and the policy also lives
 * here; the vectors are what keep the two from drifting.
 */
describe('assessPassword', () => {
  it('reports an empty password as empty rather than weak', () => {
    expect(assessPassword('')).toBe('EMPTY');
  });

  it('scores Password1 as weak, because it contains a predictable fragment', () => {
    expect(assessPassword('Password1')).toBe('WEAK');
  });

  it('scores a password shorter than eight characters as weak', () => {
    expect(assessPassword('abc123')).toBe('WEAK');
  });

  it('scores a password repeating one character four times as weak', () => {
    expect(assessPassword('maaaarcelo')).toBe('WEAK');
  });

  it('scores Portuguese betting fragments as weak', () => {
    expect(assessPassword('minhasenha2026')).toBe('WEAK');
    expect(assessPassword('apostando123')).toBe('WEAK');
  });

  it('scores a sixteen-character passphrase as strong on length alone', () => {
    expect(assessPassword('quatro palavras comuns')).toBe('STRONG');
  });

  it('scores a twelve-character password with three character classes as strong', () => {
    expect(assessPassword('Marcelo2026!')).toBe('STRONG');
  });

  it('scores an eight-character password with no hint of predictability as fair', () => {
    expect(assessPassword('Marcelo7')).toBe('FAIR');
  });

  it('labels every strength in Portuguese without judging the person', () => {
    expect(PASSWORD_STRENGTH_LABELS.WEAK).toBe('Senha fraca');
    expect(PASSWORD_STRENGTH_LABELS.FAIR).toBe('Senha razoável');
    expect(PASSWORD_STRENGTH_LABELS.STRONG).toBe('Senha forte');
  });
});
