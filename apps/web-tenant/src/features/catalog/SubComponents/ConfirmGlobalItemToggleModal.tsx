import React from 'react';
import { Modal } from '../../../components/Modal';
import { Globe } from 'lucide-react';

interface ConfirmGlobalItemToggleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  nextState: boolean;
}

export const ConfirmGlobalItemToggleModal: React.FC<ConfirmGlobalItemToggleModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  nextState,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Esta alteração é global"
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
            className={`px-5 py-2 text-sm font-bold rounded-lg transition-colors text-white ${
              nextState ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {nextState ? 'Ativar em todos' : 'Desativar em todos'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-left">
        <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-xl">
          <Globe className="w-6 h-6 shrink-0 mt-0.5 text-primary" />
          <div className="text-sm font-medium text-foreground">
            <p className="font-bold mb-1">
              "{itemName}" faz parte de um grupo de opções.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Ao {nextState ? 'ativá-lo' : 'desativá-lo'}, ele ficará {nextState ? 'disponível' : 'indisponível'} em <strong>todos os produtos</strong> que utilizam este grupo.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
