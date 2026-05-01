import React from 'react';
import { Bot, Smartphone, Settings, Zap } from 'lucide-react';

export function WhatsAppConfigPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">WhatsApp & Agente IA</h1>
          <p className="text-gray-400">Configure sua conexão WhatsApp e o comportamento do assistente virtual.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 rounded-full border border-green-500/20">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm font-medium">Evolution Go Online</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Instância WhatsApp */}
        <div className="bg-[#1A1D24] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-green-500/10" />
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-gray-800/50 rounded-xl">
              <Smartphone className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Conexão WhatsApp</h2>
              <p className="text-sm text-gray-400">Gerencie a instância conectada</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 bg-black/20 rounded-xl border border-gray-800/50 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Status atual</p>
                <p className="text-green-400 font-medium">Conectado (+55 82 98889-8565)</p>
              </div>
              <button className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors">
                Desconectar
              </button>
            </div>
            <p className="text-xs text-gray-500">Provider: Evolution Go (Instância local)</p>
          </div>
        </div>

        {/* Card Configuração do Agente IA */}
        <div className="bg-[#1A1D24] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-blue-500/10" />
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gray-800/50 rounded-xl">
                <Bot className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Agente Inteligente</h2>
                <p className="text-sm text-gray-400">Configure o comportamento do robô</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
          
          <div className="space-y-4">
             <div className="space-y-2">
               <label className="text-sm font-medium text-gray-300">Mensagem de Saudação</label>
               <textarea 
                 className="w-full bg-black/20 border border-gray-800 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none"
                 rows={3}
                 defaultValue="Olá! Sou o assistente virtual da loja. Como posso ajudar você hoje?"
               />
             </div>
             <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-blue-500/20">
               <Settings className="w-4 h-4" />
               Salvar Configurações
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
