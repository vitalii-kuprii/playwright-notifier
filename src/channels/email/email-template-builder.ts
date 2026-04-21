import type { NormalizedSummary, TestResult, SkipReminder } from '../../types';
import type { PluginConfig } from '../../config/schema';

export interface EmailContent {
  subject: string;
  html: string;
}

const COLORS = {
  passed: '#36a64f',
  failed: '#e01e5a',
  flaky: '#f2c744',
} as const;

export function buildEmailContent(
  summary: NormalizedSummary,
  pluginConfig: PluginConfig,
): EmailContent {
  const subject = interpolateSubject(
    pluginConfig.channels.email!.subject,
    summary,
  );

  const html = buildHtmlBody(summary, pluginConfig);

  return { subject, html };
}

export function interpolateSubject(
  template: string,
  summary: NormalizedSummary,
): string {
  const vars: Record<string, string> = {
    projectName: summary.projectName ?? '',
    status: summary.runStatus === 'interrupted' ? 'cancelled' : summary.runStatus === 'timedout' ? 'timed out' : summary.status,
    passed: String(summary.stats.passed),
    failed: String(summary.stats.failed),
    skipped: String(summary.stats.skipped),
    flaky: String(summary.stats.flaky),
    total: String(summary.stats.total),
    environment: summary.environment,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function buildHtmlBody(summary: NormalizedSummary, pluginConfig: PluginConfig): string {
  const isFailed = summary.status === 'failed';
  const isFlaky = summary.status === 'flaky';
  const isInterrupted = summary.runStatus === 'interrupted';
  const isTimedOut = summary.runStatus === 'timedout';
  const statusColor = (isFailed || isInterrupted || isTimedOut) ? COLORS.failed : (isFlaky && pluginConfig.flaky.show) ? COLORS.flaky : COLORS.passed;
  const statusEmoji = (isFailed || isInterrupted || isTimedOut) ? '❌' : '✅';
  const statusText = isInterrupted ? 'was cancelled' : isTimedOut ? 'timed out' : isFailed ? 'failed' : 'passed';

  const sections: string[] = [];

  // Header
  const runLink = buildRunLink(summary, statusColor);
  const projectPrefix = summary.projectName
    ? `<strong>${esc(summary.projectName)}</strong> pipeline`
    : 'Pipeline';

  const prLink = buildPRLink(summary);

  const headerLine = prLink
    ? [statusEmoji, projectPrefix, runLink, esc(statusText), 'for', prLink].filter(Boolean).join(' ')
    : [statusEmoji, projectPrefix, esc(statusText), runLink].filter(Boolean).join(' ');

  sections.push(`
    <div style="border-left:4px solid ${statusColor};padding:12px 16px;margin-bottom:16px;">
      <h2 style="margin:0;font-size:18px;color:${statusColor};">
        ${headerLine}
      </h2>
      <p style="margin:4px 0 0;color:#666;font-size:14px;">
        ${esc(formatDuration(summary.duration))}${summary.reportUrl ? ` | <a href="${esc(summary.reportUrl)}">View report</a>` : ''}
      </p>
    </div>
  `);

  // Shard warning
  if (summary.shards) {
    sections.push(`
    <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:8px 12px;margin-bottom:16px;color:#856404;">
      ⚠️ <strong>Warning:</strong> only ${summary.shards.actual} of ${summary.shards.expected} shards reported — results are incomplete
    </div>
    `);
  }

  // Stats table
  sections.push(buildStatsTable(summary));

  // Meta
  const metaEntries = summary.meta.filter((e) => e.value);
  if (metaEntries.length > 0 || summary.environment !== 'default') {
    sections.push(buildMetaTable(summary));
  }

  // Failed tests
  if (isFailed && summary.failedTests.length > 0) {
    sections.push(buildFailedSection(summary, pluginConfig));
  }

  // Flaky
  if (pluginConfig.flaky.show && summary.flakyTests.length > 0) {
    sections.push(buildFlakySection(summary, pluginConfig));
  }

  // Reminders
  if (pluginConfig.reminders.show && summary.reminders?.length > 0) {
    sections.push(buildRemindersSection(summary.reminders, pluginConfig.display.maxFailures));
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:16px;">
  ${sections.join('\n')}
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
  <p style="font-size:12px;color:#999;">Sent by playwright-notify</p>
</body>
</html>`.trim();
}

function buildStatsTable(summary: NormalizedSummary): string {
  const { stats } = summary;
  const skippedNote = stats.skipped > 0 ? ` (${stats.skipped} skipped)` : '';
  const successCount = stats.passed + stats.flaky;

  const rows = [
    ['Success', `${successCount} out of ${stats.total}${skippedNote}`],
  ];

  if (summary.status === 'failed' && stats.flaky > 0) {
    rows.push(['Failed / Flaky', `${stats.failed} / ${stats.flaky}`]);
  } else if (summary.status === 'failed') {
    rows.push(['Failed', `${stats.failed}`]);
  } else if (stats.flaky > 0) {
    rows.push(['Flaky', `${stats.flaky}`]);
  }

  return `
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
      ${rows.map(([label, value]) => `
        <tr>
          <td style="padding:6px 12px;border:1px solid #eee;font-weight:bold;width:120px;">${esc(label)}</td>
          <td style="padding:6px 12px;border:1px solid #eee;">${esc(value)}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function buildMetaTable(summary: NormalizedSummary): string {
  const rows: [string, string][] = [];

  for (const entry of summary.meta) {
    if (entry.value) rows.push([entry.key, entry.value]);
  }
  if (summary.environment !== 'default') {
    rows.push(['Environment', summary.environment]);
  }

  if (summary.triggeredBy) {
    rows.push(['Triggered by', summary.triggeredBy]);
  }

  return `
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
      ${rows.map(([label, value]) => `
        <tr>
          <td style="padding:4px 12px;border:1px solid #eee;font-weight:bold;width:120px;">${esc(label)}</td>
          <td style="padding:4px 12px;border:1px solid #eee;">${esc(value)}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function buildFlakySection(summary: NormalizedSummary, config: PluginConfig): string {
  const { flakyTests } = summary;

  if (flakyTests.length > config.display.maxFailures) {
    const reportLink = summary.reportUrl
      ? ` <a href="${esc(summary.reportUrl)}">View report</a>`
      : '';
    return `
    <div style="margin-bottom:16px;">
      <strong>⚠️ Flaky tests (${flakyTests.length})</strong>
      <p>Too many flaky tests to display here 🙄${reportLink}</p>
    </div>
  `;
  }

  const items = flakyTests.map((t) => {
    const suite = t.suitePath.length > 0 ? t.suitePath.join(' &gt; ') + ' &gt; ' : '';
    return `<li>⟳ ${esc(suite)}${esc(t.name)} <em>(retried ${t.retries}x)</em></li>`;
  });

  return `
    <div style="margin-bottom:16px;">
      <strong>⚠️ Flaky tests (${flakyTests.length})</strong>
      <ul style="margin:8px 0;padding-left:20px;">${items.join('')}</ul>
    </div>
  `;
}

function buildFailedSection(summary: NormalizedSummary, config: PluginConfig): string {
  const { failedTests } = summary;

  if (failedTests.length > config.display.maxFailures) {
    const reportNote = summary.reportUrl
      ? ` <a href="${esc(summary.reportUrl)}">View report</a>`
      : '';
    return `
      <div style="margin-bottom:16px;">
        <strong>Failed test cases:</strong>
        <p>Too many failures to display here 🙄${reportNote}</p>
      </div>
    `;
  }

  const items = failedTests.map((t, i) => {
    const ownerEntry = summary.owners?.find((o) => o.testName === t.name);
    const ownerSuffix = ownerEntry ? ` (${esc(ownerEntry.owner.name)})` : '';
    const fullName = [...t.suitePath, t.name].filter(Boolean).join(' > ');
    return `<li>${esc(fullName)}${ownerSuffix}</li>`;
  });

  return `
    <div style="margin-bottom:16px;">
      <strong>Failed test cases:</strong>
      <ol style="margin:8px 0;padding-left:20px;">${items.join('')}</ol>
    </div>
  `;
}

function buildRemindersSection(reminders: SkipReminder[], maxDisplay: number): string {
  const displayed = reminders.slice(0, maxDisplay);
  const remaining = reminders.length - displayed.length;

  const items = displayed.map((r) => {
    const overdueText = r.daysOverdue === 0 ? 'Take a look today' : `Overdue ${r.daysOverdue} days`;
    return `<li>${esc(r.testName)} — ${esc(overdueText)}</li>`;
  });

  const moreNote = remaining > 0 ? `<p><em>+${remaining} more</em></p>` : '';

  return `
    <div style="margin-bottom:16px;">
      <strong>🔔 Reminders (${reminders.length})</strong>
      <ol style="margin:8px 0;padding-left:20px;">${items.join('')}</ol>
      ${moreNote}
    </div>
  `;
}

function buildRunLink(summary: NormalizedSummary, statusColor: string): string {
  const runId = summary.ci?.runId;
  if (runId && summary.ci?.runUrl) {
    return `<a href="${esc(summary.ci.runUrl)}" style="color:${statusColor};text-decoration:none;">#${esc(runId)}</a>`;
  }
  if (runId) {
    return `#${esc(runId)}`;
  }
  return '';
}

function buildPRLink(summary: NormalizedSummary): string | undefined {
  const ci = summary.ci;
  if (!ci?.pullRequestUrl || !ci.pullRequestNumber) return undefined;

  const label = ci.provider === 'gitlab' ? `MR !${ci.pullRequestNumber}` : `PR #${ci.pullRequestNumber}`;
  return `<a href="${esc(ci.pullRequestUrl)}">${esc(label)}</a>`;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} seconds`;
  return `${minutes} minutes ${seconds} seconds`;
}
