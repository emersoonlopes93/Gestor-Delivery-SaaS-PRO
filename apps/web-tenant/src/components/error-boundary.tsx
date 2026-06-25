import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
  errorInfo?: React.ErrorInfo;
};

const showDebugError =
  import.meta.env.DEV ||
  import.meta.env.VITE_DEBUG_ERROR_BOUNDARY === 'true';

const getErrorName = (error: unknown) =>
  error instanceof Error ? error.name : 'Unknown';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? 'Erro inesperado');

const getErrorStack = (error: unknown) =>
  error instanceof Error ? error.stack : undefined;

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });

    console.error('[ErrorBoundary]', {
      name: getErrorName(error),
      message: getErrorMessage(error),
      stack: getErrorStack(error),
      componentStack: errorInfo?.componentStack,
      href: typeof window !== 'undefined' ? window.location.href : 'N/A',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
    });
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error;
      const errorName = getErrorName(error);
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error) ?? 'No stack trace';
      const componentStack = this.state.errorInfo?.componentStack ?? 'No component stack';
      const location = typeof window !== 'undefined' ? window.location.href : 'N/A';
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A';

      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }} className="error-boundary-container">
          <h1 style={{ fontSize: 18, margin: 0, color: '#dc2626' }}>Ocorreu um erro</h1>
          <p style={{ marginTop: 8, marginBottom: 16 }} className="error-message">
            {errorMessage}
          </p>
          
          {showDebugError && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
                borderRadius: 4,
                fontSize: 12,
                overflow: 'auto',
                maxHeight: '60vh',
              }}
            >
              <h2 style={{ fontSize: 14, margin: '0 0 8px 0', color: '#4ec9b0' }}>
                DEBUG ERROR BOUNDARY
              </h2>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <strong>Name:</strong>
                {'\n'}
                {errorName}
                {'\n\n'}
                <strong>Message:</strong>
                {'\n'}
                {errorMessage}
                {'\n\n'}
                <strong>Stack:</strong>
                {'\n'}
                {errorStack}
                {'\n\n'}
                <strong>Component stack:</strong>
                {'\n'}
                {componentStack}
                {'\n\n'}
                <strong>Location:</strong>
                {'\n'}
                {location}
                {'\n\n'}
                <strong>User agent:</strong>
                {'\n'}
                {userAgent}
              </pre>
            </div>
          )}
          
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
