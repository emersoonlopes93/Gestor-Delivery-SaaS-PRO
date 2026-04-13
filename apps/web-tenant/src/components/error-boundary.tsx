import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Intencionalmente não logamos tokens/senhas aqui
    // Para produção, isso pode ser conectado a um coletor (ex: Sentry)
    // eslint-disable-next-line no-console
    console.error('UI_ERROR_BOUNDARY', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>Ocorreu um erro</h1>
          <p style={{ marginTop: 8, marginBottom: 16 }}>
            Tente recarregar a página. Se o problema persistir, entre em contato com o suporte.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '8px 12px', cursor: 'pointer' }}
          >
            Recarregar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
