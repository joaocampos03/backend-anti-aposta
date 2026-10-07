import { describe, expect, it } from 'vitest';
import { DisplayName } from './display-name.js';

describe('DisplayName', () => {
  it('stores the trimmed name', () => {
    const name = DisplayName.create(' Ana ');

    expect(name.ok && name.value.value).toBe('Ana');
  });

  it('refuses a single character, because it is how somebody wants to be called', () => {
    expect(DisplayName.create('A').ok).toBe(false);
  });

  it('refuses a name longer than 80 characters', () => {
    expect(DisplayName.create('a'.repeat(81)).ok).toBe(false);
  });

  it('refuses whitespace that only looks like a name', () => {
    expect(DisplayName.create('    ').ok).toBe(false);
  });
});
