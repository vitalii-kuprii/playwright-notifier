import type { TestResult, SkipReminder } from '../types';

const REMIND_TAG_RE = /^@remind\((\d{4}-\d{2}-\d{2})\)$/;

/**
 * Parse a @remind(YYYY-MM-DD) tag and return the Date, or null if invalid.
 */
export function parseRemindTag(tag: string): Date | null {
  const match = REMIND_TAG_RE.exec(tag);
  if (!match) return null;

  const [year, month, day] = match[1].split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Validate the date is real (e.g. reject 2026-02-30)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Extract due reminders from skipped tests that have @remind tags with past/today dates.
 * Returns results sorted by most overdue first.
 */
export function extractDueReminders(
  skippedTests: TestResult[],
  now: Date = new Date(),
): SkipReminder[] {
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const reminders: SkipReminder[] = [];

  for (const test of skippedTests) {
    for (const tag of test.tags) {
      const remindDate = parseRemindTag(tag);
      if (!remindDate) continue;

      const daysOverdue = Math.floor((todayUTC - remindDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue >= 0) {
        reminders.push({
          testName: test.name,
          file: test.file,
          remindDate,
          daysOverdue,
        });
      }
    }
  }

  // Most overdue first
  reminders.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return reminders;
}
