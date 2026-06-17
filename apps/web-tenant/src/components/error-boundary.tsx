import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
  errorInfo?: React.ErrorInfo;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // Log detalhado do erro para debugging em desenvolvimento/Capacitor
    console.error('=== UI_ERROR_BOUNDARY ===');
    console.error('Error:', error);
    console.error('Error Message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error Stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('========================');

    // Log adicional para Capacitor/Android
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      console.error('Capacitor Platform:', (window as any).Capacitor.getPlatform());
      console.error('Current URL:', window.location.href);
    }
  }

  render() {
    if (this.state.hasError) {
      const errorMessage =
        typeof this.state.error === 'object' && this.state.error && 'message' in this.state.error
          ? (this.state.error as any).message
          : 'Erro inesperado';
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }} className="error-boundary-container">
          <h1 style={{ fontSize: 18, margin: 0, color: '#dc2626' }}>Ocorreu um erro</h1>
          <p style={{ marginTop: 8, marginBottom: 16 }} className="error-message">
            {errorMessage}
          </p>
          <p style={{ marginTop: 8, marginBottom: 16 }}>
            Tente recarregar a página. Se o problema persistir, entre em contato com o suporte.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '8px 12px', cursor: 'pointer' }}
            className="error-button"
          >
            Recarregar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
