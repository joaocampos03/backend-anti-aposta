import type { Money } from '@shared/domain/money.js';
import {
  BetClassification,
  certaintyOf,
  strengthOf,
  type DetectionConfidence,
  type DetectionReason,
} from './bet-classification.js';
import type { BetEntry } from './bet-entry.js';
import { BettingCost } from './betting-cost.js';
import type { BookmakerIdentity } from './bookmaker-identity.js';

/** One policy's contribution to a single bookmaker's rows. */
export interface BookmakerDetection {
  readonly matchedBy: DetectionReason;
  readonly count: number;
  readonly lowestConfidence: DetectionConfidence;
}

/** The weakest verdict behind a bookmaker, with the reason that produced it. */
export interface WeakestDetection {
  readonly matchedBy: DetectionReason;
  readonly confidence: DetectionConfidence;
}

/**
 * One bookmaker's place in the window's ranking.
 *
 * `weakest` is the single most important field here. A house with nine MCC
 * matches at `HIGH` and one keyword match at `LOW` is not a `HIGH` house, and it
 * is not a `GAMBLING_MCC`/`LOW` house either — that pairing would attach one
 * policy's reason to another policy's uncertainty, which is how a reader comes
 * to believe a figure is firmer than it is. The confidence travels with the
 * reason that earned it.
 */
export class BookmakerStanding {
  private constructor(
    readonly bookmaker: BookmakerIdentity,
    readonly total: Money,
    readonly transactionCount: number,
    readonly firstSeenAt: Date,
    readonly lastSeenAt: Date,
    readonly weakest: WeakestDetection,
    readonly detections: readonly BookmakerDetection[],
  ) {}

  /**
   * Ordered by net total descending, then by name ascending. A house whose
   * every bet was refunded still appears, at zero: the transactions happened,
   * and hiding the row would make the ranking disagree with the statement.
   */
  static rank(entries: readonly BetEntry[]): readonly BookmakerStanding[] {
    return [...groupByBookmaker(entries).values()]
      .map((group) => BookmakerStanding.of(group))
      .filter((standing): standing is BookmakerStanding => standing !== null)
      .sort(compareStandings);
  }

  private static of(entries: readonly BetEntry[]): BookmakerStanding | null {
    const first = entries[0];

    if (first === undefined) {
      return null;
    }

    const cost = BettingCost.from(entries);
    const described = describable(entries);
    const instants = entries.map((entry) => entry.occurredAt.getTime());

    return new BookmakerStanding(
      first.bookmaker,
      cost.total,
      cost.transactionCount,
      new Date(Math.min(...instants)),
      new Date(Math.max(...instants)),
      weakestOf(described),
      detectionsOf(described),
    );
  }
}

function groupByBookmaker(entries: readonly BetEntry[]): ReadonlyMap<string, BetEntry[]> {
  const groups = new Map<string, BetEntry[]>();

  for (const entry of entries) {
    const group = groups.get(entry.bookmakerId) ?? [];
    group.push(entry);
    groups.set(entry.bookmakerId, group);
  }

  return groups;
}

/**
 * The rows the breakdown describes: bets placed, so the per-policy counts add
 * up to `transactionCount`.
 *
 * The fallback is for the one case where a window holds a house's refund but
 * not the bet it reverses — a refund that landed just inside the window for a
 * bet just outside it. Describing the house by its refund is better than
 * listing it with no reason at all.
 */
function describable(entries: readonly BetEntry[]): readonly BetEntry[] {
  const placed = entries.filter((entry) => entry.isBetPlaced);

  return placed.length > 0 ? placed : entries;
}

/**
 * The lowest confidence among the rows, reported with the `matchedBy` of a row
 * that actually has it. Ties break toward the weaker policy, so a `LOW` from a
 * keyword match is never hidden behind a `LOW` from anything else.
 */
function weakestOf(entries: readonly BetEntry[]): WeakestDetection {
  const weakest = entries.reduce((candidate, entry) =>
    isWeaker(entry, candidate) ? entry : candidate,
  );

  return { matchedBy: weakest.matchedBy, confidence: weakest.confidence };
}

function isWeaker(entry: BetEntry, than: BetEntry): boolean {
  const certainty = certaintyOf(entry.confidence) - certaintyOf(than.confidence);

  if (certainty !== 0) {
    return certainty < 0;
  }

  return strengthOf(entry.matchedBy) > strengthOf(than.matchedBy);
}

/** By count, then by policy strength. `detections[0]` is what the row names. */
function detectionsOf(entries: readonly BetEntry[]): readonly BookmakerDetection[] {
  const byReason = new Map<DetectionReason, BetEntry[]>();

  for (const entry of entries) {
    const group = byReason.get(entry.matchedBy) ?? [];
    group.push(entry);
    byReason.set(entry.matchedBy, group);
  }

  return [...byReason.entries()]
    .map(([matchedBy, matched]) => ({
      matchedBy,
      count: matched.length,
      lowestConfidence: BetClassification.lowestConfidence(
        matched.map((entry) => entry.confidence),
      ),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || strengthOf(left.matchedBy) - strengthOf(right.matchedBy),
    );
}

function compareStandings(left: BookmakerStanding, right: BookmakerStanding): number {
  return (
    right.total.amountInCents - left.total.amountInCents ||
    left.bookmaker.name.localeCompare(right.bookmaker.name, 'pt-BR')
  );
}
