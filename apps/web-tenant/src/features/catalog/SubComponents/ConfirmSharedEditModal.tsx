import React from 'react';
import { Modal } from '../../../components/Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmSharedEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  groupName: string;
  usageCount: number;
}

export const ConfirmSharedEditModal: React.FC<ConfirmSharedEditModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  groupName,
  usageCount,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Este grupo é compartilhado"
      maxWidth="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="btn-primary px-5 py-2 text-sm font-bold"
          >
            Continuar edição
          </button>
        </>
      }
    >
      <div className="space-y-4 text-left">
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="text-sm font-medium">
            <p className="font-bold text-foreground mb-1">
              "{groupName}" é usado em {usageCount} {usageCount === 1 ? 'produto' : 'produtos'}.
            </p>
            <p className="text-muted-foreground">
              Alterações no nome, opções, preços ou configurações deste grupo poderão aparecer em todos os produtos que o utilizam.
            </p>
          </div>
        </div>

        <p className="text-sm text-foreground font-bold">Deseja continuar?</p>
      </div>
    </Modal>
  );
};
