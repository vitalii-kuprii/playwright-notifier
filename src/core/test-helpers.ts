import type {
  TestCase,
  TestResult,
  Suite,
  FullResult,
} from '@playwright/test/reporter';

interface MockTestOptions {
  title: string;
  file?: string;
  line?: number;
  status?: TestResult['status'];
  duration?: number;
  retry?: number;
  outcome?: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  errors?: Array<{ message?: string; value?: string }>;
  projectName?: string;
  suites?: string[];
}

export function createMockSuite(options: {
  title?: string;
  projectName?: string;
  parent?: Suite;
}): Suite {
  const suite: Partial<Suite> = {
    title: options.title ?? '',
    parent: options.parent as Suite,
    project: () =>
      options.projectName
        ? ({ name: options.projectName } as ReturnType<Suite['project']>)
        : (options.parent as Suite)?.project?.() ?? undefined,
  };
  return suite as Suite;
}

export function createMockTest(opts: MockTestOptions): {
  testCase: TestCase;
  testResult: TestResult;
} {
  // Build suite hierarchy: root > project > file > ...suites > (test)
  const rootSuite = createMockSuite({ title: '' });
  const projectSuite = createMockSuite({
    title: opts.projectName ?? 'chromium',
    projectName: opts.projectName ?? 'chromium',
    parent: rootSuite,
  });
  const fileSuite = createMockSuite({
    title: opts.file ?? 'tests/example.spec.ts',
    parent: projectSuite,
  });

  let parentSuite = fileSuite;
  for (const suiteName of opts.suites ?? []) {
    parentSuite = createMockSuite({
      title: suiteName,
      parent: parentSuite,
    });
  }

  const testCase: Partial<TestCase> = {
    title: opts.title,
    location: {
      file: opts.file ?? 'tests/example.spec.ts',
      line: opts.line ?? 1,
      column: 1,
    },
    parent: parentSuite as Suite,
    outcome: () => opts.outcome ?? 'expected',
  };

  const testResult: Partial<TestResult> = {
    status: opts.status ?? 'passed',
    duration: opts.duration ?? 1000,
    retry: opts.retry ?? 0,
    errors: (opts.errors as TestResult['errors']) ?? [],
    attachments: [],
  };

  return {
    testCase: testCase as TestCase,
    testResult: testResult as TestResult,
  };
}

export function createFullResult(overrides?: Partial<FullResult>): FullResult {
  return {
    status: 'passed',
    duration: 60000,
    startTime: new Date(),
    ...overrides,
  } as FullResult;
}
