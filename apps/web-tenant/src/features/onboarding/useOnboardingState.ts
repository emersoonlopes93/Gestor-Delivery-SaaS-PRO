import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import type { OnboardingBackendStep, TenantUserSession } from '@gestor/types';
import { DeliveryCoverageCompletion } from './deliveryCoverageCompletion';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStepOptions {
  resumePersistedDeliveryCoverage?: boolean;
}

export interface OnboardingValidation {
  hasStoreName: boolean;
  hasAddress: boolean;
  hasOperatingHours: boolean;
  hasPaymentMethod: boolean;
  hasOperationalModes: boolean;
  hasProduct: boolean;
}

export type OnboardingIfoodChoice = 'skipped' | 'connected' | 'pending' | 'unavailable' | 'failed';

function hasRealCoordinates(lat: number | undefined, lng: number | undefined) {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat !== 0 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng !== 0
  );
}

export interface OnboardingStateData {
  currentStep: number;
  visitedSteps: number[];
  validation: OnboardingValidation;
  autoSaveStatus: AutoSaveStatus;
  ifoodChoice?: OnboardingIfoodChoice | null;
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

const LEGACY_STORAGE_KEY = 'onboarding_state';
const STORAGE_KEY_PREFIX = 'onboarding_state';
const STORAGE_VERSION = 2;
const TOTAL_STEPS = 10;
const VALID_IFOOD_CHOICES = new Set<OnboardingIfoodChoice>([
  'skipped',
  'connected',
  'pending',
  'unavailable',
  'failed',
]);

function normalizeStoredStep(step: unknown, version: number) {
  if (typeof step !== 'number' || !Number.isInteger(step)) return undefined;
  const migratedStep = version < STORAGE_VERSION && step >= 2 ? step + 1 : step;
  return migratedStep >= 0 && migratedStep < TOTAL_STEPS ? migratedStep : undefined;
}

function normalizeStoredState(data: Partial<OnboardingStateData> & { version?: number }) {
  const version = typeof data.version === 'number' ? data.version : 1;
  const currentStep = normalizeStoredStep(data.currentStep, version);
  const visitedSteps = Array.isArray(data.visitedSteps)
    ? Array.from(
        new Set(
          data.visitedSteps
            .map((step) => normalizeStoredStep(step, version))
            .filter((step): step is number => typeof step === 'number'),
        ),
      ).sort((a, b) => a - b)
    : undefined;

  const safeCurrentStep = currentStep ?? 0;
  const safeVisitedSteps = Array.from(new Set([0, safeCurrentStep, ...(visitedSteps ?? [])]))
    .sort((a, b) => a - b);
  const ifoodChoice = VALID_IFOOD_CHOICES.has(data.ifoodChoice as OnboardingIfoodChoice)
    ? data.ifoodChoice as OnboardingIfoodChoice
    : null;

  return {
    ...data,
    currentStep: safeCurrentStep,
    visitedSteps: safeVisitedSteps,
    ifoodChoice,
    version: STORAGE_VERSION,
  };
}

const STEP_BACKEND_MAPPING: Record<number, OnboardingBackendStep[]> = {
  0: ['basicInfo'],
  1: ['address'],
  2: ['delivery'],
  3: ['operatingHours'],
  4: ['payments'],
  5: ['catalog', 'menu'],
  6: [],
  7: [],
  8: [],
  9: [],
};

export function getOnboardingStorageKey(tenantId: string, userId: string) {
  return `${STORAGE_KEY_PREFIX}:${tenantId}:${userId}`;
}

type StoredOnboardingPresentationState = Pick<
  OnboardingStateData,
  'currentStep' | 'visitedSteps' | 'ifoodChoice'
>;

function loadFromStorage(storageKey: string): Partial<StoredOnboardingPresentationState> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return normalizeStoredState(JSON.parse(raw));
  } catch {
    // ignore
  }
  return {};
}

function saveToStorage(storageKey: string, data: Partial<StoredOnboardingPresentationState>) {
  try {
    const existing = loadFromStorage(storageKey);
    const next = { ...existing, ...data };
    localStorage.setItem(storageKey, JSON.stringify({
      currentStep: next.currentStep,
      visitedSteps: next.visitedSteps,
      ifoodChoice: next.ifoodChoice,
      version: STORAGE_VERSION,
    }));
  } catch {
    // ignore
  }
}

