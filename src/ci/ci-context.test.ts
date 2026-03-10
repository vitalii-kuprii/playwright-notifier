import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCIContext } from './ci-context';

describe('detectCIContext', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns undefined when not in CI', () => {
    expect(detectCIContext()).toBeUndefined();
  });

  it('detects GitHub Actions', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('GITHUB_REF_NAME', 'feature/auth');
    vi.stubEnv('GITHUB_SHA', 'abc123');
    vi.stubEnv('GITHUB_RUN_ID', '9876');
    vi.stubEnv('GITHUB_ACTOR', 'alice');
    vi.stubEnv('GITHUB_WORKFLOW', 'E2E Tests');
    vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com');
    vi.stubEnv('GITHUB_REPOSITORY', 'org/repo');

    const ctx = detectCIContext()!;

    expect(ctx.provider).toBe('github');
    expect(ctx.branch).toBe('feature/auth');
    expect(ctx.commitSha).toBe('abc123');
    expect(ctx.runId).toBe('9876');
    expect(ctx.runUrl).toBe('https://github.com/org/repo/actions/runs/9876');
    expect(ctx.actor).toBe('alice');
    expect(ctx.pipelineName).toBe('E2E Tests');
  });

  it('detects GitLab CI', () => {
    vi.stubEnv('GITLAB_CI', 'true');
    vi.stubEnv('CI_COMMIT_BRANCH', 'main');
    vi.stubEnv('CI_COMMIT_SHA', 'def456');
    vi.stubEnv('CI_PIPELINE_ID', '555');
    vi.stubEnv('CI_PIPELINE_URL', 'https://gitlab.com/org/repo/-/pipelines/555');
    vi.stubEnv('GITLAB_USER_LOGIN', 'bob');
    vi.stubEnv('CI_PROJECT_NAME', 'my-project');

    const ctx = detectCIContext()!;

    expect(ctx.provider).toBe('gitlab');
    expect(ctx.branch).toBe('main');
    expect(ctx.runUrl).toBe('https://gitlab.com/org/repo/-/pipelines/555');
  });

  it('detects Azure DevOps', () => {
    vi.stubEnv('TF_BUILD', 'True');
    vi.stubEnv('BUILD_SOURCEBRANCH', 'refs/heads/develop');
    vi.stubEnv('BUILD_SOURCEVERSION', 'ghi789');
    vi.stubEnv('BUILD_BUILDID', '42');
    vi.stubEnv('BUILD_REQUESTEDFOR', 'carol');
    vi.stubEnv('BUILD_DEFINITIONNAME', 'CI Pipeline');

    const ctx = detectCIContext()!;

    expect(ctx.provider).toBe('azure');
    expect(ctx.branch).toBe('develop');
    expect(ctx.actor).toBe('carol');
  });
});
