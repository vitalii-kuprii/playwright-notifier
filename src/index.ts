export { PlaywrightNotifyReporter } from './reporter';
export { SummaryBuilder } from './core/summary-builder';
export { detectCIContext } from './ci/ci-context';
export { ChannelManager } from './channels/channel-manager';
export { buildSlackPayload } from './channels/slack/slack-message-builder';
export type { PluginConfig } from './config/schema';
export type { NormalizedSummary, TestResult, MetaEntry, CIContext } from './types';

// Default export for Playwright reporter shorthand:
// reporter: [['playwright-notify', { ... }]]
export { PlaywrightNotifyReporter as default } from './reporter';
