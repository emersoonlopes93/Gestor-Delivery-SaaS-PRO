import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Phone, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../lib/api-client';
import { useCustomerStore } from '../store/useCustomerStore';
import { useToast } from './Toast';
import { CustomerDTO } from '@gestor/types';
import { getGoogleClientId, loadGoogleIdentityServices, type GoogleCredentialResponse } from '../lib/google-identity';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
}

export function LoginModal({ isOpen, onClose, tenantSlug }: LoginModalProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLinkCapability, setGoogleLinkCapability] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const { setCustomer } = useCustomerStore();
  const { showToast } = useToast();

  const handleGoogleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    if (!response.credential || isLoading) return;

    setIsLoading(true);
    try {
      const result = await api.post<
        | { status: 'AUTHENTICATED'; customer: CustomerDTO; accessToken: string; refreshToken: string }
        | { status: 'PHONE_LINK_REQUIRED'; googleLinkCapability: string }
      >(`/public/auth/${tenantSlug}/otp/google`, { credential: response.credential });
      if (result.data.status === 'AUTHENTICATED') {
        setCustomer(result.data.customer, result.data.accessToken, result.data.refreshToken, tenantSlug);
        showToast({ title: 'Bem-vindo!', type: 'success' });
        onClose();
        return;
      }

      setGoogleLinkCapability(result.data.googleLinkCapability);
      setStep('phone');
      showToast({ title: 'Confirme seu WhatsApp para vincular sua conta Google.', type: 'success' });
    } catch (error: unknown) {
      const err = error as Error;
      showToast({ title: err.message || 'Não foi possível entrar com Google', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, onClose, setCustomer, showToast, tenantSlug]);

  useEffect(() => {
    const clientId = getGoogleClientId();
    const target = googleButtonRef.current;
    if (!isOpen || step !== 'phone' || !clientId || !target) return;

    let cancelled = false;
    void loadGoogleIdentityServices()
      .then((google) => {
        if (cancelled || !googleButtonRef.current) return;
        google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential, auto_select: false });
        googleButtonRef.current.replaceChildren();
        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline', size: 'large', text: 'continue_with', width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) showToast({ title: 'Google não está disponível no momento.', type: 'error' });
      });

    return () => { cancelled = true; };
  }, [handleGoogleCredential, isOpen, showToast, step]);

  if (!isOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) {
      showToast({ title: 'Digite um telefone válido', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      await api.post(`/public/auth/${tenantSlug}/otp/send`, { phone });
      setStep('otp');
      showToast({ title: 'Código enviado!', type: 'success' });
    } catch (error: unknown) {
      const err = error as Error;
      showToast({ title: err.message || 'Erro ao enviar código', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidateOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      showToast({ title: 'Digite o código de 6 dígitos', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post<{ customer: CustomerDTO; accessToken: string; refreshToken: string }>(`/public/auth/${tenantSlug}/otp/validate`, {
        phone, 
        code: otp,
        ...(googleLinkCapability ? { googleLinkCapability } : {}),
      });
      
      setCustomer(response.data.customer, response.data.accessToken, response.data.refreshToken, tenantSlug);
      showToast({ title: 'Bem-vindo!', type: 'success' });
      onClose();
    } catch (error: unknown) {
      const err = error as Error;
      showToast({ title: err.message || 'Código inválido ou expirado', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
              {step === 'phone' ? (
                <Phone className="w-8 h-8 text-primary-600" />
              ) : (
                <ShieldCheck className="w-8 h-8 text-primary-600" />
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-white mb-2">
            {step === 'phone' ? 'Bem-vindo de volta!' : 'Verifique seu telefone'}
          </h2>
          <p className="text-gray-500 text-center mb-8">
            {step === 'phone' 
              ? 'Entre com seu telefone para acompanhar seus pedidos e agilizar o checkout.'
              : `Enviamos um código de 6 dígitos para o número ${phone}`}
          </p>

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefone (WhatsApp)
                </label>
                <input
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-premium"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Continuar
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
              {getGoogleClientId() ? (
                <div className="pt-2">
                  <div className="relative my-2 text-center text-xs text-gray-400 before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-gray-100">
                    <span className="relative bg-white px-2 dark:bg-gray-900">ou</span>
                  </div>
                  <div ref={googleButtonRef} aria-label="Continuar com Google" className="flex justify-center" />
                </div>
              ) : null}
            </form>
          ) : (
            <form onSubmit={handleValidateOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código de Verificação
                </label>
                <input
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="input-premium text-center tracking-[0.5em] text-xl font-bold"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Verificar e Entrar'
                )}
              </button>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-full text-sm text-gray-500 hover:text-primary-600 transition-colors"
                disabled={isLoading}
              >
                Alterar número de telefone
              </button>
            </form>
          )}

          <div className="mt-8 pt-8 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Ao continuar, você concorda com nossos Termos de Uso e Política de Privacidade.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
