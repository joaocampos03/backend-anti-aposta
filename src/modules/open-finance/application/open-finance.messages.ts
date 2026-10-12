/**
 * Every Portuguese string this module can put in front of a person, in one
 * place. None of them judges an amount: the bands name their own boundaries and
 * the API sends no `isExcessive`, no `severity` and no copy about spending too
 * much.
 */
export const OPEN_FINANCE_MESSAGES = {
  accountNotFound: 'Não encontramos essa conta.',
  transactionsFilterInvalid: 'Não conseguimos aplicar esses filtros.',
  transactionsUnavailable:
    'Não conseguimos carregar suas transações agora. Tente novamente em instantes.',
  chartsFilterInvalid: 'Não conseguimos carregar os gráficos.',
  chartsUnavailable: 'Não conseguimos carregar os gráficos agora. Tente novamente em instantes.',
  accountsUnavailable: 'Não conseguimos carregar suas contas agora. Tente novamente em instantes.',
  consentNotFound: 'Não encontramos esse consentimento.',
  consentAlreadyAuthorised:
    'Você já tem um consentimento ativo. Revogue o atual para conectar outra instituição.',
  consentNotAwaitingAuthorisation:
    'Esse pedido de consentimento já foi respondido ou expirou. Comece de novo.',
  consentNotAuthorised: 'Nenhum consentimento ativo para esta conta.',
  authorisationNotPending:
    'Não há uma autorização em andamento para esse consentimento. Comece de novo.',
  authorisationStateMismatch:
    'Não foi possível confirmar que esse retorno da instituição é seu. Nada foi registrado.',
  authorisationExpired: 'O tempo para autorizar terminou. Comece de novo.',
  authorisationRefused: 'A instituição não aceitou a autorização. Comece de novo.',
  dataHolderUnavailable:
    'Não conseguimos falar com a instituição agora. Seus dados não foram alterados.',
  consentRequestInvalid: 'Não conseguimos ler esse pedido.',
  consentUnavailable:
    'Não conseguimos carregar seu consentimento agora. Tente novamente em instantes.',
  connectionUnavailable:
    'Não conseguimos conectar sua conta agora. Tente novamente em instantes.',
  synchronisationUnavailable:
    'Não conseguimos atualizar suas transações agora. Tente novamente em instantes.',
  revocationUnavailable:
    'Não conseguimos revogar o consentimento agora. Tente novamente em instantes.',
  tooManyConsentCommands: 'Muitas tentativas em pouco tempo. Tente novamente em instantes.',
  checkingAccountProduct: 'Conta corrente',
  creditCardProduct: 'Cartão de crédito',
} as const;
