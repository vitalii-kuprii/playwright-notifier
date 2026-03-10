import { describe, it, expect } from 'vitest';
import { parseOwnerTag, extractOwners } from './owner-parser';
import type { TestResult } from '../types';

describe('parseOwnerTag', () => {
  it('parses valid @owner(name) tag', () => {
    expect(parseOwnerTag('@owner(alice)')).toBe('alice');
  });

  it('parses owner with hyphenated name', () => {
    expect(parseOwnerTag('@owner(alice-smith)')).toBe('alice-smith');
  });

  it('returns null for non-owner tags', () => {
    expect(parseOwnerTag('@smoke')).toBeNull();
    expect(parseOwnerTag('@remind(2026-01-01)')).toBeNull();
  });

  it('returns null for malformed owner tags', () => {
    expect(parseOwnerTag('@owner()')).toBeNull();
    expect(parseOwnerTag('@owner')).toBeNull();
    expect(parseOwnerTag('owner(alice)')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseOwnerTag('')).toBeNull();
  });
});

describe('extractOwners', () => {
  function makeTest(overrides: Partial<TestResult>): TestResult {
    return {
      name: 'test',
      suitePath: [],
      fullTitle: 'test',
      file: 'test.spec.ts',
      line: 1,
      status: 'failed',
      duration: 1000,
      tags: [],
      retries: 0,
      ...overrides,
    };
  }

  it('extracts owners from tests with @owner tags', () => {
    const tests = [
      makeTest({ name: 'login test', tags: ['@auth', '@owner(alice)'], file: 'login.spec.ts' }),
      makeTest({ name: 'checkout test', tags: ['@owner(bob)'], file: 'checkout.spec.ts' }),
    ];

    const owners = extractOwners(tests);

    expect(owners).toEqual([
      { testName: 'login test', file: 'login.spec.ts', ownerTag: 'alice' },
      { testName: 'checkout test', file: 'checkout.spec.ts', ownerTag: 'bob' },
    ]);
  });

  it('skips tests without @owner tags', () => {
    const tests = [
      makeTest({ name: 'no owner', tags: ['@smoke'] }),
    ];

    expect(extractOwners(tests)).toEqual([]);
  });

  it('returns only first owner per test', () => {
    const tests = [
      makeTest({ name: 'multi owner', tags: ['@owner(alice)', '@owner(bob)'] }),
    ];

    const owners = extractOwners(tests);
    expect(owners).toHaveLength(1);
    expect(owners[0].ownerTag).toBe('alice');
  });

  it('returns empty array for empty input', () => {
    expect(extractOwners([])).toEqual([]);
  });
});
