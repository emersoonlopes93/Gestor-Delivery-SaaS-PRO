import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { ProductCombo } from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';

export function CombosPage() {
  const [combos, setCombos] = useState<ProductCombo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recipeTarget, setRecipeTarget] = useState<{ id: string, name: string } | null>(null);

  useEffect(() => {
    loadCombos();
  }, []);

  const loadCombos = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<ProductCombo[]>('/catalog/combos');
      if (response.success) {
        setCombos(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar combos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Combos</h1>
          <p className="text-gray-500 mt-1">Gerencie ofertas combinadas e fichas técnicas fixas.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {combos.map((combo) => (
            <div key={combo.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-40 bg-gray-100 relative">
                {combo.image ? (
                  <img src={combo.image} alt={combo.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">Sem Imagem</div>
                )}
                <div className="absolute top-4 right-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${combo.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {combo.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900 text-lg leading-tight">{combo.name}</h3>
                <p className="text-sm text-gray-500 mt-1 h-10 line-clamp-2">{combo.description || 'Sem descrição'}</p>
                
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-primary-600 font-bold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(combo.basePrice))}
                  </span>
                  
                  <button
                    onClick={() => setRecipeTarget({ id: combo.id, name: combo.name })}
                    className="text-xs font-semibold bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg border border-gray-100 transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-sm">📝</span> Ficha Técnica
                  </button>
                </div>
              </div>
            </div>
          ))}
          {combos.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-400">
              Nenhum combo cadastrado ainda.
            </div>
          )}
        </div>
      )}

      {recipeTarget && (
        <RecipeModal
          isOpen={!!recipeTarget}
          onClose={() => setRecipeTarget(null)}
          entityType="combo"
          entityId={recipeTarget.id}
          entityName={recipeTarget.name}
        />
      )}
    </div>
  );
}
