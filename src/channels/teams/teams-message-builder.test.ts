import { describe, it, expect } from 'vitest';
import { buildTeamsPayload } from './teams-message-builder';
import { pluginConfigSchema } from '../../config/schema';
import type { NormalizedSummary } from '../../types';

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

const defaultTeamsConfig = {
  webhookUrl: 'https://outlook.office.com/webhook/test',
  webhookType: 'standard' as const,
  mentionOnFailure: [] as string[],
};
const defaultPluginConfig = pluginConfigSchema.parse({
  projectName: 'MyApp E2E',
  environment: 'staging',
});

describe('buildTeamsPayload', () => {
  describe('payload structure', () => {
    it('returns valid Adaptive Card wrapper', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);

      expect(payload.type).toBe('message');
      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
      expect(payload.attachments[0].content.type).toBe('AdaptiveCard');
      expect(payload.attachments[0].content.version).toBe('1.4');
    });

    it('sets msteams width to Full', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      expect(payload.attachments[0].content.msteams).toEqual({ width: 'Full' });
    });
  });

  describe('passed pipeline', () => {
    it('shows success header with green color', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('✅');
      expect(header.text).toContain('passed');
      expect(header.text).toContain('MyApp E2E');
      expect(header.color).toBe('good');
    });

    it('includes run ID in header', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];
      expect(header.text).toContain('#11359');
    });

    it('shows duration', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('2 minutes 34 seconds');
    });

    it('shows stats as FactSet', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('50 out of 52');
      expect(allText).toContain('2 skipped');
    });

    it('includes report link action', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('View Report');
      expect(allText).toContain('reports.example.com');
    });

    it('includes pipeline link action', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('View Pipeline');
      expect(allText).toContain('github.com/org/repo/actions/runs/11359');
    });
  });

  describe('failed pipeline', () => {
    it('shows failure header with attention color', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests: [
          { name: 'login test', suitePath: [], fullTitle: 'login test', file: 'login.spec.ts', line: 5, status: 'failed', duration: 1000, tags: [], retries: 0 },
        ],
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('❌');
      expect(header.text).toContain('failed');
      expect(header.color).toBe('attention');
    });

    it('shows failed test cases', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests: [
          { name: 'login test', suitePath: [], fullTitle: 'login test', file: 'login.spec.ts', line: 5, status: 'failed', duration: 1000, tags: [], retries: 0 },
          { name: 'checkout test', suitePath: ['Cart'], fullTitle: 'Cart > checkout test', file: 'cart.spec.ts', line: 10, status: 'failed', duration: 2000, tags: [], retries: 0 },
        ],
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);

      expect(allText).toContain('Failed test cases');
      expect(allText).toContain('login test');
      expect(allText).toContain('checkout test');
    });

    it('shows mentions on failure', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
      });
      const config = { ...defaultTeamsConfig, mentionOnFailure: ['john@company.com'] };
      const payload = buildTeamsPayload(summary, config, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('john@company.com');
    });

    it('shows too many failures message when exceeding maxFailures', () => {
      const tests = Array.from({ length: 6 }, (_, i) => ({
        name: `test ${i}`, suitePath: [] as string[], fullTitle: `test ${i}`, file: 'a.spec.ts', line: i, status: 'failed' as const, duration: 100, tags: [] as string[], retries: 0,
      }));
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 44, failed: 6, skipped: 2, flaky: 0, total: 52 },
        failedTests: tests,
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);

      expect(allText).toContain('Too many failures');
    });

    it('shows owner annotations on failed tests', () => {
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
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);

      expect(allText).toContain('login test');
      expect(allText).toContain('alice');
    });
  });

  describe('flaky pipeline', () => {
    it('shows success header on flaky pipeline', () => {
      const summary = baseSummary({
        status: 'flaky',
        stats: { passed: 50, failed: 0, skipped: 2, flaky: 1, total: 52 },
        flakyTests: [
          { name: 'flaky test', suitePath: [], fullTitle: 'flaky test', file: 'a.spec.ts', line: 1, status: 'flaky', duration: 500, tags: [], retries: 2 },
        ],
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('✅');
      expect(header.text).toContain('passed');
      expect(header.text).not.toContain('flaky');
      // showFlaky defaults to false → green sidebar
      expect(header.color).toBe('good');
    });

    it('shows flaky tests section when showFlaky is true', () => {
      const summary = baseSummary({
        status: 'flaky',
        stats: { passed: 50, failed: 0, skipped: 2, flaky: 1, total: 52 },
        flakyTests: [
          { name: 'flaky test', suitePath: ['Suite'], fullTitle: 'Suite > flaky test', file: 'a.spec.ts', line: 1, status: 'flaky', duration: 500, tags: [], retries: 2 },
        ],
      });
      const config = pluginConfigSchema.parse({ showFlaky: true });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const allText = JSON.stringify(payload);

      expect(allText).toContain('Flaky tests');
      expect(allText).toContain('Suite > flaky test');
      expect(allText).toContain('retried 2x');
    });
  });

  describe('reminders', () => {
    it('shows reminders section', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 8 },
        ],
      });
      const config = pluginConfigSchema.parse({ showReminders: true });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const allText = JSON.stringify(payload);

      expect(allText).toContain('Reminders (1)');
      expect(allText).toContain('old test');
      expect(allText).toContain('Overdue 8 days');
    });

    it('hides reminders when showReminders is false', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 8 },
        ],
      });
      const config = pluginConfigSchema.parse({ showReminders: false });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const allText = JSON.stringify(payload);

      expect(allText).not.toContain('Reminders');
    });
  });

  describe('on-call rotation', () => {
    it('shows on-call in header on failure', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        onCall: { name: 'bob', slack: '<@U222>', isOnCall: true },
      });
      const config = pluginConfigSchema.parse({
        rotation: { startDate: '2026-01-01', members: [{ name: 'bob' }] },
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('(bob)');
      expect(header.text).not.toContain('on-call');
    });

    it('does not show on-call on passed pipeline', () => {
      const summary = baseSummary({
        onCall: { name: 'bob', slack: '<@U222>', isOnCall: true },
      });
      const config = pluginConfigSchema.parse({
        rotation: { startDate: '2026-01-01', members: [{ name: 'bob' }] },
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).not.toContain('bob');
    });

    it('on-call overrides mentionOnFailure', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        onCall: { name: 'bob', slack: '<@U222>', isOnCall: true },
      });
      const teamsConfig = { ...defaultTeamsConfig, mentionOnFailure: ['john@company.com'] };
      const config = pluginConfigSchema.parse({
        rotation: { startDate: '2026-01-01', members: [{ name: 'bob' }] },
      });
      const payload = buildTeamsPayload(summary, teamsConfig, config);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('(bob)');
      expect(header.text).not.toContain('john@company.com');
    });
  });

  describe('meta', () => {
    it('shows meta entries', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('Branch');
      expect(allText).toContain('main');
    });

    it('shows environment when not default', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('Environment');
      expect(allText).toContain('staging');
    });
  });

  describe('edge cases', () => {
    it('handles no CI context', () => {
      const summary = baseSummary({ ci: undefined });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);

      expect(payload.attachments[0].content.body[0].text).toContain('MyApp E2E');
      expect(payload.attachments[0].content.body[0].text).not.toContain('#');
    });

    it('handles no report URL', () => {
      const summary = baseSummary({ reportUrl: undefined });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);

      expect(allText).not.toContain('View Report');
    });

    it('handles no meta entries', () => {
      const summary = baseSummary({ meta: [], environment: 'default' });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      // Should not throw
      expect(payload.attachments).toHaveLength(1);
    });
  });
});
