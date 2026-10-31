import { describe, expect, it, vi } from 'vitest';
import {
  branchCreationMessage,
  branchCreationErrorMessage,
  canCreateBranch,
  runSingleBranchSubmission,
} from './branchCreationSafety';
import { ApiError } from '../../lib/api-client';

const disabledCapability = {
  enabled: false,
  reason: 'release_disabled' as const,
  source: 'initial_go_live_release_policy',
  code: 'BRANCH_CREATION_TEMPORARILY_DISABLED',
  message: 'A criação de novas filiais está temporariamente indisponível.',
};

describe('branch creation safety', () => {
  it('keeps the create action unavailable from the server capability without affecting network data', () => {
    const existingStores = [{ id: 'tenant-1' }, { id: 'tenant-2' }];

    expect(canCreateBranch(true, 'headquarters', disabledCapability)).toBe(false);
    expect(branchCreationMessage(true, 'headquarters', disabledCapability)).toBe(disabledCapability.message);
    expect(existingStores).toHaveLength(2);
  });

  it('requires owner, headquarters and an explicitly enabled capability', () => {
    const enabledCapability = { ...disabledCapability, enabled: true };

    expect(canCreateBranch(true, 'headquarters', enabledCapability)).toBe(true);
    expect(canCreateBranch(false, 'headquarters', enabledCapability)).toBe(false);
    expect(canCreateBranch(true, 'branch', enabledCapability)).toBe(false);
  });

  it('allows only one logical call while a submit is in flight and unlocks after failure', async () => {
    const lock = { current: false };
    let release: (() => void) | undefined;
    const operation = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve;
    }));

    const first = runSingleBranchSubmission(lock, operation);
    const second = runSingleBranchSubmission(lock, operation);
    expect(await second).toBe(false);
    expect(operation).toHaveBeenCalledTimes(1);

    release?.();
    expect(await first).toBe(true);

    await expect(runSingleBranchSubmission(lock, async () => {
      throw new Error('definitive failure');
    })).rejects.toThrow('definitive failure');
    expect(lock.current).toBe(false);
  });

  it('maps stable API errors and keeps a safe fallback for unknown failures', () => {
    expect(branchCreationErrorMessage(new ApiError(409, 'Slug em conflito', 'BRANCH_SLUG_CONFLICT')))
      .toBe('Slug em conflito');
    expect(branchCreationErrorMessage(new Error('internal details')))
      .toBe('Não foi possível criar a filial agora.');
  });
});
