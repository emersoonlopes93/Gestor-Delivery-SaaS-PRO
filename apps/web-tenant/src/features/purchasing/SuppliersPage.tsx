import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { SupplierDTO, CreateSupplierDTO } from '@gestor/types';
import { SupplierModal } from './SupplierModal';
import { Truck, Plus, Search, Mail, Phone, FileText } from 'lucide-react';

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDTO | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<SupplierDTO[]>('/purchasing/suppliers');
      if (response.success) {
        setSuppliers(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar fornecedores:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (data: CreateSupplierDTO) => {
    try {
      if (editingSupplier) {
        await api.put(`/purchasing/suppliers/${editingSupplier.id}`, data);
      } else {
        await api.post('/purchasing/suppliers', data);
      }
      loadSuppliers();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Erro ao salvar fornecedor:', error);
      throw error;
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.cnpj?.includes(searchTerm)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-3">
            <Truck className="h-8 w-8 text-primary-600" />
            Fornecedores
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Gerencie sua rede de parceiros e fornecedores de insumos.</p>
        </div>
        <button
          onClick={() => {
            setEditingSupplier(null);
            setIsModalOpen(true);
          }}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm flex items-center gap-2 group"
        >
          <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
          Novo Fornecedor
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou CNPJ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50/50">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fornecedor</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CNPJ/Doc</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contato</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{supplier.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 font-mono">
                      {supplier.cnpj || '---'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {supplier.email && (
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <Mail className="h-3 w-3" />
                            {supplier.email}
                          </div>
                        )}
                        {supplier.phone && (
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <Phone className="h-3 w-3" />
                            {supplier.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        supplier.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {supplier.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setEditingSupplier(supplier);
                            setIsModalOpen(true);
                          }}
                          className="text-primary-600 hover:text-primary-700 font-semibold text-xs"
                        >
                          Editar
                        </button>
                        <button className="text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors">
                          <FileText className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSuppliers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <Truck className="h-12 w-12 mb-3 opacity-50" />
                        <p>Nenhum fornecedor encontrado.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        editingSupplier={editingSupplier}
      />
    </div>
  );
}
