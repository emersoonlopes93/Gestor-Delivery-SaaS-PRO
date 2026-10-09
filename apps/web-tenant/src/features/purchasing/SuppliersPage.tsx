import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { SupplierDTO, CreateSupplierDTO } from '@gestor/types';
import { SupplierModal } from './SupplierModal';
import { Truck, Plus, Search, Mail, Phone } from 'lucide-react';
import { ContextualNavigation } from '../navigation/NavigationHub';
import { PageHeader } from '../../components/ui/PageHeader';

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDTO | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

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
      setActionError(error instanceof Error ? error.message : 'Não foi possível carregar fornecedores.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (data: CreateSupplierDTO) => {
    setActionError(null);
    try {
      if (editingSupplier) {
        await api.put(`/purchasing/suppliers/${editingSupplier.id}`, data);
      } else {
        await api.post('/purchasing/suppliers', data);
      }
      loadSuppliers();
      setIsModalOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível salvar o fornecedor.');
      throw error;
    }
  };

  const handleDeactivate = async (supplier: SupplierDTO) => {
    if (!supplier.isActive) {
      try {
        setActionError(null);
        await api.put(`/purchasing/suppliers/${supplier.id}`, { isActive: true });
        await loadSuppliers();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Não foi possível reativar o fornecedor.');
      }
      return;
    }

    if (!window.confirm(`Inativar ${supplier.name}? As compras históricas serão preservadas.`)) return;

    try {
      setActionError(null);
      await api.delete(`/purchasing/suppliers/${supplier.id}`);
      await loadSuppliers();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível inativar o fornecedor.');
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.cnpj?.includes(searchTerm)
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 text-left md:p-6">
      <PageHeader
        title="Fornecedores"
        description="Mantenha os parceiros de compra prontos para as próximas entradas."
        icon={Truck}
        action={<button
          onClick={() => {
            setEditingSupplier(null);
            setIsModalOpen(true);
          }}
          className="hidden items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:flex"
        >
          <Plus className="h-5 w-5" />
          Novo Fornecedor
        </button>}
      />

      <button
        type="button"
        onClick={() => {
          setEditingSupplier(null);
          setIsModalOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:hidden"
      >
        <Plus className="h-5 w-5" aria-hidden />
        Novo Fornecedor
      </button>

      <ContextualNavigation itemIds={['inventory.home', 'management.purchases', 'management.suppliers']} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {actionError && <p role="alert" className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p>}
        <div className="border-b border-border bg-muted/50 p-4">
          <div className="relative max-w-md">
            <label className="sr-only" htmlFor="suppliers-search">Buscar fornecedores</label>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="suppliers-search"
              type="text"
              placeholder="Buscar por nome ou CNPJ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-border bg-background py-2 pl-10 pr-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
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
                <tr className="bg-muted/50">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Fornecedor</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">CNPJ/Doc</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Contato</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="group transition-colors hover:bg-muted/70">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-foreground">{supplier.name}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                      {supplier.cnpj || 'Não informado'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="min-w-[11rem] space-y-1">
                        {supplier.email && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" aria-hidden />
                            {supplier.email}
                          </div>
                        )}
                        {supplier.phone && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" aria-hidden />
                            {supplier.phone}
                          </div>
                        )}
                        {!supplier.email && !supplier.phone && <span className="text-xs text-muted-foreground">Sem contato informado</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        supplier.isActive ? 'bg-status-success/15 text-status-success' : 'bg-destructive/15 text-destructive'
                      }`}>
                        {supplier.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSupplier(supplier);
                            setIsModalOpen(true);
                          }}
                          aria-label={`Editar fornecedor ${supplier.name}`}
                          className="text-primary-600 hover:text-primary-700 font-semibold text-xs"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeactivate(supplier)}
                          aria-label={`${supplier.isActive ? 'Inativar' : 'Reativar'} fornecedor ${supplier.name}`}
                          className="text-muted-foreground transition-colors hover:text-foreground font-semibold text-xs"
                        >
                          {supplier.isActive ? 'Inativar' : 'Reativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSuppliers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
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
