import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { pluginConfigSchema, type PluginConfig } from './config/schema';
import { SummaryBuilder } from './core/summary-builder';
import { ChannelManager } from './channels/channel-manager';

export class PlaywrightNotifyReporter implements Reporter {
  private config: PluginConfig;
  private summaryBuilder: SummaryBuilder;
  private channelManager: ChannelManager;

  constructor(rawConfig: Partial<PluginConfig> = {}) {
    this.config = pluginConfigSchema.parse(rawConfig);
    this.summaryBuilder = new SummaryBuilder(this.config);
    this.channelManager = new ChannelManager(this.config);
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.summaryBuilder.onBegin(config);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.summaryBuilder.addTestResult(test, result);
  }

  async onEnd(result: FullResult): Promise<void> {
    const summary = this.summaryBuilder.build(result);


    if (this.config.sendResults === 'off') return;
    if (this.config.sendResults === 'on-failure' && summary.status === 'passed') return;

    await this.channelManager.sendAll(summary);
  }
}
