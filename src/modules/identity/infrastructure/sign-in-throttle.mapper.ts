import type { SignInThrottle as SignInThrottleRow } from '@prisma/client';
import { SignInThrottle } from '../domain/sign-in-throttle.js';

export class SignInThrottleMapper {
  static toDomain(row: SignInThrottleRow): SignInThrottle {
    return SignInThrottle.restore({
      identifierFingerprint: row.identifierHash,
      failureCount: row.failureCount,
      firstFailureAt: row.firstFailureAt,
      blockedUntil: row.blockedUntil,
    });
  }

  static toRow(throttle: SignInThrottle): SignInThrottleRow {
    return {
      identifierHash: throttle.identifierFingerprint,
      failureCount: throttle.failureCount,
      firstFailureAt: throttle.firstFailureAt,
      blockedUntil: throttle.blockedUntil,
    };
  }
}
