import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../../lib/api-client';
import { TenantUser, TenantRole, CreateEmployeeDTO } from '@gestor/types';

export function useEmployees() {
  const [employees, setEmployees] = useState<TenantUser[]>([]);
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<TenantUser[]>('/tenant/users');
      if (response.success) {
        setEmployees(response.data);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar funcionários';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const response = await api.get<TenantRole[]>('/tenant/users/roles');
      if (response.success) {
        setRoles(response.data);
      }
    } catch (err: unknown) {
      console.error('Erro ao carregar cargos:', err);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
    loadRoles();
  }, [loadEmployees, loadRoles]);

  const createEmployee = async (data: CreateEmployeeDTO) => {
    const response = await api.post<TenantUser>('/tenant/users', data);
    if (response.success) {
      await loadEmployees();
    }
    return response;
  };

  const updateEmployee = async (id: string, data: Partial<CreateEmployeeDTO>) => {
    const response = await api.patch<TenantUser>(`/tenant/users/${id}`, data);
    if (response.success) {
      await loadEmployees();
    }
    return response;
  };

  const deleteEmployee = async (id: string) => {
    const response = await api.delete(`/tenant/users/${id}`);
    if (response.success) {
      await loadEmployees();
    }
    return response;
  };

  return {
    employees,
    roles,
    isLoading,
    error,
    refresh: loadEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
  };
}
