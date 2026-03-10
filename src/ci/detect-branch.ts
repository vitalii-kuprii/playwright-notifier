import { execSync } from 'child_process';
import type { CIContext } from '../types';

/**
 * Resolve current branch: config override → CI context → git command fallback.
 */
export function detectBranch(
  configBranch: string | undefined,
  ci: CIContext | undefined,
): string | undefined {
  if (configBranch) return configBranch;
  if (ci?.branch) return ci.branch;
  return detectBranchFromGit();
}

function detectBranchFromGit(): string | undefined {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim() || undefined;
  } catch {
    return undefined;
  }
}
