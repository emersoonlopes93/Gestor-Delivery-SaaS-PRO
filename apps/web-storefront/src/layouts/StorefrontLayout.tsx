import { Outlet } from 'react-router-dom';

export function StorefrontLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col w-full">
      {/* Navigation / Header will be here */}
      <main className="flex-1 w-full max-w-4xl mx-auto">
        <Outlet />
      </main>
      
      {/* Footer / Cart bar will be here */}
    </div>
  );
}