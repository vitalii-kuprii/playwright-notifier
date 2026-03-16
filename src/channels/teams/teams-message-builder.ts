import type { NormalizedSummary, TestResult, SkipReminder } from '../../types';
import type { PluginConfig, TeamsChannelConfig } from '../../config/schema';

// Adaptive Card types (minimal subset)
interface AdaptiveCard {
  type: 'AdaptiveCard';
  $schema: string;
  version: string;
  body: CardElement[];
  msteams?: { width: string };
}

interface CardElement {
  type: string;
  text?: string;
  size?: string;
  weight?: string;
  color?: string;
  wrap?: boolean;
  spacing?: string;
  separator?: boolean;
  columns?: CardColumn[];
  items?: CardElement[];
  style?: string;
  facts?: { title: string; value: string }[];
  actions?: CardAction[];
}

interface CardColumn {
  type: 'Column';
  width: string;
  items: CardElement[];
}

interface CardAction {
  type: string;
  title: string;
  url: string;
}

export interface TeamsPayload {
  type: 'message';
  attachments: Array<{
    contentType: string;
    contentUrl: null;
    content: AdaptiveCard;
  }>;
}

export function buildTeamsPayload(
  summary: NormalizedSummary,
  teamsConfig: TeamsChannelConfig,
  pluginConfig: PluginConfig,
): TeamsPayload {
  const isFailed = summary.status === 'failed';
  const isFlaky = summary.status === 'flaky';

  const statusEmoji = isFailed ? '❌' : '✅';
  const statusText = isFailed ? 'failed' : 'passed';
  const statusColor = isFailed ? 'attention' : (isFlaky && pluginConfig.flaky.show) ? 'warning' : 'good';

  const body: CardElement[] = [];

  // Header
  const prLink = buildPRLink(summary);
  const runLink = buildRunLink(summary);
  const projectPrefix = summary.projectName ? `${summary.projectName} pipeline` : 'Pipeline';

  const headerLine = prLink
    ? [statusEmoji, projectPrefix, runLink, statusText, 'for', prLink].filter(Boolean).join(' ')
    : [statusEmoji, projectPrefix, statusText, runLink].filter(Boolean).join(' ');
  const headerParts = [headerLine];

  // Issue 11: Only render mentions when webhookType === 'powerautomate'
  // Standard webhooks can't resolve @mentions in Adaptive Cards
  const canMention = teamsConfig.webhookType === 'powerautomate';
  const shouldMention = isFailed || (isFlaky && pluginConfig.flaky.mention);

  if (canMention && shouldMention && summary.onCall && pluginConfig.rotation?.mentionInSummary !== false) {
    headerParts.push(`(${summary.onCall.name})`);
  } else if (canMention && shouldMention && teamsConfig.mentionOnFailure.length > 0) {
    headerParts.push(`cc ${teamsConfig.mentionOnFailure.join(', ')}`);
  }

  body.push({
    type: 'TextBlock',
    text: headerParts.join(' '),
    size: 'Medium',
    weight: 'Bolder',
    wrap: true,
    color: statusColor,
  });

  // Duration + report link
  const contextParts = [formatDuration(summary.duration)];
  if (summary.reportUrl) contextParts.push(`[View report](${summary.reportUrl})`);
  body.push({
    type: 'TextBlock',
    text: contextParts.join('  |  '),
    spacing: 'Small',
    wrap: true,
  });

  // Issue 6: Single reminder inline (after duration, before separator)
  const showReminders = pluginConfig.reminders.show && summary.reminders?.length > 0;
  if (showReminders && summary.reminders.length === 1) {
    const r = summary.reminders[0];
    const overdueText = r.daysOverdue === 0 ? 'due today' : `${r.daysOverdue}d overdue`;
    body.push({
      type: 'TextBlock',
      text: `🔔 **1 reminder due** — ${r.testName} (${overdueText})`,
      spacing: 'Small',
      wrap: true,
    });
  }

  // Separator
  body.push({ type: 'TextBlock', text: '', separator: true });

  // Issue 2: Stats + Meta (ColumnSet grid replacing FactSet)
  body.push(buildStatsAndMetaGrid(summary));

  // Failed tests
  if (isFailed && summary.failedTests.length > 0) {
    body.push({ type: 'TextBlock', text: '', separator: true });
    body.push(buildFailedTestsBlock(summary, pluginConfig));
  }

  // Flaky section
  if (pluginConfig.flaky.show && summary.flakyTests.length > 0) {
    body.push({ type: 'TextBlock', text: '', separator: true });
    body.push(buildFlakyBlock(summary, pluginConfig));
  }

  // Issue 6: Multiple reminders at bottom
  if (showReminders && summary.reminders.length >= 2) {
    body.push({ type: 'TextBlock', text: '', separator: true });
    body.push(buildRemindersBlock(summary.reminders, pluginConfig.display.maxFailures));
  }

  // Issue 1: Only "View Report" action — removed redundant "View Pipeline" button
  const actions: CardAction[] = [];
  if (summary.reportUrl) {
    actions.push({ type: 'Action.OpenUrl', title: 'View Report', url: summary.reportUrl });
  }

  const card: AdaptiveCard = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
    msteams: { width: 'Full' },
  };

  if (actions.length > 0) {
    (card.body as CardElement[]).push({ type: 'ActionSet', actions } as CardElement);
  }

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: card,
    }],
  };
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

