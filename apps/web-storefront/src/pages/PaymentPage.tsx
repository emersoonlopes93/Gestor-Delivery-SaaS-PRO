import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, QrCode, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../lib/api-client';

interface PixPaymentData {
  transactionId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAt: string;
  status?: 'pending' | 'confirmed' | 'failed' | 'expired';
}

export function PaymentPage() {
  const { tenantSlug, transactionId } = useParams<{ tenantSlug: string; transactionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [paymentData, setPaymentData] = useState<PixPaymentData | null>(null);
  const [status, setStatus] = useState<'loading' | 'pending' | 'confirmed' | 'expired' | 'error'>('loading');
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const pixPayment = (location.state as any)?.pixPayment;
    if (pixPayment) {
      setPaymentData(pixPayment);
      setStatus('pending');
    } else {
      // Se não tiver os dados no state, buscar da API
      loadPaymentData();
    }
  }, [tenantSlug, transactionId]);

  const loadPaymentData = async () => {
    try {
      const response = await api.get<PixPaymentData>(`/public/payment-gateway/pix/${transactionId}`);
      setPaymentData(response.data);
      setStatus(response.data.status === 'confirmed' ? 'confirmed' : 'pending');
    } catch (error) {
      console.error('Error loading payment data:', error);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (status === 'pending' && paymentData) {
      // Iniciar polling para verificar status do pagamento
      const interval = setInterval(async () => {
        try {
          const response = await api.get<PixPaymentData>(`/public/payment-gateway/pix/${transactionId}`);
          const updatedStatus = response.data.status;
          
          if (updatedStatus === 'confirmed') {
            setStatus('confirmed');
            setPollingInterval(null);
            
            // Redirecionar para página do pedido
            setTimeout(() => {
              navigate(`/${tenantSlug}/order/success`, { 
                state: { 
                  message: 'Pagamento confirmado com sucesso!',
                  orderData: response.data 
                } 
              });
            }, 2000);
          } else if (updatedStatus === 'failed' || updatedStatus === 'expired') {
            setStatus('expired');
            setPollingInterval(null);
          }
        } catch (error) {
          console.error('Error checking payment status:', error);
        }
      }, 3000); // Verificar a cada 3 segundos

      setPollingInterval(interval);

      // Limpar polling quando o componente for desmontado
      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [status, paymentData, tenantSlug, transactionId]);

  useEffect(() => {
    if (paymentData && status === 'pending') {
      const updateTimeLeft = () => {
        const now = new Date();
        const expiresAt = new Date(paymentData.expiresAt);
        const diff = expiresAt.getTime() - now.getTime();
        
        if (diff <= 0) {
          setTimeLeft('Expirado');
          setStatus('expired');
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
        } else {
          const minutes = Math.floor(diff / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      };

      updateTimeLeft();
      const interval = setInterval(updateTimeLeft, 1000);
      
      return () => clearInterval(interval);
    }
  }, [paymentData, status, pollingInterval]);

  const handleCopyPixCode = async () => {
    if (paymentData?.qrCode) {
      try {
        await navigator.clipboard.writeText(paymentData.qrCode);
        alert('Código PIX copiado com sucesso!');
      } catch (error) {
        console.error('Error copying PIX code:', error);
        alert('Erro ao copiar código PIX');
      }
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Carregando informações de pagamento...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6 bg-white rounded-2xl shadow-lg">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Erro no Pagamento</h1>
          <p className="text-gray-600 mb-6">
            Não foi possível carregar as informações do pagamento. Tente novamente mais tarde.
          </p>
          <button
            onClick={() => navigate(`/${tenantSlug}/checkout`)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Voltar para o Checkout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(`/${tenantSlug}/checkout`)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Voltar</span>
            </button>
            <h1 className="text-xl font-bold text-gray-900">Pagamento PIX</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Status Header */}
          <div className={`p-6 border-b ${
            status === 'confirmed' 
              ? 'bg-green-50 border-green-200' 
              : status === 'expired'
              ? 'bg-red-50 border-red-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center gap-3">
              {status === 'confirmed' && (
                <>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-green-800">Pagamento Confirmado!</h2>
                    <p className="text-green-600">Seu pagamento foi aprovado com sucesso.</p>
                  </div>
                </>
              )}
              {status === 'expired' && (
                <>
                  <AlertCircle className="w-6 h-6 text-red-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-red-800">Pagamento Expirado</h2>
                    <p className="text-red-600">O tempo para pagamento expirou. Por favor, faça um novo pedido.</p>
                  </div>
                </>
              )}
              {status === 'pending' && (
                <>
                  <Clock className="w-6 h-6 text-yellow-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-yellow-800">Aguardando Pagamento</h2>
                    <p className="text-yellow-600">Escaneie o QR code ou copie o código PIX.</p>
                  </div>
                </>
              )}
            </div>
            
            {status === 'pending' && (
              <div className="ml-auto text-sm text-yellow-600">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Tempo restante: {timeLeft}</span>
                </div>
              </div>
            )}
          </div>

          {/* QR Code Section */}
          {status === 'pending' && paymentData && (
            <div className="p-8">
              <div className="max-w-sm mx-auto">
                {/* QR Code Image */}
                <div className="bg-white p-4 rounded-2xl shadow-inner mb-6">
                  <img 
                    src={`data:image/png;base64,${paymentData.qrCodeBase64}`}
                    alt="QR Code para pagamento PIX"
                    className="w-full h-auto"
                  />
                </div>

                {/* PIX Code */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-center font-semibold text-gray-800 mb-3">Código PIX</h3>
                  <div className="bg-white p-4 rounded border-2 border-dashed border-gray-300">
                    <code className="text-lg font-mono text-center break-all">
                      {paymentData.qrCode}
                    </code>
                  </div>
                  <button
                    onClick={handleCopyPixCode}
                    className="w-full mt-3 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    Copiar Código
                  </button>
                </div>

                {/* Instructions */}
                <div className="mt-6 text-center text-sm text-gray-600">
                  <p className="mb-2">
                    <strong>Como pagar:</strong>
                  </p>
                  <ol className="text-left space-y-2">
                    <li>1. Abra o app do seu banco</li>
                    <li>2. Escaneie o QR code ou cole o código PIX</li>
                    <li>3. Confirme o pagamento</li>
                    <li>4. Aguarde a confirmação (atualização automática)</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {status === 'confirmed' && (
            <div className="p-8 text-center">
              <div className="max-w-sm mx-auto">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-green-800 mb-2">Pagamento Aprovado!</h2>
                <p className="text-green-600 mb-6">
                  Seu pagamento foi confirmado e seu pedido está sendo preparado.
                </p>
                <button
                  onClick={() => navigate(`/${tenantSlug}/orders`)}
                  className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Acompanhar Pedido
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
