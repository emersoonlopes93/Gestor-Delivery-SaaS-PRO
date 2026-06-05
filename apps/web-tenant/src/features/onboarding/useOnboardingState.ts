import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import type { TenantUserSession } from '@gestor/types';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface OnboardingValidation {
  hasStoreName: boolean;
  hasAddress: boolean;
  hasOperatingHours: boolean;
  hasPaymentMethod: boolean;
  hasProduct: boolean;
}

export interface OnboardingStateData {
  currentStep: number;
  visitedSteps: number[];
  validation: OnboardingValidation;
  autoSaveStatus: AutoSaveStatus;
}

const STORAGE_KEY = 'onboarding_state';
const TOTAL_STEPS = 8;

function loadFromStorage(): Partial<OnboardingStateData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveToStorage(data: Partial<OnboardingStateData>) {
  try {
    const existing = loadFromStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...data }));
  } catch {
    // ignore
  }
}

export function useOnboardingState() {
  const { user, setUser } = useAuthStore();
  const stored = loadFromStorage();

  const [currentStep, setCurrentStep] = useState<number>(stored.currentStep ?? 0);
  const [visitedSteps, setVisitedSteps] = useState<number[]>(stored.visitedSteps ?? [0]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [validation, setValidation] = useState<OnboardingValidation>({
    hasStoreName: stored.validation?.hasStoreName ?? false,
    hasAddress: stored.validation?.hasAddress ?? false,
    hasOperatingHours: stored.validation?.hasOperatingHours ?? false,
    hasPaymentMethod: stored.validation?.hasPaymentMethod ?? false,
    hasProduct: stored.validation?.hasProduct ?? false,
  });

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist state to localStorage
  useEffect(() => {
    saveToStorage({ currentStep, visitedSteps, validation });
  }, [currentStep, visitedSteps, validation]);

  // Check validation on mount from real data if token exists
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      checkValidationFromApi().catch(() => {});
    }
  }, []);

  const checkValidationFromApi = async () => {
    try {
      const [tenantRes, hoursRes, productsRes] = await Promise.all([
        api.get<{ name: string; settings?: { street?: string; city?: string; paymentMethods?: string[] } }>('/tenant/me'),
        api.get<{ isOpen: boolean }[]>('/tenant/operating-hours'),
        api.get<{ id: string }[]>('/catalog/products'),
      ]);

      setValidation({
        hasStoreName: !!(tenantRes.success && tenantRes.data?.name?.trim()),
        hasAddress: !!(tenantRes.success && tenantRes.data?.settings?.city),
        hasOperatingHours: !!(hoursRes.success && hoursRes.data?.some(h => h.isOpen)),
        hasPaymentMethod: !!(tenantRes.success && tenantRes.data?.settings?.paymentMethods?.length),
        hasProduct: !!(productsRes.success && productsRes.data?.length > 0),
      });
    } catch {
      // silent — keep existing validation state
    }
  };

  const triggerAutoSave = useCallback((saveFn: () => Promise<void>) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('saving');
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await saveFn();
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2500);
      } catch {
        setAutoSaveStatus('error');
        setTimeout(() => setAutoSaveStatus('idle'), 3000);
      }
    }, 800);
  }, []);

  const goNext = useCallback(() => {
    setCurrentStep(prev => {
      const next = Math.min(prev + 1, TOTAL_STEPS - 1);
      setVisitedSteps(vs => vs.includes(next) ? vs : [...vs, next]);
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((step: number) => {
    if (visitedSteps.includes(step) || step === 0) {
      setCurrentStep(step);
    }
  }, [visitedSteps]);

  const markValidation = useCallback((key: keyof OnboardingValidation, value: boolean) => {
    setValidation(prev => ({ ...prev, [key]: value }));
  }, []);

  const saveStep = useCallback(async (saveFn: () => Promise<void>) => {
    triggerAutoSave(saveFn);
    // Mark next step as visited
    setCurrentStep(prev => {
      const next = Math.min(prev + 1, TOTAL_STEPS - 1);
      setVisitedSteps(vs => vs.includes(next) ? vs : [...vs, next]);
      return next;
    });
  }, [triggerAutoSave]);

  const completeOnboarding = useCallback(async () => {
    setAutoSaveStatus('saving');
    try {
      await api.post('/tenant/onboarding-complete');
      if (user) {
        setUser({ ...user, onboardingCompletedAt: new Date().toISOString() } as TenantUserSession);
      }
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      setAutoSaveStatus('error');
      throw err;
    }
  }, [user, setUser]);

  const isAllValid = Object.values(validation).every(Boolean);

  return {
    currentStep,
    visitedSteps,
    autoSaveStatus,
    validation,
    totalSteps: TOTAL_STEPS,
    isAllValid,
    goNext,
    goPrev,
    goToStep,
    saveStep,
    markValidation,
    completeOnboarding,
    triggerAutoSave,
    checkValidationFromApi,
  };
}
