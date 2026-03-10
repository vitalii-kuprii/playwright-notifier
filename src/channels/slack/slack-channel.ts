import type { NormalizedSummary } from '../../types';
import type { PluginConfig, SlackChannelConfig } from '../../config/schema';
import { BaseChannel } from '../base-channel';
import { buildSlackPayload, buildReminderThreadPayload } from './slack-message-builder';

export class SlackChannel extends BaseChannel {
  readonly name = 'slack';
  private slackConfig: SlackChannelConfig;
  private pluginConfig: PluginConfig;

  constructor(slackConfig: SlackChannelConfig, pluginConfig: PluginConfig) {
    super();
    this.slackConfig = slackConfig;
    this.pluginConfig = pluginConfig;
  }

  async send(summary: NormalizedSummary): Promise<void> {
    const isThreadReminder = this.slackConfig.reminderPlacement === 'thread'
      && !this.slackConfig.webhookUrl
      && this.pluginConfig.showReminders
      && summary.reminders?.length > 0;

    const payload = buildSlackPayload(
      summary,
      this.slackConfig,
      this.pluginConfig,
      { excludeReminders: isThreadReminder },
    );

    if (this.slackConfig.webhookUrl) {
      await this.postWebhook(payload);
    } else {
      for (const channel of this.slackConfig.channels) {
        const ts = await this.postBotMessage(channel, payload);

        if (isThreadReminder && ts) {
          const threadPayload = buildReminderThreadPayload(summary.reminders);
          try {
            await this.postThreadReply(channel, ts, threadPayload);
          } catch (err) {
            console.warn(`[playwright-notify] Failed to post reminder thread reply: ${err}`);
          }
        }
      }
    }
  }

  private async postWebhook(
    payload: ReturnType<typeof buildSlackPayload>,
  ): Promise<void> {
    const response = await fetch(this.slackConfig.webhookUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Slack webhook HTTP error: ${response.status} — ${body}`);
    }
  }

  private async postBotMessage(
    channel: string,
    payload: ReturnType<typeof buildSlackPayload>,
  ): Promise<string> {
    const token = this.slackConfig.token;

    if (!token) {
      throw new Error('[playwright-notify] Slack token is required');
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        ...payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as { ok: boolean; error?: string; ts?: string };
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data.ts ?? '';
  }

  private async postThreadReply(
    channel: string,
    threadTs: string,
    payload: ReturnType<typeof buildSlackPayload>,
  ): Promise<void> {
    const token = this.slackConfig.token;

    if (!token) {
      throw new Error('[playwright-notify] Slack token is required');
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        thread_ts: threadTs,
        ...payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
  }
}
