import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Trash2, 
  Download, 
  Users, 
  Info,
  ExternalLink,
  Search,
  LayoutGrid
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Tenant } from '@gestor/types';

interface Table {
  id: string;
  name: string;
  capacity: number;
  status: string;
}

export function TablesPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newCapacity, setNewCapacity] = useState(4);
  const [storefrontBaseUrl, setStorefrontBaseUrl] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');

  // Fetch tenant info for slug and storefront URL
  useEffect(() => {
    const loadTenantInfo = async () => {
      const res = await api.get<Tenant>('/tenant/me');
      if (res.success) {
        setTenantSlug(res.data.slug);
      }
    };
    loadTenantInfo();

    const envBase = (import.meta.env.VITE_STOREFRONT_BASE_URL as string | undefined)?.trim();
    if (envBase) {
      setStorefrontBaseUrl(envBase.replace(/\/+$/, ''));
    } else {
      const { origin, hostname } = window.location;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        if (hostname.startsWith('app-')) {
          setStorefrontBaseUrl(origin.replace('app-', ''));
        } else if (hostname.startsWith('app.')) {
          setStorefrontBaseUrl(origin.replace('app.', ''));
        } else {
          setStorefrontBaseUrl(origin.replace('tenant', 'storefront'));
        }
      } else {
        setStorefrontBaseUrl(origin.replace('tenant', 'storefront').replace('8081', '3000'));
      }
    }
  }, []);

  const { data: tables, isLoading } = useQuery<Table[]>({
    queryKey: ['posSalon'], // Re-use same key as PDV
    queryFn: async () => {
      const res = await api.get<Table[]>('/pos/salon');
      return res.data;
    }
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: { name: string; capacity: number }) => {
      return api.post<Table>('/pos/tables', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posSalon'] });
      setIsAdding(false);
      setNewTableName('');
    }
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/pos/tables/${id}/delete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posSalon'] });
    }
  });

  const filteredTables = useMemo(() => {
    return (tables || []).filter((t: Table) => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [tables, searchTerm]);

  const downloadQRCode = (tableId: string, tableName: string) => {
    const svg = document.getElementById(`qr-${tableId}`);
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = 1000;
      canvas.height = 1000;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 50, 50, 900, 900);
        
        // Add label
        ctx.fillStyle = 'black';
        ctx.font = 'bold 60px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`MESA: ${tableName}`, 500, 960);
        
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `QR_CODE_MESA_${tableName}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const getTableUrl = (tableId: string) => {
    return `${storefrontBaseUrl}/${tenantSlug}?tableId=${tableId}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Gestão de Mesas</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px] tracking-widest mt-1">Configure o salão e gere QR Codes para pedidos em mesa</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-emerald-900/20 flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus size={18} />
          Nova Mesa
        </button>
      </header>

      {/* Stats and Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 rounded-3xl shadow-sm">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center">
                  <LayoutGrid size={24} />
               </div>
               <div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Total de Mesas</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{tables?.length || 0}</p>
               </div>
            </div>
         </div>
         <div className="md:col-span-2 bg-indigo-600 rounded-3xl p-6 text-white flex items-center gap-6 shadow-xl shadow-indigo-900/20">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
               <Info size={32} />
            </div>
            <div>
               <h3 className="text-lg font-black leading-tight mb-1">Como funciona o QR Mesa?</h3>
               <p className="text-indigo-100 text-sm font-medium">Cada QR Code é único. Quando o cliente escaneia, o sistema identifica a mesa automaticamente no checkout, removendo a necessidade de preencher endereço.</p>
            </div>
         </div>
      </div>

      {/* Table List */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar mesa pelo nome..."
              className="w-full bg-gray-50 dark:bg-gray-950 border-none rounded-2xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-950 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-6 py-4">Nome da Mesa</th>
                <th className="px-6 py-4">Capacidade</th>
                <th className="px-6 py-4">Status Atual</th>
                <th className="px-6 py-4">QR Code / Link</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">Carregando mesas...</td>
                </tr>
              ) : filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">Nenhuma mesa encontrada.</td>
                </tr>
              ) : filteredTables.map((table: Table) => (
                <tr key={table.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 font-black">
                          {table.name.substring(0, 2).toUpperCase()}
                       </div>
                       <span className="font-bold text-gray-900 dark:text-white">{table.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-gray-500 font-medium">
                       <Users size={14} />
                       {table.capacity} pessoas
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      table.status === 'free' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${table.status === 'free' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {table.status === 'free' ? 'Livre' : 'Ocupada'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                       <div className="bg-white p-2 rounded-xl border border-gray-100 shadow-sm group-hover:scale-110 transition-transform cursor-pointer" onClick={() => downloadQRCode(table.id, table.name)}>
                          <QRCodeSVG 
                            id={`qr-${table.id}`}
                            value={getTableUrl(table.id)} 
                            size={40} 
                            level="H" 
                            includeMargin={false}
                          />
                       </div>
                       <a 
                         href={getTableUrl(table.id)} 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="text-[10px] text-gray-400 hover:text-blue-500 font-bold flex items-center gap-1 transition-colors"
                       >
                          Abrir link <ExternalLink size={10} />
                       </a>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => downloadQRCode(table.id, table.name)}
                        className="p-2 text-gray-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all"
                        title="Baixar QR Code"
                      >
                        <Download size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm('Deseja excluir esta mesa?')) {
                            deleteTableMutation.mutate(table.id);
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        title="Excluir Mesa"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Table Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8">
                 <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Cadastrar Nova Mesa</h2>
                 <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-8">Defina o nome e a capacidade para o salão.</p>
                 
                 <div className="space-y-6">
                    <div>
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Nome ou Número</label>
                       <input 
                         autoFocus
                         type="text" 
                         value={newTableName}
                         onChange={(e) => setNewTableName(e.target.value)}
                         placeholder="Ex: Mesa 15, Varanda 02..."
                         className="w-full bg-gray-50 dark:bg-gray-950 border-2 border-transparent focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-bold outline-none transition-all"
                       />
                    </div>
                    <div>
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Capacidade (Pessoas)</label>
                       <input 
                         type="number" 
                         value={newCapacity}
                         onChange={(e) => setNewCapacity(Number(e.target.value))}
                         className="w-full bg-gray-50 dark:bg-gray-950 border-2 border-transparent focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-bold outline-none transition-all"
                       />
                    </div>
                 </div>

                 <div className="flex gap-3 mt-10">
                    <button 
                      onClick={() => setIsAdding(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                       Cancelar
                    </button>
                    <button 
                      onClick={() => createTableMutation.mutate({ name: newTableName, capacity: newCapacity })}
                      disabled={!newTableName || createTableMutation.isPending}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
                    >
                       {createTableMutation.isPending ? 'Salvando...' : 'Salvar Mesa'}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
