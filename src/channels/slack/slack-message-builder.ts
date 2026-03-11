console.log('[playwright-notify] v2 loaded');

import type { NormalizedSummary, TestResult, SkipReminder, OwnershipEntry } from '../../types';
import type { PluginConfig, SlackChannelConfig } from '../../config/schema';

// Slack Block Kit types (minimal subset we need)
interface SlackBlock {
  type: string;
  text?: SlackText;
  fields?: SlackText[];
  elements?: SlackElement[];
}

interface SlackText {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

interface SlackElement {
  type: string;
  text?: SlackText | string;
  url?: string;
}

interface SlackPayload {
  attachments: Array<{
    color: string;
    fallback: string;
    blocks: SlackBlock[];
  }>;
}

export function buildSlackPayload(
  summary: NormalizedSummary,
  slackConfig: SlackChannelConfig,
  pluginConfig: PluginConfig,
  options?: { excludeReminders?: boolean },
): SlackPayload {
  const isFailed = summary.status === 'failed';
  const isFlaky = summary.status === 'flaky';

  const statusEmoji = isFailed ? '❌' : '✅';
  const statusText = isFailed ? 'failed' : 'passed';
  const color = isFailed ? '#e01e5a' : (isFlaky && pluginConfig.showFlaky) ? '#f2c744' : '#36a64f';

  const runLink = buildRunLink(summary);
  const prLink = buildPRLink(summary);
  const projectPrefix = summary.projectName ? `${summary.projectName} pipeline` : 'Pipeline';

  const headerText = prLink
    ? [statusEmoji, projectPrefix, runLink, statusText, 'for', prLink].filter(Boolean).join(' ')
    : [statusEmoji, projectPrefix, statusText, runLink].filter(Boolean).join(' ');

  const blocks: SlackBlock[] = [];

  // Header + context combined (with mentions inline on failure/flaky)
  // Rotation on-call overrides mentionOnFailure to avoid duplicate pings
  const shouldMention = isFailed || (isFlaky && pluginConfig.mentionOnFlaky);
  const hasOnCall = shouldMention && summary.onCall && pluginConfig.rotation?.mentionInSummary !== false;
  const mentionSuffix = hasOnCall
    ? ` (${summary.onCall!.slack ?? summary.onCall!.name})`
    : shouldMention && slackConfig.mentionOnFailure.length > 0
      ? ` (${slackConfig.mentionOnFailure.join(' ')})`
      : '';
  const contextLine = buildContextLine(summary);
  const headerBody = [
    `${headerText}${mentionSuffix}`,
    contextLine,
  ].filter(Boolean).join('\n\n');
  blocks.push({
    type: 'section',
    text: mrkdwn(headerBody),
  });

  // Single reminder: context block after header, before divider
  const showReminders = pluginConfig.showReminders
    && !options?.excludeReminders
    && summary.reminders?.length > 0;

  if (showReminders && summary.reminders.length === 1) {
    blocks.push({
      type: 'context',
      elements: [mrkdwn(buildSingleReminderLine(summary.reminders[0]))],
    });
  }

  // Divider
  blocks.push({ type: 'divider' });

  // Stats + Meta combined (single block, 2-column grid)
  blocks.push(buildStatsAndMetaBlock(summary));

  // Failed test cases (only on failure)
  if (isFailed && summary.failedTests.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push(buildFailedTestsBlock(summary, pluginConfig));
  }

  // Flaky section (if enabled and present)
  if (pluginConfig.showFlaky && summary.flakyTests.length > 0) {
    blocks.push(buildFlakyBlock(summary, pluginConfig));
  }

  // Multiple reminders: section block at bottom
  if (showReminders && summary.reminders.length >= 2) {
    blocks.push(buildReminderSection(summary.reminders, pluginConfig.maxFailures));
  }

  return {
    attachments: [{
      color,
      fallback: `${statusEmoji} ${summary.projectName ? `${summary.projectName} pipeline` : 'Pipeline'} ${statusText}`,
      blocks,
    }],
  };
}

export function buildReminderThreadPayload(reminders: SkipReminder[]): SlackPayload {
  const lines = [`:bell: *Reminders (${reminders.length})*`, ''];

  reminders.forEach((r, i) => {
    const overdueText = r.daysOverdue === 0 ? 'Take a look today' : `Overdue ${r.daysOverdue} days`;
    lines.push(`${i + 1}. ${r.testName} — ${overdueText}`);
  });

  return {
    attachments: [{
      color: '#f2c744',
      fallback: `${reminders.length} skip reminders due`,
      blocks: [{
        type: 'section',
        text: mrkdwn(lines.join('\n')),
      }],
    }],
  };
}

function buildRunLink(summary: NormalizedSummary): string {
  const runId = summary.ci?.runId;
  if (runId && summary.ci?.runUrl) {
    return `<${summary.ci.runUrl}|#${runId}>`;
  }
  if (runId) {
    return `#${runId}`;
  }
  return '';
}

function buildPRLink(summary: NormalizedSummary): string | undefined {
  const ci = summary.ci;
  if (!ci?.pullRequestUrl || !ci.pullRequestNumber) return undefined;

  const label = ci.provider === 'gitlab' ? `MR !${ci.pullRequestNumber}` : `PR #${ci.pullRequestNumber}`;
  return `<${ci.pullRequestUrl}|${label}>`;
}

function resolveReportUrl(summary: NormalizedSummary): string | undefined {
  if (summary.reportUrl) return summary.reportUrl;
  if (summary.ci?.runUrl && summary.ci.provider === 'github') {
    return `${summary.ci.runUrl}#artifacts`;
  }
  return summary.ci?.runUrl;
}

function buildContextLine(summary: NormalizedSummary): string {
  const parts: string[] = [];

  parts.push(`*${formatDuration(summary.duration)}*`);

  const reportUrl = resolveReportUrl(summary);
  if (reportUrl) {
    parts.push(`*<${reportUrl}|View report>*`);
  }

  return parts.join('  |  ');
}

function buildStatsAndMetaBlock(summary: NormalizedSummary): SlackBlock {
  const { stats } = summary;
  const isFailed = summary.status === 'failed';

  const skippedNote = stats.skipped > 0 ? ` (${stats.skipped} skipped)` : '';
  const successCount = stats.passed + stats.flaky;
  const successValue = `${successCount} out of ${stats.total}${skippedNote}`;

  // 2-column grid: stats first, then meta pairs
  const fields: SlackText[] = [
    mrkdwn(`*Success*\n${successValue}`),
  ];

  if (isFailed && stats.flaky > 0) {
    fields.push(mrkdwn(`*Failed / Flaky*\n  ${stats.failed}   /   ${stats.flaky}  `));
  } else if (isFailed) {
    fields.push(mrkdwn(`*Failed*\n${stats.failed}`));
  } else if (stats.flaky > 0) {
    fields.push(mrkdwn(`*Flaky*\n${stats.flaky}`));
  }

  // Meta pairs (Branch, Environment, etc.)
  for (const entry of summary.meta) {
    if (entry.value) {
      fields.push(mrkdwn(`*${entry.key}*\n${entry.value}`));
    }
  }

  if (summary.environment !== 'default') {
    fields.push(mrkdwn(`*Environment*\n${summary.environment}`));
  }

  if (summary.triggeredBy) {
    fields.push(mrkdwn(`*Triggered by*\n${summary.triggeredBy}`));
  }

  return { type: 'section', fields };
}

function buildFlakyBlock(summary: NormalizedSummary, config: PluginConfig): SlackBlock {
  const { flakyTests } = summary;

  if (flakyTests.length > config.maxFailures) {
    const reportUrl = resolveReportUrl(summary);
    const reportLink = reportUrl
      ? ` <${reportUrl}|View report>`
      : '';
    return {
      type: 'section',
      text: mrkdwn(`*⚠️ Flaky tests (${flakyTests.length})*\nToo many flaky tests to display here 🙄${reportLink}`),
    };
  }

  const lines = [`*⚠️ Flaky tests (${flakyTests.length})*`, ''];
  for (const test of flakyTests) {
    const suite = test.suitePath.length > 0 ? test.suitePath.join(' > ') + ' > ' : '';
    lines.push(`⟳ ${suite}${test.name} _(retried ${test.retries}x)_`);
  }

  return {
    type: 'section',
    text: mrkdwn(lines.join('\n')),
  };
}

function buildFailedTestsBlock(
  summary: NormalizedSummary,
  config: PluginConfig,
): SlackBlock {
  const { failedTests } = summary;
  const maxFailures = config.maxFailures;

  if (failedTests.length > maxFailures) {
    const reportUrl = resolveReportUrl(summary);
    const reportLink = reportUrl
      ? ` <${reportUrl}|View report>`
      : '';
    return {
      type: 'section',
      text: mrkdwn(`*Failed test cases:*\nToo many failures to display here 🙄${reportLink}`),
    };
  }

  const numbered = failedTests.map((t, i) => {
    const ownerEntry = summary.owners?.find((o) => o.testName === t.name);
    const ownerSuffix = ownerEntry
      ? ` (${ownerEntry.owner.slack ?? ownerEntry.owner.name})`
      : '';
    return `${i + 1}. ${t.name}${ownerSuffix}`;
  });
  return {
    type: 'section',
    text: mrkdwn(`*Failed test cases:*\n${numbered.join('\n')}`),
  };
}

function buildSingleReminderLine(reminder: SkipReminder): string {
  const overdueText = reminder.daysOverdue === 0 ? 'due today' : `${reminder.daysOverdue}d overdue`;
  return `:bell: *1 reminder due* — \`${reminder.testName}\` (${overdueText})`;
}

function buildReminderSection(reminders: SkipReminder[], maxDisplay: number = 5): SlackBlock {
  const lines = [`:bell: *Reminders (${reminders.length})*`, ''];

  const displayed = reminders.slice(0, maxDisplay);
  const remaining = reminders.length - displayed.length;

  for (let i = 0; i < displayed.length; i++) {
    const r = displayed[i];
    const overdueText = r.daysOverdue === 0 ? 'Take a look today' : `Overdue ${r.daysOverdue} days`;
    lines.push(`${i + 1}. ${r.testName} — ${overdueText}`);
  }

  if (remaining > 0) {
    lines.push(`_+${remaining} more_`);
  }

  return {
    type: 'section',
    text: mrkdwn(lines.join('\n')),
  };
}

// --- Helpers ---

function mrkdwn(text: string): SlackText {
  return { type: 'mrkdwn', text };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds} seconds`;
  return `${minutes} minutes ${seconds} seconds`;
}
