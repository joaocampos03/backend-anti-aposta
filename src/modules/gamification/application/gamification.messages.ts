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
} as const;
