import type { NormalizedSummary, SkipReminder } from '../../types';
import type { PluginConfig, DiscordChannelConfig } from '../../config/schema';

interface DiscordEmbed {
  color: number;
  title: string;
  url?: string;
  description: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}

interface DiscordPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds: DiscordEmbed[];
}

const COLOR_GREEN = 0x36a64f;
const COLOR_RED = 0xe01e5a;
const COLOR_YELLOW = 0xf2c744;

export function buildDiscordPayload(
  summary: NormalizedSummary,
  discordConfig: DiscordChannelConfig,
  pluginConfig: PluginConfig,
): DiscordPayload {
  const isFailed = summary.status === 'failed';
  const isFlaky = summary.status === 'flaky';
  const isInterrupted = summary.runStatus === 'interrupted';
  const isTimedOut = summary.runStatus === 'timedout';

  const statusEmoji = (isFailed || isInterrupted || isTimedOut) ? '❌' : '✅';
  const statusText = isInterrupted ? 'was cancelled' : isTimedOut ? 'timed out' : isFailed ? 'failed' : 'passed';
  const color = (isFailed || isInterrupted || isTimedOut) ? COLOR_RED : (isFlaky && pluginConfig.flaky.show) ? COLOR_YELLOW : COLOR_GREEN;

  const runLink = buildRunLink(summary);
  const prLink = buildPRLink(summary);
  const projectPrefix = summary.projectName ? `${summary.projectName} pipeline` : 'Pipeline';

  const title = prLink
    ? [statusEmoji, projectPrefix, runLink, statusText, 'for', prLink].filter(Boolean).join(' ')
    : [statusEmoji, projectPrefix, statusText, runLink].filter(Boolean).join(' ');

  // Description: duration, report link, shard warning, single reminder
  const descriptionParts: string[] = [];

  const contextLine = buildContextLine(summary);
  if (contextLine) descriptionParts.push(contextLine);

  if (summary.shards) {
    descriptionParts.push(`⚠️ **Warning:** only ${summary.shards.actual} of ${summary.shards.expected} shards reported — results are incomplete`);
  }

  const showReminders = pluginConfig.reminders.show && summary.reminders?.length > 0;
  if (showReminders && summary.reminders.length === 1) {
    descriptionParts.push(buildSingleReminderLine(summary.reminders[0]));
  }

  // Fields: stats + meta (inline grid)
  const fields: DiscordEmbed['fields'] = buildStatsAndMetaFields(summary);

  // Bottom sections as non-inline fields
  if (isFailed && summary.failedTests.length > 0) {
    fields.push(buildFailedTestsField(summary, pluginConfig));
  }
  if (pluginConfig.flaky.show && summary.flakyTests.length > 0) {
    fields.push(buildFlakyField(summary, pluginConfig));
  }
  if (showReminders && summary.reminders.length >= 2) {
    fields.push(buildReminderField(summary.reminders, pluginConfig.display.maxFailures));
  }

  // Mentions: must be in content (outside embeds) to actually ping
  const shouldMention = isFailed || (isFlaky && pluginConfig.flaky.mention);
  const hasOnCall = shouldMention && summary.onCall && pluginConfig.rotation?.mentionInSummary !== false;
  let content: string | undefined;

  if (hasOnCall) {
    content = summary.onCall!.slack ?? summary.onCall!.name;
  } else if (shouldMention && discordConfig.mentionOnFailure.length > 0) {
    content = discordConfig.mentionOnFailure.join(' ');
  }

  const payload: DiscordPayload = {
    embeds: [{
      color,
      title,
      url: summary.ci?.runUrl,
      description: descriptionParts.join('\n'),
      fields,
    }],
  };

  if (content) payload.content = content;
  if (discordConfig.username) payload.username = discordConfig.username;
  if (discordConfig.avatarUrl) payload.avatar_url = discordConfig.avatarUrl;

  return payload;
}

