import React, { useEffect, useRef, useState } from 'react';
import { useDrivers } from '../hooks/useDrivers';
import type { DriverDTO } from '@gestor/types';
import { DriverPayMode, DriverStatus, DriverVehicleType } from '@gestor/types';
import { Copy, Check, AlertCircle, WalletCards } from 'lucide-react';
import {
  DriverPayFields,
} from './DriverPayFields';
import { DEFAULT_DRIVER_PAY_VALUE, driverPayOverridePayload, type DriverPayFormValue, validateDriverPay } from './driver-pay-form';
import { DriverEarningsPanel } from './DriverEarningsPanel';
import { useDriverEarnings } from '../hooks/useDriverEarnings';



interface Props {
  isOpen: boolean;
  onClose: () => void;
  driver: DriverDTO | null;
}

export function DriverFormModal({ isOpen, onClose, driver }: Props) {
  const { createDriver, updateDriver, resetPin } = useDrivers();
  const earnings = useDriverEarnings(driver?.id ?? null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<DriverVehicleType>(DriverVehicleType.motorcycle);
  const [status, setStatus] = useState<DriverStatus>(DriverStatus.available);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [payOverrideEnabled, setPayOverrideEnabled] = useState(false);
  const [payValue, setPayValue] = useState<DriverPayFormValue>(DEFAULT_DRIVER_PAY_VALUE);
  const [payError, setPayError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setGeneratedPin(null);
      setCopied(false);
      setPayError(null);
      if (driver) {
        setName(driver.name);
        setPhone(driver.phone);
        setVehicleType(driver.vehicleType);
        setStatus(driver.status);
        setIsActive(driver.isActive);
        setNotes(driver.notes || '');
        setPayOverrideEnabled(driver.payOverrideEnabled ?? false);
        setPayValue({
          mode: driver.payMode ?? DriverPayMode.FIXED,
          dailyRate: driver.dailyRate ?? 0,
          fixedAmount: driver.payFixedAmount ?? 0,
          percentage: driver.payPercentage ?? 0,
          rateTable: driver.payRateTable?.length ? driver.payRateTable : [{ upToKm: null, amount: 0 }],
          payFailedAttempt: driver.payFailedAttempt ?? false,
        });
      } else {
        setName('');
        setPhone('');
        setVehicleType(DriverVehicleType.motorcycle);
        setStatus(DriverStatus.available);
        setIsActive(true);
        setNotes('');
        setPayOverrideEnabled(false);
        setPayValue(DEFAULT_DRIVER_PAY_VALUE);
      }
    }
  }, [driver, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActive?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (driver && payOverrideEnabled) {
      const validationError = validateDriverPay(payValue);
      if (validationError) {
        setPayError(validationError);
        return;
      }
    }
    setPayError(null);
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
          ...driverPayOverridePayload(payOverrideEnabled, payValue),
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="driver-form-modal-title" className="my-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 id="driver-form-modal-title" className="text-lg font-bold text-foreground">
            {driver ? 'Editar Entregador' : 'Novo Entregador'}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Fechar"
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
          <form onSubmit={handleSubmit} className="max-h-[calc(100vh-8rem)] space-y-4 overflow-y-auto p-6">
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

                <DriverEarningsPanel
                  summary={earnings.summary}
                  isLoading={earnings.isLoading}
                  isError={earnings.isError}
                  isMutating={earnings.isMutating}
                  onCashTip={earnings.addCashTip}
                  onAdjustment={earnings.addAdjustment}
                />

                <section className="space-y-4 border-t border-border pt-5" aria-labelledby="driver-pay-override-title">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary"><WalletCards className="h-4 w-4" /></span>
                    <div>
                      <h3 id="driver-pay-override-title" className="text-sm font-black text-foreground">Pagamento</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Use a regra padrão da loja ou defina uma exceção somente para este entregador.</p>
                    </div>
                  </div>

                  <fieldset>
                    <legend className="sr-only">Origem da regra de pagamento</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 transition focus-within:ring-2 focus-within:ring-ring ${!payOverrideEnabled ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
                        <input type="radio" name="driver-pay-source" checked={!payOverrideEnabled} onChange={() => { setPayOverrideEnabled(false); setPayError(null); }} className="mt-0.5 h-4 w-4 accent-primary" />
                        <span>
                          <span className="block text-sm font-bold text-foreground">Padrão da loja</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">Acompanha futuras alterações da regra geral.</span>
                        </span>
                      </label>
                      <label className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 transition focus-within:ring-2 focus-within:ring-ring ${payOverrideEnabled ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
                        <input type="radio" name="driver-pay-source" checked={payOverrideEnabled} onChange={() => setPayOverrideEnabled(true)} className="mt-0.5 h-4 w-4 accent-primary" />
                        <span>
                          <span className="block text-sm font-bold text-foreground">Regra personalizada</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">Substitui o padrão apenas para este cadastro.</span>
                        </span>
                      </label>
                    </div>
                  </fieldset>

                  {payOverrideEnabled ? (
                    <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
                      <DriverPayFields value={payValue} onChange={setPayValue} idPrefix={`driver-${driver.id}-pay`} compact disabled={isSubmitting} />
                    </div>
                  ) : (
                    <div className="border-l-4 border-primary bg-primary/5 px-3 py-2.5">
                      <p className="text-sm font-bold text-foreground">Este entregador usa a regra padrão da loja.</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">A taxa cobrada do cliente permanece independente do pagamento do entregador.</p>
                    </div>
                  )}
                  {payError && <p role="alert" className="text-sm font-semibold text-status-danger">{payError}</p>}
                </section>
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
