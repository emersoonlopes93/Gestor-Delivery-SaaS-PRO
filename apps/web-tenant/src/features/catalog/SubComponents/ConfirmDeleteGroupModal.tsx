import React from 'react';
import { Modal } from '../../../components/Modal';
import { Archive } from 'lucide-react';

interface ConfirmDeleteGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  groupName: string;
  usageCount: number;
  isDeleting?: boolean;
}

export const ConfirmDeleteGroupModal: React.FC<ConfirmDeleteGroupModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  groupName,
  usageCount,
  isDeleting = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Arquivar grupo?"
      maxWidth="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-5 py-2 text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg transition-colors flex items-center gap-2"
          >
            {isDeleting && <div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" />}
            Arquivar grupo
          </button>
        </>
      }
    >
      <div className="space-y-4 text-left">
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive">
          <Archive className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="text-sm font-medium text-foreground">
            {usageCount > 0 ? (
              <>
                <p className="font-bold mb-1">
                  "{groupName}" está vinculado a {usageCount} {usageCount === 1 ? 'produto' : 'produtos'}.
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Ao excluir este grupo, ele será removido de todos esses produtos. Os pedidos já realizados não serão alterados.
                </p>
              </>
            ) : (
              <p className="font-bold">
                Deseja excluir o grupo "{groupName}"?
              </p>
            )}
            <p className="text-destructive font-bold text-xs mt-2">
              Esta ação não pode ser desfeita.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
