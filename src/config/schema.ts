import { z } from 'zod';

const slackChannelSchema = z.object({
  webhookUrl: z.string().url().optional(),
  token: z.string().optional(),
  channels: z.array(z.string()).default([]),
  threads: z.boolean().default(false),
  mentionOnFailure: z.array(z.string()).default([]),
  sendResults: z.enum(['always', 'on-failure', 'off']).optional(),
  reminderPlacement: z.enum(['inline', 'thread']).default('inline'),
}).refine(
  (data) => data.webhookUrl || (data.token && data.channels.length > 0),
  { message: 'Slack requires either webhookUrl or both token and channels' },
);

const webhookChannelSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).default({}),
  method: z.enum(['POST', 'PUT']).default('POST'),
  sendResults: z.enum(['always', 'on-failure', 'off']).optional(),
});

const teamsChannelSchema = z.object({
  webhookUrl: z.string().url(),
  webhookType: z.enum(['standard', 'powerautomate']).default('standard'),
  mentionOnFailure: z.array(z.string()).default([]),
  sendResults: z.enum(['always', 'on-failure', 'off']).optional(),
});

const emailSmtpSchema = z.object({
  host: z.string(),
  port: z.number().default(587),
  secure: z.boolean().default(false),
  auth: z.object({
    user: z.string(),
    pass: z.string(),
  }),
});

const emailChannelSchema = z.object({
  to: z.array(z.string().email()).min(1),
  from: z.string().email().optional(),
  subject: z.string().default('[{{status}}] {{projectName}} — {{passed}}/{{total}} passed'),
  smtp: emailSmtpSchema,
  sendResults: z.enum(['always', 'on-failure', 'off']).optional(),
});

const metaEntrySchema = z.object({
  key: z.string(),
  value: z.string().optional(),
});

const rotationMemberSchema = z.object({
  name: z.string(),
  slack: z.string().optional(),
  email: z.string().optional(),
});

const rotationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.enum(['daily', 'weekly', 'biweekly']).default('weekly'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  members: z.array(rotationMemberSchema).min(1),
  calendar: z.record(z.string()).default({}),
  mentionInSummary: z.boolean().default(true),
});

export const pluginConfigSchema = z.object({
  sendResults: z.enum(['always', 'on-failure', 'off']).default('always'),
  projectName: z.string().default('Playwright Tests'),
  environment: z.string().default('default'),
  branch: z.string().optional(),

  channels: z.object({
    slack: slackChannelSchema.optional(),
    webhook: webhookChannelSchema.optional(),
    teams: teamsChannelSchema.optional(),
    email: emailChannelSchema.optional(),
  }).default({}),

  meta: z.array(metaEntrySchema).default([]),

  // Display options
  maxFailures: z.number().default(5),
  maxErrorLength: z.number().default(300),
  showFlaky: z.boolean().default(false),
  mentionOnFlaky: z.boolean().default(false),
  showReminders: z.boolean().default(true),

  // Report link (base URL to index.html)
  reportUrl: z.string().optional(),

  // On-call rotation
  rotation: rotationConfigSchema.optional(),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;
export type SlackChannelConfig = z.infer<typeof slackChannelSchema>;
export type WebhookChannelConfig = z.infer<typeof webhookChannelSchema>;
export type TeamsChannelConfig = z.infer<typeof teamsChannelSchema>;
export type EmailChannelConfig = z.infer<typeof emailChannelSchema>;
export type RotationConfig = z.infer<typeof rotationConfigSchema>;
