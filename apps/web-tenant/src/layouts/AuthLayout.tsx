import { Outlet } from 'react-router-dom';

/**
 * Layout for public pages (login, register, etc.).
 */
export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900">
      <div className="w-full max-w-md mx-4">
        <Outlet />
      </div>
    </div>
  );
}
