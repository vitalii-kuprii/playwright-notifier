import type { CIContext } from '../types';

export function detectCIContext(): CIContext | undefined {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
    const repo = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;

    return {
      provider: 'github',
      branch: process.env.GITHUB_REF_NAME,
      commitSha: process.env.GITHUB_SHA,
      runId,
      runUrl: repo && runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : undefined,
      actor: process.env.GITHUB_ACTOR,
      pipelineName: process.env.GITHUB_WORKFLOW,
    };
  }

  if (process.env.GITLAB_CI === 'true') {
    return {
      provider: 'gitlab',
      branch: process.env.CI_COMMIT_BRANCH ?? process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME,
      commitSha: process.env.CI_COMMIT_SHA,
      runId: process.env.CI_PIPELINE_ID,
      runUrl: process.env.CI_PIPELINE_URL,
      actor: process.env.GITLAB_USER_LOGIN,
      pipelineName: process.env.CI_PROJECT_NAME,
    };
  }

  if (process.env.TF_BUILD === 'True') {
    return {
      provider: 'azure',
      branch: process.env.BUILD_SOURCEBRANCH?.replace('refs/heads/', ''),
      commitSha: process.env.BUILD_SOURCEVERSION,
      runId: process.env.BUILD_BUILDID,
      runUrl: process.env.BUILD_BUILDURI,
      actor: process.env.BUILD_REQUESTEDFOR,
      pipelineName: process.env.BUILD_DEFINITIONNAME,
    };
  }

  return undefined;
}
