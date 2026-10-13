import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { NotificationContent } from './notification-content.js';
import { MAXIMUM_TEXT_LENGTH, Notification } from './notification.js';

const RECIPIENT_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-0000000000aa');
const NOTIFICATION_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001');
const NOW = new Date('2026-10-12T15:00:00.000Z');

function compose(content: NotificationContent) {
  return Notification.compose({
    id: NOTIFICATION_ID,
    recipientId: RECIPIENT_ID,
    content,
    createdAt: NOW,
  });
}

const A_NUDGE: NotificationContent = {
  kind: 'AWARENESS_NUDGE',
  merchant: 'Aposta Andorinha',
  amountInCents: -5000,
  yieldInCents: 5570,
  annualRatePercent: 11.4,
  monthlyTotalInCents: 18400,
  matchedBy: 'MCC 7995',
};

describe('Notification', () => {
  it('composes a nudge a person can read', () => {
    const composed = compose(A_NUDGE);

    expect(composed.ok && composed.value.content).toEqual(A_NUDGE);
    expect(composed.ok && composed.value.recipientId.equals(RECIPIENT_ID)).toBe(true);
  });

  it('refuses a nudge for a zero amount, which reframes to nothing', () => {
    const composed = compose({ ...A_NUDGE, amountInCents: 0 });

    expect(!composed.ok && composed.error.code).toBe('INVALID_NOTIFICATION');
  });

  it('refuses a fraction of a cent', () => {
    const composed = compose({ kind: 'GOAL_REACHED', label: 'Curso técnico', amountInCents: 10.5 });

    expect(composed.ok).toBe(false);
  });

  it('refuses a blank line, so a dialog can never open empty', () => {
    const composed = compose({
      kind: 'BADGE_AWARDED',
      badgeId: 'streak-7',
      title: '   ',
      description: '7 dias.',
    });

    expect(composed.ok).toBe(false);
  });

  it('refuses text longer than a lock screen shows', () => {
    const composed = compose({
      kind: 'GOAL_REACHED',
      label: 'x'.repeat(MAXIMUM_TEXT_LENGTH + 1),
      amountInCents: 50_000,
    });

    expect(composed.ok).toBe(false);
  });

  it('refuses to announce zero new transactions', () => {
    const composed = compose({ kind: 'TRANSACTIONS_INGESTED', ingestedCount: 0 });

    expect(composed.ok).toBe(false);
  });

  it('refuses a broken streak of zero days, which was never a streak', () => {
    const composed = compose({ kind: 'STREAK_BROKEN', previousDays: 0 });

    expect(composed.ok).toBe(false);
  });
});
