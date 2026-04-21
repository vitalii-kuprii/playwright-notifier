export interface MetaEntry {
  key: string;
  value: string | undefined;
}

export interface TestResult {
  name: string;
  suitePath: string[];
  fullTitle: string;
  file: string;
  line: number;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  duration: number;
  error?: string;
  tags: string[];
  retries: number;
  browser?: string;
}

export interface NormalizedSummary {
  projectName?: string;
  environment: string;
  branch?: string;
  status: 'passed' | 'failed' | 'flaky';

  // Run-level status from Playwright's FullResult (passed, failed, interrupted, timedout)
  runStatus: 'passed' | 'failed' | 'interrupted' | 'timedout';

  stats: {
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    total: number;
  };

  duration: number;
  startedAt: Date;
  finishedAt: Date;

  tests: TestResult[];
  failedTests: TestResult[];
  flakyTests: TestResult[];
  skippedTests: TestResult[];
  passedTests: TestResult[];

  meta: MetaEntry[];

  // Resolved triggered-by display string
  triggeredBy?: string;

  // CI context (auto-detected or manual)
  ci?: CIContext;

  // Skip reminders that are due
  reminders: SkipReminder[];

  // Ownership + on-call rotation
  owners: OwnershipEntry[];
  onCall?: ResolvedOwner;

  // Shard validation
  shards?: {
    actual: number;
    expected: number;
  };

  // Report link
  reportUrl?: string;
}

export interface SkipReminder {
  testName: string;
  file: string;
  remindDate: Date;
  daysOverdue: number;
}

export interface RotationMember {
  name: string;
  slack?: string;
  email?: string;
}

export interface ResolvedOwner {
  name: string;
  slack?: string;
  email?: string;
  isOnCall: boolean;
}

export interface OwnershipEntry {
  testName: string;
  file: string;
  owner: ResolvedOwner;
}

export interface CIContext {
  provider: 'github' | 'gitlab' | 'azure' | 'unknown';
  branch?: string;
  commitSha?: string;
  runId?: string;
  runUrl?: string;
  actor?: string;
  pipelineName?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: string;
}
