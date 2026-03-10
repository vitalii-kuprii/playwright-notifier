import type { NormalizedSummary } from '../../types';
import type { PluginConfig, TeamsChannelConfig } from '../../config/schema';
import { BaseChannel } from '../base-channel';
import { buildTeamsPayload } from './teams-message-builder';

export class TeamsChannel extends BaseChannel {
  readonly name = 'teams';
  private teamsConfig: TeamsChannelConfig;
  private pluginConfig: PluginConfig;

  constructor(teamsConfig: TeamsChannelConfig, pluginConfig: PluginConfig) {
    super();
    this.teamsConfig = teamsConfig;
    this.pluginConfig = pluginConfig;
  }

  async send(summary: NormalizedSummary): Promise<void> {
    const payload = buildTeamsPayload(summary, this.teamsConfig, this.pluginConfig);

    const body = this.teamsConfig.webhookType === 'powerautomate'
      ? payload
      : payload;

    const response = await fetch(this.teamsConfig.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Teams webhook HTTP error: ${response.status} — ${text}`);
    }
  }
}
