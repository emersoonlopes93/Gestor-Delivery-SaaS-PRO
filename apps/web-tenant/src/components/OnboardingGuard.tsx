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
    // If onboarding is not completed, restrict access but allow specific paths
    if (!user.onboardingCompletedAt) {
      // Remove '/dashboard' to force users to finish onboarding
      const allowedPaths = ['/onboarding', '/settings', '/catalog/products'];
      const isAllowed = allowedPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
      
      if (!isAllowed) {
        return <Navigate to="/onboarding" replace />;
      }
    }
    
    // If onboarding is completed and trying to access /onboarding
    if (user.onboardingCompletedAt && location.pathname === '/onboarding') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
