import { describe, it, expect } from 'vitest';
import { buildEmailContent, interpolateSubject } from './email-template-builder';
import { pluginConfigSchema } from '../../config/schema';
import type { NormalizedSummary } from '../../types';

const smtpFixture = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: { user: 'test@example.com', pass: 'secret' },
};

function baseSummary(overrides?: Partial<NormalizedSummary>): NormalizedSummary {
  return {
    projectName: 'MyApp E2E',
    environment: 'staging',
    status: 'passed',
    stats: { passed: 50, failed: 0, skipped: 2, flaky: 0, total: 52 },
    duration: 154_000,
    startedAt: new Date('2026-03-06T10:00:00Z'),
    finishedAt: new Date('2026-03-06T10:02:34Z'),
    tests: [],
    failedTests: [],
    flakyTests: [],
    skippedTests: [],
    passedTests: [],
    reminders: [],
    owners: [],
    meta: [{ key: 'Branch', value: 'main' }],
    ci: {
      provider: 'github',
      branch: 'main',
      runId: '11359',
      runUrl: 'https://github.com/org/repo/actions/runs/11359',
      actor: 'alice',
      pipelineName: 'E2E Tests',
    },
    reportUrl: 'https://reports.example.com/run-123/index.html',
    ...overrides,
  };
}

function makePluginConfig(overrides?: Record<string, unknown>) {
  const { subject, ...pluginOverrides } = overrides ?? {};
  return pluginConfigSchema.parse({
    projectName: 'MyApp E2E',
    environment: 'staging',
    ...pluginOverrides,
    channels: {
      email: {
        to: ['team@example.com'],
        smtp: smtpFixture,
        ...(subject !== undefined ? { subject } : {}),
      },
    },
  });
}

describe('interpolateSubject', () => {
  it('replaces all known variables', () => {
    const result = interpolateSubject(
      '[{{status}}] {{projectName}} — {{passed}}/{{total}} passed',
      baseSummary(),
    );
    expect(result).toBe('[passed] MyApp E2E — 50/52 passed');
  });

  it('replaces unknown variables with empty string', () => {
    const result = interpolateSubject('{{unknown}} test', baseSummary());
    expect(result).toBe(' test');
  });

  it('handles failed status', () => {
    const result = interpolateSubject(
      '{{status}}: {{failed}} failures',
      baseSummary({ status: 'failed', stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 } }),
    );
    expect(result).toBe('failed: 2 failures');
  });
});

