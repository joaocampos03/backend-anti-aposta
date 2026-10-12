export interface EvaluateSupportOfferInput {
  readonly userId: string;
}

export interface SupportOfferOutput {
  readonly shouldOffer: boolean;
  readonly sustainedMonths: number;
  readonly isRising: boolean;
  readonly thresholdInCents: number;
}
