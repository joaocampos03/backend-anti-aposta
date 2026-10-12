/**
 * Every Portuguese string the simulated bank can put in front of a person or a
 * client, in one place. The bank is fictional and says so nowhere in its copy:
 * that boundary is drawn on the authorisation screen by the frontend.
 */
export const SANDBOX_BANK_MESSAGES = {
  clientNotRecognised: 'Cliente não reconhecido pela instituição.',
  invalidGrant: 'O código ou token apresentado não é válido.',
  invalidTokenRequest: 'Faltam dados para este tipo de concessão.',
  unauthenticated: 'Token de acesso ausente, expirado ou sem permissão para este recurso.',
  invalidConsentRequest:
    'O pedido de consentimento precisa incluir a leitura de contas e durar no máximo 12 meses.',
  consentNotFound: 'Consentimento não encontrado.',
  consentNotAwaitingAuthorisation: 'Este consentimento não está mais aguardando autorização.',
  consentNotActive: 'O consentimento não está ativo.',
  permissionNotGranted: 'O consentimento não cobre este recurso.',
  invalidAuthorisationRequest:
    'O pedido de autorização não é válido para este cliente ou endereço de retorno.',
  noAccountSelected: 'Escolha ao menos uma conta para compartilhar.',
  accountNotFound: 'Conta não encontrada.',
  invalidLedgerEntry:
    'Não foi possível registrar esse lançamento. Confira o valor, a descrição e o tipo.',
  validationFailed: 'Os dados enviados não são válidos.',
  tooManyLedgerEntries: 'Muitos lançamentos em pouco tempo. Tente novamente em instantes.',
  protocolUnavailable: 'A instituição não conseguiu responder agora. Tente novamente em instantes.',
  authorisationUnavailable:
    'Não conseguimos carregar o pedido de autorização agora. Tente novamente em instantes.',
  ledgerUnavailable: 'Não conseguimos registrar o lançamento agora. Tente novamente em instantes.',
} as const;
