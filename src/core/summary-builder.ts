import type {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult as PwTestResult,
} from '@playwright/test/reporter';
import type { NormalizedSummary, TestResult, MetaEntry, OwnershipEntry, ResolvedOwner } from '../types';
import type { PluginConfig } from '../config/schema';
import { detectCIContext } from '../ci/ci-context';
import { detectBranch } from '../ci/detect-branch';
import { detectEnvironment } from '../ci/detect-environment';
import { extractDueReminders } from '../intelligence/reminder-parser';
import { extractOwners } from '../intelligence/owner-parser';
import { resolveCurrentOnCall, resolveOwnerMention } from '../intelligence/rotation';

export class SummaryBuilder {
  private tests: TestResult[] = [];
  private startedAt: Date = new Date();
  private config: PluginConfig;
  private baseURL: string | undefined;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  onBegin(playwrightConfig?: FullConfig): void {
    this.startedAt = new Date();
    this.tests = [];
    this.baseURL = playwrightConfig?.projects?.[0]?.use?.baseURL;
  }

  addTestResult(test: TestCase, result: PwTestResult): void {
    const tags = extractTags(test.title);
    const cleanName = stripTags(test.title);
    const suitePath = buildSuitePath(test.parent);

    this.tests.push({
      name: cleanName,
      suitePath,
      fullTitle: [...suitePath, cleanName].join(' > '),
      file: test.location.file,
      line: test.location.line,
      status: mapStatus(test, result),
      duration: result.duration,
      error: truncateError(
        result.errors?.[0]?.message ?? result.errors?.[0]?.value?.toString(),
        this.config.display.maxErrorLength,
      ),
      tags,
      retries: result.retry,
      browser: test.parent.project()?.name,
    });
  }

  build(fullResult: FullResult): NormalizedSummary {
    const finishedAt = new Date();

    // Deduplicate: keep only the final result per test (by file + title)
    const dedupedTests = deduplicateTests(this.tests);

    const failedTests = dedupedTests.filter((t) => t.status === 'failed');
    const flakyTests = dedupedTests.filter((t) => t.status === 'flaky');
    const skippedTests = dedupedTests.filter((t) => t.status === 'skipped');
    const passedTests = dedupedTests.filter((t) => t.status === 'passed');

    const stats = {
      passed: passedTests.length,
      failed: failedTests.length,
      skipped: skippedTests.length,
      flaky: flakyTests.length,
      total: dedupedTests.length,
    };

    let status: NormalizedSummary['status'] = 'passed';
    if (stats.failed > 0) status = 'failed';
    else if (stats.flaky > 0) status = 'flaky';

    const ci = detectCIContext();
    const branch = detectBranch(this.config.branch, ci);
    const environment = detectEnvironment(this.config.environment, this.baseURL);

    const meta: MetaEntry[] = this.config.meta.map((m) => ({
      key: m.key,
      value: m.value,
    }));

    // Auto-add meta if not manually provided
    const hasKey = (key: string) => meta.some((m) => m.key.toLowerCase() === key.toLowerCase());

    if (branch && !hasKey('Branch')) {
      meta.push({ key: 'Branch', value: branch });
    }

    // Issue 14: showTriggeredBy with onFailure support
    let triggeredBy: string | undefined;
    if (ci && ci.actor && this.config.showTriggeredBy !== false) {
      if (typeof this.config.showTriggeredBy === 'object') {
        const { users, onFailure } = this.config.showTriggeredBy;
        // When onFailure is true, only show triggeredBy on failed pipelines
        if (!onFailure || status === 'failed') {
          triggeredBy = users[ci.actor] ?? ci.actor;
        }
      } else if (this.config.showTriggeredBy === true) {
        triggeredBy = ci.actor;
      }
    }

    const reminders = this.config.reminders.show
      ? extractDueReminders(skippedTests)
      : [];

    // On-call rotation
    const onCallMember = this.config.rotation
      ? resolveCurrentOnCall(this.config.rotation)
      : undefined;
    const onCall: ResolvedOwner | undefined = onCallMember
      ? { ...onCallMember, isOnCall: true }
      : undefined;

    // Extract owners from failed + flaky tests
    const relevantTests = [...failedTests, ...flakyTests];
    const rawOwners = extractOwners(relevantTests);
    const owners: OwnershipEntry[] = rawOwners.map((entry) => ({
      testName: entry.testName,
      file: entry.file,
      owner: resolveOwnerMention(entry.ownerTag, this.config.rotation),
    }));

    return {
      projectName: this.config.projectName,
      environment,
      branch,
      status,
      runStatus: fullResult.status as NormalizedSummary['runStatus'],
      stats,
      duration: fullResult.duration,
      startedAt: this.startedAt,
      finishedAt,
      tests: dedupedTests,
      failedTests,
      flakyTests,
      skippedTests,
      passedTests,
      triggeredBy,
      reminders,
      owners,
      onCall,
      meta: meta.filter((m) => m.value !== undefined),
      ci,
      reportUrl: this.config.display.reportUrl,
    };
  }
}

// --- Helpers ---

function mapStatus(test: TestCase, result: PwTestResult): TestResult['status'] {
  if (result.status === 'skipped') return 'skipped';
  if (result.status === 'interrupted') return 'skipped';
  if (result.status === 'timedOut') return 'failed';
  if (test.outcome() === 'flaky') return 'flaky';
  if (test.outcome() === 'unexpected') return 'failed';
  return 'passed';
}

function buildSuitePath(suite: Suite): string[] {
  const path: string[] = [];
  let current: Suite | undefined = suite;

  while (current) {
    // Skip root, project-level, and file-level suites (they have no meaningful title)
    // Structure: root (no parent) > project (depth 1) > file (depth 2) > describe blocks
    if (current.title && current.parent?.parent?.parent) {
      path.unshift(current.title);
    }
    current = current.parent as Suite | undefined;
  }

  return path;
}

function extractTags(title: string): string[] {
  const tagPattern = /@[\w-]+(?:\([^)]*\))?/g;
  return title.match(tagPattern) ?? [];
}

/** Strip @tag and @tag(value) patterns from display text */
function stripTags(title: string): string {
  return title.replace(/@[\w-]+(?:\([^)]*\))?/g, '').replace(/\s+/g, ' ').trim();
}

function truncateError(error: string | undefined, maxLength: number): string | undefined {
  if (!error) return undefined;

  // Take only the first line for conciseness, then truncate
  const firstLine = error.split('\n')[0].trim();

  if (firstLine.length <= maxLength) return firstLine;
  return firstLine.slice(0, maxLength - 3) + '...';
}

/**
 * Keep only the final attempt for each unique test.
 * If any attempt passed after retries, mark as flaky.
 */
function deduplicateTests(tests: TestResult[]): TestResult[] {
  const map = new Map<string, TestResult>();

  for (const test of tests) {
    const key = `${test.file}::${test.name}`;
    const existing = map.get(key);

    if (!existing || test.retries > existing.retries) {
      map.set(key, test);
    }
  }

  return Array.from(map.values());
}
