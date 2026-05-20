import React from 'react';
import { Crosshair, Plus, Target } from 'lucide-react';

interface FloatingButtonsProps {
  onCenterStore: () => void;
  onNewZone: () => void;
  onSimulate: () => void;
  simulationActive: boolean;
  editorOpen: boolean;
}

export const FloatingButtons: React.FC<FloatingButtonsProps> = ({
  onCenterStore,
  onNewZone,
  onSimulate,
  simulationActive,
  editorOpen,
}) => {
  return (
    <div className="lg:hidden absolute bottom-32 right-4 flex flex-col gap-3 z-30">
      <button
        onClick={onCenterStore}
        className="w-12 h-12 rounded-full bg-white dark:bg-gray-900 shadow-lg border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-800 dark:text-gray-100 hover:scale-105 transition-transform active:scale-95"
        title="Centralizar na loja"
      >
        <Crosshair className="w-6 h-6" />
      </button>

      {!editorOpen && (
        <button
          onClick={onNewZone}
          className="w-12 h-12 rounded-full bg-primary-600 shadow-lg flex items-center justify-center text-white hover:bg-primary-700 hover:scale-105 transition-transform active:scale-95"
          title="Nova zona"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {!editorOpen && (
        <button
          onClick={onSimulate}
          className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
            simulationActive
              ? 'bg-gray-900 text-white border border-gray-900'
              : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-100'
          } hover:scale-105 active:scale-95`}
          title="Simular entrega"
        >
          <Target className="w-6 h-6" />
        </button>
      )}
    </div>
  );
};

export default FloatingButtons;
