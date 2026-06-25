import 'reflect-metadata';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import { queryClient } from './lib/query-client';
import { useThemeStore } from './stores/theme.store';
import { ErrorBoundary } from './components/error-boundary';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import './lib/leaflet-icon';
import './index.css';

// Initialize Theme
useThemeStore.getState().initializeTheme();

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-capacitor');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

