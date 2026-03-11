import type { CIContext } from '../types';

export function detectCIContext(): CIContext | undefined {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
    const repo = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;

    // Detect PR: GITHUB_HEAD_REF is only set for pull_request events
    const prNumber = process.env.GITHUB_HEAD_REF
      ? process.env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\//)?.[1]
      : undefined;

    return {
      provider: 'github',
      branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
      commitSha: process.env.GITHUB_SHA,
      runId,
      runUrl: repo && runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : undefined,
      actor: process.env.GITHUB_ACTOR,
      pipelineName: process.env.GITHUB_WORKFLOW,
      pullRequestNumber: prNumber,
      pullRequestUrl: prNumber && repo ? `${serverUrl}/${repo}/pull/${prNumber}` : undefined,
    };
  }

  if (process.env.GITLAB_CI === 'true') {
    const mrIid = process.env.CI_MERGE_REQUEST_IID;
    const projectUrl = process.env.CI_PROJECT_URL;

    return {
      provider: 'gitlab',
      branch: process.env.CI_COMMIT_BRANCH ?? process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME,
      commitSha: process.env.CI_COMMIT_SHA,
      runId: process.env.CI_PIPELINE_ID,
      runUrl: process.env.CI_PIPELINE_URL,
      actor: process.env.GITLAB_USER_LOGIN,
      pipelineName: process.env.CI_PROJECT_NAME,
      pullRequestNumber: mrIid,
      pullRequestUrl: mrIid && projectUrl ? `${projectUrl}/-/merge_requests/${mrIid}` : undefined,
    };
  }

  if (process.env.TF_BUILD === 'True') {
    const isPR = process.env.BUILD_REASON === 'PullRequest';
    const prId = process.env.SYSTEM_PULLREQUEST_PULLREQUESTID;
    const collectionUri = process.env.SYSTEM_COLLECTIONURI;
    const teamProject = process.env.SYSTEM_TEAMPROJECT;

    return {
      provider: 'azure',
      branch: process.env.BUILD_SOURCEBRANCH?.replace('refs/heads/', ''),
      commitSha: process.env.BUILD_SOURCEVERSION,
      runId: process.env.BUILD_BUILDID,
      runUrl: process.env.BUILD_BUILDURI,
      actor: process.env.BUILD_REQUESTEDFOR,
      pipelineName: process.env.BUILD_DEFINITIONNAME,
      pullRequestNumber: isPR ? prId : undefined,
      pullRequestUrl: isPR && prId && collectionUri && teamProject
        ? `${collectionUri}${teamProject}/_git/pullrequest/${prId}`
        : undefined,
    };
  }

  return undefined;
}
