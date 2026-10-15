import type {
  BookmakerIdentityQuery,
  BookmakerIdentityRow,
} from '../../application/ports/bookmaker-identity.query.port.js';

export class InMemoryBookmakerIdentityQuery implements BookmakerIdentityQuery {
  private rows: readonly BookmakerIdentityRow[] = [];

  /** Arrange: what each house in this reader's history is called. */
  know(...rows: readonly BookmakerIdentityRow[]): void {
    this.rows = [...this.rows, ...rows];
  }

  async forUserId(_userId: string): Promise<readonly BookmakerIdentityRow[]> {
    return this.rows;
  }
}
