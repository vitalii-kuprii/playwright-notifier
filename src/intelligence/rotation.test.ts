import { describe, it, expect } from 'vitest';
import { resolveCurrentOnCall, resolveOwnerMention } from './rotation';
import type { RotationConfig } from '../config/schema';

function makeConfig(overrides?: Partial<RotationConfig>): RotationConfig {
  return {
    enabled: true,
    schedule: 'weekly',
    startDate: '2026-01-05', // a Monday
    members: [
      { name: 'alice', slack: '<@U111>' },
      { name: 'bob', slack: '<@U222>' },
      { name: 'charlie', slack: '<@U333>', email: 'charlie@example.com' },
    ],
    calendar: {},
    mentionInSummary: true,
    ...overrides,
  };
}

describe('resolveCurrentOnCall', () => {
  it('returns first member in first week', () => {
    const config = makeConfig();
    // Jan 5 2026 is the start date, should be alice (index 0)
    const result = resolveCurrentOnCall(config, new Date('2026-01-07T12:00:00Z'));
    expect(result?.name).toBe('alice');
  });

  it('rotates to next member after one period', () => {
    const config = makeConfig();
    // Week 2: Jan 12-18 → bob (index 1)
    const result = resolveCurrentOnCall(config, new Date('2026-01-14T12:00:00Z'));
    expect(result?.name).toBe('bob');
  });

  it('wraps around after all members', () => {
    const config = makeConfig();
    // Week 4: Jan 26 → alice again (index 3 % 3 = 0)
    const result = resolveCurrentOnCall(config, new Date('2026-01-28T12:00:00Z'));
    expect(result?.name).toBe('alice');
  });

  it('uses daily schedule', () => {
    const config = makeConfig({ schedule: 'daily' });
    // Day 0 = alice, Day 1 = bob, Day 2 = charlie
    expect(resolveCurrentOnCall(config, new Date('2026-01-05T12:00:00Z'))?.name).toBe('alice');
    expect(resolveCurrentOnCall(config, new Date('2026-01-06T12:00:00Z'))?.name).toBe('bob');
    expect(resolveCurrentOnCall(config, new Date('2026-01-07T12:00:00Z'))?.name).toBe('charlie');
  });

  it('uses biweekly schedule', () => {
    const config = makeConfig({ schedule: 'biweekly' });
    // First 14 days → alice
    expect(resolveCurrentOnCall(config, new Date('2026-01-10T12:00:00Z'))?.name).toBe('alice');
    // Day 14-27 → bob
    expect(resolveCurrentOnCall(config, new Date('2026-01-20T12:00:00Z'))?.name).toBe('bob');
  });

  it('returns null when disabled', () => {
    const config = makeConfig({ enabled: false });
    expect(resolveCurrentOnCall(config)).toBeNull();
  });

  it('uses calendar override when present', () => {
    const config = makeConfig({
      calendar: { '2026-01-10': 'charlie' },
    });
    // Without override, week 1 would be alice. But calendar says charlie from Jan 10
    const result = resolveCurrentOnCall(config, new Date('2026-01-12T12:00:00Z'));
    expect(result?.name).toBe('charlie');
  });

  it('uses most recent calendar override', () => {
    const config = makeConfig({
      calendar: {
        '2026-01-10': 'charlie',
        '2026-01-15': 'bob',
      },
    });
    const result = resolveCurrentOnCall(config, new Date('2026-01-16T12:00:00Z'));
    expect(result?.name).toBe('bob');
  });

  it('ignores future calendar entries', () => {
    const config = makeConfig({
      calendar: { '2026-02-01': 'charlie' },
    });
    // Jan 7 is before Feb 1, so calendar doesn't apply → normal rotation
    const result = resolveCurrentOnCall(config, new Date('2026-01-07T12:00:00Z'));
    expect(result?.name).toBe('alice');
  });

  it('returns first member if now is before startDate', () => {
    const config = makeConfig();
    const result = resolveCurrentOnCall(config, new Date('2025-12-01T12:00:00Z'));
    expect(result?.name).toBe('alice');
  });
});

describe('resolveOwnerMention', () => {
  it('resolves direct member match with slack info', () => {
    const config = makeConfig();
    const result = resolveOwnerMention('alice', config);

    expect(result).toEqual({
      name: 'alice',
      slack: '<@U111>',
      isOnCall: false,
    });
  });

  it('returns raw name when no config', () => {
    const result = resolveOwnerMention('unknown-person', undefined);

    expect(result).toEqual({
      name: 'unknown-person',
      isOnCall: false,
    });
  });

  it('returns raw name when tag does not match any member', () => {
    const config = makeConfig();
    const result = resolveOwnerMention('unknown-person', config);

    expect(result).toEqual({
      name: 'unknown-person',
      isOnCall: false,
    });
  });

  it('includes email when member has one', () => {
    const config = makeConfig();
    const result = resolveOwnerMention('charlie', config);

    expect(result.email).toBe('charlie@example.com');
  });
});
