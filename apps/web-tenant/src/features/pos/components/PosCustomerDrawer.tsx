import React from 'react';
import { 
  X, 
  Search, 
  Phone, 
  Home, 
  Plus, 
  MapPin, 
  RefreshCw, 
  Edit3, 
  UserPlus, 
  AlertCircle, 
  CheckCircle,
  MapPinned
} from 'lucide-react';
import { PosFulfillmentType } from '@gestor/types';

interface CustomerAddress {
  id: string;
  label?: string | null;
  street: string;
  number: string;
  neighborhood: string;
  complement?: string | null;
  reference?: string | null;
  zipCode: string;
  city: string;
  state: string;
  lat?: number | null;
  lng?: number | null;
  isDefault: boolean;
}

interface CustomerResult {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  lastOrderAt?: string | null;
  orderCount: number;
  addresses: CustomerAddress[];
}

interface PosCustomerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  fulfillmentType: PosFulfillmentType;
  
  // Customer
  selectedCustomer: CustomerResult | null;
  customerName: string;
  setCustomerName: (name: string) => void;
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
  customerSearchTerm: string;
  setCustomerSearchTerm: (term: string) => void;
  foundCustomers: CustomerResult[] | undefined;
  onSelectCustomer: (customer: CustomerResult) => void;
  onClearCustomer: () => void;

  // Address
  addressesForSelectedCustomer: CustomerAddress[];
  selectedAddressId: string | null;
  setSelectedAddressId: (id: string | null) => void;
  editingAddressId: string | null;
  setEditingAddressId: (id: string | null) => void;
  deliveryAddress: {
    street: string;
    number: string;
    neighborhood: string;
    complement: string;
    reference: string;
    zipCode: string;
    city: string;
    state: string;
    lat: number | undefined;
    lng: number | undefined;
  };
  setDeliveryAddress: React.Dispatch<React.SetStateAction<{
    street: string;
    number: string;
    neighborhood: string;
    complement: string;
    reference: string;
    zipCode: string;
    city: string;
    state: string;
    lat: number | undefined;
    lng: number | undefined;
  }>>;
  onUpdateDeliveryAddress: (
    field: 'street' | 'number' | 'neighborhood' | 'city' | 'state' | 'zipCode' | 'complement' | 'reference', 
    value: string
  ) => void;
  onApplyAddress: (address: CustomerAddress) => void;

  // Delivery Fee
  deliveryFee: number;
  deliveryFeeCalculated: boolean;
  deliveryFeeError: string | null;
  deliveryFeeRule: string | null;
  onCalculateDeliveryFee: () => void;
  onResetDeliveryFee: () => void;

  // Actions
  isSavingCustomerAddress: boolean;
  onSaveCustomerAndAddress: () => Promise<void>;
  deliveryMissingRequiredData: boolean;
}

