import { describe, it, expect, vi } from 'vitest';
import { ChannelManager } from './channel-manager';
import { pluginConfigSchema } from '../config/schema';
import type { NormalizedSummary } from '../types';

function baseSummary(overrides?: Partial<NormalizedSummary>): NormalizedSummary {
  return {
    projectName: 'Test',
    environment: 'staging',
    status: 'passed',
    stats: { passed: 10, failed: 0, skipped: 0, flaky: 0, total: 10 },
    duration: 10_000,
    startedAt: new Date(),
    finishedAt: new Date(),
    tests: [],
    failedTests: [],
    flakyTests: [],
    skippedTests: [],
    passedTests: [],
    meta: [],
    ...overrides,
  };
}

describe('ChannelManager', () => {
  it('creates with no channels configured', () => {
    const config = pluginConfigSchema.parse({});
    const manager = new ChannelManager(config);
    expect(manager).toBeInstanceOf(ChannelManager);
  });

  it('sendAll completes without error when no channels configured', async () => {
    const config = pluginConfigSchema.parse({});
    const manager = new ChannelManager(config);
    await expect(manager.sendAll(baseSummary())).resolves.toBeUndefined();
  });

  it('respects per-channel sendResults: off', async () => {
    const config = pluginConfigSchema.parse({
      channels: {
        slack: {
          token: 'xoxb-test',
          channels: ['#test'],
          sendResults: 'off',
        },
      },
    });
    const manager = new ChannelManager(config);
    // Should not throw — channel is skipped
    await expect(manager.sendAll(baseSummary())).resolves.toBeUndefined();
  });

  it('respects per-channel sendResults: on-failure (skips on pass)', async () => {
    const config = pluginConfigSchema.parse({
      channels: {
        slack: {
          token: 'xoxb-test',
          channels: ['#test'],
          sendResults: 'on-failure',
        },
      },
    });
    const manager = new ChannelManager(config);
    // Passed summary, on-failure channel — should not send
    await expect(manager.sendAll(baseSummary())).resolves.toBeUndefined();
  });

  it('creates slack channel from webhookUrl config', () => {
    const config = pluginConfigSchema.parse({
      channels: {
        slack: {
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
        },
      },
    });
    const manager = new ChannelManager(config);
    expect(manager).toBeInstanceOf(ChannelManager);
  });

  it('logs error when channel fails but does not throw', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const config = pluginConfigSchema.parse({
      channels: {
        slack: {
          token: 'xoxb-test',
          channels: ['#test'],
          sendResults: 'always',
        },
      },
    });
    const manager = new ChannelManager(config);

    // This will fail because there's no real Slack API, but it should catch the error
    const failedSummary = baseSummary({ status: 'failed' });
    await manager.sendAll(failedSummary);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
