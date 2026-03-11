import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaywrightNotifyReporter } from './reporter';
import { ChannelManager } from './channels/channel-manager';

vi.mock('./channels/channel-manager');

describe('PlaywrightNotifyReporter', () => {
  it('instantiates with default config', () => {
    const reporter = new PlaywrightNotifyReporter();
    expect(reporter).toBeInstanceOf(PlaywrightNotifyReporter);
  });

  it('instantiates with custom config', () => {
    const reporter = new PlaywrightNotifyReporter({
      projectName: 'MyApp',
      environment: 'production',
      sendResults: 'on-failure',
    });
    expect(reporter).toBeInstanceOf(PlaywrightNotifyReporter);
  });

  it('rejects invalid config', () => {
    expect(
      () => new PlaywrightNotifyReporter({ sendResults: 'invalid' as 'always' }),
    ).toThrow();
  });

  describe('ciOnly', () => {
    const originalCI = process.env.CI;

    beforeEach(() => {
      vi.mocked(ChannelManager.prototype.sendAll).mockResolvedValue();
    });

    afterEach(() => {
      if (originalCI === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCI;
      }
    });

    it('does not send when ciOnly is true (default) and CI env is not set', async () => {
      delete process.env.CI;
      const reporter = new PlaywrightNotifyReporter({ ciOnly: true });
      reporter.onBegin({ projects: [] } as any, { allTests: () => [] } as any);
      await reporter.onEnd({ status: 'passed' } as any);
      expect(ChannelManager.prototype.sendAll).not.toHaveBeenCalled();
    });

    it('sends when ciOnly is true and CI env is set', async () => {
      process.env.CI = 'true';
      const reporter = new PlaywrightNotifyReporter({ ciOnly: true });
      reporter.onBegin({ projects: [] } as any, { allTests: () => [] } as any);
      await reporter.onEnd({ status: 'passed' } as any);
      expect(ChannelManager.prototype.sendAll).toHaveBeenCalled();
    });

    it('sends when ciOnly is false regardless of CI env', async () => {
      delete process.env.CI;
      const reporter = new PlaywrightNotifyReporter({ ciOnly: false });
      reporter.onBegin({ projects: [] } as any, { allTests: () => [] } as any);
      await reporter.onEnd({ status: 'passed' } as any);
      expect(ChannelManager.prototype.sendAll).toHaveBeenCalled();
    });
  });
});
