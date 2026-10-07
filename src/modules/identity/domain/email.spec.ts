import { describe, expect, it } from 'vitest';
import { Email } from './email.js';

describe('Email', () => {
  it('normalises the address, because a phone keyboard capitalises and pads it', () => {
    const email = Email.create(' ANA@Exemplo.com ');

    expect(email.ok && email.value.value).toBe('ana@exemplo.com');
  });

  it('considers two addresses differing only in case the same address', () => {
    const first = Email.create('ana@exemplo.com');
    const second = Email.create('Ana@Exemplo.COM');

    expect(first.ok && second.ok && first.value.equals(second.value)).toBe(true);
  });

  it('refuses an address without a domain', () => {
    const email = Email.create('ana@exemplo');

    expect(email.ok).toBe(false);
  });

  it('refuses an address without an at sign', () => {
    expect(Email.create('ana.exemplo.com').ok).toBe(false);
  });

  it('refuses an address longer than 254 characters', () => {
    const local = 'a'.repeat(250);

    expect(Email.create(`${local}@exemplo.com`).ok).toBe(false);
  });
});
