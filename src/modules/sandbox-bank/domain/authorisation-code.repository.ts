import type { AuthorisationCode } from './authorisation-code.js';

export interface AuthorisationCodeRepository {
  save(code: AuthorisationCode): Promise<void>;
  findByFingerprint(codeFingerprint: string): Promise<AuthorisationCode | null>;
}
