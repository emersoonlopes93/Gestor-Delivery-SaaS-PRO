import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';

interface OnboardingGuardProps {
  children: ReactNode;
}

export function OnboardingGuard({ children }: OnboardingGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) return null;

  if (isAuthenticated && user) {
    // If onboarding is not completed and trying to access something other than /onboarding
    if (!user.onboardingCompletedAt && location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
    
    // If onboarding is completed and trying to access /onboarding
    if (user.onboardingCompletedAt && location.pathname === '/onboarding') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
