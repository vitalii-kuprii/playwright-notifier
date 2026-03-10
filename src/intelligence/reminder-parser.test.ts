import { describe, it, expect } from 'vitest';
import { parseRemindTag, extractDueReminders } from './reminder-parser';
import type { TestResult } from '../types';

describe('parseRemindTag', () => {
  it('parses a valid @remind tag', () => {
    const date = parseRemindTag('@remind(2026-04-01)');
    expect(date).toEqual(new Date(Date.UTC(2026, 3, 1)));
  });

  it('returns null for non-remind tags', () => {
    expect(parseRemindTag('@smoke')).toBeNull();
    expect(parseRemindTag('@auth')).toBeNull();
  });

  it('returns null for malformed dates', () => {
    expect(parseRemindTag('@remind(2026-13-01)')).toBeNull();
    expect(parseRemindTag('@remind(2026-02-30)')).toBeNull();
  });

  it('returns null for incomplete format', () => {
    expect(parseRemindTag('@remind(2026-04)')).toBeNull();
    expect(parseRemindTag('@remind()')).toBeNull();
    expect(parseRemindTag('@remind')).toBeNull();
  });

  it('returns null for extra text around tag', () => {
    expect(parseRemindTag('x@remind(2026-04-01)')).toBeNull();
    expect(parseRemindTag('@remind(2026-04-01)x')).toBeNull();
  });
});

function makeSkippedTest(overrides: Partial<TestResult> = {}): TestResult {
  return {
    name: 'skipped test',
    suitePath: [],
    fullTitle: 'skipped test',
    file: 'tests/example.spec.ts',
    line: 1,
    status: 'skipped',
    duration: 0,
    tags: [],
    retries: 0,
    ...overrides,
  };
}

describe('extractDueReminders', () => {
  const now = new Date(Date.UTC(2026, 2, 8)); // 2026-03-08

  it('returns reminders for overdue @remind tags', () => {
    const tests = [
      makeSkippedTest({
        name: 'old skip',
        tags: ['@remind(2026-03-01)'],
        file: 'tests/old.spec.ts',
      }),
    ];

    const result = extractDueReminders(tests, now);
    expect(result).toHaveLength(1);
    expect(result[0].testName).toBe('old skip');
    expect(result[0].daysOverdue).toBe(7);
  });

  it('includes reminders due today with daysOverdue=0', () => {
    const tests = [
      makeSkippedTest({
        name: 'due today',
        tags: ['@remind(2026-03-08)'],
      }),
    ];

    const result = extractDueReminders(tests, now);
    expect(result).toHaveLength(1);
    expect(result[0].daysOverdue).toBe(0);
  });

  it('excludes future reminders', () => {
    const tests = [
      makeSkippedTest({
        name: 'future skip',
        tags: ['@remind(2026-04-01)'],
      }),
    ];

    const result = extractDueReminders(tests, now);
    expect(result).toHaveLength(0);
  });

  it('ignores non-remind tags', () => {
    const tests = [
      makeSkippedTest({
        tags: ['@smoke', '@auth'],
      }),
    ];

    const result = extractDueReminders(tests, now);
    expect(result).toHaveLength(0);
  });

  it('sorts most overdue first', () => {
    const tests = [
      makeSkippedTest({
        name: 'recent',
        tags: ['@remind(2026-03-07)'],
      }),
      makeSkippedTest({
        name: 'old',
        tags: ['@remind(2026-02-01)'],
      }),
    ];

    const result = extractDueReminders(tests, now);
    expect(result).toHaveLength(2);
    expect(result[0].testName).toBe('old');
    expect(result[1].testName).toBe('recent');
  });

  it('returns empty for no skipped tests', () => {
    expect(extractDueReminders([], now)).toEqual([]);
  });
});
