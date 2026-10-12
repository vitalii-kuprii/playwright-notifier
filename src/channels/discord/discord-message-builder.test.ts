import { describe, it, expect } from 'vitest';
import { buildDiscordPayload } from './discord-message-builder';
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
    meta: [
      { key: 'Branch', value: 'main' },
    ],
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

const defaultDiscordConfig = { webhookUrl: 'https://discord.com/api/webhooks/123/abc', mentionOnFailure: [] as string[] };
const defaultPluginConfig = pluginConfigSchema.parse({
  projectName: 'MyApp E2E',
  environment: 'staging',
});

describe('buildDiscordPayload', () => {
  describe('passed pipeline', () => {
    it('builds correct payload structure', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0].title).toContain('✅ MyApp E2E pipeline passed');
      expect(payload.embeds[0].color).toBe(0x36a64f);
    });

    it('shows pipeline link in title', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].title).toContain('[#11359](https://github.com/org/repo/actions/runs/11359)');
    });

    it('sets embed url to CI run URL', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].url).toBe('https://github.com/org/repo/actions/runs/11359');
    });

    it('shows duration and view report link in description', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].description).toContain('**2 minutes 34 seconds**');
      expect(payload.embeds[0].description).toContain('[View report](https://reports.example.com/run-123/index.html)');
    });

    it('shows success stats and meta in fields', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const fields = payload.embeds[0].fields;
      const fieldMap = Object.fromEntries(fields.map((f) => [f.name, f.value]));

      expect(fieldMap['Success']).toBe('50 out of 52 (2 skipped)');
      expect(fieldMap['Branch']).toBe('main');
      expect(fieldMap['Environment']).toBe('staging');
      expect(fieldMap['Failed']).toBeUndefined();
      expect(fieldMap['Flaky']).toBeUndefined();
    });

    it('does not show failed test cases field', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const fieldNames = payload.embeds[0].fields.map((f) => f.name);
      expect(fieldNames).not.toContain('Failed test cases');
    });

    it('does not include content when no mentions needed', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.content).toBeUndefined();
    });
  });

  describe('failed pipeline — few failures (<=5)', () => {
    const failedTests = [
      {
        name: 'should redirect after login',
        suitePath: ['Login', 'OAuth'],
        fullTitle: 'Login > OAuth > should redirect after login',
        file: 'src/tests/login.spec.ts',
        line: 42,
        status: 'failed' as const,
        duration: 12_300,
        error: "Expected 'dashboard' but got 'error-page'",
        tags: ['@auth'],
        retries: 0,
        browser: 'chromium',
      },
      {
        name: 'payment timeout handling',
        suitePath: ['Checkout'],
        fullTitle: 'Checkout > payment timeout handling',
        file: 'src/tests/checkout.spec.ts',
        line: 88,
        status: 'failed' as const,
        duration: 45_100,
        error: 'Timeout 30000ms exceeded',
        tags: [],
        retries: 0,
        browser: 'chromium',
      },
    ];

    it('shows red color and failed status', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests,
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].title).toContain('❌');
      expect(payload.embeds[0].color).toBe(0xe01e5a);
    });

    it('shows Failed column in fields', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests,
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const fieldNames = payload.embeds[0].fields.map((f) => f.name);
      expect(fieldNames).toContain('Failed');
    });

    it('lists failed test names with suitePath as numbered list', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests,
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('Failed test cases');
      expect(allText).toContain('1. Login > OAuth > should redirect after login');
      expect(allText).toContain('2. Checkout > payment timeout handling');
    });
  });

  describe('failed pipeline — too many failures (>5)', () => {
    const manyFailures = Array.from({ length: 9 }, (_, i) => ({
      name: `failing test ${i + 1}`,
      suitePath: ['Suite'],
      fullTitle: `Suite > failing test ${i + 1}`,
      file: `src/tests/test-${i}.spec.ts`,
      line: 10 + i,
      status: 'failed' as const,
      duration: 1000,
      error: `Error in test ${i + 1}`,
      tags: [],
      retries: 0,
      browser: 'chromium',
    }));

    it('shows "too many failures" message instead of listing tests', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 43, failed: 9, skipped: 0, flaky: 0, total: 52 },
        failedTests: manyFailures,
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('Too many failures to display here 🙄');
      expect(allText).toContain('View report');
      expect(allText).not.toContain('failing test 1');
    });
  });

  describe('flaky tests', () => {
    it('shows flaky field with numbered list when flaky.show is true', () => {
      const summary = baseSummary({
        status: 'flaky',
        stats: { passed: 50, failed: 0, skipped: 2, flaky: 1, total: 53 },
        flakyTests: [{
          name: 'date range filter',
          suitePath: ['Search', 'Filters'],
          fullTitle: 'Search > Filters > date range filter',
          file: 'src/tests/search.spec.ts',
          line: 67,
          status: 'flaky',
          duration: 5000,
          tags: [],
          retries: 2,
          browser: 'chromium',
        }],
      });

      const config = pluginConfigSchema.parse({ flaky: { show: true } });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, config);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('Flaky tests (1)');
      expect(allText).toContain('1. Search > Filters > date range filter');
      expect(allText).toContain('retried 2x');
      expect(payload.embeds[0].color).toBe(0xf2c744);
    });

    it('hides flaky field when flaky.show is false', () => {
      const summary = baseSummary({
        flakyTests: [{
          name: 'flaky test',
          suitePath: [],
          fullTitle: 'flaky test',
          file: 'test.spec.ts',
          line: 1,
          status: 'flaky',
          duration: 1000,
          tags: [],
          retries: 1,
          browser: 'chromium',
        }],
      });

      const config = pluginConfigSchema.parse({ flaky: { show: false } });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, config);

      const allText = JSON.stringify(payload);
      expect(allText).not.toContain('Flaky tests (');
      expect(allText).not.toContain('retried');
    });
  });

  describe('mentions', () => {
    it('includes mentions in content on failure', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests: [{
          name: 'test', suitePath: [], fullTitle: 'test',
          file: 'test.spec.ts', line: 1, status: 'failed',
          duration: 1000, error: 'fail', tags: [], retries: 0, browser: 'chromium',
        }],
      });

      const discordConfig = {
        ...defaultDiscordConfig,
        mentionOnFailure: ['<@123456>', '<@&789>'],
      };
      const payload = buildDiscordPayload(summary, discordConfig, defaultPluginConfig);

      expect(payload.content).toBe('<@123456> <@&789>');
    });

    it('does not include mentions on success', () => {
      const summary = baseSummary();
      const discordConfig = {
        ...defaultDiscordConfig,
        mentionOnFailure: ['<@123456>'],
      };
      const payload = buildDiscordPayload(summary, discordConfig, defaultPluginConfig);

      expect(payload.content).toBeUndefined();
    });
  });

  describe('reminders', () => {
    it('shows single reminder in description', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'test.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
        ],
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].description).toContain('🔔');
      expect(payload.embeds[0].description).toContain('**1 reminder due**');
      expect(payload.embeds[0].description).toContain('`old test` (7d overdue)');
    });

    it('shows single reminder with "due today" for daysOverdue === 0', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'today test', file: 'test.spec.ts', remindDate: new Date('2026-03-09'), daysOverdue: 0 },
        ],
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].description).toContain('due today');
    });

    it('shows multiple reminders as a field with numbered list', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'test.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
          { testName: 'today test', file: 'test2.spec.ts', remindDate: new Date('2026-03-09'), daysOverdue: 0 },
        ],
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const reminderField = payload.embeds[0].fields.find((f) => f.name.includes('Reminders'));
      expect(reminderField).toBeDefined();
      expect(reminderField!.name).toContain('Reminders (2)');
      expect(reminderField!.value).toContain('1. old test — Overdue 7 days');
      expect(reminderField!.value).toContain('2. today test — Take a look today');

      // Single reminder should NOT appear in description when there are 2+
      expect(payload.embeds[0].description).not.toContain('🔔');
    });

    it('caps multiple reminders at maxFailures and shows +N more', () => {
      const summary = baseSummary({
        reminders: Array.from({ length: 8 }, (_, i) => ({
          testName: `test${i + 1}`,
          file: `t${i}.spec.ts`,
          remindDate: new Date('2026-03-01'),
          daysOverdue: i + 1,
        })),
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const reminderField = payload.embeds[0].fields.find((f) => f.name.includes('Reminders'));
      expect(reminderField).toBeDefined();
      expect(reminderField!.name).toContain('Reminders (8)');
      expect(reminderField!.value).toContain('1. test1');
      expect(reminderField!.value).toContain('5. test5');
      expect(reminderField!.value).not.toContain('6. test6');
      expect(reminderField!.value).toContain('+3 more');
    });

    it('hides reminders when reminders.show is false', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'test.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
        ],
      });
      const config = pluginConfigSchema.parse({ reminders: { show: false } });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, config);

      const allText = JSON.stringify(payload);
      expect(allText).not.toContain('🔔');
    });
  });

  describe('on-call and owners', () => {
    it('shows on-call mention in content on failure', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 1, skipped: 0, flaky: 0, total: 49 },
        failedTests: [{
          name: 'test', suitePath: [], fullTitle: 'test',
          file: 'test.spec.ts', line: 1, status: 'failed',
          duration: 1000, error: 'fail', tags: [], retries: 0, browser: 'chromium',
        }],
        onCall: { name: 'alice', slack: '<@U111>', isOnCall: true },
      });
      const config = pluginConfigSchema.parse({ rotation: { startDate: '2026-01-01', members: [{ name: 'alice' }] } });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, config);

      expect(payload.content).toBe('<@U111>');
    });

    it('shows on-call name when no slack handle', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 1, skipped: 0, flaky: 0, total: 49 },
        failedTests: [{
          name: 'test', suitePath: [], fullTitle: 'test',
          file: 'test.spec.ts', line: 1, status: 'failed',
          duration: 1000, error: 'fail', tags: [], retries: 0, browser: 'chromium',
        }],
        onCall: { name: 'alice', isOnCall: true },
      });
      const config = pluginConfigSchema.parse({ rotation: { startDate: '2026-01-01', members: [{ name: 'alice' }] } });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, config);

      expect(payload.content).toBe('alice');
    });

    it('does not include mentions on success', () => {
      const summary = baseSummary({
        onCall: { name: 'alice', slack: '<@U111>', isOnCall: true },
      });
      const config = pluginConfigSchema.parse({ rotation: { startDate: '2026-01-01', members: [{ name: 'alice' }] } });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, config);

      expect(payload.content).toBeUndefined();
    });

    it('on-call overrides mentionOnFailure', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 1, skipped: 0, flaky: 0, total: 49 },
        failedTests: [{
          name: 'test', suitePath: [], fullTitle: 'test',
          file: 'test.spec.ts', line: 1, status: 'failed',
          duration: 1000, error: 'fail', tags: [], retries: 0, browser: 'chromium',
        }],
        onCall: { name: 'bob', slack: '<@U222>', isOnCall: true },
      });
      const discordConfig = { ...defaultDiscordConfig, mentionOnFailure: ['<@999>'] };
      const config = pluginConfigSchema.parse({ rotation: { startDate: '2026-01-01', members: [{ name: 'bob' }] } });
      const payload = buildDiscordPayload(summary, discordConfig, config);

      expect(payload.content).toBe('<@U222>');
      expect(payload.content).not.toContain('<@999>');
    });

    it('shows owner annotations on failed test names', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 0, flaky: 0, total: 50 },
        failedTests: [
          {
            name: 'login test', suitePath: [], fullTitle: 'login test',
            file: 'login.spec.ts', line: 1, status: 'failed',
            duration: 1000, error: 'fail', tags: ['@owner(alice)'], retries: 0, browser: 'chromium',
          },
          {
            name: 'checkout test', suitePath: [], fullTitle: 'checkout test',
            file: 'checkout.spec.ts', line: 1, status: 'failed',
            duration: 1000, error: 'fail', tags: [], retries: 0, browser: 'chromium',
          },
        ],
        owners: [
          { testName: 'login test', file: 'login.spec.ts', owner: { name: 'alice', slack: '<@U111>', isOnCall: false } },
        ],
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('1. login test (<@U111>)');
      expect(allText).toContain('2. checkout test');
      expect(allText).not.toContain('2. checkout test (');
    });
  });

  describe('triggered by', () => {
    it('shows triggered by user in fields', () => {
      const summary = baseSummary({ triggeredBy: 'alice' });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const field = payload.embeds[0].fields.find((f) => f.name === 'Triggered by');
      expect(field?.value).toBe('alice');
    });

    it('does not show triggered by when not set', () => {
      const summary = baseSummary({ triggeredBy: undefined });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const fieldNames = payload.embeds[0].fields.map((f) => f.name);
      expect(fieldNames).not.toContain('Triggered by');
    });
  });

  describe('PR/MR link', () => {
    it('shows PR link in title for GitHub PRs', () => {
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
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].title).toMatch(/MyApp E2E pipeline.*#9876.*passed for.*PR #42/);
    });

    it('shows MR link for GitLab MRs', () => {
      const summary = baseSummary({
        ci: {
          provider: 'gitlab',
          branch: 'feature/login',
          runId: '555',
          runUrl: 'https://gitlab.com/org/repo/-/pipelines/555',
          pullRequestNumber: '99',
          pullRequestUrl: 'https://gitlab.com/org/repo/-/merge_requests/99',
        },
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].title).toMatch(/pipeline.*#555.*passed for.*MR !99/);
    });

    it('does not show PR link when not in PR context', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].title).not.toContain('for');
    });
  });

  describe('interrupted/timedout runs', () => {
    it('shows "was cancelled" title when run is interrupted', () => {
      const summary = baseSummary({
        status: 'passed',
        runStatus: 'interrupted',
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].title).toContain('❌');
      expect(payload.embeds[0].title).toContain('was cancelled');
      expect(payload.embeds[0].color).toBe(0xe01e5a);
    });

    it('shows "timed out" title when run times out', () => {
      const summary = baseSummary({
        status: 'failed',
        runStatus: 'timedout',
        stats: { passed: 10, failed: 2, skipped: 0, flaky: 0, total: 12 },
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].title).toContain('❌');
      expect(payload.embeds[0].title).toContain('timed out');
      expect(payload.embeds[0].color).toBe(0xe01e5a);
    });
  });

  describe('edge cases', () => {
    it('handles no CI context', () => {
      const summary = baseSummary({ ci: undefined });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].title).toContain('MyApp E2E pipeline passed');
      expect(payload.embeds[0].url).toBeUndefined();
    });

    it('falls back to artifacts URL when no report URL on GitHub', () => {
      const summary = baseSummary({ reportUrl: undefined });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].description).toContain('View report');
      expect(payload.embeds[0].description).toContain('actions/runs/11359#artifacts');
    });

    it('handles no report URL and no CI context', () => {
      const summary = baseSummary({ reportUrl: undefined, ci: undefined });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].description).not.toContain('View report');
    });

    it('handles zero skipped', () => {
      const summary = baseSummary({
        stats: { passed: 50, failed: 0, skipped: 0, flaky: 0, total: 50 },
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      const successField = payload.embeds[0].fields.find((f) => f.name === 'Success');
      expect(successField?.value).toBe('50 out of 50');
      expect(successField?.value).not.toContain('skipped');
    });

    it('includes username and avatar_url when configured', () => {
      const summary = baseSummary();
      const discordConfig = {
        ...defaultDiscordConfig,
        username: 'Test Bot',
        avatarUrl: 'https://example.com/avatar.png',
      };
      const payload = buildDiscordPayload(summary, discordConfig, defaultPluginConfig);

      expect(payload.username).toBe('Test Bot');
      expect(payload.avatar_url).toBe('https://example.com/avatar.png');
    });

    it('does not include username and avatar_url when not configured', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.username).toBeUndefined();
      expect(payload.avatar_url).toBeUndefined();
    });
  });

  describe('missing shards warning', () => {
    it('shows shard warning in description', () => {
      const summary = baseSummary({
        status: 'failed',
        shards: { actual: 3, expected: 4 },
      });
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].description).toContain('only 3 of 4 shards reported');
      expect(payload.embeds[0].description).toContain('results are incomplete');
    });

    it('does not show shard warning when shards field is absent', () => {
      const summary = baseSummary();
      const payload = buildDiscordPayload(summary, defaultDiscordConfig, defaultPluginConfig);

      expect(payload.embeds[0].description).not.toContain('shards reported');
    });
  });
});
