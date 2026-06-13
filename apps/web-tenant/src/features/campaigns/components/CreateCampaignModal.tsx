import { useState } from 'react';
import { X, Megaphone, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import type { CreateCampaignDto } from '@gestor/types';
import { CAMPAIGN_TEMPLATES } from '../constants/campaignTemplates';
import { CAMPAIGN_STATUS_TEMPLATES } from '../constants/campaignStatusTemplates';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
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
  const [estimatedAudience, setEstimatedAudience] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: CreateCampaignDto) => {
      const res = await api.post('/campaigns', data);
      return res.data;
    },
    onSuccess: () => {
      onSuccess();
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setCurrentStep(1);
    setFormData({
      name: '',
      objective: '',
      messageTemplate: '',
      segmentRules: {},
      maxDispatches: 1000,
    });
    setConfirmationText('');
    setEstimatedAudience(null);
  };

  const updateFormData = <K extends keyof CreateCampaignDto>(field: K, value: CreateCampaignDto[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateSegmentRules = <K extends keyof CreateCampaignDto['segmentRules']>(
    field: K,
    value: CreateCampaignDto['segmentRules'][K]
  ) => {
    setFormData(prev => ({
      ...prev,
      segmentRules: { ...prev.segmentRules, [field]: value }
    }));
  };

  const handleTemplateSelect = (templateId: string) => {
    const templates = formData.type === 'whatsapp_status' ? CAMPAIGN_STATUS_TEMPLATES : CAMPAIGN_TEMPLATES;
    const template = templates.find(t => t.id === templateId);
    if (template) {
      updateFormData('name', template.name);
      updateFormData('objective', template.description);
      updateFormData('messageTemplate', template.messageTemplate);
    }
  };

  const ensureOptOutMessage = (text: string) => {
    const optOutPhrases = ['SAIR', 'sair', 'opt-out'];
    const hasOptOut = optOutPhrases.some(p => text.includes(p));
    if (!hasOptOut) {
      return text.trim() + '\n\nPara não receber mais mensagens, responda SAIR.';
    }
    return text;
  };

  const nextStep = async () => {
    if (currentStep === 2) {
      // Force opt-out phrasing only if it's a message campaign
      if (formData.type !== 'whatsapp_status') {
        updateFormData('messageTemplate', ensureOptOutMessage(formData.messageTemplate));
      }
    }
    if (currentStep === 3) {
      if (formData.type === 'whatsapp_status') {
        // No audience estimation needed for Status
        setEstimatedAudience(null);
      } else {
        // Fetch audience estimation
        setIsEstimating(true);
        try {
          const res = await api.post<{ estimatedAudience: number }>('/campaigns/estimate', {
            segmentRules: formData.segmentRules,
          });
          if (res.success && res.data) {
            setEstimatedAudience(res.data.estimatedAudience);
          }
        } catch (err) {
          console.error('Failed to estimate audience', err);
        } finally {
          setIsEstimating(false);
        }
      }
    }
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = () => {
    createMutation.mutate(formData);
  };

  // Verificação forte para envio
  const isLargeAudience = estimatedAudience !== null && estimatedAudience > 50;
  const canSubmit = !createMutation.isPending && 
    formData.name && 
    formData.messageTemplate && 
    (!isLargeAudience || confirmationText === 'ENVIAR');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
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
            onClick={() => { resetForm(); onClose(); }}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>1</div>
              <span className="hidden sm:inline">Template</span>
              <div className="w-4 border-t border-gray-300 dark:border-gray-600 mx-2"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>2</div>
              <span className="hidden sm:inline">Mensagem</span>
              <div className="w-4 border-t border-gray-300 dark:border-gray-600 mx-2"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 3 ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>3</div>
              <span className="hidden sm:inline">Público</span>
              <div className="w-4 border-t border-gray-300 dark:border-gray-600 mx-2"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 4 ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>4</div>
              <span className="hidden sm:inline">Revisão</span>
            </div>
          </div>
          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-primary-600 transition-all duration-300" style={{ width: `${(currentStep / 4) * 100}%` }} />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Step 1: Template */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de Campanha *</label>
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    onClick={() => updateFormData('type', 'whatsapp_message')}
                    className={`p-4 border rounded-xl cursor-pointer transition-all ${
                      (!formData.type || formData.type === 'whatsapp_message')
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                    }`}
                  >
                    <h4 className="font-semibold text-gray-900 dark:text-white">Mensagem Privada</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Dispara para a caixa de entrada dos clientes.</p>
                  </div>
                  <div 
                    onClick={() => updateFormData('type', 'whatsapp_status')}
                    className={`p-4 border rounded-xl cursor-pointer transition-all ${
                      formData.type === 'whatsapp_status'
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                    }`}
                  >
                    <h4 className="font-semibold text-gray-900 dark:text-white">Status do WhatsApp</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Publica na aba de Status (Stories).</p>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-6">Escolha um Template Prático</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(formData.type === 'whatsapp_status' ? CAMPAIGN_STATUS_TEMPLATES : CAMPAIGN_TEMPLATES).map(template => (
                  <div 
                    key={template.id}
                    onClick={() => handleTemplateSelect(template.id)}
                    className={`p-4 border rounded-xl cursor-pointer transition-all ${
                      formData.name === template.name
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                    }`}
                  >
                    <h4 className="font-semibold text-gray-900 dark:text-white">{template.name}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{template.description}</p>
                    <span className="inline-block mt-3 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
                      {template.category}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nome Personalizado da Campanha *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  placeholder="Nome interno da campanha..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Step 2: Mensagem */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Corpo da Mensagem *</label>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg mb-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    <strong>Variáveis:</strong> {'{nome}'}, {'{link_cardapio}'}, {'{cupom}'}, {'{pedido}'}, {'{total}'}
                  </p>
                </div>
                <textarea
                  value={formData.messageTemplate}
                  onChange={(e) => updateFormData('messageTemplate', e.target.value)}
                  placeholder="Olá {nome}..."
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 dark:bg-gray-800 dark:text-white font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">A mensagem de Opt-out ("responder SAIR") será adicionada automaticamente ao final, caso você não inclua.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">URL de Mídia / Imagem (opcional)</label>
                <input
                  type="url"
                  value={formData.mediaUrl || ''}
                  onChange={(e) => updateFormData('mediaUrl', e.target.value)}
                  placeholder="https://exemplo.com/imagem.jpg"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Step 3: Público (Segmentação) */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {formData.type === 'whatsapp_status' ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Status do WhatsApp:</strong> Esta campanha será publicada diretamente no seu Status (Stories) do WhatsApp. Não há filtros de público, pois o WhatsApp exibe o Status para todos os seus contatos salvos (dependendo das configurações de privacidade do seu aparelho).
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Filtre para quem você quer enviar. Se não preencher nada, a campanha irá para <strong>todos os clientes</strong> (que não pediram para sair).
                    </p>
                  </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mínimo de pedidos</label>
                  <input
                    type="number"
                    value={formData.segmentRules.minOrders || ''}
                    onChange={(e) => updateSegmentRules('minOrders', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Ex: 1"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Máximo de pedidos</label>
                  <input
                    type="number"
                    value={formData.segmentRules.maxOrders || ''}
                    onChange={(e) => updateSegmentRules('maxOrders', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Ex: 5"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Valor mínimo gasto (R$)</label>
                  <input
                    type="number"
                    value={formData.segmentRules.minSpent || ''}
                    onChange={(e) => updateSegmentRules('minSpent', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Ex: 100.00"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Inativo há mais de X dias</label>
                  <input
                    type="number"
                    value={formData.segmentRules.daysSinceLastOrder || ''}
                    onChange={(e) => updateSegmentRules('daysSinceLastOrder', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Ex: 30"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Limite Máximo de Disparos (Segurança)</label>
                <input
                  type="number"
                  value={formData.maxDispatches}
                  onChange={(e) => updateFormData('maxDispatches', parseInt(e.target.value))}
                  placeholder="1000"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                />
                <p className="text-xs text-gray-500 mt-1">Corta a audiência se exceder esse limite de segurança.</p>
              </div>
              </>
              )}
            </div>
          )}

          {/* Step 4: Revisão e Envio */}
          {currentStep === 4 && (
            <div className="space-y-6">
              {isEstimating ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <span className="ml-3 text-gray-500">Calculando audiência...</span>
                </div>
              ) : (
                <>
                  <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-lg mb-4">Resumo do Disparo</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Campanha:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{formData.name}</span>
                      </div>
                      <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Audiência Estimada:</span>
                        <span className="font-bold text-primary-600 dark:text-primary-400">
                          {formData.type === 'whatsapp_status' ? 'Todos os contatos' : (estimatedAudience !== null ? `${estimatedAudience} contatos` : 'Desconhecido')}
                        </span>
                      </div>
                      {formData.type !== 'whatsapp_status' && (
                        <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                          <span className="text-gray-600 dark:text-gray-400">Limite de Segurança:</span>
                          <span className="font-medium text-gray-900 dark:text-white">{formData.maxDispatches} disparos</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {formData.type !== 'whatsapp_status' && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-xl flex gap-3">
                      <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                      <div>
                        <h5 className="font-medium text-yellow-800 dark:text-yellow-300">Atenção ao Risco de Spam</h5>
                        <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                          Disparos em massa podem causar bloqueio do seu número de WhatsApp se muitos clientes denunciarem. O sistema possui um atraso de segurança (Jitter) entre as mensagens para simular envio humano.
                        </p>
                      </div>
                    </div>
                  )}

                  {isLargeAudience && formData.type !== 'whatsapp_status' && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-xl">
                      <label className="block text-sm font-medium text-red-800 dark:text-red-300 mb-2">
                        Como a audiência estimada é maior que 50 contatos, digite <strong>ENVIAR</strong> para confirmar.
                      </label>
                      <input
                        type="text"
                        value={confirmationText}
                        onChange={(e) => setConfirmationText(e.target.value)}
                        placeholder="ENVIAR"
                        className="w-full px-4 py-2 border border-red-300 dark:border-red-600 rounded-lg focus:ring-red-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
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
                disabled={(currentStep === 1 && !formData.name) || (currentStep === 2 && !formData.messageTemplate)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Próximo
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? 'Agendando...' : 'Confirmar Envio'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
