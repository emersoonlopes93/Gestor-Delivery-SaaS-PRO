import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Link2,
  Loader2,
  PackageSearch,
  RefreshCw,
  Store,
  Unplug,
  X,
} from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import {
  useConnectMarketplaceManual,
  useDisconnectMarketplace,
  useMarketplaceCatalogMappingCandidates,
  useMarketplaceConnections,
  useMarketplaceEvents,
  useMarketplaceOrders,
  useMarketplaceStatus,
  useReconnectMarketplace,
  useReprocessMarketplaceEvent,
  useReprocessMarketplaceOrder,
  useStartFood99SelfServiceAuthorization,
  useUpsertMarketplaceCatalogMapping,
  useVerifyFood99SelfServiceAuthorization,
} from "../marketplace/hooks";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTenantCapabilities } from "../../hooks/useTenantCapabilities";
import { api } from "../../lib/api-client";

type Provider = "ifood" | "99food";
type Overlay =
  | "connect"
  | "food99connect"
  | "stores"
  | "products"
  | "activity"
  | "manage99food"
  | null;
type Food99Section =
  | "Visão geral"
  | "Pedidos"
  | "Financeiro"
  | "Logística"
  | "Diagnóstico";
type ManualConnectForm = {
  externalMerchantId: string;
  externalStoreId: string;
  displayName: string;
};
type ProductOption = { id: string; name: string; sku?: string | null };
const providerName = (provider: Provider) =>
  provider === "ifood" ? "iFood" : "99Food";
let overlayDepth = 0;

function connectionState(status?: string | null) {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "CONNECTED" || normalized === "PROCESSED")
    return { label: "Conectada", variant: "success" as const };
  if (normalized.includes("TOKEN_EXPIRED"))
    return { label: "Precisa de atenção", variant: "warning" as const };
  if (normalized.includes("PAUSED"))
    return { label: "Pausada", variant: "warning" as const };
  if (
    normalized.includes("FAILED") ||
    normalized.includes("ERROR") ||
    normalized.includes("DISCONNECTED")
  )
    return { label: "Não conectada", variant: "destructive" as const };
  return {
    label: normalized.includes("PROCESS") ? "Em andamento" : "Não conectada",
    variant: "info" as const,
  };
}

function OverlayShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    overlayDepth += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === dialogRef.current ||
          document.activeElement === first)
      ) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      overlayDepth -= 1;
      if (overlayDepth === 0) document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);
  const dismiss = () => closeRef.current();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-foreground/35 p-0 sm:items-center sm:justify-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card shadow-2xl outline-none sm:max-w-2xl sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4 sm:px-6">
          <h2
            id={titleId}
            className="min-w-0 text-lg font-black text-foreground"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useTenantCapabilities();
  const canManageIfood = isFeatureEnabled("ifood_marketplace");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [showSupportDetails, setShowSupportDetails] = useState(false);
  const [food99Section, setFood99Section] =
    useState<Food99Section>("Visão geral");
  const [manualProvider, setManualProvider] = useState<Provider>("ifood");
  const [manualForm, setManualForm] = useState<ManualConnectForm>({
    externalMerchantId: "",
    externalStoreId: "",
    displayName: "iFood",
  });
  const [food99ConnectionId, setFood99ConnectionId] = useState<
    string | undefined
  >();
  const [food99AuthorizationStarted, setFood99AuthorizationStarted] =
    useState(false);
  const [showFood99ManualFallback, setShowFood99ManualFallback] =
    useState(false);
  const [catalogMappingForm, setCatalogMappingForm] = useState({
    connectionId: "",
    externalItemId: "",
    externalItemName: "",
    externalReferenceId: "",
    productId: "",
  });
  const {
    data: status,
    isLoading: loadingStatus,
    refetch: refetchStatus,
  } = useMarketplaceStatus("ifood", canManageIfood);
  const {
    data: connections,
    isLoading: loadingConnections,
    isError: connectionsError,
    error: connectionsErrorObj,
    refetch: refetchConnections,
  } = useMarketplaceConnections();
  const {
    data: orders = [],
    isLoading: loadingOrders,
    isError: ordersError,
    error: ordersErrorObj,
    refetch: refetchOrders,
  } = useMarketplaceOrders();
  const {
    data: events = [],
    isError: eventsError,
    error: eventsErrorObj,
    refetch: refetchEvents,
  } = useMarketplaceEvents();
  const {
    data: catalogMappingCandidates = [],
    isLoading: loadingCatalogMappingCandidates,
  } = useMarketplaceCatalogMappingCandidates();
  const { data: catalogProducts = [] } = useQuery({
    queryKey: ["marketplace-catalog-products"],
    queryFn: async () =>
      (await api.get<ProductOption[]>("/catalog/products")).data ?? [],
  });
  const connectIfood = useConnectMarketplaceManual("ifood");
  const connectFood99 = useConnectMarketplaceManual("99food");
  const disconnect = useDisconnectMarketplace();
  const reconnect = useReconnectMarketplace();
  const reprocessEvent = useReprocessMarketplaceEvent();
  const reprocessOrder = useReprocessMarketplaceOrder();
  const startFood99Authorization = useStartFood99SelfServiceAuthorization();
  const verifyFood99Authorization = useVerifyFood99SelfServiceAuthorization();
  const saveProductAssociation = useUpsertMarketplaceCatalogMapping();
  const visibleConnections = useMemo(
    () =>
      (connections ?? []).filter(
        (item) => canManageIfood || item.provider !== "ifood",
      ),
    [connections, canManageIfood],
  );
  const visibleEvents = useMemo(
    () => events.filter((item) => canManageIfood || item.provider !== "ifood"),
    [events, canManageIfood],
  );
  const visibleOrders = useMemo(
    () => orders.filter((item) => canManageIfood || item.provider !== "ifood"),
    [orders, canManageIfood],
  );
  const firstConnection = (provider: Provider) =>
    provider === "ifood"
      ? (status ??
        visibleConnections.find((item) => item.provider === provider))
      : visibleConnections.find((item) => item.provider === provider);
  const refresh = () =>
    Promise.all([
      ...(canManageIfood ? [refetchStatus()] : []),
      refetchConnections(),
      refetchOrders(),
      refetchEvents(),
    ]);
  const openConnect = (provider: Provider, connectionId?: string) => {
    setManualProvider(provider);
    setManualForm({
      externalMerchantId: "",
      externalStoreId: "",
      displayName: providerName(provider),
    });
    setFood99ConnectionId(connectionId);
    setFood99AuthorizationStarted(false);
    setShowFood99ManualFallback(false);
    setOverlay(provider === "99food" ? "food99connect" : "connect");
  };
  const handleStartFood99Authorization = async () => {
    try {
      const result = await startFood99Authorization.mutateAsync({
        connectionId: food99ConnectionId,
      });
      setFood99ConnectionId(result.connection.id);
      setFood99AuthorizationStarted(true);
      window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(
        "Não foi possível abrir a autorização agora. Tente novamente.",
      );
    }
  };
  const handleVerifyFood99Authorization = async () => {
    if (!food99ConnectionId) return;
    try {
      const result = await verifyFood99Authorization.mutateAsync({
        connectionId: food99ConnectionId,
      });
      if (!result.authorized) {
        toast.error(
          "A autorização ainda não foi confirmada. Volte à 99Food e tente verificar novamente.",
        );
        return;
      }
      toast.success("99Food conectada.");
      setOverlay(null);
      await refresh();
    } catch {
      toast.error(
        "Ainda não conseguimos confirmar a autorização. Tente novamente em instantes.",
      );
    }
  };
  const handleManualConnect = async () => {
    if (
      !manualForm.externalMerchantId.trim() ||
      !manualForm.externalStoreId.trim()
    ) {
      toast.error("Informe os dados da loja para continuar.");
      return;
    }
    try {
      await (
        manualProvider === "99food" ? connectFood99 : connectIfood
      ).mutateAsync({
        externalMerchantId: manualForm.externalMerchantId.trim(),
        externalStoreId: manualForm.externalStoreId.trim(),
        displayName:
          manualForm.displayName.trim() || providerName(manualProvider),
        authType:
          manualProvider === "99food" ? "oauth2_client_credentials" : "manual",
        settingsJson: {
          autoConfirmOrders: false,
          pollingFallbackEnabled: manualProvider === "99food",
          presenceMode: manualProvider === "99food" ? "POLLING" : "WEBHOOK",
          importAsStatus: "pending",
        },
      });
      toast.success(`${providerName(manualProvider)} conectada.`);
      setOverlay(null);
      await refresh();
      queryClient.invalidateQueries({
        queryKey: ["marketplace-billing-preview"],
      });
    } catch {
      toast.error("Não foi possível conectar a loja. Tente novamente.");
    }
  };
  const handleDisconnect = async (id: string) => {
    try {
      await disconnect.mutateAsync(id);
      toast.success("Loja desconectada.");
      await refresh();
    } catch {
      toast.error("Não foi possível desconectar. Tente novamente.");
    }
  };
  const handleReconnect = async (id: string) => {
    try {
      await reconnect.mutateAsync(id);
      toast.success("Conexão atualizada.");
      await refresh();
    } catch {
      toast.error("Não foi possível reconectar. Tente novamente.");
    }
  };
  const handleSaveAssociation = async () => {
    if (
      !catalogMappingForm.connectionId ||
      !catalogMappingForm.externalItemId ||
      !catalogMappingForm.productId
    ) {
      toast.error("Escolha o produto correspondente para continuar.");
      return;
    }
    try {
      await saveProductAssociation.mutateAsync({
        ...catalogMappingForm,
        externalItemId: catalogMappingForm.externalItemId.trim(),
        externalItemName:
          catalogMappingForm.externalItemName.trim() || undefined,
        externalReferenceId:
          catalogMappingForm.externalReferenceId.trim() || undefined,
      });
      toast.success("Produto associado para os próximos pedidos.");
      setCatalogMappingForm({
        connectionId: "",
        externalItemId: "",
        externalItemName: "",
        externalReferenceId: "",
        productId: "",
      });
    } catch {
      toast.error("Não foi possível salvar agora. Tente novamente.");
    }
  };
  const providerCard = (provider: Provider) => {
    const connection = firstConnection(provider);
    const state = connectionState(connection?.status);
    const canManage = Boolean(connection && state.variant === "success");
    const primaryLabel = !connection
      ? "Conectar loja"
      : canManage
        ? "Gerenciar"
        : reconnect.isPending
          ? "Tentando novamente..."
          : "Tentar novamente";
    const onPrimaryAction = () => {
      if (!connection) {
        openConnect(provider);
        return;
      }
      if (canManage) {
        setOverlay(provider === "99food" ? "manage99food" : "stores");
        return;
      }
      if (provider === "99food") {
        openConnect("99food", connection.id);
        return;
      }
      void handleReconnect(connection.id);
    };
    return (
      <Card
        key={provider}
        className="flex min-h-52 flex-col justify-between p-5 sm:p-6"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-lg font-black text-primary">
                {provider === "ifood" ? "iF" : "99"}
              </div>
              <div>
                <h2 className="text-lg font-black text-foreground">
                  {providerName(provider)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Receba pedidos nesta loja.
                </p>
              </div>
            </div>
            <Badge variant={state.variant} size="sm">
              {loadingStatus && provider === "ifood"
                ? "Verificando"
                : state.label}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {connection?.displayName
              ? state.variant === "success"
                ? `${connection.displayName} está pronta para receber pedidos.`
                : `${connection.displayName} precisa de atenção antes de receber pedidos.`
              : "Conecte sua loja em poucos passos."}
          </p>
        </div>
        <button
          type="button"
          disabled={reconnect.isPending && !canManage}
          onClick={onPrimaryAction}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
        >
          <Link2 className="h-4 w-4" />
          {primaryLabel}
        </button>
      </Card>
    );
  };
  const hasError = connectionsError || ordersError || eventsError;
  const food99Orders = visibleOrders.filter(
    (order) => order.provider === "99food",
  );
  const food99Events = visibleEvents.filter(
    (event) => event.provider === "99food",
  );
  const food99ConnectDialog =
    overlay === "food99connect" ? (
      <OverlayShell title="Conectar 99Food" onClose={() => setOverlay(null)}>
        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-foreground">
            <p className="font-bold">Receba os pedidos da 99Food aqui.</p>
            <p className="mt-1 text-muted-foreground">
              {food99ConnectionId
                ? "Vamos pedir uma nova autorização para esta loja. Você não precisa preencher códigos."
                : "Vamos abrir a 99Food para você autorizar esta conexão. Ao voltar, confirme que a autorização foi concluída."}
            </p>
          </div>
          <ol className="space-y-3" aria-label="Etapas da conexão com a 99Food">
            <li className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                1
              </span>
              <span>
                <strong className="block text-foreground">
                  Autorize na 99Food
                </strong>
                <span className="text-muted-foreground">
                  A autorização é feita no portal da 99Food.
                </span>
              </span>
            </li>
            <li className="flex gap-3 text-sm">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${food99AuthorizationStarted ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                2
              </span>
              <span>
                <strong className="block text-foreground">
                  Confirme a conexão
                </strong>
                <span className="text-muted-foreground">
                  Só mostramos a loja como conectada depois da confirmação.
                </span>
              </span>
            </li>
          </ol>
          {!food99AuthorizationStarted ? (
            <button
              type="button"
              onClick={() => void handleStartFood99Authorization()}
              disabled={startFood99Authorization.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
            >
              {startFood99Authorization.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {startFood99Authorization.isPending
                ? "Abrindo 99Food..."
                : "Autorizar na 99Food"}
            </button>
          ) : (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-bold text-foreground">
                    Aguardando autorização
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Conclua a autorização na página da 99Food e volte para
                    verificar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleVerifyFood99Authorization()}
                disabled={verifyFood99Authorization.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
              >
                {verifyFood99Authorization.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {verifyFood99Authorization.isPending
                  ? "Verificando autorização..."
                  : "Verificar autorização"}
              </button>
              <button
                type="button"
                onClick={() => setFood99AuthorizationStarted(false)}
                className="w-full text-sm font-bold text-primary hover:underline"
              >
                Abrir a 99Food novamente
              </button>
            </div>
          )}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              aria-expanded={showFood99ManualFallback}
              onClick={() => setShowFood99ManualFallback((current) => !current)}
              className="flex w-full items-center justify-between text-left text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Conexão manual para suporte{" "}
              <ChevronRight
                className={`h-4 w-4 transition-transform ${showFood99ManualFallback ? "rotate-90" : ""}`}
              />
            </button>
            {showFood99ManualFallback ? (
              <div className="mt-4 space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-sm leading-5 text-muted-foreground">
                  Use esta opção somente com a orientação do suporte.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-bold text-foreground">
                    <span>Código da empresa</span>
                    <input
                      className="input-premium"
                      value={manualForm.externalMerchantId}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          externalMerchantId: event.target.value,
                        }))
                      }
                      placeholder="Informe o código"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-bold text-foreground">
                    <span>Código da loja</span>
                    <input
                      className="input-premium"
                      value={manualForm.externalStoreId}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          externalStoreId: event.target.value,
                        }))
                      }
                      placeholder="Informe o código da loja"
                    />
                  </label>
                </div>
                <label className="block space-y-1.5 text-sm font-bold text-foreground">
                  <span>Como você quer chamar esta loja?</span>
                  <input
                    className="input-premium"
                    value={manualForm.displayName}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    placeholder="99Food"
                  />
                </label>
                <button
                  type="button"
                  disabled={
                    !manualForm.externalMerchantId.trim() ||
                    !manualForm.externalStoreId.trim() ||
                    connectFood99.isPending
                  }
                  onClick={handleManualConnect}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-black text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connectFood99.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Conectar com ajuda do suporte
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </OverlayShell>
    ) : null;
  const manageFood99Dialog =
    overlay === "manage99food" ? (
      <OverlayShell title="Gerenciar 99Food" onClose={() => setOverlay(null)}>
        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Resumo agregado das suas conexões 99Food. Pedidos, repasses e
            logística são acompanhados separadamente.
          </p>
          <div
            className="flex gap-1 overflow-x-auto border-b border-border"
            role="tablist"
            aria-label="Seções das conexões 99Food"
          >
            {(
              [
                "Visão geral",
                "Pedidos",
                "Financeiro",
                "Logística",
                "Diagnóstico",
              ] as Food99Section[]
            ).map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={food99Section === section}
                onClick={() => setFood99Section(section)}
                className={`shrink-0 border-b-2 px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${food99Section === section ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {section}
              </button>
            ))}
          </div>
          {food99Section === "Visão geral" ? (
            <section className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Suas conexões 99Food
              </p>
              <p className="mt-1 font-bold text-foreground">
                {
                  visibleConnections.filter(
                    (connection) => connection.provider === "99food",
                  ).length
                }{" "}
                conexão(ões) disponível(is)
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                O resumo não confirma por si só pedidos, repasses ou entrega.
              </p>
            </section>
          ) : null}
          {food99Section === "Pedidos" ? (
            <section className="rounded-xl border border-border p-4">
              <p className="font-bold text-foreground">Pedidos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {food99Orders.length
                  ? `${food99Orders.length} pedido(s) recebido(s) recentemente nas suas conexões.`
                  : "Nenhum pedido 99Food confirmado para exibir agora."}
              </p>
            </section>
          ) : null}
          {food99Section === "Financeiro" ? (
            <section className="rounded-xl border border-border p-4">
              <p className="font-bold text-foreground">Financeiro</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Consultar dados não altera o saldo. Um repasse só é registrado
                após sua confirmação no Financeiro.
              </p>
              <Link
                to="/management/finance"
                className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Abrir Financeiro
              </Link>
            </section>
          ) : null}
          {food99Section === "Logística" ? (
            <section className="rounded-xl border border-border p-4">
              <p className="font-bold text-foreground">Logística</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Status, entregador e previsão aparecem no pedido apenas quando a
                99Food confirmar esses dados. Não mostramos localização
                estimada.
              </p>
            </section>
          ) : null}
          {food99Section === "Diagnóstico" ? (
            <section className="rounded-xl border border-border p-4">
              <p className="font-bold text-foreground">Diagnóstico</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Última atividade nas suas conexões:{" "}
                {food99Events[0]?.receivedAt
                  ? new Date(food99Events[0].receivedAt).toLocaleString("pt-BR")
                  : "sem atividade confirmada"}
                .
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {food99Events.some((event) => event.status === "FAILED")
                  ? "Há uma atualização que precisa de atenção. Use Atividade e ajuda para tentar novamente."
                  : "Nenhum problema confirmado nas atividades exibidas."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setOverlay("activity");
                  setShowSupportDetails(true);
                }}
                className="mt-3 text-sm font-bold text-primary hover:underline"
              >
                Ver detalhes para suporte
              </button>
            </section>
          ) : null}
        </div>
      </OverlayShell>
    ) : null;
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Canais de venda"
        description="Conecte suas lojas para receber os pedidos em um só lugar."
        icon={Store}
        action={
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />
      {hasError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-bold">
              Não foi possível atualizar algumas informações.
            </p>
            <button
              type="button"
              onClick={() => {
                setOverlay("activity");
                setShowSupportDetails(true);
              }}
              className="mt-1 font-bold text-primary hover:underline"
            >
              Ver informações para suporte
            </button>
          </div>
        </div>
      ) : null}
      <section
        aria-label="Canais disponíveis"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {providerCard("99food")}
        {canManageIfood ? providerCard("ifood") : null}
      </section>
      <section aria-label="Mais opções" className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setOverlay("stores")}
          className="group flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/40"
        >
          <span>
            <span className="block font-bold text-foreground">
              Lojas conectadas
            </span>
            <span className="text-sm text-muted-foreground">
              Veja e ajuste suas conexões
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
        </button>
        <button
          type="button"
          onClick={() => setOverlay("products")}
          className="group flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-left hover:border-amber-500/50"
        >
          <span>
            <span className="block font-bold text-foreground">
              Produtos que precisam de atenção
            </span>
            <span className="text-sm text-muted-foreground">
              {catalogMappingCandidates.length
                ? `${catalogMappingCandidates.length} item(ns) para revisar`
                : "Tudo certo por enquanto"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-amber-600" />
        </button>
        <button
          type="button"
          onClick={() => setOverlay("activity")}
          className="group flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/40"
        >
          <span>
            <span className="block font-bold text-foreground">
              Atividade e ajuda
            </span>
            <span className="text-sm text-muted-foreground">
              Acompanhe os últimos pedidos
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
        </button>
      </section>
      {overlay === "connect" ? (
        <OverlayShell title="Conectar iFood" onClose={() => setOverlay(null)}>
          <div className="space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">
              Informe os dados da sua loja iFood para concluir a conexão.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-bold text-foreground">
                <span>Código da empresa</span>
                <input
                  className="input-premium"
                  value={manualForm.externalMerchantId}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      externalMerchantId: event.target.value,
                    }))
                  }
                  placeholder="Informe o código"
                />
              </label>
              <label className="space-y-1.5 text-sm font-bold text-foreground">
                <span>Código da loja</span>
                <input
                  className="input-premium"
                  value={manualForm.externalStoreId}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      externalStoreId: event.target.value,
                    }))
                  }
                  placeholder="Informe o código da loja"
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-bold text-foreground">
              <span>Como você quer chamar esta loja?</span>
              <input
                className="input-premium"
                value={manualForm.displayName}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                placeholder="iFood"
              />
            </label>
            <button
              type="button"
              disabled={
                !manualForm.externalMerchantId.trim() ||
                !manualForm.externalStoreId.trim() ||
                connectIfood.isPending
              }
              onClick={handleManualConnect}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectIfood.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Conectar loja
            </button>
          </div>
        </OverlayShell>
      ) : null}
      {overlay === "stores" ? (
        <OverlayShell title="Lojas conectadas" onClose={() => setOverlay(null)}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="font-bold text-foreground">Adicionar outra loja</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cada canal pode ter mais de uma loja conectada.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openConnect("99food")}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Adicionar 99Food
                </button>
                {canManageIfood ? (
                  <button
                    type="button"
                    onClick={() => openConnect("ifood")}
                    className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Adicionar iFood
                  </button>
                ) : null}
              </div>
            </div>
            {loadingConnections ? (
              <p className="text-sm text-muted-foreground">
                Carregando lojas...
              </p>
            ) : visibleConnections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Você ainda não conectou nenhuma loja.
              </p>
            ) : (
              visibleConnections.map((connection) => {
                const state = connectionState(connection.status);
                return (
                  <article
                    key={connection.id}
                    className="rounded-2xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-foreground">
                          {connection.displayName || connection.provider}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {providerName(connection.provider as Provider)}
                        </p>
                      </div>
                      <Badge variant={state.variant} size="sm">
                        {state.label}
                      </Badge>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      {state.variant === "success" ? (
                        <button
                          type="button"
                          onClick={() => handleDisconnect(connection.id)}
                          disabled={disconnect.isPending}
                          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Unplug className="h-4 w-4" />
                          Desconectar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReconnect(connection.id)}
                          disabled={reconnect.isPending}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Tentar novamente
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </OverlayShell>
      ) : null}
      {overlay === "products" ? (
        <OverlayShell
          title="Produtos que precisam de atenção"
          onClose={() => setOverlay(null)}
        >
          <div className="space-y-4">
            {loadingCatalogMappingCandidates ? (
              <p className="text-sm text-muted-foreground">
                Carregando produtos...
              </p>
            ) : catalogMappingCandidates.length === 0 ? (
              <div className="rounded-2xl bg-emerald-500/10 p-5 text-sm text-foreground">
                <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-600" />
                <p className="font-bold">
                  Nenhum produto precisa da sua atenção.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Os próximos pedidos continuarão funcionando normalmente.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm leading-6 text-muted-foreground">
                  Quando não for possível reconhecer um item com segurança, o
                  pedido continua operável e pedimos sua ajuda antes de qualquer
                  ajuste.
                </p>
                {catalogMappingCandidates.map((candidate) => (
                  <button
                    key={`${candidate.connectionId}:${candidate.externalItemId}`}
                    type="button"
                    onClick={() =>
                      setCatalogMappingForm({
                        connectionId: candidate.connectionId,
                        externalItemId: candidate.externalItemId,
                        externalItemName: candidate.externalItemName ?? "",
                        externalReferenceId: "",
                        productId: "",
                      })
                    }
                    className={`w-full rounded-2xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-primary ${catalogMappingForm.connectionId === candidate.connectionId && catalogMappingForm.externalItemId === candidate.externalItemId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  >
                    <PackageSearch className="mb-2 h-5 w-5 text-amber-600" />
                    <p className="font-bold text-foreground">
                      Este item corresponde a qual produto do seu cardápio?
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {candidate.externalItemName || "Item sem nome informado"}
                    </p>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      {providerName(candidate.provider as Provider)} ·{" "}
                      {candidate.connection.displayName || "Sua loja"}
                    </p>
                  </button>
                ))}
                {catalogMappingForm.connectionId ? (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <label className="block text-sm font-bold text-foreground">
                      Produto do cardápio
                      <select
                        className="input-premium mt-2"
                        value={catalogMappingForm.productId}
                        onChange={(event) =>
                          setCatalogMappingForm((current) => ({
                            ...current,
                            productId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Escolha um produto</option>
                        {catalogProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                            {product.sku ? ` (${product.sku})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={handleSaveAssociation}
                      disabled={saveProductAssociation.isPending}
                      className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-50"
                    >
                      {saveProductAssociation.isPending
                        ? "Salvando..."
                        : "Confirmar produto"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </OverlayShell>
      ) : null}
      {overlay === "activity" ? (
        <OverlayShell
          title="Atividade e ajuda"
          onClose={() => setOverlay(null)}
        >
          <div className="space-y-5">
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Pedidos recentes</h3>
              </div>
              {loadingOrders ? (
                <p className="text-sm text-muted-foreground">
                  Carregando pedidos...
                </p>
              ) : visibleOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum pedido recebido ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {visibleOrders.slice(0, 6).map((order) => (
                    <article
                      key={order.id}
                      className="rounded-xl border border-border p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-foreground">
                            Pedido{" "}
                            {order.externalDisplayId ||
                              order.externalOrderId ||
                              "recebido"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleString(
                                  "pt-BR",
                                  {
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )
                              : "Recebido recentemente"}{" "}
                            · {providerName(order.provider as Provider)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            order.internalOrderId ? "success" : "warning"
                          }
                          size="sm"
                        >
                          {order.internalOrderId ? "Processado" : "Pendente"}
                        </Badge>
                      </div>
                      {!order.internalOrderId ? (
                        <button
                          type="button"
                          onClick={() => reprocessOrder.mutate(order.id)}
                          disabled={reprocessOrder.isPending}
                          className="mt-3 text-xs font-bold text-primary hover:underline disabled:opacity-50"
                        >
                          Tentar novamente este pedido
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="border-t border-border pt-5">
              <div className="mb-3 flex items-center gap-2">
                <CircleHelp className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Ajuda</h3>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Se algo não funcionar como esperado, tente atualizar a conexão.
                Nossa equipe de suporte pode usar os detalhes abaixo para
                ajudar.
              </p>
              <button
                type="button"
                onClick={() => setShowSupportDetails((value) => !value)}
                className="mt-3 text-sm font-bold text-primary hover:underline"
              >
                Ver informações para suporte
              </button>
              {showSupportDetails ? (
                <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                  <p>
                    {visibleEvents.length} atividade(s) recente(s)
                    disponível(is).
                  </p>
                  {visibleEvents
                    .filter((event) => event.status === "FAILED")
                    .slice(0, 3)
                    .map((event) => (
                      <div key={event.id} className="rounded-lg bg-card p-2">
                        <p className="font-bold">
                          Não foi possível concluir uma atualização.
                        </p>
                        {event.lastError ? (
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {event.lastError}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => reprocessEvent.mutate(event.id)}
                          className="mt-2 text-xs font-bold text-primary"
                        >
                          Tentar novamente
                        </button>
                      </div>
                    ))}
                  {connectionsErrorObj || ordersErrorObj || eventsErrorObj ? (
                    <p className="break-words text-xs text-muted-foreground">
                      {(connectionsErrorObj as Error | undefined)?.message ||
                        (ordersErrorObj as Error | undefined)?.message ||
                        (eventsErrorObj as Error | undefined)?.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </OverlayShell>
      ) : null}
      {food99ConnectDialog}
      {manageFood99Dialog}
    </div>
  );
}
