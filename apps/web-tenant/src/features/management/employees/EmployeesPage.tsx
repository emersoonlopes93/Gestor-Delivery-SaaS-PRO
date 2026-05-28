import { useState } from 'react';
import { useEmployees } from './hooks/useEmployees';
import { Modal } from '../../../components/Modal';
import { EmployeeForm } from './components/EmployeeForm';
import { TenantUser, CreateEmployeeDTO } from '@gestor/types';

export function EmployeesPage() {
  const { employees, roles, isLoading, error, createEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<TenantUser | null>(null);

  const handleOpenModal = (employee?: TenantUser) => {
    setEditingEmployee(employee || null);
    setIsModalOpen(true);
  };

  const handleSave = async (data: CreateEmployeeDTO) => {
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, data);
      } else {
        await createEmployee(data);
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar funcionário';
      alert(message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este funcionário?')) return;
    try {
      await deleteEmployee(id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir funcionário';
      alert(message);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Funcionários</h1>
          <p className="text-muted-foreground mt-1">Gerencie sua equipe e suas permissões de acesso.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <span>➕</span> Novo Funcionário
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 p-4 rounded-xl">
          {error}
        </div>
      ) : (
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-6 py-4 text-xs font-black text-muted-foreground uppercase tracking-wider">Nome / E-mail</th>
                <th className="px-6 py-4 text-xs font-black text-muted-foreground uppercase tracking-wider">Cargos</th>
                <th className="px-6 py-4 text-xs font-black text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-muted/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-foreground">{employee.name}</div>
                    <div className="text-xs text-muted-foreground">{employee.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {employee.userRoles?.length ? (
                        employee.userRoles.map((ur) => (
                          <span
                            key={ur.role.id}
                            className="px-2 py-0.5 rounded-lg bg-muted text-foreground text-[10px] font-bold border border-border"
                          >
                            {ur.role.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sem cargo</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        employee.isActive
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}
                    >
                      {employee.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenModal(employee)}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(employee.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-medium italic">
                    Nenhum funcionário cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}
        maxWidth="max-w-xl"
      >
        <EmployeeForm
          employee={editingEmployee}
          roles={roles}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
