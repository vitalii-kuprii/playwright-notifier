import type { NormalizedSummary } from '../../types';
import type { PluginConfig, EmailChannelConfig } from '../../config/schema';
import { BaseChannel } from '../base-channel';
import { buildEmailContent } from './email-template-builder';

export class EmailChannel extends BaseChannel {
  readonly name = 'email';
  private emailConfig: EmailChannelConfig;
  private pluginConfig: PluginConfig;

  constructor(emailConfig: EmailChannelConfig, pluginConfig: PluginConfig) {
    super();
    this.emailConfig = emailConfig;
    this.pluginConfig = pluginConfig;
  }

  async send(summary: NormalizedSummary): Promise<void> {
    const { subject, html } = buildEmailContent(summary, this.pluginConfig);

    const { host, port, secure, auth } = this.emailConfig.smtp;
    const from = this.emailConfig.from ?? auth.user;
    const to = this.emailConfig.to.join(', ');

    // Build raw SMTP payload and send via nodemailer-compatible transport
    // Using native fetch to an SMTP-to-HTTP bridge, or dynamic import of nodemailer
    const nodemailer = await loadNodemailer();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: auth.user, pass: auth.pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
  }
}

async function loadNodemailer(): Promise<any> {
  try {
    return await import('nodemailer');
  } catch {
    throw new Error(
      '[playwright-notify] Email channel requires "nodemailer" package. Install it with: npm install nodemailer',
    );
  }
}
