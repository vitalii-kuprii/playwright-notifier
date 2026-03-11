import { describe, it, expect } from 'vitest';
import { buildSlackPayload, buildReminderThreadPayload } from './slack-message-builder';
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

const defaultSlackConfig = { channels: ['#qa'], threads: false, mentionOnFailure: [] as string[], reminderPlacement: 'inline' as const };
const defaultPluginConfig = pluginConfigSchema.parse({
  projectName: 'MyApp E2E',
  environment: 'staging',
});

describe('buildSlackPayload', () => {
  describe('passed pipeline', () => {
    it('builds correct payload structure', () => {
      const summary = baseSummary();
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].fallback).toContain('✅ MyApp E2E pipeline passed');
      expect(payload.attachments[0].color).toBe('#36a64f');
    });

    it('shows pipeline link in header', () => {
      const summary = baseSummary();
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toContain('✅ MyApp E2E pipeline passed');
      expect(headerBlock.text?.text).toContain('<https://github.com/org/repo/actions/runs/11359|#11359>');
    });

    it('shows duration and view report link in header', () => {
      const summary = baseSummary();
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toContain('*2 minutes 34 seconds*');
      expect(headerBlock.text?.text).toContain('*<https://reports.example.com/run-123/index.html|View report>*');
    });

    it('shows success stats with Flaky column and meta', () => {
      const summary = baseSummary();
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const statsBlock = payload.attachments[0].blocks[2]; // header, divider, stats+meta
      const fieldTexts = statsBlock.fields?.map((f) => f.text) ?? [];

      expect(fieldTexts).toContain('*Success*\n50 out of 52 (2 skipped)');
      expect(fieldTexts).toContain('*Branch*\nmain');
      expect(fieldTexts).toContain('*Environment*\nstaging');
      // Should NOT contain Failed or Flaky column when both are 0
      expect(fieldTexts.join('')).not.toContain('*Failed*');
      expect(fieldTexts.join('')).not.toContain('*Flaky*');
    });

    it('shows meta fields (Branch, Environment)', () => {
      const summary = baseSummary();
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('Branch');
      expect(allText).toContain('main');
      expect(allText).toContain('Environment');
      expect(allText).toContain('staging');
    });

    it('does not show failed test cases section', () => {
      const summary = baseSummary();
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).not.toContain('Failed test cases');
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
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      expect(payload.attachments[0].fallback).toContain('❌');
      expect(payload.attachments[0].color).toBe('#e01e5a');
    });

    it('shows Failed column in stats', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests,
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('*Failed*');
    });

    it('lists failed test names as numbered list', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests,
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('Failed test cases');
      expect(allText).toContain('1. should redirect after login');
      expect(allText).toContain('2. payment timeout handling');
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
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('Too many failures to display here 🙄');
      expect(allText).toContain('View report');
      // Should NOT list individual tests
      expect(allText).not.toContain('failing test 1');
    });
  });

  describe('flaky tests', () => {
    it('shows flaky section when showFlaky is true', () => {
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

      const config = pluginConfigSchema.parse({ showFlaky: true });
      const payload = buildSlackPayload(summary, defaultSlackConfig, config);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('Flaky tests (1)');
      expect(allText).toContain('Search > Filters > date range filter');
      expect(allText).toContain('retried 2x');
      // showFlaky: true → yellow sidebar color
      expect(payload.attachments[0].color).toBe('#f2c744');
    });

    it('hides flaky section when showFlaky is false', () => {
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

      const config = pluginConfigSchema.parse({ showFlaky: false });
      const payload = buildSlackPayload(summary, defaultSlackConfig, config);

      const allText = JSON.stringify(payload);
      // Stats block still shows Flaky count, but detailed flaky section is hidden
      expect(allText).not.toContain('Flaky tests (');
      expect(allText).not.toContain('retried');
    });
  });

  describe('mentions', () => {
    it('shows mentions in header on failure', () => {
      const summary = baseSummary({
        status: 'failed',
        stats: { passed: 48, failed: 2, skipped: 2, flaky: 0, total: 52 },
        failedTests: [{
          name: 'test',
          suitePath: [],
          fullTitle: 'test',
          file: 'test.spec.ts',
          line: 1,
          status: 'failed',
          duration: 1000,
          error: 'fail',
          tags: [],
          retries: 0,
          browser: 'chromium',
        }],
      });

      const slackConfig = {
        ...defaultSlackConfig,
        mentionOnFailure: ['<@U123456>'],
      };
      const payload = buildSlackPayload(summary, slackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toContain('(<@U123456>)');
    });

    it('does not show mentions on success', () => {
      const summary = baseSummary();
      const slackConfig = {
        ...defaultSlackConfig,
        mentionOnFailure: ['@qa-team'],
      };
      const payload = buildSlackPayload(summary, slackConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).not.toContain('@qa-team');
    });
  });

  describe('reminders', () => {
    it('shows single reminder as context block after header (index 1)', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'test.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
        ],
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const blocks = payload.attachments[0].blocks;
      // Block 0 = header, Block 1 = context (single reminder), Block 2 = divider
      expect(blocks[1].type).toBe('context');
      const reminderText = (blocks[1].elements?.[0] as { text: string }).text;
      expect(reminderText).toContain(':bell:');
      expect(reminderText).toContain('*1 reminder due*');
      expect(reminderText).toContain('`old test` (7d overdue)');

      // Header should NOT contain reminder
      expect(blocks[0].text?.text).not.toContain(':bell:');
    });

    it('shows single reminder with "due today" for daysOverdue === 0', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'today test', file: 'test.spec.ts', remindDate: new Date('2026-03-09'), daysOverdue: 0 },
        ],
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const blocks = payload.attachments[0].blocks;
      const reminderText = (blocks[1].elements?.[0] as { text: string }).text;
      expect(reminderText).toContain('due today');
    });

    it('shows multiple reminders as section block at bottom with numbered list', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'test.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
          { testName: 'today test', file: 'test2.spec.ts', remindDate: new Date('2026-03-09'), daysOverdue: 0 },
        ],
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const blocks = payload.attachments[0].blocks;
      const lastBlock = blocks[blocks.length - 1];
      expect(lastBlock.type).toBe('section');
      const text = lastBlock.text?.text ?? '';
      expect(text).toContain(':bell:');
      expect(text).toContain('*Reminders (2)*');
      expect(text).toContain('1. old test — Overdue 7 days');
      expect(text).toContain('2. today test — Take a look today');

      // Header should NOT contain reminder
      expect(blocks[0].text?.text).not.toContain(':bell:');
      // No context block for reminders (only section)
      expect(blocks[1].type).toBe('divider');
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
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const blocks = payload.attachments[0].blocks;
      const lastBlock = blocks[blocks.length - 1];
      expect(lastBlock.type).toBe('section');
      const text = lastBlock.text?.text ?? '';
      expect(text).toContain('*Reminders (8)*');
      expect(text).toContain('1. test1');
      expect(text).toContain('5. test5');
      expect(text).not.toContain('6. test6');
      expect(text).toContain('+3 more');
    });

    it('hides reminders when showReminders is false', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'test.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
        ],
      });
      const config = pluginConfigSchema.parse({ showReminders: false });
      const payload = buildSlackPayload(summary, defaultSlackConfig, config);

      const allText = JSON.stringify(payload);
      expect(allText).not.toContain(':bell:');
      const blocks = payload.attachments[0].blocks;
      expect(blocks.every((b: { type: string }) => b.type !== 'context')).toBe(true);
    });

    it('excludes reminders when excludeReminders option is true', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'old test', file: 'test.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
        ],
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig, { excludeReminders: true });

      const allText = JSON.stringify(payload);
      expect(allText).not.toContain(':bell:');
      const blocks = payload.attachments[0].blocks;
      expect(blocks.every((b: { type: string }) => b.type !== 'context')).toBe(true);
    });

    it('excludes multiple reminders when excludeReminders option is true', () => {
      const summary = baseSummary({
        reminders: [
          { testName: 'test1', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
          { testName: 'test2', file: 'b.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 3 },
        ],
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig, { excludeReminders: true });

      const allText = JSON.stringify(payload);
      expect(allText).not.toContain(':bell:');
      expect(allText).not.toContain('Reminders');
    });
  });

  describe('buildReminderThreadPayload', () => {
    it('builds payload with all reminders listed (no truncation)', () => {
      const reminders = [
        { testName: 'test1', file: 'a.spec.ts', remindDate: new Date('2026-03-01'), daysOverdue: 7 },
        { testName: 'test2', file: 'b.spec.ts', remindDate: new Date('2026-03-09'), daysOverdue: 0 },
        { testName: 'test3', file: 'c.spec.ts', remindDate: new Date('2026-02-15'), daysOverdue: 21 },
      ];
      const payload = buildReminderThreadPayload(reminders);

      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].color).toBe('#f2c744');

      const text = payload.attachments[0].blocks[0].text?.text ?? '';
      expect(text).toContain(':bell:');
      expect(text).toContain('*Reminders (3)*');
      expect(text).toContain('1. test1 — Overdue 7 days');
      expect(text).toContain('2. test2 — Take a look today');
      expect(text).toContain('3. test3 — Overdue 21 days');
    });

    it('lists many reminders without truncation', () => {
      const reminders = Array.from({ length: 10 }, (_, i) => ({
        testName: `test${i + 1}`,
        file: `t${i}.spec.ts`,
        remindDate: new Date('2026-03-01'),
        daysOverdue: i,
      }));
      const payload = buildReminderThreadPayload(reminders);

      const text = payload.attachments[0].blocks[0].text?.text ?? '';
      expect(text).toContain('*Reminders (10)*');
      expect(text).toContain('10. test10');
      expect(text).not.toContain('more');
    });
  });

  describe('on-call and owners', () => {
    it('shows on-call in header on failure when onCall is set', () => {
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
      const payload = buildSlackPayload(summary, defaultSlackConfig, config);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toContain('(<@U111>)');
      expect(headerBlock.text?.text).not.toContain('on-call');
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
      const payload = buildSlackPayload(summary, defaultSlackConfig, config);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toContain('(alice)');
      expect(headerBlock.text?.text).not.toContain('on-call');
    });

    it('does not show on-call in header on success', () => {
      const summary = baseSummary({
        onCall: { name: 'alice', slack: '<@U111>', isOnCall: true },
      });
      const config = pluginConfigSchema.parse({ rotation: { startDate: '2026-01-01', members: [{ name: 'alice' }] } });
      const payload = buildSlackPayload(summary, defaultSlackConfig, config);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).not.toContain('alice');
    });

    it('does not show on-call when mentionInSummary is false', () => {
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
      const config = pluginConfigSchema.parse({
        rotation: { startDate: '2026-01-01', members: [{ name: 'alice' }], mentionInSummary: false },
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, config);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).not.toContain('alice');
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
      const slackConfig = { ...defaultSlackConfig, mentionOnFailure: ['<@U999>'] };
      const config = pluginConfigSchema.parse({ rotation: { startDate: '2026-01-01', members: [{ name: 'bob' }] } });
      const payload = buildSlackPayload(summary, slackConfig, config);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toContain('(<@U222>)');
      expect(headerBlock.text?.text).not.toContain('<@U999>');
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
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('1. login test (<@U111>)');
      expect(allText).toContain('2. checkout test');
      expect(allText).not.toContain('2. checkout test (');
    });

  });

  describe('triggered by', () => {
    it('shows triggered by user in stats/meta grid', () => {
      const summary = baseSummary({ triggeredBy: 'alice' });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const statsBlock = payload.attachments[0].blocks[2]; // header, divider, stats+meta
      const fieldTexts = statsBlock.fields?.map((f) => f.text) ?? [];
      expect(fieldTexts).toContain('*Triggered by*\nalice');
      // Header should NOT contain triggered by
      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).not.toContain('alice');
    });

    it('shows mapped slack mention in stats/meta grid', () => {
      const summary = baseSummary({ triggeredBy: '<@UD2GYJRO9>' });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const statsBlock = payload.attachments[0].blocks[2];
      const fieldTexts = statsBlock.fields?.map((f) => f.text) ?? [];
      expect(fieldTexts).toContain('*Triggered by*\n<@UD2GYJRO9>');
    });

    it('does not show triggered by when not set', () => {
      const summary = baseSummary({ triggeredBy: undefined });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const statsBlock = payload.attachments[0].blocks[2];
      const fieldTexts = statsBlock.fields?.map((f) => f.text) ?? [];
      expect(fieldTexts.join('')).not.toContain('Triggered by');
    });
  });

  describe('PR/MR link', () => {
    it('shows PR link in header for GitHub PRs with reordered words', () => {
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
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      // Word order: MyApp E2E pipeline <runLink> passed for PR #42
      expect(headerBlock.text?.text).toMatch(/MyApp E2E pipeline.*#9876.*passed for.*PR #42/);
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
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toMatch(/pipeline.*#555.*passed for.*MR !99/);
    });

    it('shows PR link in header and triggered by in stats grid', () => {
      const summary = baseSummary({
        triggeredBy: '<@U111>',
        ci: {
          provider: 'github',
          branch: 'feature/login',
          runId: '9876',
          runUrl: 'https://github.com/org/repo/actions/runs/9876',
          pullRequestNumber: '42',
          pullRequestUrl: 'https://github.com/org/repo/pull/42',
        },
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toMatch(/pipeline.*#9876.*passed for.*PR #42/);
      expect(headerBlock.text?.text).not.toContain('<@U111>');
      // Triggered by should be in stats/meta grid
      const statsBlock = payload.attachments[0].blocks[2];
      const fieldTexts = statsBlock.fields?.map((f) => f.text) ?? [];
      expect(fieldTexts).toContain('*Triggered by*\n<@U111>');
    });

    it('does not show PR link when not in PR context', () => {
      const summary = baseSummary();
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).not.toContain('for');
    });
  });

  describe('edge cases', () => {
    it('handles no CI context', () => {
      const summary = baseSummary({ ci: undefined });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toContain('MyApp E2E pipeline passed');
    });

    it('falls back to artifacts URL when no report URL on GitHub', () => {
      const summary = baseSummary({ reportUrl: undefined });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).toContain('View report');
      expect(headerBlock.text?.text).toContain('actions/runs/11359#artifacts');
    });

    it('handles no report URL and no CI context', () => {
      const summary = baseSummary({ reportUrl: undefined, ci: undefined });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const headerBlock = payload.attachments[0].blocks[0];
      expect(headerBlock.text?.text).not.toContain('View report');
    });

    it('handles zero skipped', () => {
      const summary = baseSummary({
        stats: { passed: 50, failed: 0, skipped: 0, flaky: 0, total: 50 },
      });
      const payload = buildSlackPayload(summary, defaultSlackConfig, defaultPluginConfig);

      const allText = JSON.stringify(payload);
      expect(allText).toContain('50 out of 50');
      expect(allText).not.toContain('skipped');
    });
  });
});
