import type { NormalizedSummary } from '../types';
import type { PluginConfig } from '../config/schema';
import type { BaseChannel } from './base-channel';
import { SlackChannel } from './slack/slack-channel';
import { TeamsChannel } from './teams/teams-channel';
import { EmailChannel } from './email/email-channel';

type SendResults = 'always' | 'on-failure' | 'off';

interface ChannelEntry {
  channel: BaseChannel;
  sendResults: SendResults;
}

export class ChannelManager {
  private entries: ChannelEntry[] = [];

  constructor(config: PluginConfig) {
    const globalSendResults = config.sendResults;

    if (config.channels.slack) {
      this.entries.push({
        channel: new SlackChannel(config.channels.slack, config),
        sendResults: config.channels.slack.sendResults ?? globalSendResults,
      });
    }

    if (config.channels.teams) {
      this.entries.push({
        channel: new TeamsChannel(config.channels.teams, config),
        sendResults: config.channels.teams.sendResults ?? globalSendResults,
      });
    }

    if (config.channels.email) {
      this.entries.push({
        channel: new EmailChannel(config.channels.email, config),
        sendResults: config.channels.email.sendResults ?? globalSendResults,
      });
    }
  }

  async sendAll(summary: NormalizedSummary): Promise<void> {
    const eligible = this.entries.filter((entry) =>
      this.shouldSend(entry.sendResults, summary),
    );

    if (eligible.length === 0) return;

    const results = await Promise.allSettled(
      eligible.map((entry) => entry.channel.send(summary)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const channelName = eligible[i].channel.name;
        console.error(`[playwright-notify] ${channelName} failed:`, result.reason);
      }
    }
  }

  private shouldSend(sendResults: SendResults, summary: NormalizedSummary): boolean {
    if (sendResults === 'off') return false;
    if (sendResults === 'on-failure' && summary.status === 'passed') return false;
    return true;
  }
}
