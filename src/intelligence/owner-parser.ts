import type { TestResult } from '../types';

const OWNER_TAG_RE = /^@owner\(([^)]+)\)$/;

/**
 * Parse an @owner(name) tag and return the name, or null if invalid.
 */
export function parseOwnerTag(tag: string): string | null {
  const match = OWNER_TAG_RE.exec(tag);
  if (!match) return null;
  return match[1];
}

/**
 * Extract owner tags from tests.
 * Returns raw entries with testName, file, and ownerTag string.
 */
export function extractOwners(
  tests: TestResult[],
): { testName: string; file: string; ownerTag: string }[] {
  const entries: { testName: string; file: string; ownerTag: string }[] = [];

  for (const test of tests) {
    for (const tag of test.tags) {
      const owner = parseOwnerTag(tag);
      if (owner) {
        entries.push({
          testName: test.name,
          file: test.file,
          ownerTag: owner,
        });
        break; // one owner per test
      }
    }
  }

  return entries;
}
