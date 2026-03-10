import { describe, it, expect } from 'vitest';
import { PlaywrightNotifyReporter } from './reporter';

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
});