// Issue 2: ColumnSet grid replacing two separate FactSets
function buildStatsAndMetaGrid(summary: NormalizedSummary): CardElement {
  const { stats } = summary;
  const skippedNote = stats.skipped > 0 ? ` (${stats.skipped} skipped)` : '';
  const successCount = stats.passed + stats.flaky;

  const pairs: { label: string; value: string }[] = [
    { label: 'Success', value: `${successCount} out of ${stats.total}${skippedNote}` },
  ];

  if (summary.status === 'failed' && stats.flaky > 0) {
    pairs.push({ label: 'Failed / Flaky', value: `${stats.failed} / ${stats.flaky}` });
  } else if (summary.status === 'failed') {
    pairs.push({ label: 'Failed', value: `${stats.failed}` });
  } else if (stats.flaky > 0) {
    pairs.push({ label: 'Flaky', value: `${stats.flaky}` });
  }

  for (const entry of summary.meta) {
    if (entry.value) {
      pairs.push({ label: entry.key, value: entry.value });
    }
  }

  if (summary.environment !== 'default') {
    pairs.push({ label: 'Environment', value: summary.environment });
  }

  if (summary.triggeredBy) {
    pairs.push({ label: 'Triggered by', value: summary.triggeredBy });
  }

  // Build 2-column grid: each Column has bold label TextBlock + value TextBlock
  const columns: CardColumn[] = pairs.map(p => ({
    type: 'Column' as const,
    width: 'auto',
    items: [
      { type: 'TextBlock', text: p.label, weight: 'Bolder', spacing: 'None' },
      { type: 'TextBlock', text: p.value, spacing: 'None' },
    ],
  }));

  return { type: 'ColumnSet', columns };
}

function buildFlakyBlock(summary: NormalizedSummary, config: PluginConfig): CardElement {
  const { flakyTests } = summary;

  // Issue 12: No "View report" link in flaky "too many" message for Teams
  if (flakyTests.length > config.display.maxFailures) {
    return { type: 'TextBlock', text: `**⚠️ Flaky tests (${flakyTests.length})**\n\nToo many flaky tests to display here 🙄`, wrap: true };
  }

  // Issue 13: Numbered list instead of ⟳
  const lines = [`**⚠️ Flaky tests (${flakyTests.length})**`, ''];
  flakyTests.forEach((test, i) => {
    const suite = test.suitePath.length > 0 ? test.suitePath.join(' > ') + ' > ' : '';
    lines.push(`${i + 1}. ${suite}${test.name} _(retried ${test.retries}x)_`);
  });
  return { type: 'TextBlock', text: lines.join('\n\n'), wrap: true };
}

function buildFailedTestsBlock(summary: NormalizedSummary, config: PluginConfig): CardElement {
  const { failedTests } = summary;

  if (failedTests.length > config.display.maxFailures) {
    const reportNote = summary.reportUrl ? ` [View report](${summary.reportUrl})` : '';
    return {
      type: 'TextBlock',
      text: `**Failed test cases:**\n\nToo many failures to display here 🙄${reportNote}`,
      wrap: true,
    };
  }

  // Issue 7: Show suitePath > testName for failed tests
  const lines = ['**Failed test cases:**', ''];
  failedTests.forEach((t, i) => {
    const ownerEntry = summary.owners?.find((o) => o.testName === t.name);
    const ownerSuffix = ownerEntry ? ` (${ownerEntry.owner.name})` : '';
    const fullName = [...t.suitePath, t.name].filter(Boolean).join(' > ');
    lines.push(`${i + 1}. ${fullName}${ownerSuffix}`);
  });

  return { type: 'TextBlock', text: lines.join('\n\n'), wrap: true };
}

function buildRemindersBlock(reminders: SkipReminder[], maxDisplay: number): CardElement {
  const lines = [`🔔 **Reminders (${reminders.length})**`, ''];
  const displayed = reminders.slice(0, maxDisplay);
  const remaining = reminders.length - displayed.length;

  displayed.forEach((r, i) => {
    const overdueText = r.daysOverdue === 0 ? 'Take a look today' : `Overdue ${r.daysOverdue} days`;
    lines.push(`${i + 1}. ${r.testName} — ${overdueText}`);
  });

  if (remaining > 0) lines.push(`_+${remaining} more_`);

  return { type: 'TextBlock', text: lines.join('\n\n'), wrap: true };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} seconds`;
  return `${minutes} minutes ${seconds} seconds`;
}
