import React, { useState, useEffect } from 'react';
import { TenantUser, TenantRole } from '@gestor/types';

interface EmployeeFormProps {
  employee: TenantUser | null;
  roles: TenantRole[];
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function EmployeeForm({ employee, roles, onSave, onCancel }: EmployeeFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    isActive: true,
    roles: [] as string[],
  });

  useEffect(() => {
    if (employee) {
      setFormData({
        name: employee.name,
        email: employee.email,
        password: '', // Password stays empty on edit unless user wants to change it
        isActive: employee.isActive,
        roles: employee.userRoles?.map((ur) => ur.role.slug) || [],
      });
    }
  }, [employee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple validation
    if (!formData.name || !formData.email || (!employee && !formData.password)) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const data: any = { ...formData };
    if (employee && !data.password) {
      delete data.password;
    }

    await onSave(data);
  };

  const handleRoleToggle = (slug: string) => {
    setFormData((prev) => {
      const roles = prev.roles.includes(slug)
        ? prev.roles.filter((r) => r !== slug)
        : [...prev.roles, slug];
      return { ...prev, roles };
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">
          Nome Completo*
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
          placeholder="Ex: João da Silva"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">
          E-mail*
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
          placeholder="exemplo@empresa.com"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">
          Senha {employee ? '(Deixe em branco para não alterar)' : '*'}
        </label>
        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
          placeholder="••••••••"
          required={!employee}
          minLength={6}
        />
      </div>

      <div>
        <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2">
          Cargos / Permissões
        </label>
        <div className="grid grid-cols-2 gap-2">
          {roles.map((role) => (
            <label
              key={role.id}
              className={`flex items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer ${
                formData.roles.includes(role.slug)
                  ? 'bg-primary-50 border-primary-200 text-primary-700'
                  : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50'
              }`}
            >
              <input
                type="checkbox"
                checked={formData.roles.includes(role.slug)}
                onChange={() => handleRoleToggle(role.slug)}
                className="sr-only"
              />
              <span className="text-sm font-bold truncate">{role.name}</span>
              {formData.roles.includes(role.slug) && (
                <span className="ml-auto text-primary-500">✓</span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 dark:border-gray-700 rounded focus:ring-primary-500"
        />
        <label htmlFor="isActive" className="text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
          Usuário Ativo
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-6 py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all"
        >
          {employee ? 'Salvar Alterações' : 'Criar Funcionário'}
        </button>
      </div>
    </form>
  );
}
