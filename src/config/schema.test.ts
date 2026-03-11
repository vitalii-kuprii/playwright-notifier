import { describe, it, expect } from 'vitest';
import { pluginConfigSchema } from './schema';

describe('pluginConfigSchema', () => {
  it('applies defaults for minimal config', () => {
    const result = pluginConfigSchema.parse({});
    expect(result.sendResults).toBe('always');
    expect(result.projectName).toBeUndefined();
    expect(result.environment).toBe('default');
    expect(result.channels).toEqual({});
    expect(result.meta).toEqual([]);
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

  it('defaults showReminders to true', () => {
    const result = pluginConfigSchema.parse({});
    expect(result.showReminders).toBe(true);
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

  it('accepts showTriggeredBy as a mapping object', () => {
    const mapping = { alice: '<@U111>', bob: '<@U222>' };
    const result = pluginConfigSchema.parse({ showTriggeredBy: mapping });
    expect(result.showTriggeredBy).toEqual(mapping);
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
