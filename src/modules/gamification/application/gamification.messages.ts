import type { BadgeId } from '../domain/badge-catalogue.js';

/**
 * Every Portuguese string this module can put in front of a person, in one
 * place.
 *
 * None of them comments on the person's choices. A withdrawal refused for want
 * of balance says what the balance allows and stops; a month past its ceiling
 * is described by the frontend in a distance, never in a verdict.
 */
export const GAMIFICATION_MESSAGES = {
  goalNotFound: 'Não encontramos essa meta. Recarregue a página.',
  insufficientBalance:
    'Esta meta não tem esse valor guardado no seu registro. Não é possível retirar mais do que isso.',
  goalModifiedConcurrently:
    'Esta meta mudou enquanto você registrava. Recarregue a página e confira antes de tentar de novo.',
  idempotencyKeyReused: 'Não conseguimos registrar este valor. Recarregue a página e tente de novo.',
  ceilingModifiedConcurrently:
    'O teto mudou enquanto você salvava. Recarregue a página e confira antes de tentar de novo.',
  validationFailed: 'Não conseguimos salvar. Confira os campos e tente de novo.',
  listInvalid: 'Não conseguimos carregar essa lista.',
  titleTooShort: 'Dê um nome com pelo menos 3 letras.',
  titleTooLong: 'O nome ficou longo demais.',
  purposeInvalid: 'Escolha para que serve esta meta.',
  amountInvalid: 'Informe um valor em reais, com no máximo dois centavos.',
  amountNotPositive: 'O valor precisa ser maior que zero.',
  amountNegative: 'O teto não pode ser negativo.',
  amountTooLarge: 'O valor passou do máximo aceito, R$ 10.000.000,00.',
  directionInvalid: 'Não conseguimos registrar este valor. Recarregue a página e tente de novo.',
  destinationTooLong: 'O destino ficou longo demais.',
  idempotencyKeyInvalid: 'Não conseguimos registrar este valor. Recarregue a página e tente de novo.',
  tooManyAttempts: 'Muitos registros em pouco tempo. Tente novamente em alguns minutos.',
  goalsUnavailable: 'Não conseguimos carregar suas metas agora. Tente novamente em instantes.',
  movementsUnavailable: 'Não conseguimos carregar o histórico agora. Tente novamente em instantes.',
  createUnavailable: 'Não conseguimos criar a meta agora. Tente novamente em instantes.',
  recordUnavailable: 'Não conseguimos registrar este valor agora. Tente novamente em instantes.',
  ceilingUnavailable: 'Não conseguimos carregar o seu teto agora. Tente novamente em instantes.',
  setCeilingUnavailable: 'Não conseguimos salvar o teto agora. Tente novamente em instantes.',
  achievementsUnavailable: 'Não conseguimos carregar suas conquistas agora. Tente novamente em instantes.',
} as const;

/**
 * Each badge's name and what it takes, readable before it happens. A criterion
 * states a fact to reach and stops — no "quase lá", and no reward described
 * beyond the record that it happened.
 */
export const BADGE_COPY: Readonly<Record<BadgeId, { readonly title: string; readonly criterion: string }>> = {
  'streak-7': {
    title: 'Uma semana sem apostas',
    criterion: '7 dias seguidos sem nenhuma aposta identificada no extrato.',
  },
  'streak-15': {
    title: 'Quinze dias sem apostas',
    criterion: '15 dias seguidos sem nenhuma aposta identificada no extrato.',
  },
  'streak-30': {
    title: 'Um mês sem apostas',
    criterion: '30 dias seguidos sem nenhuma aposta identificada no extrato.',
  },
  'streak-90': {
    title: 'Três meses sem apostas',
    criterion: '90 dias seguidos sem nenhuma aposta identificada no extrato.',
  },
  'ceiling-1': {
    title: 'Um mês dentro do teto',
    criterion: 'Fechar um mês com o gasto em apostas dentro do teto que você definiu.',
  },
  'ceiling-3': {
    title: 'Três meses seguidos dentro do teto',
    criterion: 'Fechar três meses seguidos dentro do teto que valia em cada um deles.',
  },
  'ceiling-6': {
    title: 'Seis meses seguidos dentro do teto',
    criterion: 'Fechar seis meses seguidos dentro do teto que valia em cada um deles.',
  },
  'reduction-1': {
    title: 'Um mês de queda',
    criterion: 'Fechar um mês gastando menos em apostas do que no mês anterior.',
  },
  'reduction-3': {
    title: 'Três meses seguidos de queda',
    criterion: 'Fechar três meses seguidos gastando menos em apostas que no mês anterior.',
  },
  'savings-1': {
    title: 'Primeira meta concluída',
    criterion: 'Chegar ao valor de uma meta de poupança que você registrou.',
  },
  'savings-3': {
    title: 'Três metas concluídas',
    criterion: 'Chegar ao valor de três metas de poupança que você registrou.',
  },
};

/**
 * What the person did, for the `BADGE_AWARDED` notification. No dates: it may be
 * read on a lock screen days later, when "até ontem" would be wrong. A figure the
 * statement window cut off says "pelo menos", as it does everywhere else.
 */
export const BADGE_ANNOUNCEMENT_MESSAGES = {
  streak: (days: number, isLowerBound: boolean): string =>
    `${isLowerBound ? 'Pelo menos ' : ''}${days} dias seguidos sem nenhuma aposta identificada no extrato.`,
  ceiling: (months: number): string =>
    months === 1
      ? '1 mês fechado dentro do teto que você definiu.'
      : `${months} meses seguidos fechados dentro do teto que você definiu.`,
  reduction: (months: number): string =>
    months === 1
      ? '1 mês fechado gastando menos em apostas que no mês anterior.'
      : `${months} meses seguidos gastando menos em apostas que no mês anterior.`,
  savings: (goals: number): string =>
    goals === 1
      ? '1 meta de poupança concluída, registrada por você.'
      : `${goals} metas de poupança concluídas, registradas por você.`,
  othersRecorded: (count: number): string =>
    count === 1
      ? ' Outra conquista também foi registrada.'
      : ` Outras ${count} conquistas também foram registradas.`,
} as const;
