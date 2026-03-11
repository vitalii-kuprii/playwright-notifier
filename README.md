# playwright-notifier

Playwright reporter that sends test results to **Slack**, **Microsoft Teams**, and **Email**.
Designed for CI pipelines — just add it to your Playwright config and get instant notifications when tests pass, fail, or flake.

## Features

- **Multi-channel** — send to Slack, Teams, and Email simultaneously
- **CI auto-detection** — picks up branch, commit, actor, and run URL from GitHub Actions, GitLab CI, and Azure DevOps
- **Flaky test tracking** — highlights tests that passed only after retries
- **Skip reminders** — tag skipped tests with `@remind(YYYY-MM-DD)` and get notified when they're overdue
- **On-call rotation** — rotate who gets mentioned on failures (daily, weekly, or biweekly)
- **Test ownership** — tag tests with `@owner(name)` to mention the responsible person on failure
- **Environment detection** — auto-detects `staging`, `dev`, `production` from your base URL
- **Configurable** — control what gets shown, how many failures to list, and who gets pinged

## Install

```bash
npm install playwright-notifier --save-dev
```

## Quick Start

Add the reporter to your `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['playwright-notifier', {
      channels: {
        slack: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
        },
      },
    }],
  ],
});
```

That's it. Run your tests and you'll get a Slack notification.

## Configuration

