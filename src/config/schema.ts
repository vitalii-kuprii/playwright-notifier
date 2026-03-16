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

// --- Backward-compat preprocess: migrate deprecated flat keys to nested shape ---
function migrateConfig(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const data = { ...(input as Record<string, unknown>) };

  // Issue 10: showFlaky / mentionOnFlaky → flaky: { show, mention }
  if ('showFlaky' in data || 'mentionOnFlaky' in data) {
    if (!data.flaky) {
      console.warn('⚠ playwright-notifier: "showFlaky"/"mentionOnFlaky" are deprecated — use "flaky: { show, mention }" instead');
      data.flaky = {};
    }
    const flaky = data.flaky as Record<string, unknown>;
    if ('showFlaky' in data) {
      flaky.show = flaky.show ?? data.showFlaky;
      delete data.showFlaky;
    }
    if ('mentionOnFlaky' in data) {
      flaky.mention = flaky.mention ?? data.mentionOnFlaky;
      delete data.mentionOnFlaky;
    }
  }

  // Issue 15: showReminders → reminders: { show }
  if ('showReminders' in data) {
    if (!data.reminders) {
      console.warn('⚠ playwright-notifier: "showReminders" is deprecated — use "reminders: { show }" instead');
      data.reminders = { show: data.showReminders };
    }
    delete data.showReminders;
  }

  // Issue 15: maxFailures / maxErrorLength / reportUrl → display: { ... }
  const hasDeprecatedDisplay = 'maxFailures' in data || 'maxErrorLength' in data || 'reportUrl' in data;
  if (hasDeprecatedDisplay) {
    if (!data.display) {
      console.warn('⚠ playwright-notifier: "maxFailures"/"maxErrorLength"/"reportUrl" are deprecated — use "display: { ... }" instead');
      data.display = {};
    }
    const display = data.display as Record<string, unknown>;
    if ('maxFailures' in data) { display.maxFailures = display.maxFailures ?? data.maxFailures; delete data.maxFailures; }
    if ('maxErrorLength' in data) { display.maxErrorLength = display.maxErrorLength ?? data.maxErrorLength; delete data.maxErrorLength; }
    if ('reportUrl' in data) { display.reportUrl = display.reportUrl ?? data.reportUrl; delete data.reportUrl; }
  }

  // Issue 14: showTriggeredBy flat mapping → { users, onFailure }
  if (data.showTriggeredBy && typeof data.showTriggeredBy === 'object' && !Array.isArray(data.showTriggeredBy)) {
    const obj = data.showTriggeredBy as Record<string, unknown>;
    // Detect flat mapping: object that does NOT have 'users' or 'onFailure' keys
    if (!('users' in obj) && !('onFailure' in obj)) {
      console.warn('⚠ playwright-notifier: flat "showTriggeredBy" mapping is deprecated — use "showTriggeredBy: { users: { ... } }" instead');
      data.showTriggeredBy = { users: obj, onFailure: false };
    }
  }

  return data;
}

export const pluginConfigSchema = z.preprocess(migrateConfig, z.object({
  sendResults: z.enum(['always', 'on-failure', 'off']).default('always'),
  ciOnly: z.boolean().default(true),
  projectName: z.string().optional(),
  environment: z.string().default('default'),
  branch: z.string().optional(),

  channels: z.object({
    slack: slackChannelSchema.optional(),
    webhook: webhookChannelSchema.optional(),
    teams: teamsChannelSchema.optional(),
    email: emailChannelSchema.optional(),
  }).default({}),

  meta: z.array(metaEntrySchema).default([]),

  // Display options (Issue 15)
  display: z.object({
    maxFailures: z.number().default(5),
    maxErrorLength: z.number().default(300),
    reportUrl: z.string().optional(),
  }).default({}),

  // Flaky config (Issue 10)
  flaky: z.object({
    show: z.boolean().default(false),
    mention: z.boolean().default(false),
  }).default({}),

  // Reminders (Issue 15)
  reminders: z.object({
    show: z.boolean().default(true),
  }).default({}),

  // Triggered by (Issue 14)
  showTriggeredBy: z.union([
    z.boolean(),
    z.object({
      users: z.record(z.string()),
      onFailure: z.boolean().default(false),
    }),
  ]).default(false),

  // On-call rotation
  rotation: rotationConfigSchema.optional(),
}));

export type PluginConfig = z.infer<typeof pluginConfigSchema>;
export type SlackChannelConfig = z.infer<typeof slackChannelSchema>;
export type WebhookChannelConfig = z.infer<typeof webhookChannelSchema>;
export type TeamsChannelConfig = z.infer<typeof teamsChannelSchema>;
export type EmailChannelConfig = z.infer<typeof emailChannelSchema>;
export type RotationConfig = z.infer<typeof rotationConfigSchema>;
