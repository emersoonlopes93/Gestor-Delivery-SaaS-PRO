import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Star, MessageSquare, ExternalLink, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api-client';

type FeedbackInfo = {
  storeName: string;
  orderNumber: string;
  alreadyResponded: boolean;
  googleReviewUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  shareText?: string;
  highRatingMessage?: string;
  lowRatingMessage?: string;
};

export function PublicFeedbackPage() {
  const { tenantSlug, token } = useParams<{ tenantSlug: string; token: string }>();
  const navigate = useNavigate();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { data: info, isLoading, isError } = useQuery({
    queryKey: ['feedback-info', token],
    queryFn: async () => {
      const res = await api.get<FeedbackInfo>(`/public/orders/${token}/feedback-info`);
      if (!res.success) throw new Error('Não foi possível carregar as informações');
      return res.data;
    },
    enabled: !!token,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/public/orders/${token}/feedback`, { rating, comment });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const clickMutation = useMutation({
    mutationFn: async (channel: string) => {
      await api.post(`/public/orders/${token}/feedback-click`, { channel });
    },
  });

  const handleLinkClick = (channel: string, url: string) => {
    clickMutation.mutate(channel);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !info) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
        <p className="text-red-600 mb-4">Não foi possível carregar o pedido ou o link é inválido.</p>
        <button onClick={() => navigate(`/${tenantSlug}`)} className="text-primary hover:underline">
          Voltar para a loja
        </button>
      </div>
    );
  }

  if (info.alreadyResponded && !submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center max-w-lg mx-auto">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Feedback já registrado!</h2>
        <p className="text-gray-600 mb-6">Agradecemos por já ter avaliado o pedido #{info.orderNumber}.</p>
        <button onClick={() => navigate(`/${tenantSlug}`)} className="text-primary hover:underline">
          Voltar para a loja
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 max-w-lg mx-auto min-h-screen flex flex-col bg-[var(--storefront-background)] text-[var(--storefront-foreground)]">
      <header className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(`/${tenantSlug}`)} className="p-2 hover:bg-[var(--storefront-muted)] rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-[var(--storefront-foreground)]" />
        </button>
        <div>
          <h1 className="text-lg font-black text-[var(--storefront-foreground)] tracking-tight">Avalie seu pedido</h1>
          <p className="text-sm text-[var(--storefront-muted-foreground)]">{info.storeName} • #{info.orderNumber}</p>
        </div>
      </header>

      {!submitted ? (
        <div className="flex-1">
          <div className="bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-3xl p-6 shadow-sm mb-6 flex flex-col items-center">
            <h2 className="text-xl font-semibold mb-6 text-center text-[var(--storefront-foreground)]">Como foi sua experiência?</h2>
            
            <div className="flex items-center justify-center gap-2 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= (hoveredRating || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'fill-transparent text-gray-300'
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>

            {rating > 0 && (
              <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                <label className="block text-sm font-medium text-[var(--storefront-foreground)] mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Deixe um comentário (opcional)
                </label>
                <textarea
                  className="w-full border border-[var(--storefront-border)] rounded-xl p-3 text-sm focus:ring-2 focus:ring-[var(--storefront-primary)] focus:border-transparent outline-none transition-all resize-none bg-[var(--storefront-muted)] text-[var(--storefront-foreground)] mb-4"
                  rows={4}
                  placeholder={rating >= 4 ? "O que você mais gostou?" : "O que podemos melhorar?"}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                
                <button
                  className="w-full bg-[var(--storefront-primary)] text-[var(--storefront-primary-foreground)] font-bold rounded-xl py-4 flex items-center justify-center gap-2 transition-all hover:brightness-110 disabled:opacity-50"
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar Avaliação'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 animate-in zoom-in-95 fade-in duration-500">
          <div className="bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-3xl p-8 shadow-sm text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-3 text-[var(--storefront-foreground)]">Muito obrigado!</h2>
            
            {rating <= 3 ? (
              <p className="text-[var(--storefront-muted-foreground)] mb-6">
                {info.lowRatingMessage || "Sentimos muito que sua experiência não tenha sido perfeita. Recebemos seu feedback e nossa equipe já foi avisada para melhorar."}
              </p>
            ) : (
              <p className="text-[var(--storefront-muted-foreground)] mb-6">
                {info.highRatingMessage || "Ficamos muito felizes que você gostou! Sua avaliação é muito importante para nós."}
              </p>
            )}

            {rating >= 4 && (info.googleReviewUrl || info.facebookUrl || info.instagramUrl) && (
              <div className="mt-8 space-y-4">
                <div className="text-sm font-medium text-[var(--storefront-muted-foreground)] uppercase tracking-widest mb-4 border-b border-[var(--storefront-border)] pb-2">
                  Ajude mais pessoas a nos encontrarem
                </div>
                
                {info.googleReviewUrl && (
                  <button
                    onClick={() => handleLinkClick('google', info.googleReviewUrl!)}
                    className="w-full border-2 border-[var(--storefront-border)] hover:border-[var(--storefront-primary)] bg-[var(--storefront-card)] text-[var(--storefront-foreground)] font-semibold rounded-xl py-3 px-4 flex items-center justify-between transition-colors group"
                  >
                    <span>Avaliar no Google</span>
                    <ExternalLink className="w-4 h-4 text-[var(--storefront-muted-foreground)] group-hover:text-[var(--storefront-foreground)]" />
                  </button>
                )}
                
                {info.instagramUrl && (
                  <button
                    onClick={() => handleLinkClick('instagram', info.instagramUrl!)}
                    className="w-full border-2 border-[var(--storefront-border)] hover:border-[var(--storefront-primary)] bg-[var(--storefront-card)] text-[var(--storefront-foreground)] font-semibold rounded-xl py-3 px-4 flex items-center justify-between transition-colors group"
                  >
                    <span>Seguir no Instagram</span>
                    <ExternalLink className="w-4 h-4 text-[var(--storefront-muted-foreground)] group-hover:text-[var(--storefront-foreground)]" />
                  </button>
                )}

                {info.facebookUrl && (
                  <button
                    onClick={() => handleLinkClick('facebook', info.facebookUrl!)}
                    className="w-full border-2 border-[var(--storefront-border)] hover:border-[var(--storefront-primary)] bg-[var(--storefront-card)] text-[var(--storefront-foreground)] font-semibold rounded-xl py-3 px-4 flex items-center justify-between transition-colors group"
                  >
                    <span>Seguir no Facebook</span>
                    <ExternalLink className="w-4 h-4 text-[var(--storefront-muted-foreground)] group-hover:text-[var(--storefront-foreground)]" />
                  </button>
                )}
              </div>
            )}
            
            <button
              onClick={() => navigate(`/${tenantSlug}`)}
              className="mt-8 text-[var(--storefront-primary)] font-medium hover:underline"
            >
              Voltar para o cardápio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
