import { randomBytes } from 'node:crypto';
import type { Clock } from '../application/clock.port.js';
import type { IdGenerator } from '../application/id-generator.port.js';
import { UniqueEntityId } from '../domain/unique-entity-id.js';

const VERSION_BYTE_INDEX = 6;
const VARIANT_BYTE_INDEX = 8;
const TIMESTAMP_BYTE_LENGTH = 6;

/**
 * UUID v7: a 48-bit millisecond timestamp followed by randomness, so ids sort by
 * creation time and a b-tree index on a primary key stays dense.
 */
export class UuidV7IdGenerator implements IdGenerator {
  constructor(private readonly clock: Clock) {}

  generate(): UniqueEntityId {
    const bytes = randomBytes(16);
    bytes.writeUIntBE(this.clock.now().getTime(), 0, TIMESTAMP_BYTE_LENGTH);
    bytes.writeUInt8((bytes.readUInt8(VERSION_BYTE_INDEX) & 0x0f) | 0x70, VERSION_BYTE_INDEX);
    bytes.writeUInt8((bytes.readUInt8(VARIANT_BYTE_INDEX) & 0x3f) | 0x80, VARIANT_BYTE_INDEX);

    const hexadecimal = bytes.toString('hex');

    return UniqueEntityId.restore(
      [
        hexadecimal.slice(0, 8),
        hexadecimal.slice(8, 12),
        hexadecimal.slice(12, 16),
        hexadecimal.slice(16, 20),
        hexadecimal.slice(20, 32),
      ].join('-'),
    );
  }
}
