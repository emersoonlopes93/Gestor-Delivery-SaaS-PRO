import React, { useState } from 'react';
import { X, Megaphone, Users, Calendar, MessageSquare, ChevronRight, ChevronLeft } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import type { CreateCampaignDto } from '@gestor/types';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CampaignAudienceCustomer {
  id: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt?: string | null;
  lastOrderDate?: string | null;
}

export function CreateCampaignModal({ isOpen, onClose, onSuccess }: CreateCampaignModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<CreateCampaignDto>({
    name: '',
    objective: '',
    messageTemplate: '',
    segmentRules: {},
    maxDispatches: 1000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get<CampaignAudienceCustomer[]>('/customers');
      return res.success ? res.data : [];
    },
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateCampaignDto) => {
      const res = await api.post('/campaigns', data);
      return res.data;
    },
    onSuccess: () => {
      onSuccess();
      onClose();
      setCurrentStep(1);
      setFormData({
        name: '',
        objective: '',
        messageTemplate: '',
        segmentRules: {},
        maxDispatches: 1000,
      });
    },
  });

  const updateFormData = (field: keyof CreateCampaignDto, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateSegmentRules = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      segmentRules: { ...prev.segmentRules, [field]: value }
    }));
  };

  const nextStep = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = () => {
    createMutation.mutate(formData);
  };

  const estimateAudience = () => {
    // Lógica para estimar audiência baseada nas regras
    let filtered: CampaignAudienceCustomer[] = customers;
    
    const minOrders = formData.segmentRules.minOrders;
    if (minOrders !== undefined) {
      filtered = filtered.filter((c) => c.orderCount >= minOrders);
    }
    const maxOrders = formData.segmentRules.maxOrders;
    if (maxOrders !== undefined) {
      filtered = filtered.filter((c) => c.orderCount <= maxOrders);
    }
    const minSpent = formData.segmentRules.minSpent;
    if (minSpent !== undefined) {
      filtered = filtered.filter((c) => c.totalSpent >= minSpent);
    }
    const daysSinceLastOrder = formData.segmentRules.daysSinceLastOrder;
    if (daysSinceLastOrder !== undefined) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastOrder);
      filtered = filtered.filter((c) => {
        const lastOrder = c.lastOrderAt ?? c.lastOrderDate;
        return lastOrder ? new Date(lastOrder) >= cutoffDate : false;
      });
    }
    if (formData.segmentRules.specificCustomers?.length) {
      filtered = filtered.filter((c) => formData.segmentRules.specificCustomers?.includes(c.id));
    }
    
    return Math.min(filtered.length, formData.maxDispatches || Infinity);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Megaphone className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Nova Campanha</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Passo {currentStep} de 4</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                1
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                2
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 3 ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                3
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 4 ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                4
              </div>
            </div>
          </div>
          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-600 transition-all duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Step 1: Informações Básicas */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome da Campanha *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  placeholder="Ex: Promoção de Verão 2024"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Objetivo
                </label>
                <textarea
                  value={formData.objective || ''}
                  onChange={(e) => updateFormData('objective', e.target.value)}
                  placeholder="Qual o objetivo desta campanha?"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Step 2: Segmentação */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Audiência estimada:</strong> {estimateAudience()} clientes
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mínimo de pedidos
                  </label>
                  <input
                    type="number"
                    value={formData.segmentRules.minOrders || ''}
                    onChange={(e) => updateSegmentRules('minOrders', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Máximo de pedidos
                  </label>
                  <input
                    type="number"
                    value={formData.segmentRules.maxOrders || ''}
                    onChange={(e) => updateSegmentRules('maxOrders', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="999"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Valor mínimo gasto
                  </label>
                  <input
                    type="number"
                    value={formData.segmentRules.minSpent || ''}
                    onChange={(e) => updateSegmentRules('minSpent', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Dias desde último pedido
                  </label>
                  <input
                    type="number"
                    value={formData.segmentRules.daysSinceLastOrder || ''}
                    onChange={(e) => updateSegmentRules('daysSinceLastOrder', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="30"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Template de Mensagem */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mensagem *
                </label>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg mb-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Variáveis disponíveis: {'{nome}'}, {'{pedido}'}, {'{total}'}, {'{data}'}
                  </p>
                </div>
                <textarea
                  value={formData.messageTemplate}
                  onChange={(e) => updateFormData('messageTemplate', e.target.value)}
                  placeholder="Olá {nome}! 🎉\n\nTemos uma oferta especial para você! Seu último pedido foi #{pedido} e gostaríamos de oferecer...\n\nAproveite! 🚀"
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formData.messageTemplate.length} caracteres
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL de Mídia (opcional)
                </label>
                <input
                  type="url"
                  value={formData.mediaUrl || ''}
                  onChange={(e) => updateFormData('mediaUrl', e.target.value)}
                  placeholder="https://exemplo.com/imagem.jpg"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Step 4: Configurações */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Limite de disparos
                </label>
                <input
                  type="number"
                  value={formData.maxDispatches}
                  onChange={(e) => updateFormData('maxDispatches', parseInt(e.target.value))}
                  placeholder="1000"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Máximo de mensagens que serão enviadas
                </p>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">📋 Resumo da Campanha</h4>
                <div className="space-y-1 text-sm text-yellow-800 dark:text-yellow-200">
                  <p><strong>Nome:</strong> {formData.name || 'Não definido'}</p>
                  <p><strong>Audiência:</strong> {estimateAudience()} clientes</p>
                  <p><strong>Limite:</strong> {formData.maxDispatches} disparos</p>
                  <p><strong>Template:</strong> {formData.messageTemplate ? '✅ Definido' : '❌ Não definido'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={prevStep}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>

          <div className="flex items-center gap-3">
            {currentStep < 4 ? (
              <button
                onClick={nextStep}
                disabled={
                  (currentStep === 1 && !formData.name) ||
                  (currentStep === 3 && !formData.messageTemplate)
                }
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Próximo
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || !formData.name || !formData.messageTemplate}
                className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Campanha'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
