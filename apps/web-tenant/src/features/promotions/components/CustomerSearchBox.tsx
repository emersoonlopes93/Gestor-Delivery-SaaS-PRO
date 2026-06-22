import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { Search, User } from 'lucide-react';

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
}

interface CustomerSearchBoxProps {
  onSelect: (customer: CustomerOption) => void;
}

export function CustomerSearchBox({ onSelect }: CustomerSearchBoxProps) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setIsLoading(true);
        const res = await api.get<CustomerOption[]>('/crm/customers');
        if (res.success && Array.isArray(res.data)) {
          setCustomers(res.data);
        }
      } catch (err) {
        console.error('Erro ao carregar clientes para busca:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadCustomers();
  }, []);

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <input
          type="text"
          className="input-premium pl-10 w-full"
          placeholder="Buscar cliente por nome ou telefone..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        />
      </div>

      {isOpen && (searchTerm.length > 0 || customers.length > 0) && (
        <div className="absolute z-50 mt-2 w-full bg-card border border-border rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground animate-pulse">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            <div className="py-2">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelect(c);
                    setSearchTerm(c.name);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3 border-b border-border/40 last:border-0"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <User size={14} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.phone}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
