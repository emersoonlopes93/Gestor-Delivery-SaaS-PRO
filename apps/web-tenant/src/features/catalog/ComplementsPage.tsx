import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { ProductComplementItem } from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';

export function ComplementsPage() {
  const [complements, setComplements] = useState<ProductComplementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recipeTarget, setRecipeTarget] = useState<{ id: string, name: string } | null>(null);

  useEffect(() => {
    loadComplements();
  }, []);

  const loadComplements = async () => {
    setIsLoading(true);
    try {
      // In this system, complements are usually listed by group, but for recipe management 
      // we might need a flat list or a slightly different endpoint. 
      // Assuming /catalog/complements/items exists or similar.
      const response = await api.get<ProductComplementItem[]>('/catalog/complements/items');
      if (response.success) {
        setComplements(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar complementos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Complementos</h1>
          <p className="text-gray-500 mt-1">Gerencie adicionais e suas fichas técnicas.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Complemento</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Preço Adic.</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {complements.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{item.name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.additionalPrice))}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${item.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {item.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    <button
                      onClick={() => setRecipeTarget({ id: item.id, name: item.name })}
                      className="text-xs font-semibold bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg border border-gray-100 transition-colors inline-flex items-center gap-1.5"
                    >
                      <span className="text-sm">📝</span> Ficha Técnica
                    </button>
                  </td>
                </tr>
              ))}
              {complements.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                    Nenhum complemento cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {recipeTarget && (
        <RecipeModal
          isOpen={!!recipeTarget}
          onClose={() => setRecipeTarget(null)}
          entityType="complement"
          entityId={recipeTarget.id}
          entityName={recipeTarget.name}
        />
      )}
    </div>
  );
}
