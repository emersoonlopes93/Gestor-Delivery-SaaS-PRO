import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Target, TrendingUp, AlertCircle, CheckCircle2, 
  ChevronRight, Calendar, User, MoreVertical, Trash2
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { GoalDTO, ApiResponse, GoalType, GoalStatus } from '@gestor/types';

export function GoalsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: goals, isLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const res = await api.get<GoalDTO[]>('/goals');
      return res.data;
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    }
  });

  if (isLoading) return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  );

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Metas e Desempenho</h1>
          <p className="text-gray-500">Defina objetivos e acompanhe o crescimento da sua loja.</p>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Nova Meta
        </button>
      </div>

      {/* Goals Dashboard Area */}
      {goals?.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <div className="bg-primary-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="text-primary-600" size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Nenhuma meta definida</h3>
          <p className="text-gray-500 max-w-sm mx-auto mt-2">
            Comece definindo objetivos de faturamento, volume de pedidos ou eficiência para motivar sua equipe.
          </p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="mt-6 text-primary-600 font-bold hover:underline"
          >
            Criar minha primeira meta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {goals?.map((goal) => (
            <GoalListItem 
              key={goal.id} 
              goal={goal} 
              onDelete={() => {
                if (window.confirm('Excluir esta meta?')) deleteMutation.mutate(goal.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Modal Placeholder */}
      {isModalOpen && (
        <GoalFormModal onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}

function GoalListItem({ goal, onDelete }: { goal: GoalDTO, onDelete: () => void }) {
  const isRevenue = goal.type === GoalType.REVENUE;
  const unit = isRevenue ? 'R$' : '';
  const progressColor = goal.progressPercentage >= 100 
    ? 'bg-green-500' 
    : goal.trend === 'behind' ? 'bg-red-500' : 'bg-primary-500';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-primary-200 transition-all">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${goal.progressPercentage >= 100 ? 'bg-green-50' : 'bg-primary-50' }`}>
              <Target size={24} className={goal.progressPercentage >= 100 ? 'text-green-600' : 'text-primary-600'} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{goal.name}</h3>
              <p className="text-sm text-gray-500 flex items-center gap-3">
                <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(goal.startDate).toLocaleDateString()} - {new Date(goal.endDate).toLocaleDateString()}</span>
                {goal.responsibleId && <span className="flex items-center gap-1"><User size={14} /> {goal.responsibleId}</span>}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="text-right">
              <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${
                goal.trend === 'on_track' ? 'bg-green-100 text-green-700' :
                goal.trend === 'at_risk' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              }`}>
                {goal.trend === 'on_track' ? 'No Prazo' : goal.trend === 'at_risk' ? 'Em Risco' : 'Atrasado'}
              </span>
            </div>
            <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Progress Bar Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Progresso: {goal.progressPercentage.toFixed(1)}%</span>
            <span className="text-gray-500 font-medium">
              {isRevenue ? `R$ ${goal.currentValue.toLocaleString()}` : goal.currentValue} / {isRevenue ? `R$ ${goal.targetValue.toLocaleString()}` : goal.targetValue}
            </span>
          </div>
          <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${progressColor}`} 
              style={{ width: `${Math.min(goal.progressPercentage, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Subgoals (Simplified) */}
        {goal.subGoals && goal.subGoals.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Desdobramentos ({goal.subGoals.length})</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goal.subGoals.map(sg => (
                <div key={sg.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                   <span className="text-sm font-medium text-gray-700">{sg.name}</span>
                   <span className="text-sm font-bold text-primary-600">{sg.progressPercentage.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GoalFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    type: GoalType.REVENUE,
    targetValue: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/goals', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      onClose();
    }
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Configurar Nova Meta</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        
        <form className="p-6 space-y-4" onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            ...formData,
            targetValue: Number(formData.targetValue)
          });
        }}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Meta</label>
            <input 
              required
              className="w-full border border-gray-200 p-2 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" 
              placeholder="Ex: Faturamento Recorde Junho"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Indicador</label>
              <select 
                className="w-full border border-gray-200 p-2 rounded-lg"
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value as any})}
              >
                <option value={GoalType.REVENUE}>Faturamento (R$)</option>
                <option value={GoalType.ORDERS}>Volume de Pedidos</option>
                <option value={GoalType.AVG_TICKET}>Ticket Médio (R$)</option>
                <option value={GoalType.PREPARATION_TIME}>Tempo de Preparo (min)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor Alvo</label>
              <input 
                required
                type="number"
                className="w-full border border-gray-200 p-2 rounded-lg"
                placeholder="0.00"
                value={formData.targetValue}
                onChange={e => setFormData({...formData, targetValue: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
              <input 
                type="date"
                className="w-full border border-gray-200 p-2 rounded-lg"
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
              <input 
                type="date"
                className="w-full border border-gray-200 p-2 rounded-lg"
                value={formData.endDate}
                onChange={e => setFormData({...formData, endDate: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Salvando...' : 'Salvar Meta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