function deriveVisitedStepsFromBackend(status: BackendOnboardingStatus): number[] {
  const visited = new Set<number>([0]);

  if (status.stepBasicInfo) visited.add(1);
  if (status.stepAddress) visited.add(1);
  if (status.stepDelivery) visited.add(2);
  if (status.stepOperatingHours) visited.add(3);
  if (status.stepPayments) visited.add(4);
  if (status.stepCatalog || status.stepMenu) visited.add(5);
  if (status.stepFirstOrder) visited.add(6);

  return Array.from(visited).sort((a, b) => a - b);
}

function deriveCompletedStepsFromBackend(status: BackendOnboardingStatus): number[] {
  const completed: number[] = [];
  if (status.stepBasicInfo) completed.push(0);
  if (status.stepAddress) completed.push(1);
  if (status.stepDelivery) completed.push(2);
  if (status.stepOperatingHours) completed.push(3);
  if (status.stepPayments) completed.push(4);
  if (status.stepCatalog || status.stepMenu) completed.push(5);
  return completed;
}

function deriveResumeStep(status: BackendOnboardingStatus): number {
  const requiredStepCompleted = [
    status.stepBasicInfo,
    status.stepAddress,
    status.stepDelivery,
    status.stepOperatingHours,
    status.stepPayments,
    status.stepCatalog || status.stepMenu,
  ];
  const firstIncomplete = requiredStepCompleted.findIndex((completed) => !completed);
  return firstIncomplete === -1 ? 6 : firstIncomplete;
}

