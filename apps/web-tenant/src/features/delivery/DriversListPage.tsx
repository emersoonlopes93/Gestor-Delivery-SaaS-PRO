import React, { useState } from 'react';
import { useDrivers } from './hooks/useDrivers';
import { DriverFormModal } from './components/DriverFormModal';
import type { DriverDTO } from '@gestor/types';

export function DriversListPage() {
  const { drivers, isLoading, isError, deleteDriver } = useDrivers();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverDTO | null>(null);

  if (isLoading) return <div className="p-6">Carregando entregadores...</div>;
  if (isError) return <div className="p-6 text-red-500">Erro ao carregar entregadores.</div>;

  const handleOpenNew = () => {
    setSelectedDriver(null);
    setIsModalOpen(true);
  };

  const handleEdit = (driver: DriverDTO) => {
    setSelectedDriver(driver);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este entregador?')) {
      await deleteDriver(id);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Entregadores</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie a sua frota de entrega</p>
        </div>
        <button
          onClick={handleOpenNew}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium shadow transition-colors"
        >
          + Novo Entregador
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-sm font-medium text-gray-600 dark:text-gray-400">
              <th className="px-6 py-4">Nome</th>
              <th className="px-6 py-4">Telefone</th>
              <th className="px-6 py-4">Veículo</th>
              <th className="px-6 py-4">Status / Operação</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm p-4">
            {drivers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  Nenhum entregador cadastrado.
                </td>
              </tr>
            ) : (
              drivers.map((d: DriverDTO) => (
                <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                    <span className={d.isActive ? '' : 'line-through text-gray-400'}>{d.name}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{d.phone}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400 capitalize">{d.vehicleType}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        d.status === 'available'
                          ? 'bg-green-100 text-green-800'
                          : d.status === 'busy'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {d.status === 'available' ? 'Disponível' : d.status === 'busy' ? 'Ocupado' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => handleEdit(d)}
                      className="text-primary-600 hover:text-primary-800 font-medium"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-red-500 hover:text-red-700 font-medium"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DriverFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        driver={selectedDriver}
      />
    </div>
  );
}
