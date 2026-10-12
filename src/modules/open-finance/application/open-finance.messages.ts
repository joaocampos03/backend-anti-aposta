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
} as const;