function buildRunLink(summary: NormalizedSummary): string {
  const runId = summary.ci?.runId;
  if (runId && summary.ci?.runUrl) {
    return `[#${runId}](${summary.ci.runUrl})`;
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
  return `[${label}](${ci.pullRequestUrl})`;
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

  parts.push(`**${formatDuration(summary.duration)}**`);

  const reportUrl = resolveReportUrl(summary);
  if (reportUrl) {
    parts.push(`**[View report](${reportUrl})**`);
  }

  return parts.join('  |  ');
}

function buildStatsAndMetaFields(summary: NormalizedSummary): DiscordEmbed['fields'] {
  const { stats } = summary;
  const isFailed = summary.status === 'failed';

  const skippedNote = stats.skipped > 0 ? ` (${stats.skipped} skipped)` : '';
  const successCount = stats.passed + stats.flaky;
  const successValue = `${successCount} out of ${stats.total}${skippedNote}`;

  const fields: DiscordEmbed['fields'] = [
    { name: 'Success', value: successValue, inline: true },
  ];

  if (isFailed && stats.flaky > 0) {
    fields.push({ name: 'Failed / Flaky', value: `${stats.failed}  /  ${stats.flaky}`, inline: true });
  } else if (isFailed) {
    fields.push({ name: 'Failed', value: `${stats.failed}`, inline: true });
  } else if (stats.flaky > 0) {
    fields.push({ name: 'Flaky', value: `${stats.flaky}`, inline: true });
  }

  for (const entry of summary.meta) {
    if (entry.value) {
      fields.push({ name: entry.key, value: entry.value, inline: true });
    }
  }

  if (summary.environment !== 'default') {
    fields.push({ name: 'Environment', value: summary.environment, inline: true });
  }

  if (summary.triggeredBy) {
    fields.push({ name: 'Triggered by', value: summary.triggeredBy, inline: true });
  }

  return fields;
}

function buildFailedTestsField(
  summary: NormalizedSummary,
  config: PluginConfig,
): DiscordEmbed['fields'][number] {
  const { failedTests } = summary;
  const maxFailures = config.display.maxFailures;

  if (failedTests.length > maxFailures) {
    const reportUrl = resolveReportUrl(summary);
    const reportLink = reportUrl ? ` [View report](${reportUrl})` : '';
    return {
      name: 'Failed test cases',
      value: `Too many failures to display here 🙄${reportLink}`,
    };
  }

  const numbered = failedTests.map((t, i) => {
    const ownerEntry = summary.owners?.find((o) => o.testName === t.name);
    const ownerSuffix = ownerEntry
      ? ` (${ownerEntry.owner.slack ?? ownerEntry.owner.name})`
      : '';
    const fullName = [...t.suitePath, t.name].filter(Boolean).join(' > ');
    return `${i + 1}. ${fullName}${ownerSuffix}`;
  });

  return {
    name: 'Failed test cases',
    value: numbered.join('\n'),
  };
}

function buildFlakyField(
  summary: NormalizedSummary,
  config: PluginConfig,
): DiscordEmbed['fields'][number] {
  const { flakyTests } = summary;

  if (flakyTests.length > config.display.maxFailures) {
    const reportUrl = resolveReportUrl(summary);
    const reportLink = reportUrl ? ` [View report](${reportUrl})` : '';
    return {
      name: `⚠️ Flaky tests (${flakyTests.length})`,
      value: `Too many flaky tests to display here 🙄${reportLink}`,
    };
  }

  const lines = flakyTests.map((test, i) => {
    const suite = test.suitePath.length > 0 ? test.suitePath.join(' > ') + ' > ' : '';
    return `${i + 1}. ${suite}${test.name} *(retried ${test.retries}x)*`;
  });

  return {
    name: `⚠️ Flaky tests (${flakyTests.length})`,
    value: lines.join('\n'),
  };
}

function buildSingleReminderLine(reminder: SkipReminder): string {
  const overdueText = reminder.daysOverdue === 0 ? 'due today' : `${reminder.daysOverdue}d overdue`;
  return `🔔 **1 reminder due** — \`${reminder.testName}\` (${overdueText})`;
}

function buildReminderField(reminders: SkipReminder[], maxDisplay: number = 5): DiscordEmbed['fields'][number] {
  const displayed = reminders.slice(0, maxDisplay);
  const remaining = reminders.length - displayed.length;

  const lines = displayed.map((r, i) => {
    const overdueText = r.daysOverdue === 0 ? 'Take a look today' : `Overdue ${r.daysOverdue} days`;
    return `${i + 1}. ${r.testName} — ${overdueText}`;
  });

  if (remaining > 0) {
    lines.push(`*+${remaining} more*`);
  }

  return {
    name: `🔔 Reminders (${reminders.length})`,
    value: lines.join('\n'),
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds} seconds`;
  return `${minutes} minutes ${seconds} seconds`;
}
