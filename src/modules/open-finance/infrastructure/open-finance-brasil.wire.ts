import { z } from 'zod';
import type { SharedAccount, SharedTransaction } from '../application/ports/data-holder.port.js';
import { OPEN_FINANCE_MESSAGES } from '../application/open-finance.messages.js';
import type {
  AccountKind,
  PaymentMethod,
  TransactionStatus,
} from '../domain/transaction-attributes.js';

/**
 * The Open Finance Brasil wire format, parsed and translated. This file and
 * `sandbox-bank-data-holder.ts` are the anti-corruption layer: every field name
 * of the specification is spelled here, and none of them travels further.
 *
 * Anything that does not parse is the institution answering nonsense, and is
 * treated as unavailable rather than half-understood.
 */

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
});

export const consentResponseSchema = z.object({
  data: z.object({ consentId: z.string().min(1), status: z.string() }),
});

const accountTypeSchema = z.enum(['CONTA_DEPOSITO_A_VISTA', 'CARTAO_CREDITO']);

export const accountsResponseSchema = z.object({
  data: z.array(
    z.object({
      accountId: z.string().min(1),
      brandName: z.string().min(1),
      type: accountTypeSchema,
      number: z.string().regex(/^\d+$/),
      checkDigit: z.string(),
    }),
  ),
});

const AMOUNT_PATTERN = /^(\d+)\.(\d{2})$/;
const MCC_PATTERN = /^\d{4}$/;

const transactionSchema = z.object({
  transactionId: z.string().min(1),
  completedAuthorisedPaymentType: z.enum(['TRANSACAO_EFETIVADA', 'LANCAMENTO_FUTURO']),
  creditDebitType: z.enum(['CREDITO', 'DEBITO']),
  transactionName: z.string().min(1),
  type: z.enum([
    'PIX',
    'TED',
    'BOLETO',
    'CONVENIO_ARRECADACAO',
    'CARTAO',
    'FOLHA_PAGAMENTO',
    'TRANSFERENCIA_MESMA_INSTITUICAO',
  ]),
  transactionAmount: z.object({
    amount: z.string().regex(AMOUNT_PATTERN),
    currency: z.literal('BRL'),
  }),
  transactionDateTime: z.iso.datetime({ offset: true }),
  merchantCategoryCode: z.string().regex(MCC_PATTERN).optional(),
  payeeDocument: z.string().regex(/^\d{11}$|^\d{14}$/).optional(),
});

export const transactionsResponseSchema = z.object({
  data: z.array(transactionSchema),
  meta: z.object({ totalPages: z.number().int().nonnegative() }),
});

type WireAccount = z.infer<typeof accountsResponseSchema>['data'][number];
type WireTransaction = z.infer<typeof transactionSchema>;

/** Generic words a statement row does not need, when it already names the merchant. */
const GENERIC_BRAND_PREFIXES: readonly string[] = ['Banco ', 'Instituição de Pagamento '];

const KIND_BY_TYPE: Readonly<Record<WireAccount['type'], AccountKind>> = {
  CONTA_DEPOSITO_A_VISTA: 'CHECKING',
  CARTAO_CREDITO: 'CREDIT_CARD',
};

const PRODUCT_BY_KIND: Readonly<Record<AccountKind, string>> = {
  CHECKING: OPEN_FINANCE_MESSAGES.checkingAccountProduct,
  CREDIT_CARD: OPEN_FINANCE_MESSAGES.creditCardProduct,
};

export function toSharedAccount(wire: WireAccount): SharedAccount {
  const kind = KIND_BY_TYPE[wire.type];

  return {
    externalId: wire.accountId,
    institution: wire.brandName,
    shortName: shortNameOf(wire.brandName),
    product: PRODUCT_BY_KIND[kind],
    fullNumber: `${wire.number}${wire.checkDigit}`,
    kind,
  };
}

function shortNameOf(brandName: string): string {
  const prefix = GENERIC_BRAND_PREFIXES.find((generic) => brandName.startsWith(generic));

  return prefix === undefined ? brandName : brandName.slice(prefix.length);
}

const STATUS_BY_PAYMENT_TYPE: Readonly<
  Record<WireTransaction['completedAuthorisedPaymentType'], TransactionStatus>
> = {
  TRANSACAO_EFETIVADA: 'SETTLED',
  LANCAMENTO_FUTURO: 'PENDING',
};

const METHOD_BY_TYPE: Readonly<Record<Exclude<WireTransaction['type'], 'CARTAO'>, PaymentMethod>> =
  {
    PIX: 'PIX',
    TED: 'TRANSFER',
    BOLETO: 'BOLETO',
    CONVENIO_ARRECADACAO: 'DIRECT_DEBIT',
    FOLHA_PAGAMENTO: 'TRANSFER',
    TRANSFERENCIA_MESMA_INSTITUICAO: 'TRANSFER',
  };

/** A card movement is a credit- or a debit-card payment depending on the account it is on. */
function methodOf(type: WireTransaction['type'], accountKind: AccountKind): PaymentMethod {
  if (type === 'CARTAO') {
    return accountKind === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'DEBIT_CARD';
  }

  return METHOD_BY_TYPE[type];
}

/** "1234.56" to 123456, by digits: a decimal string never passes through a float. */
function centsOf(amount: string): number {
  const [, whole = '0', fraction = '00'] = AMOUNT_PATTERN.exec(amount) ?? [];

  return Number(whole) * 100 + Number(fraction);
}

export function toSharedTransaction(
  wire: WireTransaction,
  accountKind: AccountKind,
): SharedTransaction {
  const magnitude = centsOf(wire.transactionAmount.amount);

  return {
    externalId: wire.transactionId,
    occurredAt: new Date(wire.transactionDateTime),
    amountInCents: wire.creditDebitType === 'DEBITO' ? -magnitude : magnitude,
    statementLine: wire.transactionName,
    method: methodOf(wire.type, accountKind),
    status: STATUS_BY_PAYMENT_TYPE[wire.completedAuthorisedPaymentType],
    merchantCategoryCode:
      wire.merchantCategoryCode === undefined ? null : Number(wire.merchantCategoryCode),
    counterpartyDocument: wire.payeeDocument ?? null,
    isAccountToAccountTransfer: wire.type === 'TRANSFERENCIA_MESMA_INSTITUICAO',
  };
}

/** The specification's booking-date filters are calendar dates, not instants. */
export function bookingDateOf(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}