export function PosCustomerDrawer({
  isOpen,
  onClose,
  fulfillmentType,
  selectedCustomer,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  customerSearchTerm,
  setCustomerSearchTerm,
  foundCustomers,
  onSelectCustomer,
  onClearCustomer,
  addressesForSelectedCustomer,
  selectedAddressId,
  setSelectedAddressId,
  editingAddressId,
  setEditingAddressId,
  deliveryAddress,
  setDeliveryAddress,
  onUpdateDeliveryAddress,
  onApplyAddress,
  deliveryFee,
  deliveryFeeCalculated,
  deliveryFeeError,
  deliveryFeeRule,
  onCalculateDeliveryFee,
  onResetDeliveryFee,
  isSavingCustomerAddress,
  onSaveCustomerAndAddress,
  deliveryMissingRequiredData,
}: PosCustomerDrawerProps) {
  const isDelivery = fulfillmentType === PosFulfillmentType.DELIVERY;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose} 
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm safe-inset transition-opacity duration-300 animate-in fade-in"
      />
      
      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-card dark:bg-muted900 shadow-2xl border-l border-border200 dark:border-border800 flex flex-col safe-top safe-bottom transition-transform duration-300 transform translate-x-0 animate-in slide-in-from-right">
        
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-border200 dark:border-border800 flex items-center justify-between bg-card dark:bg-muted900">
          <div className="flex items-center gap-2">
            <Phone size={18} className="text-status-success" />
            <h2 className="text-base font-black text-foreground uppercase tracking-wide">
              {isDelivery ? 'Identificação & Endereço' : 'Identificar Cliente'}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-muted-foreground500 hover:text-foreground p-1 rounded-lg hover:bg-muted100 dark:hover:bg-muted800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 custom-scrollbar bg-background dark:bg-muted950">
          
          {/* CRM: Busca e Seleção de Cliente */}
          <div className="space-y-3 bg-card dark:bg-muted900 p-4 rounded-2xl border border-border200 dark:border-border800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-muted-foreground500 tracking-wider">
                Buscar Cliente Cadastrado
              </span>
              {selectedCustomer && (
                <button 
                  onClick={onClearCustomer} 
                  className="text-[10px] font-black uppercase text-destructive hover:underline"
                >
                  Limpar Seleção
                </button>
              )}
            </div>

            {!selectedCustomer && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground500" size={15} />
                <input
                  autoFocus
                  className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                  placeholder="Pesquisar por telefone ou nome..."
                  value={customerSearchTerm}
                  onChange={(e) => {
                    setCustomerSearchTerm(e.target.value);
                    if (!customerPhone && /\d/.test(e.target.value)) setCustomerPhone(e.target.value);
                  }}
                />

                {foundCustomers && foundCustomers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-card dark:bg-muted800 border border-border200 dark:border-border700 rounded-xl mt-1.5 shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-border200 dark:divide-border700">
                    {foundCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => onSelectCustomer(customer)}
                        className="w-full text-left px-4 py-3 hover:bg-muted100 dark:hover:bg-muted750 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-black text-xs text-muted-foreground900 dark:text-white truncate">{customer.name}</p>
                          <p className="text-[10px] font-bold text-muted-foreground500">{customer.phone}</p>
                        </div>
                        <span className="text-[9px] font-black uppercase text-status-success shrink-0 bg-status-success/10 px-2 py-0.5 rounded border border-status-success/20">
                          {customer.orderCount} pedidos
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-xl bg-status-success/10 border border-status-success/20 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">{selectedCustomer.name}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">{selectedCustomer.phone}</p>
                </div>
                <CheckCircle size={18} className="text-status-success shrink-0" />
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_130px] gap-2 pt-1">
                <input
                  className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2.5 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                  placeholder={isDelivery ? 'Nome do cliente (Obrigatório)' : 'Nome do cliente'}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
                <input
                  className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2.5 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                  placeholder={isDelivery ? 'Telefone (Obrigatório)' : 'Telefone'}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Seção Delivery: Endereços */}
          {isDelivery && (
            <div className="space-y-4">
              
              {/* Endereços Salvos */}
              {selectedCustomer && addressesForSelectedCustomer.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-muted-foreground500 tracking-wider flex items-center gap-1.5">
                      <Home size={12} className="text-primary" />
                      Endereços Salvos
                    </span>
                    <button
                      onClick={() => {
                        setEditingAddressId(null);
                        setSelectedAddressId(null);
                        setDeliveryAddress({
                          street: '',
                          number: '',
                          neighborhood: '',
                          complement: '',
                          reference: '',
                          zipCode: '',
                          city: '',
                          state: '',
                          lat: undefined,
                          lng: undefined,
                        });
                        onResetDeliveryFee();
                      }}
                      className="text-[10px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus size={10} /> Novo
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {addressesForSelectedCustomer.map((address) => (
                      <button
                        key={address.id}
                        onClick={() => onApplyAddress(address)}
                        className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${selectedAddressId === address.id ? 'border-primary bg-primary/10' : 'border-border200 dark:border-border800 bg-card dark:bg-muted900 hover:border-primary/40'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-foreground truncate">
                              {address.label || `${address.street}, ${address.number}`}
                            </p>
                            <p className="text-[10px] font-bold text-muted-foreground truncate">
                              {address.neighborhood} · {address.city}/{address.state}
                            </p>
                          </div>
                          {address.isDefault && (
                            <span className="text-[9px] font-black uppercase text-status-success bg-status-success/10 px-1.5 py-0.5 rounded border border-status-success/15 shrink-0">
                              Padrão
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Formulário de Endereço */}
              <div className="bg-card dark:bg-muted900 p-4 rounded-2xl border border-border200 dark:border-border800 shadow-sm space-y-3">
                <span className="text-[10px] font-black uppercase text-muted-foreground500 tracking-wider flex items-center gap-1.5 mb-1">
                  <MapPinned size={12} className="text-primary" />
                  {editingAddressId ? 'Editando Endereço' : 'Dados de Entrega'}
                </span>

                <div className="grid grid-cols-[1fr_98px] gap-2">
                  <input
                    className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                    placeholder="Rua"
                    value={deliveryAddress.street}
                    onChange={(e) => onUpdateDeliveryAddress('street', e.target.value)}
                  />
                  <input
                    className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                    placeholder="Número"
                    value={deliveryAddress.number}
                    onChange={(e) => onUpdateDeliveryAddress('number', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                    placeholder="Bairro"
                    value={deliveryAddress.neighborhood}
                    onChange={(e) => onUpdateDeliveryAddress('neighborhood', e.target.value)}
                  />
                  <input
                    className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                    placeholder="Cidade"
                    value={deliveryAddress.city}
                    onChange={(e) => onUpdateDeliveryAddress('city', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-[76px_1fr] gap-2">
                  <input
                    className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white uppercase outline-none focus:border-status-success transition-colors"
                    placeholder="UF"
                    maxLength={2}
                    value={deliveryAddress.state}
                    onChange={(e) => onUpdateDeliveryAddress('state', e.target.value.toUpperCase())}
                  />
                  <input
                    className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                    placeholder="CEP"
                    value={deliveryAddress.zipCode}
                    onChange={(e) => onUpdateDeliveryAddress('zipCode', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                    placeholder="Complemento"
                    value={deliveryAddress.complement}
                    onChange={(e) => onUpdateDeliveryAddress('complement', e.target.value)}
                  />
                  <input
                    className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success transition-colors"
                    placeholder="Referência"
                    value={deliveryAddress.reference}
                    onChange={(e) => onUpdateDeliveryAddress('reference', e.target.value)}
                  />
                </div>

                {/* Botões do CRM e do Endereço */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={onSaveCustomerAndAddress}
                    disabled={isSavingCustomerAddress || !customerName.trim() || !customerPhone.trim() || deliveryMissingRequiredData}
                    className="bg-primary text-primary-foreground hover:bg-primary/95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                  >
                    {isSavingCustomerAddress ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : editingAddressId ? (
                      <Edit3 size={13} />
                    ) : (
                      <UserPlus size={13} />
                    )}
                    {editingAddressId ? 'Salvar Edição' : selectedCustomer ? 'Salvar Endereço' : 'Salvar Cliente'}
                  </button>
                  {selectedAddressId && (
                    <button
                      onClick={() => setEditingAddressId(selectedAddressId)}
                      className="bg-card dark:bg-muted800 hover:bg-muted100 dark:hover:bg-muted750 text-muted-foreground700 dark:text-muted-foreground300 border border-border200 dark:border-border700 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                    >
                      <Edit3 size={13} />
                      Editar
                    </button>
                  )}
                </div>
              </div>

              {/* Cálculo do Frete */}
              <div className="space-y-3 bg-card dark:bg-muted900 p-4 rounded-2xl border border-border200 dark:border-border800 shadow-sm">
                <button
                  onClick={onCalculateDeliveryFee}
                  disabled={deliveryFeeCalculated && !deliveryMissingRequiredData ? false : false} // Controlado pelo handler interno
                  className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={13} className="shrink-0" />
                  Calcular Taxa de Entrega
                </button>

                {deliveryFeeCalculated && (
                  <div className="rounded-xl bg-status-success/5 border border-status-success/20 px-3 py-3 text-[10px] font-bold text-muted-foreground flex items-start gap-2">
                    <MapPin size={14} className="text-status-success mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="text-foreground font-black text-xs">
                        Taxa: {deliveryFee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <p className="text-muted-foreground text-[10px] font-normal leading-tight">
                        {deliveryAddress.neighborhood || 'Bairro'} · {deliveryFeeRule || 'Rota padrão'}
                      </p>
                    </div>
                  </div>
                )}

                {deliveryFeeError && (
                  <div className="rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2.5 text-[10px] font-semibold text-destructive flex items-center gap-2 animate-in fade-in">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{deliveryFeeError}</span>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-border200 dark:border-border800 bg-card dark:bg-muted900 flex justify-end">
          <button 
            onClick={onClose} 
            className="w-full sm:w-auto bg-primary hover:bg-primary/95 text-primary-foreground font-black px-6 py-3 rounded-xl text-xs uppercase tracking-widest transition-all"
          >
            Confirmar e Voltar
          </button>
        </div>

      </div>
    </>
  );
}
