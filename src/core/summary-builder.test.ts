import { describe, it, expect } from 'vitest';
import { SummaryBuilder } from './summary-builder';
import { createMockTest, createFullResult } from './test-helpers';
import type { PluginConfig } from '../config/schema';
import { pluginConfigSchema } from '../config/schema';

function createBuilder(overrides?: Partial<PluginConfig> & Record<string, unknown>): SummaryBuilder {
  const config = pluginConfigSchema.parse(overrides ?? {});
  return new SummaryBuilder(config);
}

describe('SummaryBuilder', () => {
  it('builds summary with correct stats for all-passing tests', () => {
    const builder = createBuilder({ projectName: 'MyApp E2E', environment: 'staging' });
    builder.onBegin();

    const tests = [
      createMockTest({ title: 'test 1', duration: 1000 }),
      createMockTest({ title: 'test 2', duration: 2000 }),
      createMockTest({ title: 'test 3', duration: 500 }),
    ];

    for (const { testCase, testResult } of tests) {
      builder.addTestResult(testCase, testResult);
    }

    const summary = builder.build(createFullResult({ duration: 3500 }));

    expect(summary.projectName).toBe('MyApp E2E');
    expect(summary.environment).toBe('staging');
    expect(summary.status).toBe('passed');
    expect(summary.stats).toEqual({
      passed: 3,
      failed: 0,
      skipped: 0,
      flaky: 0,
      total: 3,
    });
    expect(summary.duration).toBe(3500);
    expect(summary.failedTests).toHaveLength(0);
    expect(summary.passedTests).toHaveLength(3);
  });

  it('builds summary with failures', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(createMockTest({ title: 'passing test' })),
    );
    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'failing test',
          status: 'failed',
          outcome: 'unexpected',
          errors: [{ message: 'Expected true to be false' }],
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.status).toBe('failed');
    expect(summary.stats.passed).toBe(1);
    expect(summary.stats.failed).toBe(1);
    expect(summary.failedTests).toHaveLength(1);
    expect(summary.failedTests[0].error).toBe('Expected true to be false');
  });

  it('detects flaky tests', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'flaky test',
          file: 'tests/flaky.spec.ts',
          status: 'failed',
          outcome: 'flaky',
          retry: 0,
          errors: [{ message: 'Timeout' }],
        }),
      ),
    );
    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'flaky test',
          file: 'tests/flaky.spec.ts',
          status: 'passed',
          outcome: 'flaky',
          retry: 1,
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.status).toBe('flaky');
    expect(summary.stats.flaky).toBe(1);
    expect(summary.stats.failed).toBe(0);
    expect(summary.flakyTests).toHaveLength(1);
    expect(summary.flakyTests[0].retries).toBe(1);
  });

  it('maps interrupted tests to skipped', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'interrupted test',
          status: 'interrupted',
          outcome: 'unexpected',
        }),
      ),
    );

    const summary = builder.build(createFullResult({ status: 'interrupted' }));

    expect(summary.stats.skipped).toBe(1);
    expect(summary.skippedTests).toHaveLength(1);
    expect(summary.runStatus).toBe('interrupted');
  });

  it('maps timedout tests to failed', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'timedout test',
          status: 'timedout',
          outcome: 'unexpected',
          errors: [{ message: 'Timeout 30000ms exceeded' }],
        }),
      ),
    );

    const summary = builder.build(createFullResult({ status: 'timedout' }));

    expect(summary.status).toBe('failed');
    expect(summary.stats.failed).toBe(1);
    expect(summary.failedTests).toHaveLength(1);
    expect(summary.runStatus).toBe('timedout');
  });

  it('includes runStatus from FullResult', () => {
    const builder = createBuilder();
    builder.onBegin();

    const summary = builder.build(createFullResult({ status: 'passed' }));
    expect(summary.runStatus).toBe('passed');

    const builder2 = createBuilder();
    builder2.onBegin();
    const summary2 = builder2.build(createFullResult({ status: 'failed' }));
    expect(summary2.runStatus).toBe('failed');
  });

  it('handles skipped tests', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'skipped test',
          status: 'skipped',
          outcome: 'skipped',
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.stats.skipped).toBe(1);
    expect(summary.skippedTests).toHaveLength(1);
  });

  it('truncates long error messages', () => {
    const builder = createBuilder({ display: { maxErrorLength: 50 } });
    builder.onBegin();

    const longError = 'A'.repeat(200);
    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'error test',
          status: 'failed',
          outcome: 'unexpected',
          errors: [{ message: longError }],
        }),
      ),
    );

    const summary = builder.build(createFullResult());
    const error = summary.failedTests[0].error!;

    expect(error.length).toBe(50);
    expect(error.endsWith('...')).toBe(true);
  });

  it('extracts tags from test title', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'login flow @auth @smoke @remind(2026-04-01)',
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.tests[0].tags).toEqual([
      '@auth',
      '@smoke',
      '@remind(2026-04-01)',
    ]);
  });

  it('strips tags from test display name (Issue 3)', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'login flow @auth @smoke @remind(2026-04-01)',
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.tests[0].name).toBe('login flow');
    expect(summary.tests[0].fullTitle).toBe('login flow');
    // Tags are still preserved in the tags array
    expect(summary.tests[0].tags).toHaveLength(3);
  });

  it('builds suite path from describe hierarchy', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'should redirect',
          suites: ['Login', 'OAuth'],
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.tests[0].suitePath).toEqual(['Login', 'OAuth']);
    expect(summary.tests[0].fullTitle).toBe('Login > OAuth > should redirect');
  });

  it('includes browser/project name', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({ title: 'test', projectName: 'webkit' }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.tests[0].browser).toBe('webkit');
  });

  it('deduplicates retried tests keeping final attempt', () => {
    const builder = createBuilder();
    builder.onBegin();

    // Retry 0 fails
    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'retried test',
          file: 'tests/retry.spec.ts',
          status: 'failed',
          outcome: 'unexpected',
          retry: 0,
          errors: [{ message: 'fail' }],
        }),
      ),
    );
    // Retry 1 also fails
    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'retried test',
          file: 'tests/retry.spec.ts',
          status: 'failed',
          outcome: 'unexpected',
          retry: 1,
          errors: [{ message: 'fail again' }],
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    // Should have 1 test, not 2
    expect(summary.tests).toHaveLength(1);
    expect(summary.tests[0].retries).toBe(1);
  });

  it('includes meta entries and filters out undefined values', () => {
    const builder = createBuilder({
      meta: [
        { key: 'Branch', value: 'main' },
        { key: 'Empty', value: undefined },
      ],
    });
    builder.onBegin();

    const summary = builder.build(createFullResult());

    expect(summary.meta).toEqual([{ key: 'Branch', value: 'main' }]);
  });

  it('includes reportUrl when configured', () => {
    const builder = createBuilder({
      display: { reportUrl: 'https://reports.example.com/run-123/index.html' },
    });
    builder.onBegin();

    const summary = builder.build(createFullResult());

    expect(summary.reportUrl).toBe('https://reports.example.com/run-123/index.html');
  });

  it('populates reminders from skipped tests with due @remind tags', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'old feature @remind(2025-01-01)',
          status: 'skipped',
          outcome: 'skipped',
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.reminders).toHaveLength(1);
    // Issue 3+9: Tags stripped from display name in reminders
    expect(summary.reminders[0].testName).toBe('old feature');
    expect(summary.reminders[0].daysOverdue).toBeGreaterThan(0);
  });

  it('returns empty reminders when reminders.show is false', () => {
    const builder = createBuilder({ reminders: { show: false } });
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'old feature @remind(2025-01-01)',
          status: 'skipped',
          outcome: 'skipped',
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.reminders).toEqual([]);
  });

  it('sets timestamps', () => {
    const builder = createBuilder();
    builder.onBegin();

    const summary = builder.build(createFullResult());

    expect(summary.startedAt).toBeInstanceOf(Date);
    expect(summary.finishedAt).toBeInstanceOf(Date);
    expect(summary.finishedAt.getTime()).toBeGreaterThanOrEqual(summary.startedAt.getTime());
  });

  it('defaults owners to empty array and onCall to undefined', () => {
    const builder = createBuilder();
    builder.onBegin();

    const summary = builder.build(createFullResult());

    expect(summary.owners).toEqual([]);
    expect(summary.onCall).toBeUndefined();
  });

  it('extracts owners from failed tests with @owner tags', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'login flow @owner(alice)',
          status: 'failed',
          outcome: 'unexpected',
          errors: [{ message: 'fail' }],
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.owners).toHaveLength(1);
    // Issue 3: Tags stripped from display name
    expect(summary.owners[0].testName).toBe('login flow');
    expect(summary.owners[0].owner.name).toBe('alice');
  });

  it('extracts owners from flaky tests', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'flaky test @owner(bob)',
          file: 'tests/flaky.spec.ts',
          status: 'failed',
          outcome: 'flaky',
          retry: 0,
          errors: [{ message: 'Timeout' }],
        }),
      ),
    );
    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'flaky test @owner(bob)',
          file: 'tests/flaky.spec.ts',
          status: 'passed',
          outcome: 'flaky',
          retry: 1,
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.owners).toHaveLength(1);
    expect(summary.owners[0].owner.name).toBe('bob');
  });

  it('does not extract owners from passing tests', () => {
    const builder = createBuilder();
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({ title: 'passing @owner(alice)' }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.owners).toEqual([]);
  });

  it('resolves on-call from rotation config', () => {
    const builder = createBuilder({
      rotation: {
        enabled: true,
        schedule: 'daily',
        startDate: '2026-01-01',
        members: [
          { name: 'alice', slack: '<@U111>' },
          { name: 'bob', slack: '<@U222>' },
        ],
      },
    });
    builder.onBegin();

    const summary = builder.build(createFullResult());

    expect(summary.onCall).toBeDefined();
    expect(summary.onCall!.isOnCall).toBe(true);
    expect(['alice', 'bob']).toContain(summary.onCall!.name);
  });

  it('resolves owner mention with rotation member info', () => {
    const builder = createBuilder({
      rotation: {
        enabled: true,
        schedule: 'weekly',
        startDate: '2026-01-01',
        members: [
          { name: 'alice', slack: '<@U111>' },
        ],
      },
    });
    builder.onBegin();

    builder.addTestResult(
      ...Object.values(
        createMockTest({
          title: 'test @owner(alice)',
          status: 'failed',
          outcome: 'unexpected',
          errors: [{ message: 'fail' }],
        }),
      ),
    );

    const summary = builder.build(createFullResult());

    expect(summary.owners[0].owner.slack).toBe('<@U111>');
    expect(summary.owners[0].owner.isOnCall).toBe(false);
  });
});
