import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import type { OnboardingBackendStep, TenantUserSession } from '@gestor/types';

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

type BackendOnboardingStatus = {
  stepBasicInfo?: boolean;
  stepOperatingHours?: boolean;
  stepLogo?: boolean;
  stepAddress?: boolean;
  stepDelivery?: boolean;
  stepPayments?: boolean;
  stepWhatsapp?: boolean;
  stepMenu?: boolean;
  stepCatalog?: boolean;
  stepFirstOrder?: boolean;
  completedAt?: string | null;
};

const STORAGE_KEY = 'onboarding_state';
const TOTAL_STEPS = 8;

const STEP_BACKEND_MAPPING: Record<number, OnboardingBackendStep[]> = {
  0: ['basicInfo'],
  1: ['address'],
  2: ['operatingHours'],
  3: ['payments'],
  4: ['catalog', 'menu'],
  5: [],
  6: [],
  7: [],
};

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

function deriveVisitedStepsFromBackend(status: BackendOnboardingStatus): number[] {
  const visited = new Set<number>([0]);

  if (status.stepBasicInfo) visited.add(1);
  if (status.stepAddress) visited.add(2);
  if (status.stepOperatingHours) visited.add(3);
  if (status.stepPayments) visited.add(4);
  if (status.stepCatalog || status.stepMenu) visited.add(5);

  return Array.from(visited).sort((a, b) => a - b);
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

  useEffect(() => {
    saveToStorage({ currentStep, visitedSteps, validation });
  }, [currentStep, visitedSteps, validation]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      void Promise.all([
        checkValidationFromApi(),
        syncProgressFromBackend(),
      ]);
    }
  }, []);

  const syncProgressFromBackend = async () => {
    try {
      const res = await api.get<BackendOnboardingStatus>('/tenant/onboarding');
      if (!res.success || !res.data) return;

      const backendVisited = deriveVisitedStepsFromBackend(res.data);
      setVisitedSteps((prev) => Array.from(new Set([...prev, ...backendVisited])).sort((a, b) => a - b));
    } catch {
      // silent
    }
  };

  const checkValidationFromApi = async () => {
    try {
      const [tenantRes, hoursRes, productsRes] = await Promise.all([
        api.get<{
          name: string;
          settings?: {
            street?: string;
            number?: string;
            neighborhood?: string;
            city?: string;
            state?: string;
            zipCode?: string;
            lat?: number;
            lng?: number;
            paymentMethods?: string[];
          };
        }>('/tenant/me'),
        api.get<{ isOpen: boolean }[]>('/tenant/operating-hours'),
        api.get<{ id: string; isActive?: boolean }[]>('/catalog/products'),
      ]);

      const settings = tenantRes.success ? tenantRes.data?.settings : undefined;
      const hasAddress = Boolean(
        settings?.street?.trim() &&
          settings?.number?.trim() &&
          settings?.neighborhood?.trim() &&
          settings?.city?.trim() &&
          settings?.state?.trim() &&
          settings?.zipCode?.trim() &&
          typeof settings?.lat === 'number' &&
          Number.isFinite(settings.lat) &&
          typeof settings?.lng === 'number' &&
          Number.isFinite(settings.lng),
      );

      setValidation({
        hasStoreName: !!(tenantRes.success && tenantRes.data?.name?.trim()),
        hasAddress,
        hasOperatingHours: !!(hoursRes.success && hoursRes.data?.some((hour) => hour.isOpen)),
        hasPaymentMethod: !!(tenantRes.success && tenantRes.data?.settings?.paymentMethods?.length),
        hasProduct: !!(
          productsRes.success &&
          productsRes.data?.some((product) => product.isActive !== false)
        ),
      });
    } catch {
      // silent — keep existing validation state
    }
  };

  const syncCurrentStepToBackend = useCallback(async (stepIndex: number) => {
    const backendSteps = STEP_BACKEND_MAPPING[stepIndex] ?? [];
    if (backendSteps.length === 0) return;

    await Promise.all(
      backendSteps.map((step) =>
        api.patch('/tenant/onboarding-step', { step, completed: true }),
      ),
    );
  }, []);

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
    setCurrentStep((prev) => {
      const next = Math.min(prev + 1, TOTAL_STEPS - 1);
      setVisitedSteps((vs) => (vs.includes(next) ? vs : [...vs, next]));
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((step: number) => {
    if (visitedSteps.includes(step) || step === 0) {
      setCurrentStep(step);
    }
  }, [visitedSteps]);

  const markValidation = useCallback((key: keyof OnboardingValidation, value: boolean) => {
    setValidation((prev) => ({ ...prev, [key]: value }));
  }, []);

  const saveStep = useCallback(async (saveFn: () => Promise<void>) => {
    triggerAutoSave(async () => {
      await saveFn();
      await syncCurrentStepToBackend(currentStep);
      await checkValidationFromApi();
    });

    setCurrentStep((prev) => {
      const next = Math.min(prev + 1, TOTAL_STEPS - 1);
      setVisitedSteps((vs) => (vs.includes(next) ? vs : [...vs, next]));
      return next;
    });
  }, [checkValidationFromApi, currentStep, syncCurrentStepToBackend, triggerAutoSave]);

  const completeOnboarding = useCallback(async () => {
    setAutoSaveStatus('saving');
    try {
      const res = await api.post<{ completedAt?: string | null }>('/tenant/onboarding-complete');
      if (user) {
        setUser({
          ...user,
          onboardingCompletedAt: res.data?.completedAt || new Date().toISOString(),
        } as TenantUserSession);
      }
      localStorage.removeItem(STORAGE_KEY);
      setAutoSaveStatus('saved');
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
    syncProgressFromBackend,
  };
}
