import type { DetectionConfidence, DetectionReason } from '../bet-classification.js';
import type { DetectionSignals } from '../detection-signals.js';
import type { DetectionPolicy } from './detection-policy.js';

const DIACRITICS = /[̀-ͯ]/g;

/**
 * Words a betting operator tends to leave in a statement line. The weakest
 * policy by a distance: "bet" appears in plenty of names that have nothing to do
 * with gambling, which is why a transaction matched only by this one is reported
 * as `LOW` and renders as "Possível aposta" rather than "Aposta".
 */
const BETTING_KEYWORDS: readonly string[] = [
  'aposta',
  'apostas',
  'bet',
  'bets',
  'betting',
  'cassino',
  'casino',
  'loteria',
  'lottery',
  'poker',
  'sportsbook',
];

function fold(text: string): string {
  return text.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

export class DescriptionKeywordPolicy implements DetectionPolicy {
  readonly matchedBy: DetectionReason = 'DESCRIPTION_KEYWORD';
  readonly confidence: DetectionConfidence = 'LOW';

  matches(signals: DetectionSignals): boolean {
    const folded = fold(signals.description);

    // Whole words only: "bet" must not match "Betânia" or "Abeto".
    return BETTING_KEYWORDS.some((keyword) =>
      new RegExp(`(^|[^a-z0-9])${keyword}([^a-z0-9]|$)`).test(folded),
    );
  }
}
