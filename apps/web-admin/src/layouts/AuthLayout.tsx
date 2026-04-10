import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 via-primary-800 to-primary-950">
      <div className="w-full max-w-md mx-4">
        <Outlet />
      </div>
    </div>
  );
}
