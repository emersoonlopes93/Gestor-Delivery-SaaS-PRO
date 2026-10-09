import type { BusinessGroupRole, TenantActionCapabilityDecision } from '@gestor/types';
import { ApiError } from '../../lib/api-client';

export type SubmissionLock = { current: boolean };

export function canCreateBranch(
  isOwner: boolean,
  role: BusinessGroupRole | undefined,
  capability: TenantActionCapabilityDecision | undefined,
): boolean {
  return isOwner && role === 'headquarters' && capability?.enabled === true;
}

export function branchCreationMessage(
  isOwner: boolean,
  role: BusinessGroupRole | undefined,
  capability: TenantActionCapabilityDecision | undefined,
): string {
  if (capability?.enabled === false) {
    return capability.message;
  }
  if (!isOwner) {
    return 'A criação de filiais fica disponível apenas para a conta dona da rede.';
  }
  if (role === 'branch') {
    return 'Somente a matriz cria novas filiais. Se esta conta estiver em uma filial, a criação acontece pela loja principal.';
  }
  return 'A criação de novas filiais está temporariamente indisponível.';
}

export async function runSingleBranchSubmission(
  lock: SubmissionLock,
  operation: () => Promise<void>,
): Promise<boolean> {
  if (lock.current) {
    return false;
  }

  lock.current = true;
  try {
    await operation();
    return true;
  } finally {
    lock.current = false;
  }
}

export function branchCreationErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível criar a filial agora.';
}
