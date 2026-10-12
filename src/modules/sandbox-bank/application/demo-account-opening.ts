import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BankAccount, type AccountType } from '../domain/bank-account.js';
import type { BankAccountRepository } from '../domain/bank-account.repository.js';
import type { CustomerAccountDto } from './dto/bank-app.dto.js';
import type { BankSecrets } from './ports/bank-secrets.port.js';

/**
 * Invented institution data. The CNPJ is the documentation example format, not
 * any company's, and the COMPE code is outside the assigned range.
 */
export const SANDBOX_BANK_BRAND = {
  brandName: 'Banco Andorinha',
  companyCnpj: '11444777000161',
  compeCode: '999',
  branchCode: '0001',
} as const;

const ACCOUNT_NUMBER_LENGTH = 8;
const VISIBLE_DIGITS = 4;
const DEMO_PRODUCTS: readonly AccountType[] = ['CONTA_DEPOSITO_A_VISTA', 'CARTAO_CREDITO'];

/**
 * Every customer who reaches the sandbox gets a checking account and a credit
 * card the first time, so the authorisation screen always has something to
 * offer. A real bank would never do this; a sandbox that showed an empty list
 * would demonstrate nothing.
 */
export class DemoAccountOpening {
  constructor(
    private readonly accounts: BankAccountRepository,
    private readonly secrets: BankSecrets,
    private readonly idGenerator: IdGenerator,
  ) {}

  async ensureFor(customerId: UniqueEntityId, moment: Date): Promise<readonly BankAccount[]> {
    const existing = await this.accounts.findByCustomerId(customerId);

    if (existing.length > 0) {
      return existing;
    }

    const opened = DEMO_PRODUCTS.map((type) => this.open(customerId, type, moment));

    for (const account of opened) {
      await this.accounts.save(account);
    }

    return opened;
  }

  private open(customerId: UniqueEntityId, type: AccountType, moment: Date): BankAccount {
    return BankAccount.open({
      id: this.idGenerator.generate(),
      customerId,
      type,
      ...SANDBOX_BANK_BRAND,
      number: this.secrets.digits(ACCOUNT_NUMBER_LENGTH),
      checkDigit: this.secrets.digits(1),
      openedAt: moment,
    });
  }
}

export function toCustomerAccountDto(account: BankAccount): CustomerAccountDto {
  return {
    id: account.id.value,
    type: account.type,
    brandName: account.brandName,
    branchCode: account.branchCode,
    numberEnding: account.number.slice(-VISIBLE_DIGITS),
  };
}
