# Web Delivery — App do Entregador (PWA)

> ⚠️ **Status: Em Desenvolvimento** — Este app é um protótipo e ainda não está funcional para produção.

## Escopo Planejado

- Autenticação do entregador (login com telefone)
- Recebimento de pedidos para entrega (push notifications)
- Tracking GPS em tempo real com envio periódico para o backend
- Visualização do endereço de entrega e rota
- Confirmação de entrega
- Histórico de entregas realizadas
- Dashboard com métricas do dia

## Pré-requisitos para Go-Live

1. **PWA Manifest** — Configurar `manifest.json` e service worker para instalação
2. **Autenticação** — Implementar fluxo de login do entregador (endpoint `POST /auth/driver/login` a ser criado)
3. **API Integration** — Usar `VITE_API_URL` em vez de URL hardcoded
4. **Push Notifications** — Configruar Firebase Cloud Messaging ou similar
5. **Offline Support** — Service worker para cache de dados essenciais

## Stack

- React + Vite + TypeScript
- TailwindCSS
- PWA instalável com manifest, ícones PNG/maskable, service worker, shell offline e atualização solicitada ao usuário

### Validação PWA local

Após gerar o build e servi-lo em `127.0.0.1:4175`, execute:

```bash
PWA_SMOKE_BASE_URL=http://127.0.0.1:4175 pnpm test:pwa-browser
```

O smoke abre Chromium real, valida os campos do manifest, o MIME e as dimensões declaradas de todos os ícones, espera o controle pelo service worker e recarrega a tela de login com a rede desativada.
- Geolocation API

## Android foreground foundation

O projeto Android dedicado fica em `apps/web-delivery/android` e usa a identidade
`com.pedehub.driver` / `PedeHub Entregador`. Ele não reutiliza o projeto, package
ou applicationId de outro frontend.

- Geolocalização: plugin nativo enquanto o app está em uso, com fallback para
  `navigator.geolocation` no navegador/PWA. Não há permissão, serviço ou plugin
  de localização em background.
- Notificações locais: permissão solicitada por ação humana e canal Android
  `driver-deliveries-v1` para assignments recebidos pelo app aberto.
- Push nativo: o wiring está presente, mas permanece explicitamente
  `not_configured` enquanto FCM, `google-services.json`, token de dispositivo e
  contrato backend não forem entregues. O Web Push da PWA continua independente.
- Safe areas: CSS `env(safe-area-inset-*)`, ajuste Android edge-to-edge e
  `adjustResize` para teclado.

Para sincronizar e gerar o APK debug, configure URLs HTTPS reais no build:

```powershell
$env:VITE_API_URL='https://api.exemplo.com/api/v1'
$env:VITE_WS_URL='https://api.exemplo.com/delivery'
pnpm --filter @gestor/web-delivery build
pnpm --filter @gestor/web-delivery cap:sync
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
apps\web-delivery\android\gradlew.bat assembleDebug
```

O artefato local fica em
`apps/web-delivery/android/app/build/outputs/apk/debug/app-debug.apk`; ele não
deve ser publicado nem assinado para release nesta etapa.
