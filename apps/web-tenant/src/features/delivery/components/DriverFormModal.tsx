import React, { useEffect, useState } from 'react';
import { useDrivers } from '../hooks/useDrivers';
import type { DriverDTO } from '@gestor/types';
import { DriverStatus, DriverVehicleType } from '@gestor/types';
import { Copy, Check, AlertCircle } from 'lucide-react';



interface Props {
  isOpen: boolean;
  onClose: () => void;
  driver: DriverDTO | null;
}

export function DriverFormModal({ isOpen, onClose, driver }: Props) {
  const { createDriver, updateDriver, resetPin } = useDrivers();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<DriverVehicleType>(DriverVehicleType.motorcycle);
  const [status, setStatus] = useState<DriverStatus>(DriverStatus.available);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGeneratedPin(null);
      setCopied(false);
      if (driver) {
        setName(driver.name);
        setPhone(driver.phone);
        setVehicleType(driver.vehicleType);
        setStatus(driver.status);
        setIsActive(driver.isActive);
        setNotes(driver.notes || '');
      } else {
        setName('');
        setPhone('');
        setVehicleType(DriverVehicleType.motorcycle);
        setStatus(DriverStatus.available);
        setIsActive(true);
        setNotes('');
      }
    }
  }, [driver, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (driver) {
        await updateDriver(driver.id, {
          name,
          phone,
          vehicleType,
          status,
          isActive,
          notes,
        });
        onClose();
      } else {
        const result = (await createDriver({
          name,
          phone,
          vehicleType,
          notes,
        })) as DriverDTO;
        if (result.pin) {
          setGeneratedPin(result.pin);
        } else {
          onClose();
        }
      }
    } catch (err) {
      alert('Erro ao salvar entregador');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPin = async () => {
    if (!driver) return;
    if (!confirm('Deseja realmente gerar um novo PIN? O acesso antigo será invalidado.')) return;
    
    setIsSubmitting(true);
    try {
      const result = (await resetPin(driver.id)) as DriverDTO;
      if (result.pin) {
        setGeneratedPin(result.pin);
      }
    } catch (err) {
      alert('Erro ao resetar PIN');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedPin) {
      navigator.clipboard.writeText(generatedPin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-xl w-full max-w-md my-8">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            {driver ? 'Editar Entregador' : 'Novo Entregador'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground dark:text-muted-foreground transition-colors text-2xl leading-none"
            type="button"
          >
            &times;
          </button>
        </div>

        {generatedPin ? (
          <div className="p-6 space-y-6">
            <div className="bg-status-warning/10 dark:bg-status-warning/10 border border-status-warning/20 dark:border-status-warning/30 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-status-warning shrink-0" />
              <div>
                <p className="text-sm font-bold text-status-warning">Código de Acesso Gerado</p>
                <p className="text-xs text-status-warning/80 mt-1">
                  Este código será exibido **apenas uma vez**. Copie e envie agora para o entregador.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center py-4 space-y-4">
              <div className="text-4xl font-black tracking-widest text-foreground bg-muted px-8 py-4 rounded-2xl border-2 border-dashed border-border">
                {generatedPin}
              </div>
              
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar Código'}
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Instrua o entregador a usar este código junto com o telefone dele no painel do entregador.
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold shadow-lg active:scale-[0.98] transition-all"
              >
                Concluir e Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input-premium mt-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">Telefone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="(00) 00000-0000"
                className="input-premium mt-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">Veículo</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as DriverVehicleType)}
                className="input-premium mt-1"
              >
                <option value="motorcycle">Moto</option>
                <option value="bicycle">Bicicleta</option>
                <option value="car">Carro</option>
              </select>
            </div>

            {driver && (
              <>
                <div className="pt-2 border-t border-border">
                  <label className="block text-sm font-medium text-foreground">Status Operacional</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as DriverStatus)}
                    className="input-premium mt-1"
                  >
                    <option value="available">Disponível</option>
                    <option value="busy">Ocupado (Em rota / Ocupado logicamente)</option>
                    <option value="offline">Offline / Indisponível</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-input text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">
                    Cadastralmente Ativo
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleResetPin}
                    disabled={isSubmitting}
                    className="text-xs font-bold text-primary-600 hover:text-primary-700 underline"
                  >
                    Gerar Novo Código de Acesso (PIN)
                  </button>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground">Observações</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="input-premium mt-1 min-h-[80px]"
              />
            </div>

            <div className="pt-4 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-semibold text-foreground bg-card border border-border rounded-xl hover:bg-muted transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
