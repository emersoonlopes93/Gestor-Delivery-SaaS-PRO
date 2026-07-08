import React, { useEffect, useState } from 'react';
import { CreateEmployeeDTO, TenantRole, TenantUser } from '@gestor/types';

interface EmployeeFormProps {
  employee: TenantUser | null;
  roles: TenantRole[];
  onSave: (data: CreateEmployeeDTO) => Promise<void>;
  onCancel: () => void;
}

const OWNER_CONFIRMATION_TOKEN = 'DONO';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  isActive: true,
  roles: [] as string[],
};

export function EmployeeForm({ employee, roles, onSave, onCancel }: EmployeeFormProps) {
  const [formData, setFormData] = useState(emptyForm);
  const availableRoles = roles.filter((role) => role.assignable !== false);

  useEffect(() => {
    if (employee) {
      setFormData({
        name: employee.name,
        email: employee.email,
        password: '',
        isActive: employee.isActive,
        roles: employee.userRoles?.map((userRole) => userRole.role.slug) || [],
      });
      return;
    }

    setFormData(emptyForm);
  }, [employee]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name || !formData.email || (!employee && !formData.password)) {
      alert('Preencha os campos obrigatorios antes de continuar.');
      return;
    }

    if (formData.roles.length === 0) {
      alert('Selecione pelo menos um cargo para o funcionario.');
      return;
    }

    const payload: CreateEmployeeDTO = {
      name: formData.name,
      email: formData.email,
      isActive: formData.isActive,
      roles: formData.roles,
    };

    if (formData.password) {
      payload.password = formData.password;
    }

    if (formData.roles.includes('tenant_owner')) {
      payload.ownerConfirmationText = OWNER_CONFIRMATION_TOKEN;
    }

    await onSave(payload);
  };

  const handleRoleToggle = (slug: string) => {
    const role = availableRoles.find((item) => item.slug === slug);
    if (!role) return;

    const selectingOwner = slug === 'tenant_owner' && !formData.roles.includes(slug);
    if (selectingOwner) {
      const confirmation = window.prompt(
        'Voce esta concedendo acesso total de Dono a este usuario.\nDigite DONO para confirmar.',
      );

      if ((confirmation ?? '').trim().toUpperCase() !== OWNER_CONFIRMATION_TOKEN) {
        alert('Confirmacao invalida. O cargo Dono nao foi atribuido.');
        return;
      }
    }

    setFormData((previous) => ({
      ...previous,
      roles: previous.roles.includes(slug)
        ? previous.roles.filter((value) => value !== slug)
        : [...previous.roles, slug],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-400">
          Nome Completo*
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(event) => setFormData({ ...formData, name: event.target.value })}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-800 dark:bg-gray-900/50"
          placeholder="Ex: Joao da Silva"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-400">
          E-mail*
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(event) => setFormData({ ...formData, email: event.target.value })}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-800 dark:bg-gray-900/50"
          placeholder="exemplo@empresa.com"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-400">
          Senha {employee ? '(deixe em branco para manter)' : '*'}
        </label>
        <input
          type="password"
          value={formData.password}
          onChange={(event) => setFormData({ ...formData, password: event.target.value })}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-800 dark:bg-gray-900/50"
          placeholder="••••••••"
          required={!employee}
          minLength={6}
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-400">
          Cargos / Permissoes*
        </label>
        <p className="mb-3 text-sm text-muted-foreground">
          Mostramos todos os cargos disponiveis do tenant. Para novos funcionarios, Atendente e o default mais seguro.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {availableRoles.map((role) => (
            <label
              key={role.id}
              className={`rounded-xl border p-4 transition-all ${
                formData.roles.includes(role.slug)
                  ? 'border-primary-300 bg-primary-50 text-primary-700'
                  : 'cursor-pointer bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={formData.roles.includes(role.slug)}
                  onChange={() => handleRoleToggle(role.slug)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{role.name}</span>
                    {role.suggestedForNewUsers ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                        Recomendado
                      </span>
                    ) : null}
                    {role.protected ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                        Protegido
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {role.description || 'Cargo operacional do tenant.'}
                  </p>
                  {role.permissions?.length ? (
                    <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                      {role.permissions.length} permissoes vinculadas
                    </p>
                  ) : null}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-primary-600 focus:ring-primary-500 dark:border-gray-700"
        />
        <label htmlFor="isActive" className="cursor-pointer text-sm font-bold text-gray-700 dark:text-gray-300">
          Usuario Ativo
        </label>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-6 dark:border-gray-800">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-6 py-2.5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-700"
        >
          {employee ? 'Salvar Alteracoes' : 'Criar Funcionario'}
        </button>
      </div>
    </form>
  );
}
