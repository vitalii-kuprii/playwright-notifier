import { describe, it, expect } from 'vitest';
import { buildTeamsPayload } from './teams-message-builder';
import { pluginConfigSchema } from '../../config/schema';
import type { NormalizedSummary } from '../../types';

function baseSummary(overrides?: Partial<NormalizedSummary>): NormalizedSummary {
  return {
    projectName: 'MyApp E2E',
    environment: 'staging',
    status: 'passed',
    runStatus: 'passed',
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
const powerAutomateTeamsConfig = {
  ...defaultTeamsConfig,
  webhookType: 'powerautomate' as const,
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

    it('includes run ID as link in header', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];
      expect(header.text).toContain('[#11359]');
    });

    it('shows duration', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('2 minutes 34 seconds');
    });

    it('shows stats as ColumnSet grid (Issue 2)', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('50 out of 52');
      expect(allText).toContain('2 skipped');
      expect(allText).toContain('ColumnSet');
    });

    it('includes report link action', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('View Report');
      expect(allText).toContain('reports.example.com');
    });

    it('does NOT include View Pipeline button (Issue 1)', () => {
      const payload = buildTeamsPayload(baseSummary(), defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).not.toContain('View Pipeline');
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

    it('shows failed test cases with suitePath (Issue 7)', () => {
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
      expect(allText).toContain('Cart > checkout test');
    });

    it('does NOT show mentions on failure for standard webhook (Issue 11)', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
      });
      const config = { ...defaultTeamsConfig, mentionOnFailure: ['john@company.com'] };
      const payload = buildTeamsPayload(summary, config, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).not.toContain('john@company.com');
      expect(header.text).not.toContain('cc');
    });

    it('shows mentions on failure for Power Automate webhook (Issue 11)', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
      });
      const config = { ...powerAutomateTeamsConfig, mentionOnFailure: ['john@company.com'] };
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
      // flaky.show defaults to false → green sidebar
      expect(header.color).toBe('good');
    });

    it('shows flaky tests section with numbered list when flaky.show is true (Issue 13)', () => {
      const summary = baseSummary({
        status: 'flaky',
        stats: { passed: 50, failed: 0, skipped: 2, flaky: 1, total: 52 },
        flakyTests: [
          { name: 'flaky test', suitePath: ['Suite'], fullTitle: 'Suite > flaky test', file: 'a.spec.ts', line: 1, status: 'flaky', duration: 500, tags: [], retries: 2 },
        ],
      });
      const config = pluginConfigSchema.parse({ flaky: { show: true } });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const allText = JSON.stringify(payload);

      expect(allText).toContain('Flaky tests');
      expect(allText).toContain('1. Suite > flaky test');
      expect(allText).toContain('retried 2x');
      // Should NOT contain ⟳
      expect(allText).not.toContain('⟳');
    });

    it('flaky "too many" message includes View report link', () => {
      const flakyTests = Array.from({ length: 6 }, (_, i) => ({
        name: `flaky ${i}`, suitePath: [] as string[], fullTitle: `flaky ${i}`, file: 'a.spec.ts', line: i, status: 'flaky' as const, duration: 100, tags: [] as string[], retries: 2,
      }));
      const summary = baseSummary({
        status: 'flaky',
        stats: { passed: 46, failed: 0, skipped: 0, flaky: 6, total: 52 },
        flakyTests,
      });
      const config = pluginConfigSchema.parse({ flaky: { show: true } });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const allText = JSON.stringify(payload);

      expect(allText).toContain('Too many flaky tests');
      expect(allText).toContain('🙄');
      const flakyBlock = payload.attachments[0].content.body.find(
        (b) => b.text?.includes('Too many flaky tests'),
      );
      expect(flakyBlock?.text).toContain('View report');
    });
  });

  describe('reminders', () => {
    it('shows single reminder inline after duration (Issue 6)', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 8 },
        ],
      });
      const config = pluginConfigSchema.parse({ reminders: { show: true } });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const allText = JSON.stringify(payload);

      // Single reminder should be inline, not in bottom section
      expect(allText).toContain('1 reminder due');
      expect(allText).toContain('old test');
      expect(allText).toContain('8d overdue');
      // Should NOT have the bottom "Reminders (1)" section
      expect(allText).not.toContain('Reminders (1)');
    });

    it('shows multiple reminders as bottom section', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 8 },
          { testName: 'another test', file: 'b.spec.ts', remindDate: new Date('2026-03-05'), daysOverdue: 4 },
        ],
      });
      const config = pluginConfigSchema.parse({ reminders: { show: true } });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const allText = JSON.stringify(payload);

      expect(allText).toContain('Reminders (2)');
      expect(allText).toContain('old test');
      expect(allText).toContain('another test');
    });

    it('hides reminders when reminders.show is false', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 8 },
        ],
      });
      const config = pluginConfigSchema.parse({ reminders: { show: false } });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, config);
      const allText = JSON.stringify(payload);

      expect(allText).not.toContain('Reminders');
      expect(allText).not.toContain('reminder due');
    });
  });

  describe('on-call rotation', () => {
    it('shows on-call in header on failure for Power Automate webhook', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        onCall: { name: 'bob', slack: '<@U222>', isOnCall: true },
      });
      const config = pluginConfigSchema.parse({
        rotation: { startDate: '2026-01-01', members: [{ name: 'bob' }] },
      });
      const payload = buildTeamsPayload(summary, powerAutomateTeamsConfig, config);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('(bob)');
    });

    it('does NOT show on-call in header for standard webhook (Issue 11)', () => {
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

      expect(header.text).not.toContain('bob');
    });

    it('does not show on-call on passed pipeline', () => {
      const summary = baseSummary({
        onCall: { name: 'bob', slack: '<@U222>', isOnCall: true },
      });
      const config = pluginConfigSchema.parse({
        rotation: { startDate: '2026-01-01', members: [{ name: 'bob' }] },
      });
      const payload = buildTeamsPayload(summary, powerAutomateTeamsConfig, config);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).not.toContain('bob');
    });

    it('on-call overrides mentionOnFailure for Power Automate', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        onCall: { name: 'bob', slack: '<@U222>', isOnCall: true },
      });
      const teamsConfig = { ...powerAutomateTeamsConfig, mentionOnFailure: ['john@company.com'] };
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

  describe('triggered by', () => {
    it('shows triggered by user in stats grid', () => {
      const summary = baseSummary({ triggeredBy: 'alice' });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).toContain('Triggered by');
      expect(allText).toContain('alice');
      // Header should NOT contain triggered by
      const header = payload.attachments[0].content.body[0];
      expect(header.text).not.toContain('alice');
    });

    it('does not show triggered by when not set', () => {
      const summary = baseSummary({ triggeredBy: undefined });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);
      expect(allText).not.toContain('Triggered by');
    });
  });

  describe('PR/MR link', () => {
    it('shows PR link in header with reordered words', () => {
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
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];
      // Word order: MyApp E2E pipeline #runId passed for PR #42
      expect(header.text).toMatch(/MyApp E2E pipeline.*#9876.*passed for.*PR #42/);
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
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];
      expect(header.text).toMatch(/MyApp E2E pipeline.*#555.*passed for.*MR !99/);
    });
  });

  describe('interrupted/timedout runs', () => {
    it('shows "was cancelled" header when run is interrupted', () => {
      const summary = baseSummary({ status: 'passed', runStatus: 'interrupted' });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('❌');
      expect(header.text).toContain('was cancelled');
      expect(header.color).toBe('attention');
    });

    it('shows "was cancelled" with PR link when run is interrupted', () => {
      const summary = baseSummary({
        status: 'passed',
        runStatus: 'interrupted',
        ci: {
          provider: 'github',
          branch: 'feature/login',
          runId: '24078326715',
          runUrl: 'https://github.com/org/repo/actions/runs/24078326715',
          pullRequestNumber: '1155',
          pullRequestUrl: 'https://github.com/org/repo/pull/1155',
          actor: 'vkuprii',
        },
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toMatch(/❌.*pipeline.*#24078326715.*was cancelled for.*PR #1155/);
    });

    it('shows "timed out" header when run times out', () => {
      const summary = baseSummary({ status: 'failed', runStatus: 'timedout' });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toContain('❌');
      expect(header.text).toContain('timed out');
      expect(header.color).toBe('attention');
    });

    it('shows "timed out" with PR link when run times out', () => {
      const summary = baseSummary({
        status: 'failed',
        runStatus: 'timedout',
        ci: {
          provider: 'github',
          branch: 'feature/login',
          runId: '24078326715',
          runUrl: 'https://github.com/org/repo/actions/runs/24078326715',
          pullRequestNumber: '1155',
          pullRequestUrl: 'https://github.com/org/repo/pull/1155',
          actor: 'vkuprii',
        },
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const header = payload.attachments[0].content.body[0];

      expect(header.text).toMatch(/❌.*pipeline.*#24078326715.*timed out for.*PR #1155/);
    });
  });

  describe('edge cases', () => {
    it('handles no CI context', () => {
      const summary = baseSummary({ ci: undefined });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);

      expect(payload.attachments[0].content.body[0].text).toContain('MyApp E2E pipeline passed');
      // No run link when no CI context
      expect(payload.attachments[0].content.body[0].text).not.toContain('#11359');
    });

    it('handles no report URL — falls back to CI runUrl', () => {
      const summary = baseSummary({ reportUrl: undefined });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);

      // Should fall back to ci.runUrl#artifacts for GitHub
      expect(allText).toContain('View report');
      expect(allText).toContain('View Report');
      expect(allText).toContain('github.com/org/repo/actions/runs/11359#artifacts');
    });

    it('handles no report URL and no CI context', () => {
      const summary = baseSummary({ reportUrl: undefined, ci: undefined });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      const allText = JSON.stringify(payload);

      expect(allText).not.toContain('View Report');
      expect(allText).not.toContain('View report');
    });

    it('handles no meta entries', () => {
      const summary = baseSummary({ meta: [], environment: 'default' });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);
      // Should not throw
      expect(payload.attachments).toHaveLength(1);
    });
  });

  describe('missing shards warning', () => {
    it('shows shard warning when shards are missing', () => {
      const summary = baseSummary({
        status: 'failed',
        shards: { actual: 3, expected: 4 },
      });
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('only 3 of 4 shards reported');
      expect(allText).toContain('results are incomplete');
    });

    it('does not show shard warning when shards field is absent', () => {
      const summary = baseSummary();
      const payload = buildTeamsPayload(summary, defaultTeamsConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).not.toContain('shards reported');
    });
  });
});
