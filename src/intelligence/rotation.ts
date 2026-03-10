import type { RotationMember, ResolvedOwner } from '../types';
import type { RotationConfig } from '../config/schema';

const PERIOD_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
};

/**
 * Resolve who is currently on-call based on the rotation config.
 */
export function resolveCurrentOnCall(
  config: RotationConfig,
  now: Date = new Date(),
): RotationMember | null {
  if (!config.enabled) return null;

  // Check calendar overrides: find most recent entry <= now
  const todayStr = formatDate(now);
  const calendarDates = Object.keys(config.calendar)
    .filter((d) => d <= todayStr)
    .sort();

  if (calendarDates.length > 0) {
    const latestDate = calendarDates[calendarDates.length - 1];
    const overrideName = config.calendar[latestDate];
    const member = config.members.find((m) => m.name === overrideName);
    if (member) return member;
  }

  // Calculate based on schedule rotation
  const startDate = parseDate(config.startDate);
  const nowDate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSinceStart = Math.floor((nowDate - startDate) / (1000 * 60 * 60 * 24));

  if (daysSinceStart < 0) return config.members[0];

  const period = PERIOD_DAYS[config.schedule];
  const index = Math.floor(daysSinceStart / period) % config.members.length;

  return config.members[index];
}

/**
 * Resolve an owner tag to a full ResolvedOwner.
 * - If tag matches a rotation member name → static owner (isOnCall: false)
 * - If rotation config exists and tag doesn't match → resolve via on-call (isOnCall: true)
 * - Fallback: raw name, no slack/email
 */
export function resolveOwnerMention(
  ownerTag: string,
  config: RotationConfig | undefined,
  now: Date = new Date(),
): ResolvedOwner {
  // Check if tag matches a member directly
  if (config) {
    const directMatch = config.members.find((m) => m.name === ownerTag);
    if (directMatch) {
      return {
        name: directMatch.name,
        slack: directMatch.slack,
        email: directMatch.email,
        isOnCall: false,
      };
    }
  }

  // Fallback: raw name with no extra info
  return {
    name: ownerTag,
    isOnCall: false,
  };
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}
