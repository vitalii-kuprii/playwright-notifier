import { describe, it, expect, vi } from 'vitest';
import { pluginConfigSchema } from './schema';

describe('pluginConfigSchema', () => {
  it('applies defaults for minimal config', () => {
    const result = pluginConfigSchema.parse({});
    expect(result.sendResults).toBe('always');
    expect(result.projectName).toBeUndefined();
    expect(result.environment).toBe('default');
    expect(result.channels).toEqual({});
    expect(result.meta).toEqual([]);
    expect(result.display).toEqual({ maxFailures: 5, maxErrorLength: 300 });
    expect(result.flaky).toEqual({ show: false, mention: false });
    expect(result.reminders).toEqual({ show: true });
    expect(result.showTriggeredBy).toBe(false);
  });

  it('parses a full slack config', () => {
    const result = pluginConfigSchema.parse({
      projectName: 'MyApp E2E',
      environment: 'staging',
      sendResults: 'on-failure',
      channels: {
        slack: {
          token: 'xoxb-test',
          channels: ['#qa-alerts'],
          threads: true,
          mentionOnFailure: ['@qa-team'],
        },
      },
      meta: [
        { key: 'Branch', value: 'main' },
      ],
    });

    expect(result.projectName).toBe('MyApp E2E');
    expect(result.channels.slack?.token).toBe('xoxb-test');
    expect(result.channels.slack?.threads).toBe(true);
    expect(result.meta).toHaveLength(1);
  });

  it('parses slack config with webhookUrl', () => {
    const result = pluginConfigSchema.parse({
      channels: {
        slack: {
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
        },
      },
    });

    expect(result.channels.slack?.webhookUrl).toBe(
      'https://hooks.slack.com/services/T00/B00/xxx',
    );
  });

  it('rejects slack config with neither webhookUrl nor token+channels', () => {
    expect(() =>
      pluginConfigSchema.parse({
        channels: { slack: {} },
      }),
    ).toThrow();
  });

  // New nested config format
  it('accepts new nested flaky config', () => {
    const result = pluginConfigSchema.parse({ flaky: { show: true, mention: true } });
    expect(result.flaky.show).toBe(true);
    expect(result.flaky.mention).toBe(true);
  });

  it('accepts new nested display config', () => {
    const result = pluginConfigSchema.parse({
      display: { maxFailures: 10, maxErrorLength: 500, reportUrl: 'https://example.com/report' },
    });
    expect(result.display.maxFailures).toBe(10);
    expect(result.display.maxErrorLength).toBe(500);
    expect(result.display.reportUrl).toBe('https://example.com/report');
  });

  it('accepts new nested reminders config', () => {
    const result = pluginConfigSchema.parse({ reminders: { show: false } });
    expect(result.reminders.show).toBe(false);
  });

  it('defaults reminders.show to true', () => {
    const result = pluginConfigSchema.parse({});
    expect(result.reminders.show).toBe(true);
  });

  // Backward compat: deprecated flat keys still work
  it('migrates deprecated showFlaky/mentionOnFlaky to flaky nested config', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = pluginConfigSchema.parse({ showFlaky: true, mentionOnFlaky: true });
    expect(result.flaky.show).toBe(true);
    expect(result.flaky.mention).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('showFlaky'));
    warnSpy.mockRestore();
  });

  it('migrates deprecated showReminders to reminders nested config', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = pluginConfigSchema.parse({ showReminders: false });
    expect(result.reminders.show).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('showReminders'));
    warnSpy.mockRestore();
  });

  it('migrates deprecated maxFailures/maxErrorLength/reportUrl to display', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = pluginConfigSchema.parse({
      maxFailures: 10,
      maxErrorLength: 500,
      reportUrl: 'https://example.com/report',
    });
    expect(result.display.maxFailures).toBe(10);
    expect(result.display.maxErrorLength).toBe(500);
    expect(result.display.reportUrl).toBe('https://example.com/report');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('maxFailures'));
    warnSpy.mockRestore();
  });

  it('accepts optional branch override', () => {
    const result = pluginConfigSchema.parse({ branch: 'feature/login' });
    expect(result.branch).toBe('feature/login');
  });

  it('defaults branch to undefined', () => {
    const result = pluginConfigSchema.parse({});
    expect(result.branch).toBeUndefined();
  });

  it('defaults ciOnly to true', () => {
    const result = pluginConfigSchema.parse({});
    expect(result.ciOnly).toBe(true);
  });

  it('accepts ciOnly: false', () => {
    const result = pluginConfigSchema.parse({ ciOnly: false });
    expect(result.ciOnly).toBe(false);
  });

  it('accepts showTriggeredBy as true', () => {
    const result = pluginConfigSchema.parse({ showTriggeredBy: true });
    expect(result.showTriggeredBy).toBe(true);
  });

  it('accepts showTriggeredBy as new structured format with users and onFailure', () => {
    const result = pluginConfigSchema.parse({
      showTriggeredBy: {
        users: { alice: '<@U111>', bob: '<@U222>' },
        onFailure: true,
      },
    });
    expect(result.showTriggeredBy).toEqual({
      users: { alice: '<@U111>', bob: '<@U222>' },
      onFailure: true,
    });
  });

  it('migrates deprecated flat showTriggeredBy mapping to { users, onFailure }', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mapping = { alice: '<@U111>', bob: '<@U222>' };
    const result = pluginConfigSchema.parse({ showTriggeredBy: mapping });
    expect(result.showTriggeredBy).toEqual({
      users: { alice: '<@U111>', bob: '<@U222>' },
      onFailure: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('flat'));
    warnSpy.mockRestore();
  });

  it('defaults showTriggeredBy to false', () => {
    const result = pluginConfigSchema.parse({});
    expect(result.showTriggeredBy).toBe(false);
  });

  it('rejects invalid sendResults value', () => {
    expect(() => pluginConfigSchema.parse({ sendResults: 'never' })).toThrow();
  });

  it('defaults reminderPlacement to inline', () => {
    const result = pluginConfigSchema.parse({
      channels: {
        slack: {
          token: 'xoxb-test',
          channels: ['#qa'],
        },
      },
    });
    expect(result.channels.slack?.reminderPlacement).toBe('inline');
  });

  it('accepts reminderPlacement thread', () => {
    const result = pluginConfigSchema.parse({
      channels: {
        slack: {
          token: 'xoxb-test',
          channels: ['#qa'],
          reminderPlacement: 'thread',
        },
      },
    });
    expect(result.channels.slack?.reminderPlacement).toBe('thread');
  });

  it('rejects invalid reminderPlacement value', () => {
    expect(() =>
      pluginConfigSchema.parse({
        channels: {
          slack: {
            token: 'xoxb-test',
            channels: ['#qa'],
            reminderPlacement: 'sidebar',
          },
        },
      }),
    ).toThrow();
  });

  it('accepts expectedShards as positive integer', () => {
    const result = pluginConfigSchema.parse({ expectedShards: 4 });
    expect(result.expectedShards).toBe(4);
  });

  it('defaults expectedShards to undefined', () => {
    const result = pluginConfigSchema.parse({});
    expect(result.expectedShards).toBeUndefined();
  });

  it('rejects expectedShards as 0 or negative', () => {
    expect(() => pluginConfigSchema.parse({ expectedShards: 0 })).toThrow();
    expect(() => pluginConfigSchema.parse({ expectedShards: -1 })).toThrow();
  });

  it('rejects expectedShards as non-integer', () => {
    expect(() => pluginConfigSchema.parse({ expectedShards: 2.5 })).toThrow();
  });

  it('parses webhook config', () => {
    const result = pluginConfigSchema.parse({
      channels: {
        webhook: {
          url: 'https://hooks.example.com/test',
          headers: { Authorization: 'Bearer token123' },
        },
      },
    });

    expect(result.channels.webhook?.url).toBe('https://hooks.example.com/test');
    expect(result.channels.webhook?.method).toBe('POST');
  });
});
