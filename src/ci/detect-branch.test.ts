import { describe, it, expect, vi } from 'vitest';
import { detectBranch } from './detect-branch';
import type { CIContext } from '../types';

vi.mock('child_process', () => ({
  execSync: vi.fn(() => Buffer.from('main\n')),
}));

describe('detectBranch', () => {
  it('prefers config branch over everything', () => {
    const ci: CIContext = { provider: 'github', branch: 'ci-branch' };
    expect(detectBranch('config-branch', ci)).toBe('config-branch');
  });

  it('uses CI branch when no config branch', () => {
    const ci: CIContext = { provider: 'github', branch: 'feature/auth' };
    expect(detectBranch(undefined, ci)).toBe('feature/auth');
  });

  it('falls back to git command when no config or CI branch', () => {
    expect(detectBranch(undefined, undefined)).toBe('main');
  });

  it('falls back to git when CI exists but has no branch', () => {
    const ci: CIContext = { provider: 'github' };
    expect(detectBranch(undefined, ci)).toBe('main');
  });

  it('returns undefined when git command fails', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error('not a git repo');
    });
    expect(detectBranch(undefined, undefined)).toBeUndefined();
  });
});
