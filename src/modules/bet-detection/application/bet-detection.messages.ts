/**
 * Every Portuguese string this module can put in front of a person, in one
 * place.
 *
 * None of them argues with the correction. "Nossa classificação está correta"
 * is not an available response: the override outranks the policy chain, which
 * is the whole point of having one.
 */
export const BET_DETECTION_MESSAGES = {
  transactionNotFound: 'Não encontramos essa transação.',
  notClassifiedAsBet: 'Essa transação não está marcada como aposta.',
  alreadyOverridden: 'Essa correção já foi registrada.',
  overrideNotFound: 'Essa transação não tem correção registrada.',
  validationFailed: 'Não conseguimos registrar a correção.',
  tooManyAttempts: 'Muitas correções em pouco tempo. Tente novamente em alguns minutos.',
  overrideUnavailable: 'Não conseguimos registrar a correção agora. Tente novamente em instantes.',
  revertUnavailable: 'Não conseguimos desfazer a correção agora. Tente novamente em instantes.',
  betsPeriodInvalid: 'Não conseguimos aplicar esse período.',
  betsUnavailable: 'Não conseguimos carregar suas apostas agora. Tente novamente em instantes.',
} as const;
