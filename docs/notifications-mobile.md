# Notificações mobile, lifecycle e áudio

## Fontes canônicas

- Lifecycle: `document.visibilityState` e `visibilitychange`. Os plugins
  `@capacitor/app` e `@capacitor/network` não fazem parte do `web-tenant`;
  portanto, não devem ser importados ou adicionados sem uma PR de dependência.
- Rede: eventos `online`/`offline` são sinais iniciais, nunca prova única.
- Serviço/socket: o namespace de pedidos usa reconexão silenciosa e consulta
  `GET /health/ready/websocket` após grace period.
- Permissão Android: `@capacitor/local-notifications` 7.0.6.
- Permissão web: Notification API somente após clique explícito.

## Máquina de estados

O painel distingue:

- `background_suspended`;
- `foreground_online_connected`;
- `foreground_online_reconnecting`;
- `foreground_offline`;
- `foreground_service_unavailable`.

`socket.disconnect` não significa internet offline. Ao ocultar/pausar, timers
visuais são cancelados, o banner de conexão é removido e nenhum som, toast ou
notificação de sistema é criado. Ao voltar, o socket reconecta silenciosamente.
Offline real usa debounce de 1,2 s; socket/serviço usa grace period de 5 s.

Conectividade é sempre silenciosa. Som, vibração e canal Android pertencem
somente a eventos operacionais que exigem atenção, como novo pedido.

## Preferência, onboarding e permissões

A preferência sonora e o volume usam storage local durável e versionado,
isolado por `tenantId:userId`. Chaves legadas são migradas uma vez. A confirmação
de ativação persiste após restart; quando necessário, o AudioContext é retomado
silenciosamente no próximo gesto do usuário.

O onboarding de permissão é não bloqueante e versionado por tenant/usuário.
No web, o prompt nunca abre em `useEffect`. No Android, o plugin é consultado e
solicitado somente pela ação do usuário; `denied` não entra em loop automático.
O `POST_NOTIFICATIONS` para Android 13+ é declarado pelo manifest do próprio
plugin.

## Som de novo pedido

- Web foreground: padrão Web Audio original com aproximadamente 1,2 s e volume
  efetivo configurável até 1.0.
- Android: `new-orders-v2`, importance 5, vibração moderada e
  `res/raw/new_order_chime.wav`.
- WAV: gerado por `scripts/generate-new-order-chime.mjs`, composição original
  do projeto, PCM mono 44,1 kHz, 1,48 s, pico normalizado em 0,86, sem clipping.
- O canal `orders` anterior não é apagado; Android preserva escolhas do usuário.

O volume percebido e a entrega da notificação exigem validação em dispositivo
real. Alterar um arquivo não muda canais Android já criados, por isso o ID é
versionado.

## Identidade Android

- Nome: `PedeHub Lojista`, configurado em `capacitor.config.ts` e em
  `res/values/strings.xml`.
- Fonte visual: `apps/web-tenant/public/favicon.svg`, o asset oficial do
  web-tenant. `scripts/generate-android-branding-assets.mjs` gera launcher,
  round/adaptive icon e splash em todas as densidades Android.
- Small icon de notificação: `drawable/ic_stat_pedehub.xml`, monocromático;
  ele não reutiliza o launcher colorido. O tint segue o verde oficial `#22c55e`.

## Limite de background

Não existe Push Notifications/FCM/APNs no `web-tenant`. Local Notifications são
agendadas somente quando o WebView recebe o evento. Portanto, o produto não pode
prometer novos pedidos com tela desligada ou WebView suspenso. Push nativo
confiável requer PR separada, backend, token de dispositivo e FCM/APNs.

## Validação

Execute:

```bash
pnpm --filter @gestor/web-tenant lint
pnpm --filter @gestor/web-tenant build
pnpm dlx vitest@2.1.9 run --environment node --globals --passWithNoTests
pnpm exec ts-node --transpile-only scripts/notification-mobile-visual-e2e.ts
npx cap sync android
```

Para build Android, configure JDK/`JAVA_HOME` e execute
`apps/web-tenant/android/gradlew.bat assembleDebug`. Validação final exige
emulador/dispositivo para pause/resume, lock, rede, permissão, som e safe area.