describe('buildEmailContent', () => {
  describe('subject', () => {
    it('uses default subject template with interpolation', () => {
      const config = makePluginConfig();
      const { subject } = buildEmailContent(baseSummary(), config);
      expect(subject).toBe('[passed] MyApp E2E — 50/52 passed');
    });

    it('uses custom subject template', () => {
      const config = makePluginConfig({ subject: 'Tests {{status}} for {{projectName}}' });
      const { subject } = buildEmailContent(baseSummary(), config);
      expect(subject).toBe('Tests passed for MyApp E2E');
    });
  });

  describe('HTML body - passed', () => {
    it('contains success color', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('#36a64f');
    });

    it('contains success emoji', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('✅');
    });

    it('contains project name', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('MyApp E2E');
    });

    it('contains stats', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('50 out of 52');
      expect(html).toContain('2 skipped');
    });

    it('contains duration', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('2 minutes 34 seconds');
    });

    it('contains report link', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('View report');
      expect(html).toContain('reports.example.com');
    });

    it('contains pipeline link', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('github.com/org/repo/actions/runs/11359');
    });

    it('contains meta entries', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('Branch');
      expect(html).toContain('main');
    });

    it('contains environment', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('Environment');
      expect(html).toContain('staging');
    });

    it('contains footer', () => {
      const config = makePluginConfig();
      const { html } = buildEmailContent(baseSummary(), config);
      expect(html).toContain('playwright-notify');
    });
  });

  describe('HTML body - failed', () => {
    it('contains failure color and emoji', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests: [
          { name: 'login test', suitePath: [], fullTitle: 'login test', file: 'login.spec.ts', line: 5, status: 'failed', duration: 1000, tags: [], retries: 0 },
        ],
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('#e01e5a');
      expect(html).toContain('❌');
    });

    it('lists failed tests', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests: [
          { name: 'login test', suitePath: [], fullTitle: 'login test', file: 'login.spec.ts', line: 5, status: 'failed', duration: 1000, tags: [], retries: 0 },
          { name: 'checkout test', suitePath: [], fullTitle: 'checkout test', file: 'cart.spec.ts', line: 10, status: 'failed', duration: 2000, tags: [], retries: 0 },
        ],
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('Failed test cases');
      expect(html).toContain('login test');
      expect(html).toContain('checkout test');
    });

    it('shows too many failures message', () => {
      const tests = Array.from({ length: 6 }, (_, i) => ({
        name: `test ${i}`, suitePath: [] as string[], fullTitle: `test ${i}`, file: 'a.spec.ts', line: i, status: 'failed' as const, duration: 100, tags: [] as string[], retries: 0,
      }));
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 44, failed: 6, skipped: 2, flaky: 0, total: 52 },
        failedTests: tests,
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('Too many failures');
    });

    it('shows owner on failed tests', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 49, failed: 1, skipped: 2, flaky: 0, total: 52 },
        failedTests: [
          { name: 'login test', suitePath: [], fullTitle: 'login test', file: 'login.spec.ts', line: 5, status: 'failed', duration: 1000, tags: [], retries: 0 },
        ],
        owners: [
          { testName: 'login test', file: 'login.spec.ts', owner: { name: 'alice', isOnCall: false } },
        ],
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('alice');
    });
  });

  describe('HTML body - flaky', () => {
    it('contains flaky color when showFlaky is true', () => {
      const summary = baseSummary({
        status: 'flaky',
        stats: { passed: 50, failed: 0, skipped: 2, flaky: 1, total: 52 },
        flakyTests: [
          { name: 'flaky test', suitePath: ['Suite'], fullTitle: 'Suite > flaky test', file: 'a.spec.ts', line: 1, status: 'flaky', duration: 500, tags: [], retries: 2 },
        ],
      });
      const config = makePluginConfig({ flaky: { show: true } });
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('#f2c744');
      expect(html).toContain('✅');
    });

    it('uses green color when flaky.show is false', () => {
      const summary = baseSummary({
        status: 'flaky',
        stats: { passed: 50, failed: 0, skipped: 2, flaky: 1, total: 52 },
        flakyTests: [
          { name: 'flaky test', suitePath: ['Suite'], fullTitle: 'Suite > flaky test', file: 'a.spec.ts', line: 1, status: 'flaky', duration: 500, tags: [], retries: 2 },
        ],
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('#36a64f');
      expect(html).not.toContain('Flaky tests');
    });

    it('lists flaky tests with retry count when showFlaky is true', () => {
      const summary = baseSummary({
        status: 'flaky',
        stats: { passed: 50, failed: 0, skipped: 2, flaky: 1, total: 52 },
        flakyTests: [
          { name: 'flaky test', suitePath: ['Suite'], fullTitle: 'Suite > flaky test', file: 'a.spec.ts', line: 1, status: 'flaky', duration: 500, tags: [], retries: 2 },
        ],
      });
      const config = makePluginConfig({ flaky: { show: true } });
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('Flaky tests');
      expect(html).toContain('flaky test');
      expect(html).toContain('retried 2x');
    });
  });

  describe('reminders', () => {
    it('shows reminders section', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 8 },
        ],
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('Reminders (1)');
      expect(html).toContain('old test');
      expect(html).toContain('Overdue 8 days');
    });

    it('hides reminders when showReminders is false', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 8 },
        ],
      });
      const config = pluginConfigSchema.parse({
        reminders: { show: false },
        channels: { email: { to: ['team@example.com'], smtp: smtpFixture } },
      });
      const { html } = buildEmailContent(summary, config);

      expect(html).not.toContain('Reminders');
    });
  });

  describe('triggered by', () => {
    it('shows triggered by user in meta table', () => {
      const summary = baseSummary({ triggeredBy: 'alice' });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);
      expect(html).toContain('Triggered by');
      expect(html).toContain('alice');
      // Header should NOT contain triggered by
      const headerMatch = html.match(/<h2[^>]*>.*?<\/h2>/s);
      expect(headerMatch?.[0]).not.toContain('alice');
    });

    it('does not show triggered by when not set', () => {
      const summary = baseSummary({ triggeredBy: undefined });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);
      expect(html).not.toContain('Triggered by');
    });
  });

  describe('PR/MR link', () => {
    it('shows PR link in header for GitHub PRs', () => {
      const summary = baseSummary({
        ci: {
          provider: 'github',
          branch: 'feature/login',
          runId: '9876',
          runUrl: 'https://github.com/org/repo/actions/runs/9876',
          pullRequestNumber: '42',
          pullRequestUrl: 'https://github.com/org/repo/pull/42',
        },
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);
      expect(html).toContain('PR #42');
      expect(html).toContain('href="https://github.com/org/repo/pull/42"');
    });

    it('shows MR link for GitLab MRs', () => {
      const summary = baseSummary({
        ci: {
          provider: 'gitlab',
          branch: 'feature/login',
          runId: '555',
          pullRequestNumber: '99',
          pullRequestUrl: 'https://gitlab.com/org/repo/-/merge_requests/99',
        },
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);
      expect(html).toContain('MR !99');
      expect(html).toContain('href="https://gitlab.com/org/repo/-/merge_requests/99"');
    });
  });

  describe('edge cases', () => {
    it('handles no CI context', () => {
      const summary = baseSummary({ ci: undefined });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).toContain('MyApp E2E');
      expect(html).not.toContain('#11359');
    });

    it('handles no report URL', () => {
      const summary = baseSummary({ reportUrl: undefined });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).not.toContain('View report');
    });

    it('handles default environment (hidden)', () => {
      const summary = baseSummary({ environment: 'default', meta: [] });
      const config = pluginConfigSchema.parse({
        channels: { email: { to: ['team@example.com'], smtp: smtpFixture } },
      });
      const { html } = buildEmailContent(summary, config);

      expect(html).not.toContain('Environment');
    });

    it('escapes HTML entities in test names', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 49, failed: 1, skipped: 2, flaky: 0, total: 52 },
        failedTests: [
          { name: '<script>alert("xss")</script>', suitePath: [], fullTitle: '<script>', file: 'a.spec.ts', line: 1, status: 'failed', duration: 100, tags: [], retries: 0 },
        ],
      });
      const config = makePluginConfig();
      const { html } = buildEmailContent(summary, config);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
