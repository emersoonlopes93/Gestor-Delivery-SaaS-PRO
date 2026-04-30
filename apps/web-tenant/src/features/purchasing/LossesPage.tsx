import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { IngredientDTO } from '@gestor/types';
import { Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';

interface LossEntry {
  id: string;
  ingredient: IngredientDTO;
  quantity: number;
  reason: string;
  createdAt: string;
  costImpact: number;
}

export function LossesPage() {
  const [losses, setLosses] = useState<LossEntry[]>([]);
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form state
  const [selectedIngredient, setSelectedIngredient] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('expiration');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [lossRes, ingRes] = await Promise.all([
        api.get<LossEntry[]>('/inventory/losses'),
        api.get<IngredientDTO[]>('/inventory/ingredients')
      ]);
      if (lossRes.success) setLosses(lossRes.data);
      if (ingRes.success) setIngredients(ingRes.data);
    } catch (error) {
      console.error('Erro ao carregar perdas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedIngredient || !quantity) return;
    try {
      await api.post('/inventory/losses', {
        ingredientId: selectedIngredient,
        quantity: Number(quantity),
        reason
      });
      loadData();
      setIsModalOpen(false);
      setSelectedIngredient('');
      setQuantity('');
    } catch (error) {
      console.error('Erro ao salvar perda:', error);
    }
  };

  const reasonLabels: Record<string, string> = {
    expiration: 'Validade Vencida',
    spillage: 'Dano / Quebra',
    quality: 'Qualidade Baixa',
    theft: 'Extravio',
    other: 'Outro'
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-3">
            <Trash2 className="h-8 w-8 text-primary-600" />
            Perdas e Desperdícios
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Monitore e reduza o desperdício de insumos na sua operação.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm flex items-center gap-2 group"
        >
          <Plus className="h-5 w-5" />
          Registrar Perda
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Impacto Financeiro (Mês)</div>
          <div className="text-2xl font-bold text-red-600">R$ {losses.reduce((acc, l) => acc + (l.costImpact || 0), 0).toFixed(2)}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Principal Motivo</div>
          <div className="text-xl font-bold text-gray-800 dark:text-gray-200">Validade Vencida</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50/50">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Insumo</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quantidade</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Motivo</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Impacto (Custo)</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 animate-pulse">Carregando...</td></tr>
              ) : losses.map((loss) => (
                <tr key={loss.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900 dark:text-gray-100">{loss.ingredient?.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{loss.quantity} <span className="text-[10px] uppercase">{loss.ingredient?.unit}</span></td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700">
                      {reasonLabels[loss.reason] || loss.reason}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100">
                    R$ {(loss.costImpact || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {format(new Date(loss.createdAt), 'dd/MM/yyyy HH:mm')}
                  </td>
                </tr>
              ))}
              {!isLoading && losses.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Nenhuma perda registrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Registrar Perda</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Insumo</label>
                <select 
                  value={selectedIngredient}
                  onChange={(e) => setSelectedIngredient(e.target.value)}
                  className="w-full px-4 py-2 border rounded-xl outline-none focus:border-primary-500"
                >
                  <option value="">Selecione...</option>
                  {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Quantidade</label>
                <input 
                  type="number" 
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-4 py-2 border rounded-xl outline-none focus:border-primary-500"
                  placeholder="Ex: 0.5"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Motivo</label>
                <select 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-2 border rounded-xl outline-none focus:border-primary-500"
                >
                  {Object.entries(reasonLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3 border-t">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-200 rounded-xl transition-colors">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 shadow-md">Salvar Perda</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  );
}