All options are optional and have sensible defaults.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sendResults` | `'always'` \| `'on-failure'` \| `'off'` | `'always'` | When to send notifications |
| `ciOnly` | `boolean` | `true` | Only send notifications in CI environments |
| `projectName` | `string` | — | Display name for the project |
| `environment` | `string` | `'default'` | Environment label (auto-detected from baseURL) |
| `branch` | `string` | — | Override branch name (auto-detected in CI) |
| `showFlaky` | `boolean` | `false` | Include flaky tests in the report |
| `mentionOnFlaky` | `boolean` | `false` | Mention users when flaky tests are detected |
| `showReminders` | `boolean` | `true` | Show skip reminder alerts |
| `showTriggeredBy` | `boolean` \| `Record<string, string>` | `false` | Show who triggered the pipeline |
| `reportUrl` | `string` | — | Link to the HTML report |
| `maxFailures` | `number` | `5` | Max failed tests to list in the notification |
| `maxErrorLength` | `number` | `300` | Max characters per error message |
| `meta` | `{ key, value }[]` | `[]` | Extra key-value metadata to include |
| `rotation` | `object` | — | On-call rotation config (see below) |

```ts
['playwright-notifier', {
  sendResults: 'always',
  ciOnly: true,
  projectName: 'My App E2E',
  environment: 'staging',
  showTriggeredBy: true,
  reportUrl: 'https://your-report-url.com/run/123',
  maxFailures: 5,
  maxErrorLength: 300,
  showFlaky: true,
  mentionOnFlaky: false,
  showReminders: true,
  meta: [
    { key: 'Branch', value: process.env.GITHUB_REF_NAME },
  ],
  channels: { /* ... */ },
  rotation: { /* ... */ },
}]
```

## Channels

### Slack

Two modes: **Webhook** (simple) or **Bot Token** (supports threads).

#### Webhook mode

```ts
channels: {
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    mentionOnFailure: ['<@U0123ABC>', '@qa-team'],
  },
}
```

#### Bot Token mode

Supports posting to multiple channels and reminder threads.

```ts
channels: {
  slack: {
    token: process.env.SLACK_BOT_TOKEN,
    channels: ['#qa-alerts', '#dev-notifications'],
    mentionOnFailure: ['<@U0123ABC>'],

    // Where to show skip reminders: 'inline' (in main message) or 'thread'
    reminderPlacement: 'thread',
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `webhookUrl` | `string` | — | Slack Incoming Webhook URL |
| `token` | `string` | — | Slack Bot User OAuth Token |
| `channels` | `string[]` | `[]` | Channels to post to (bot mode only) |
| `mentionOnFailure` | `string[]` | `[]` | Users/groups to mention on failure |
| `reminderPlacement` | `'inline' \| 'thread'` | `'inline'` | Where to show skip reminders |
| `sendResults` | `'always' \| 'on-failure' \| 'off'` | — | Override global `sendResults` for this channel |

### Microsoft Teams

```ts
channels: {
  teams: {
    webhookUrl: process.env.TEAMS_WEBHOOK_URL,
    mentionOnFailure: ['user@company.com'],
  },
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `webhookUrl` | `string` | **required** | Teams Incoming Webhook URL |
| `webhookType` | `'standard' \| 'powerautomate'` | `'standard'` | Webhook connector type |
| `mentionOnFailure` | `string[]` | `[]` | Users to mention on failure |
| `sendResults` | `'always' \| 'on-failure' \| 'off'` | — | Override global `sendResults` |

### Email

Requires the `nodemailer` package:

```bash
npm install nodemailer --save-dev
```

```ts
channels: {
  email: {
    to: ['team@company.com', 'qa@company.com'],
    from: 'ci@company.com',
    subject: '[{{status}}] {{projectName}} — {{passed}}/{{total}} passed',
    smtp: {
      host: 'smtp.company.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
  },
}
```

Subject supports template variables: `{{status}}`, `{{projectName}}`, `{{passed}}`, `{{total}}`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `to` | `string[]` | **required** | Recipient email addresses |
| `from` | `string` | SMTP user | Sender email address |
| `subject` | `string` | `'[{{status}}] {{projectName}} — {{passed}}/{{total}} passed'` | Email subject template |
| `smtp` | `object` | **required** | SMTP connection config |
| `sendResults` | `'always' \| 'on-failure' \| 'off'` | — | Override global `sendResults` |

## Triggered By

Show who triggered the CI pipeline in notification headers.

**Boolean mode** — uses the CI actor name as-is:

```ts
showTriggeredBy: true
// Header: "Pipeline failed MyApp (alice)"
```

**User mapping mode** — maps CI usernames to channel-specific mentions:

```ts
showTriggeredBy: {
  'alice': '<@U12345>',    // Slack user ID
  'bob':   '<@U67890>',
}
// Header: "Pipeline failed MyApp (<@U12345>)"
// Falls back to raw CI username if no mapping found
```

## PR/MR Detection

Pull request and merge request context is auto-detected from CI environment variables. When a PR/MR is detected, the notification header changes format:

| Context | Header format |
|---------|--------------|
| Main branch | `Pipeline failed MyApp (alice)` |
| Pull request | `Pipeline MyApp failed for PR #42 (alice)` |

Supported CI providers:

- **GitHub Actions** — detects from `GITHUB_HEAD_REF` + `GITHUB_REF`
- **GitLab CI** — detects from `CI_MERGE_REQUEST_IID`
- **Azure DevOps** — detects from `BUILD_REASON`

## CI-Only Mode

By default, `ciOnly` is `true` — notifications are suppressed when running tests locally. The reporter detects CI via standard environment variables (`CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `TF_BUILD`).

Set `ciOnly: false` to send notifications from local runs as well.

## Skip Reminders

Tag skipped tests with `@remind(YYYY-MM-DD)` to get notified when they're overdue:

```ts
test.skip('broken feature @remind(2025-06-01)', async ({ page }) => {
  // This test will trigger a reminder after June 1, 2025
});
```

When the date passes, the notification will include a reminder section showing overdue tests and how many days late they are. This helps prevent skipped tests from being forgotten.

## Test Ownership

Tag tests with `@owner(name)` to identify who is responsible:

```ts
test('checkout flow @owner(alice)', async ({ page }) => {
  // If this test fails, alice will be mentioned in the notification
});
```

When the owner name matches a member in the rotation config, their Slack/email info is used for mentions.

## On-Call Rotation

Automatically rotate who gets mentioned on failures:

```ts
rotation: {
  enabled: true,
  schedule: 'weekly',      // 'daily' | 'weekly' | 'biweekly'
  startDate: '2025-06-01', // rotation start date (YYYY-MM-DD)
  members: [
    { name: 'alice', slack: '<@U0123ABC>' },
    { name: 'bob',   slack: '<@U0456DEF>' },
    { name: 'charlie', slack: '<@U0789GHI>', email: 'charlie@company.com' },
  ],

  // Manual overrides for specific dates
  calendar: {
    '2025-06-15': 'charlie', // charlie covers this date regardless of schedule
  },

  // Show on-call person in the notification header
  mentionInSummary: true,
}
```

The rotation cycles through members based on the schedule. When rotation is active, the on-call person is mentioned instead of the `mentionOnFailure` list.

## CI Auto-Detection

The reporter automatically detects CI context from environment variables:

| CI Provider | Branch | Commit | Run URL | Actor | Pipeline |
|-------------|--------|--------|---------|-------|----------|
| **GitHub Actions** | `GITHUB_REF_NAME` | `GITHUB_SHA` | Built from `GITHUB_REPOSITORY` + `GITHUB_RUN_ID` | `GITHUB_ACTOR` | `GITHUB_WORKFLOW` |
| **GitLab CI** | `CI_COMMIT_BRANCH` | `CI_COMMIT_SHA` | `CI_PIPELINE_URL` | `GITLAB_USER_LOGIN` | `CI_PROJECT_NAME` |
| **Azure DevOps** | `BUILD_SOURCEBRANCH` | `BUILD_SOURCEVERSION` | `BUILD_BUILDURI` | `BUILD_REQUESTEDFOR` | `BUILD_DEFINITIONNAME` |

Detected values are automatically added to the `meta` section unless you provide them manually.

## Environment Detection

When `environment` is set to `'default'` (the default), the reporter tries to detect it from your Playwright `baseURL`:

| URL pattern | Detected environment |
|-------------|---------------------|
| `localhost`, `127.0.0.1`, `0.0.0.0` | `local` |
| `dev.mysite.com` | `dev` |
| `staging.mysite.com`, `stg.mysite.com` | `staging` |
| `qa.mysite.com` | `qa` |
| `uat.mysite.com` | `uat` |
| `preprod.mysite.com` | `preprod` |
| `prod.mysite.com` | `production` |

You can always override this by setting `environment` explicitly.

## GitHub Actions Example

```yaml
name: E2E Tests
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Beta Releases

```bash
# 1. Make sure you're logged in to npm
npm whoami

# 2. Build the package
npm run build

# 3. Bump version with beta prerelease tag (e.g. 0.1.1-beta.0)
npm version prerelease --preid=beta

# 4. Publish to npm with the "beta" dist-tag
npm publish --tag beta

# Or use the shortcut script:
npm run release:beta
```

Install beta versions with:

```bash
npm i playwright-notifier@beta
```

## License

MIT
