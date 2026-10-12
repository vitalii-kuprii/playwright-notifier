import type { NormalizedSummary } from '../../types';
import type { PluginConfig, DiscordChannelConfig } from '../../config/schema';
import { BaseChannel } from '../base-channel';
import { buildDiscordPayload } from './discord-message-builder';

export class DiscordChannel extends BaseChannel {
  readonly name = 'discord';
  private discordConfig: DiscordChannelConfig;
  private pluginConfig: PluginConfig;

  constructor(discordConfig: DiscordChannelConfig, pluginConfig: PluginConfig) {
    super();
    this.discordConfig = discordConfig;
    this.pluginConfig = pluginConfig;
  }

  async send(summary: NormalizedSummary): Promise<void> {
    const payload = buildDiscordPayload(summary, this.discordConfig, this.pluginConfig);

    const response = await fetch(this.discordConfig.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord webhook HTTP error: ${response.status} — ${text}`);
    }
  }
}
