import type { OrderBoardItemDTO, OrderOperationalAction } from '@gestor/types';
import type { KanbanColumnSpec } from './components/KanbanColumn';

export type DropResolution = {
  action: OrderOperationalAction | null;
  message: string | null;
};

const safeDropActions: Record<KanbanColumnSpec['id'], OrderOperationalAction['type'][]> = {
  entry: [],
  production: ['CONFIRM', 'START_PREPARATION'],
  delivery: ['MARK_READY'],
};

export function resolveKanbanDropAction(
  order: OrderBoardItemDTO,
  targetColumn: KanbanColumnSpec['id'],
): DropResolution {
  const permittedTypes = safeDropActions[targetColumn];
  const candidates = order.operational.availableActions.filter((candidate) => permittedTypes.includes(candidate.type));
  const enabledCandidates = candidates.filter((candidate) => candidate.enabled);

  if (enabledCandidates.length === 1) return { action: enabledCandidates[0], message: null };
  if (candidates.length === 1 && candidates[0].reason) return { action: null, message: candidates[0].reason };
  return {
    action: null,
    message: 'Este movimento não corresponde a uma ação segura para o estado atual do pedido.',
  };
}