export function useOnboardingState() {
  const user = useAuthStore((state) => state.user);
  const storageKey = user ? getOnboardingStorageKey(user.tenantId, user.userId) : null;

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [visitedSteps, setVisitedSteps] = useState<number[]>([0]);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [ifoodChoice, setIfoodChoiceState] = useState<OnboardingIfoodChoice | null>(null);
  const [validation, setValidation] = useState<OnboardingValidation>({
    hasStoreName: false,
    hasAddress: false,
    hasOperatingHours: false,
    hasPaymentMethod: false,
    hasOperationalModes: false,
    hasProduct: false,
  });

  const deliveryCoverageCompletion = useRef<DeliveryCoverageCompletion | null>(null);
  const submittingStep = useRef(false);
  const completingOnboarding = useRef(false);
  const statusResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeStorageKey = useRef(storageKey);
  activeStorageKey.current = storageKey;

  useEffect(() => {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    deliveryCoverageCompletion.current = null;
    submittingStep.current = false;
    completingOnboarding.current = false;
    setIsHydrating(Boolean(storageKey && localStorage.getItem('accessToken')));
    setCompletedSteps([]);
    setValidation({
      hasStoreName: false,
      hasAddress: false,
      hasOperatingHours: false,
      hasPaymentMethod: false,
      hasOperationalModes: false,
      hasProduct: false,
    });
    if (!storageKey) {
      setCurrentStep(0);
      setVisitedSteps([0]);
      setIfoodChoiceState(null);
      setHydratedStorageKey(null);
      return;
    }

    const stored = loadFromStorage(storageKey);
    setCurrentStep(stored.currentStep ?? 0);
    setVisitedSteps(stored.visitedSteps ?? [0]);
    setIfoodChoiceState(stored.ifoodChoice ?? null);
    setHydratedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || hydratedStorageKey !== storageKey) return;
    saveToStorage(storageKey, { currentStep, visitedSteps, ifoodChoice });
  }, [currentStep, hydratedStorageKey, ifoodChoice, storageKey, visitedSteps]);

  useEffect(() => () => {
    if (statusResetTimer.current) clearTimeout(statusResetTimer.current);
  }, []);

  const resetStatusAfter = useCallback((delay: number) => {
    if (statusResetTimer.current) clearTimeout(statusResetTimer.current);
    statusResetTimer.current = setTimeout(() => setAutoSaveStatus('idle'), delay);
  }, []);

  const syncProgressFromBackend = useCallback(async () => {
    const requestStorageKey = storageKey;
    try {
      const res = await api.get<BackendOnboardingStatus>('/tenant/onboarding');
      if (activeStorageKey.current !== requestStorageKey) return;
      if (!res.success || !res.data) return;

      const backendVisited = deriveVisitedStepsFromBackend(res.data);
      const resumeStep = deriveResumeStep(res.data);
      const storedStep = storageKey ? loadFromStorage(storageKey).currentStep : undefined;
      const resolvedStep = resumeStep >= 6 ? Math.max(resumeStep, storedStep ?? resumeStep) : resumeStep;
      setCurrentStep(Math.min(resolvedStep, TOTAL_STEPS - 1));
      setCompletedSteps(deriveCompletedStepsFromBackend(res.data));
      setVisitedSteps((prev) => Array.from(new Set([...prev, ...backendVisited])).sort((a, b) => a - b));
    } catch {
      // silent
    }
  }, [storageKey]);

  const checkValidationFromApi = useCallback(async (options?: { throwOnFailure?: boolean }) => {
    const requestStorageKey = storageKey;
    try {
      const coverageRequest = api.get<{
        isDeliveryEnabled?: boolean;
        maxRadiusKm?: number | string;
        defaultPricePerKm?: number | string;
      } | null>('/delivery/coverage');

      const [tenantRes, hoursRes, productsRes, coverageRes] = await Promise.all([
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
            pickupEnabled?: boolean;
          };
        }>('/tenant/me'),
        api.get<{ isOpen: boolean }[]>('/tenant/operating-hours'),
        api.get<{ id: string; isActive?: boolean }[]>('/catalog/products'),
        options?.throwOnFailure ? coverageRequest : coverageRequest.catch(() => ({ success: true, data: null })),
      ]);

      if (activeStorageKey.current !== requestStorageKey) {
        if (options?.throwOnFailure) throw new Error('A identidade ativa mudou durante a validacao.');
        return;
      }

      if (options?.throwOnFailure && (!tenantRes.success || !hoursRes.success || !productsRes.success || !coverageRes.success)) {
        throw new Error('Nao foi possivel revalidar o onboarding.');
      }

      const settings = tenantRes.success ? tenantRes.data?.settings : undefined;
      const hasAddress = Boolean(
        settings?.street?.trim() &&
          settings?.number?.trim() &&
          settings?.neighborhood?.trim() &&
          settings?.city?.trim() &&
          settings?.state?.trim() &&
          settings?.zipCode?.trim() &&
          hasRealCoordinates(settings?.lat, settings?.lng),
      );

      const deliveryCoverage = coverageRes.success ? coverageRes.data : null;
      const hasDeliveryMode = Boolean(
        deliveryCoverage?.isDeliveryEnabled &&
        Number(deliveryCoverage.maxRadiusKm ?? 0) > 0 &&
        Number(deliveryCoverage.defaultPricePerKm ?? 0) >= 0 &&
        hasRealCoordinates(settings?.lat, settings?.lng),
      );
      const hasPickupMode = Boolean(settings?.pickupEnabled);

      setValidation({
        hasStoreName: !!(tenantRes.success && tenantRes.data?.name?.trim()),
        hasAddress,
        hasOperatingHours: !!(hoursRes.success && hoursRes.data?.some((hour) => hour.isOpen)),
        hasPaymentMethod: !!(tenantRes.success && tenantRes.data?.settings?.paymentMethods?.length),
        hasOperationalModes: hasDeliveryMode || hasPickupMode,
        hasProduct: !!(
          productsRes.success &&
          productsRes.data?.some((product) => product.isActive !== false)
        ),
      });
    } catch (error) {
      if (activeStorageKey.current !== requestStorageKey) {
        if (options?.throwOnFailure) throw new Error('A identidade ativa mudou durante a validacao.');
        return;
      }
      if (options?.throwOnFailure) throw error;
      // Keep the last known state during background validation failures.
    }
  }, [storageKey]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && storageKey && hydratedStorageKey === storageKey) {
      const requestStorageKey = storageKey;
      setIsHydrating(true);
      void Promise.all([
        checkValidationFromApi(),
        syncProgressFromBackend(),
      ]).finally(() => {
        if (activeStorageKey.current === requestStorageKey) setIsHydrating(false);
      });
    } else if (!token) {
      setIsHydrating(false);
    }
  }, [checkValidationFromApi, hydratedStorageKey, storageKey, syncProgressFromBackend]);

  const syncCurrentStepToBackend = useCallback(async (stepIndex: number) => {
    const requestStorageKey = storageKey;
    const backendSteps = STEP_BACKEND_MAPPING[stepIndex] ?? [];
    if (backendSteps.length === 0) return;

    await Promise.all(
      backendSteps.map(async (step) => {
        const response = await api.patch('/tenant/onboarding-step', { step, completed: true });
        if (!response.success) throw new Error('Nao foi possivel marcar a etapa do onboarding.');
      }),
    );
    if (activeStorageKey.current !== requestStorageKey) {
      throw new Error('A identidade ativa mudou durante a atualizacao do onboarding.');
    }
    setCompletedSteps((completed) => completed.includes(stepIndex)
      ? completed
      : [...completed, stepIndex].sort((a, b) => a - b));
  }, [storageKey]);

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

  const setIfoodChoice = useCallback((choice: OnboardingIfoodChoice) => {
    setIfoodChoiceState(choice);
  }, []);

  const advanceCurrentStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = Math.min(prev + 1, TOTAL_STEPS - 1);
      setVisitedSteps((vs) => (vs.includes(next) ? vs : [...vs, next]));
      return next;
    });
  }, []);

  const saveStep = useCallback(async (saveFn: () => Promise<void>, options?: SaveStepOptions): Promise<boolean> => {
    const requestStorageKey = storageKey;
    if (options?.resumePersistedDeliveryCoverage) {
      if (!deliveryCoverageCompletion.current) {
        deliveryCoverageCompletion.current = new DeliveryCoverageCompletion({
          markStep: () => syncCurrentStepToBackend(2),
          revalidate: () => checkValidationFromApi({ throwOnFailure: true }),
          advance: advanceCurrentStep,
          onStatus: setAutoSaveStatus,
        });
      }

      const advanced = await deliveryCoverageCompletion.current.submit(saveFn);
      if (advanced) deliveryCoverageCompletion.current = null;
      resetStatusAfter(advanced ? 2500 : 3000);
      return advanced;
    }

    if (submittingStep.current) return false;
    submittingStep.current = true;
    setAutoSaveStatus('saving');
    try {
      await saveFn();
      await syncCurrentStepToBackend(currentStep);
      await checkValidationFromApi({ throwOnFailure: true });
      if (activeStorageKey.current !== requestStorageKey) return false;
      advanceCurrentStep();
      setAutoSaveStatus('saved');
      resetStatusAfter(2500);
      return true;
    } catch {
      setAutoSaveStatus('error');
      resetStatusAfter(3000);
      return false;
    } finally {
      submittingStep.current = false;
    }
  }, [advanceCurrentStep, checkValidationFromApi, currentStep, resetStatusAfter, storageKey, syncCurrentStepToBackend]);

  const completeOnboarding = useCallback(async () => {
    const requestStorageKey = storageKey;
    if (completingOnboarding.current) {
      throw new Error('A conclusao do onboarding ja esta em andamento.');
    }
    completingOnboarding.current = true;
    setAutoSaveStatus('saving');
    try {
      await api.post<{ completedAt?: string | null }>('/tenant/onboarding-complete');
      const session = await api.get<TenantUserSession>('/auth/tenant/me');
      if (activeStorageKey.current !== requestStorageKey) {
        throw new Error('A identidade ativa mudou durante a conclusao do onboarding.');
      }
      if (!session.success || !session.data?.onboardingCompletedAt) {
        throw new Error('O servidor nao confirmou a conclusao do onboarding.');
      }
      if (storageKey) localStorage.removeItem(storageKey);
      setAutoSaveStatus('saved');
      return session.data;
    } catch (err) {
      setAutoSaveStatus('error');
      throw err;
    } finally {
      completingOnboarding.current = false;
    }
  }, [storageKey]);

  const isAllValid = Object.values(validation).every(Boolean);

  return {
    currentStep,
    visitedSteps,
    completedSteps,
    isHydrating,
    autoSaveStatus,
    validation,
    ifoodChoice,
    totalSteps: TOTAL_STEPS,
    isAllValid,
    goNext,
    goPrev,
    goToStep,
    saveStep,
    markValidation,
    setIfoodChoice,
    completeOnboarding,
    checkValidationFromApi,
    syncProgressFromBackend,
  };
}
