## R3 — login do entregador sem slug visível

Data: 2026-08-01

- Branch `feat/go-live-r3-driver-login-no-slug`, criada em worktree isolada no
  merge da PR #39 em `origin/main-copy` (`c386a13d`). Checkout principal,
  worktrees anteriores e `stash@{0}` permanecem preservados.
- A auditoria prévia está em `docs/audits/r3-driver-login-no-slug-audit.md`.
  O modelo permite o mesmo telefone em vários tenants e não possui identidade
  global compartilhada; por isso foi adotado o fluxo B, sem migration.
- O login agora recebe telefone + PIN. Um único vínculo autenticado cria a
  sessão tenant-bound existente; múltiplos vínculos autenticados recebem um
  seletor pós-auth limitado por capability JWT de cinco minutos. Nenhum
  `tenantId` arbitrário é aceito e o `tenantSlug` ficou apenas como entrada
  opcional compatível para clientes antigos.
- Falhas pré-auth retornam a mesma mensagem e os logs não registram telefone,
  slug ou token. O rate limit do login e da seleção é 5 por 60 segundos usando
  o `ThrottlerGuard` já existente.
- O guard do entregador valida JWT, `AuthSession`, subject, tenant, expiração,
  driver ativo e tenant ativo/trial. Refresh rotation e logout continuam no
  mecanismo canônico. O WebSocket do entregador envia o access token no
  handshake e deriva `driverId`/`tenantId` dos claims verificados.
- Gates locais: install frozen, lint, typecheck, `check:no-any`,
  `check:features`, build API, build web-delivery e `git diff --check` PASS.
  Testes focados: 5 suites/19 testes API PASS e 1 suite/1 teste frontend PASS.
- Prisma/schema, migrations, seed, dependências, lockfile, provider, secrets,
  E0-OPS, banco remoto, produção e deploy não foram alterados.
- Recuperação do proof da PR #40: o run `30693717516` perdeu o diagnóstico
  quando a API encerrou antes do health check porque consultava somente
  containers em execução (`docker compose ps -q api`) e abortava antes do
  bloco sanitizado. O workflow agora captura o container criado com `ps -aq`,
  preserva o ID após saída e limita `docker inspect` aos campos seguros de
  estado, exit code, OOM, erro e timestamps. A próxima execução instrumentada
  continua sendo o gate; a PR permanece Draft e sem deploy.

---

## R2.5 — vitrine inteligente configurável

Data: 2026-08-01

- Branch `feat/go-live-r2-5-smart-storefront-showcase`, criada em worktree isolada
  no merge da R2 em `origin/main-copy` (`8d7acb4a`). Checkout principal,
  worktrees R0/R1/R2/E0 e `stash@{0}` permanecem preservados.
- A auditoria obrigatória anterior à implementação está em
  `docs/audits/r2-5-smart-storefront-showcase-audit.md`. A decisão foi `YES`:
  o JSON `TenantSettings.storefrontLayoutJson`, o payload público, o filtro
  canônico de disponibilidade, o ranking BI e o cache existentes são suficientes.
- O layout normalizado agora possui uma vitrine opcional com título, modo manual,
  automático ou híbrido, máximo entre 1 e 12 e IDs manuais ordenados/deduplicados.
  Configurações antigas e presets recebem a vitrine desligada por padrão.
- O backend valida que todos os IDs configurados pertencem ao tenant autenticado.
  A seleção ocorre apenas sobre produtos já ativos, publicáveis e disponíveis no
  canal pelo `AvailabilityService`; lista vazia omite o bloco.
- `BEST_SELLING` reutiliza a soma de quantidades de pedidos `completed`, tenant-scoped,
  na janela existente de 30 dias, com desempate determinístico. `PROMOTIONS`
  reutiliza o badge canônico. `MOST_ORDERED` e `COMBOS` não são anunciados porque
  os contratos existentes não sustentam essas semânticas sem agregação ou renderer novo.
- Manual vence automático no modo híbrido; duplicados e IDs inelegíveis são removidos,
  e menos itens que o máximo é aceito sem preenchimento aleatório.
- O storefront renderiza uma faixa mobile-first com overflow/scroll-snap no topo do
  menu e reutiliza `ProductRenderer` e o fluxo atual de seleção/modal. A navegação
  horizontal existente continua usando `CategoryNavigation` e categorias canônicas.
- O painel configura a vitrine no local já existente de personalização e mostra a
  seleção manual no preview existente. Ranking automático completo no preview e
  convergência de renderers permanecem no escopo futuro da R5.
- O payload público continua no cache `storefront:<slug>:<fulfillmentType>`; o PATCH
  existente já invalida delivery/pickup. Não há N+1, chamada por card ou cache novo.
- Testes focados: backend 3 suites/7 testes e storefront 1 suite/2 testes, todos PASS.
  Builds de theme, types, API, web-storefront e web-tenant passaram. O Prisma Client
  foi apenas regenerado localmente para refletir o schema já existente.
- Nenhum Prisma/schema, migration, seed, provider, credencial, dependência, lockfile,
  feature flag, E0-OPS, banco remoto, deploy ou produção foi alterado.

---

## R2 - checkout guided steps and progressive address

Data: 2026-08-01

- Branch `feat/go-live-r2-checkout-steps-address`, criada em worktree isolada a
  partir do merge da R1 em `origin/main-copy` (`23b67f68`). Checkout principal,
  worktrees R0/R1/E0 e `stash@{0}` permanecem preservados.
- O checkout do storefront foi dividido em etapas móveis e progressivas para
  identificação, recebimento, endereço quando aplicável, pagamento e revisão.
  Voltar preserva o estado existente; retirada pula endereço; a revisão reutiliza
  o resumo final da R1.
- Endereços salvos, autocomplete Google já configurado e consulta ViaCEP existente
  continuam sendo as únicas fontes automáticas. O fallback manual é explícito;
  número, complemento e referência permanecem sob controle do cliente.
- Respostas tardias de CEP são descartadas quando o CEP ou um campo material foi
  editado. Autofill não sobrescreve campos já editados e falha de busca revela o
  formulário manual sem apagar dados.
- Mudança material do endereço invalida imediatamente taxa/cobertura anteriores.
  O avanço exige nova validação autoritativa da API; erro mantém o formulário e
  permite correção.
- O guard síncrono, fingerprint e tentativa lógica da R1 não foram alterados.
  Navegação entre etapas mantém a mesma tentativa; retry ambíguo do mesmo payload
  continua reutilizando a chave, sem duplicar pedido.
- Nenhum contrato amplo de API, Prisma/schema, migration, seed, provider, SDK,
  dependência, lockfile, feature flag, E0-OPS, banco remoto ou deploy foi alterado.

---

## E0 — JWT secret containment

Data: 2026-07-31
Branch: `security/e0-jwt-secret-containment`

Atualização de estado E0:

- Tokens JWT antigos foram rejeitados após a rotação; nenhum valor foi registrado.
- O HEAD está sanitizado e o gate Gitleaks/CI da PR #35 está verde.
- O SHA que inclui o comando operacional ainda não foi redeployado. A
  revogação global de `AuthSession` e os smokes de nova sessão permanecem
  pendentes; `DB_PASSWORD` continua NÃO CONFIRMADO.
- E0 está MITIGADO: a pendência E0-OPS (redeploy, revogação e smokes) e E0H
  (purga coordenada do histórico) bloqueia o Go-Live definitivo, mas não a
  continuidade documental da R0.

- O HEAD deixa de rastrear `.env.docker`; o arquivo local fica ignorado e
  `.env.docker.example` contém somente placeholders não utilizáveis.
- A auditoria redigida confirmou material JWT concreto no arquivo rastreado e
  identificou `DB_PASSWORD` como credencial adicional a confirmar no runtime.
  Valores, hashes parciais e tamanhos não foram registrados.
- O gate `Secret scanning` usa Gitleaks com checkout completo, redaction e
  permissões `contents: read`. A varredura inclui PR, HEAD e histórico que o
  GitHub Actions disponibilizar.
- `AuthSession` possui revogação global idempotente por status ativo. O comando
  operacional exige `NODE_ENV=production` e
  `CONFIRM_GLOBAL_SESSION_REVOCATION=true`, retorna somente contagens e não
  roda no startup.
- A rotação no Dokploy, captura de tokens antigos, smoke e merge permanecem
  bloqueados até confirmar acesso, serviço correto, backup utilizável e fonte
  canônica de environment. E0H planejará a purga coordenada do histórico sem
  reescrevê-lo nesta sessão.

---

## Branding Android — nome, ícones e splash

Data: 2026-07-31

Branch: `fix/mobile-notification-lifecycle-safe-area`

- Fonte canônica: `apps/web-tenant/public/favicon.svg` e o nome móvel
  `PedeHub Lojista` já definido em `apps/web-tenant/capacitor.config.ts`.
  Os recursos template do Capacitor (`My App` e ícone/splash genéricos) foram
  substituídos por launcher, round/adaptive icon e splash derivados do SVG.
- `LocalNotifications` agora usa o vetor monocromático
  `drawable/ic_stat_pedehub.xml`, com tint `#22c55e`; o canal
  `new-orders-v2` e o chime não foram alterados.
- `pnpm --filter @gestor/web-tenant build`, lint, typecheck, `check:no-any`,
  `check:features`, 22 testes de notificações e `git diff --check` passaram.
  `cap sync android` e `clean assembleDebug --stacktrace` passaram usando
  JBR 21 do Android Studio. O APK foi inspecionado por `aapt2`: label
  `PedeHub Lojista`, applicationId preservado `com.getcapacitor.app`,
  MainActivity launchable, launcher/round/adaptive icon e small icon presentes.
- Não havia alvo em `adb devices` nem AVD local; instalação e confirmação visual
  no launcher/configurações/diálogo permanecem pendentes. PR segue Draft;
  não houve deploy, merge, migration, lockfile ou dependência nova.

---

## Notificações mobile — lifecycle, permissões, safe area e áudio

Data: 2026-07-30

Branch: `fix/mobile-notification-lifecycle-safe-area`

Base: `origin/main-copy` / `ca762a79`

- `socket.disconnect` deixou de significar internet offline. Background/hidden
  suspende avisos; offline real usa debounce de 1,2 s; socket/serviço usa grace
  period de 5 s e health check WebSocket.
- Conectividade é visual, deduplicada e silenciosa. Novo pedido mantém som,
  liderança multi-tab e dedupe por pedido.
- Preferência sonora ficou durável, versionada e isolada por tenant/usuário.
  O onboarding web/nativo ocorre por gesto, não repete `denied` automaticamente
  e possui fechamento acessível.
- Toasts possuem `aria-label="Fechar notificação"`, Escape, máximo de dois e
  pilha sem sobreposição. Banner inferior e toasts respeitam safe areas, header
  mobile e landscape.
- Novo chime Web Audio tem duração superior a 1 s. Android usa canal
  `new-orders-v2` e WAV original de 1,48 s, pico 0,86.
- Não existe push nativo/FCM; alertas com tela desligada não são prometidos e
  permanecem como PR separada.
- Gates: web-tenant lint, typecheck, build, 10 arquivos/46 testes,
  `check:no-any`, `check:features`, diff-check e E2E visual mobile passaram.
  `npx cap sync android` passou e confirmou Local Notifications 7.0.6.
- Pendente: `assembleDebug` e validação em dispositivo. O ambiente não possui
  Java/JDK (`JAVA_HOME` ausente; Gradle exit 9009).
- Nenhum Prisma, migration, analytics, billing, regra de pedido, dependência,
  lockfile, banco remoto ou deploy foi alterado.

---

## PR 2B - Performance API

Branch `feat/analytics-performance-api`, stacked on `feat/analytics-daily-rollups` at `a9d11ca7`.
Authenticated tenant-scoped routes under `/analytics/performance/*` expose overview,
funnel, products and partial UTM acquisition. Behavioral reads use daily rollups;
realized revenue and completed quantities use authoritative orders and order items.
Acquisition is deliberately `utm_tagged_only`: direct/unknown and channel revenue
are unavailable and must not be shown by UI. PR 3A owns direct/referrer,
first/last-touch and session-to-order attribution. No Prisma schema, migration,
rollup, worker, storefront, UI, provider or dependency change is part of this PR.

---

## Marco 2 — PR 2A agregação diária determinística de Analytics

Data: 2026-07-29

Branch: `feat/analytics-daily-rollups`

Base: `origin/main-copy` / `f4552d10`

- `AnalyticsDailyAggregate` usa chave lógica integralmente não nula por tenant,
  dia, evento, tipo e chave de dimensão. `overall` usa `__all__`; checks no
  PostgreSQL restringem taxonomia, dimensões, chave overall e métricas.
- O rollup lê `AnalyticsEvent` tenant-scoped em páginas, calcula overall,
  product, category e UTM, soma decimais sem ponto flutuante e substitui somente
  linhas alteradas dentro de transação serializável com advisory lock por
  tenant/dia. Replay idêntico não reescreve linhas.
- O bucket usa `TenantSettings.timezone` e Luxon. Timezone divergente de
  histórico já materializado falha fechada e exige migração explícita.
- A fila `analytics-rollup` processa `analytics.daily-rollup` com payload Zod,
  job ID determinístico compatível com BullMQ, 3 tentativas, backoff exponencial
  de 5 segundos e concorrência 2. Scheduler e worker ficam desativados por
  default; `NODE_ENV=test` não agenda.
- O scheduler recompõe 3 dias a cada 6 horas por default. Um slot determinístico
  no job ID impede duplicação entre boots/réplicas no mesmo período.
- O backfill exige tenant/from/to, limita 31 dias, rejeita produção/banco não
  efêmero e oferece `--dry-run`. A retenção é tenant-scoped, em chunks, sem
  scheduler e exige `ANALYTICS_RAW_RETENTION_ENABLED=true`.
- Migration PostgreSQL efêmera: exit 0. Provas focadas com PostgreSQL 16 e Redis
  7: 10 suítes / 42 testes, exit 0, cobrindo migration, unique/checks/FK/defaults,
  isolamento, dimensões/somas/sessões, determinismo, timezone/boundary, late
  events, concorrência, rollback, fila/jobId/retry, backfill e retenção.
- Backfill efêmero: dry-run exit 0 e 0 escritas; execução exit 0 e 1 agregado com
  `eventCount=1` / `valueSum=12.50`.
- Gates locais: types build, API lint, API build, typecheck, check:no-any,
  check:features e diff-check em exit 0. O comando regex literal
  `test -- analytics` colide com o nome absoluto desta worktree e seleciona
  testes alheios; o gate equivalente por `--runTestsByPath` executou somente os
  10 arquivos canônicos de Analytics e passou.
- Nenhum storefront, web-tenant, regra de pedidos, provider, dependência,
  lockfile, banco remoto, migration de produção, merge ou deploy foi alterado.

DEFERIDO PARA MARCO 2 FINAL: Playwright, screenshots, light/dark/mobile,
validação visual do dashboard, teste de carga amplo, p95 de produção,
comparação manual de todas as métricas e GA4/Meta/Ads.

Status: implementação e gates locais concluídos. Draft PR #30 publicada contra
`main-copy`; code head validado `bdb791ed`. CI do SHA final da documentação
ainda pendente neste ponto do handoff. Nenhum merge ou deploy realizado.

---

## Marco 1 — PR 1C eventos autoritativos de pedido (Draft publicada)

Data: 2026-07-29
Branch: `feat/order-analytics-authoritative`
Base: `feat/storefront-analytics-dispatcher` / `31de6fbf76505e08f9de0d969780f3c09d36cc4a`

- O backend origina `order_confirmed`, `order_completed` e `order_cancelled` no serviço central de transição e no caminho de confirmação de PDV.
- Cada evento é gravado na mesma transação do pedido, é `source: server`, tenant-scoped, sem dependência do browser e sem PII.
- O `eventId` é determinístico por `(tenantId, orderId, eventName)` e usa `skipDuplicates`, protegendo reprocessamentos sem duplicidade.
- Eventos usam `schemaVersion: 1`, `sessionId` técnico não persistente de browser, `consentAnalytics: true`, `consentMarketing: false` e valor/currency do pedido.
- Testes focados de analytics passaram: 2 suítes / 10 testes. API build e lint passaram. O teste legado de atomicidade não iniciou por resolução de `@gestor/core` na worktree isolada; não houve falha funcional observada nesse caminho.
- Nenhuma migration, alteração de schema, provider, dependência, lockfile, banco remoto, merge ou deploy foi realizado.

Status: PR #29 Draft publicada; validação consolidada local passou em 1 suíte / 3 testes. Novo SHA aguarda CI remoto. Nenhum merge ou deploy realizado.

---

## Marco 1 — PR 1B storefront analytics dispatcher (Draft local)

Data: 2026-07-29
Branch: `feat/storefront-analytics-dispatcher`
Base: `feat/analytics-event-ingestion` / `bdd194d7162645dc69042a9012a4fecd23cf53f5`

- Reutiliza `AnalyticsEventEnvelopeV1`, `AnalyticsConsentSnapshotV1`, a taxonomia browser e o consent manager canônicos.
- Implementa sessão efêmera tenant-scoped em `sessionStorage`, rotação após 30 minutos, fallback em memória e limpeza por tenant na revogação; não adiciona visitorId, fingerprint ou fila persistente.
- Implementa dispatcher first-party com validação Zod v1, lotes de até 20, flush curto, retry limitado preservando eventId e descarte seguro em revogação.
- Instrumenta menu, seleção/detalhe de produto, add/remove, abertura do carrinho, início do checkout e submissão somente após resposta 2xx. Não envia tenantId, PII ou metadata irrestrita.
- Alterações limitadas ao storefront e testes focados; Prisma, migration da 1A, API, providers, dependências e lockfile não foram alterados.
- Gates locais: types build, storefront lint, storefront tests (6 arquivos / 32 testes), storefront build, typecheck, check:no-any, check:features e diff-check passaram. Lint mantém 17 warnings preexistentes, sem erros.
- Playwright completo, dois tenants no navegador, offline real, screenshots, carga, funil consolidado e eventos autoritativos da PR 1C permanecem deferidos para o Marco 1 final.

Status operacional: branch ainda não publicada; nenhum merge, deploy ou acesso a banco remoto realizado.

---

## PR 1A — ingestão segura de eventos de analytics (Draft publicada, CI verde)

Data: 2026-07-29
Branch: `feat/analytics-event-ingestion`
Base: `origin/main-copy` / `f41d488d`

- Adicionados o modelo tenant-scoped `AnalyticsEvent`, migration explícita `20260729120000_add_analytics_event_ingestion` e índice único `(tenantId, eventId)`.
- A rota pública proposta é `POST /public/storefront/:slug/analytics/events`. Ela resolve o tenant somente pelo slug, usa o contrato Zod v1 estrito, aceita no máximo 20 eventos, aplica o consent gate, restringe eventos a browser, valida referências por `tenantId`, limita timestamps e usa `createMany(skipDuplicates)` para deduplicação protegida pelo banco.
- Testes focados passaram: contrato e serviço de ingestão, 2 suites / 16 testes. Lint da API passou.
- Não houve alteração do runtime do storefront, provider, dashboard, dependências, lockfile, banco remoto, migration de produção, merge ou deploy.
- A Draft PR #27 foi validada no head real `bdd194d7162645dc69042a9012a4fecd23cf53f5`. A CI validou `build-and-migrate`, `Ephemeral PostgreSQL proof`, `smoke-with-ephemeral-seed`, typecheck/build incluídos nos quality gates e os checks globais, todos com sucesso. Estado da PR: `OPEN`, `Draft`, `CLEAN`.
- Os gates locais de migration, build e typecheck permanecem inconclusivos por Docker indisponível/limite de 120s, mas foram substituídos pela validação equivalente da CI.

### Contrato para PR 1B (somente após a PR 1A verde)

- rota: `POST /public/storefront/:slug/analytics/events`
- request: `{ events: AnalyticsPublicBrowserEventV1[] }`, máximo 20
- response: `{ accepted, duplicates, ignored }`
- consent rule: `analytics=false` retorna sucesso estável e não persiste
- branch base: `feat/analytics-event-ingestion`
- HEAD SHA: `bdd194d7162645dc69042a9012a4fecd23cf53f5`

title: Handoff — Sprint 5B Reconciliação e Operação iFood
status: current
owner: engineering
last_verified: 2026-07-28
verified_against: feat/storefront-consent-foundation / 5a3422a4 (base)
---

## Fundação mínima de consentimento do storefront (PR 0B)

Data: 2026-07-28

Branch: `feat/storefront-consent-foundation`

Base: `origin/main-copy` / `5a3422a4`

- O storefront público agora resolve consentimento somente depois de obter o identificador confiável do tenant e persiste uma decisão versionada em chave isolada por tenant.
- O contrato compartilhado Zod/TypeScript mantém `necessary: true`, inicia `analytics` e `marketing` em `false`, registra versão da política, versão do schema, origem e timestamps, e produz o snapshot compatível com a fundação de Analytics da PR 0A.
- O banner permanece no fluxo do documento e não cobre carrinho, checkout ou CTA de instalação. A ação permanente no rodapé reabre um diálogo acessível com foco inicial, trap de foco, `Escape` e restauração de foco.
- Aceitar tudo, aceitar somente necessários, personalizar, salvar preferências e revogar foram implementados. Decisão ausente, inválida ou de versão antiga falha fechada e volta a exibir o banner.
- Carrinho, autenticação de cliente, tema, PWA/cache e tracking funcional existente foram classificados como storage necessário e não são apagados nem condicionados por esta fundação.
- Testes Node cobrem contrato, persistência, `default deny`, versão e isolamento. O E2E real cobre sete cenários, incluindo reload, revogação, tenant A/B, política antiga, teclado e ausência de overflow, com oito capturas light/dark em desktop e mobile.
- Gates locais: `pnpm lint` exit `0` (16 warnings preexistentes no storefront); `pnpm typecheck` exit `0`; build e testes focados do storefront exit `0` (4 arquivos, 26 testes); build de `@gestor/types`, `check:no-any`, `check:features` e E2E exit `0`.
- Escopo excluído: ingestão de eventos, GA4, Meta Pixel, Google Ads, cookies opcionais, backend/Prisma/migrations, providers, banco remoto e deploy.
- Pendente: commits, push, Draft PR contra `main-copy` e CI no SHA publicado. Merge e deploy permanecem proibidos.

## Fundação canônica de Marketing Analytics do cardápio

Data: 2026-07-28

Branch: `feat/marketing-analytics-foundation` (PR #25, mergeada)

Merge em `main-copy`: `5a3422a4`

- A auditoria foi versionada sem alterar suas 24 seções. O drift direcionado desde `9d04645e` ficou vazio; o único delta global, `DriverSelectionModal.tsx`, foi classificado como sem impacto.
- A ADR define analytics first-party como fonte do dashboard, separa comportamento/domínio/provider e formaliza métricas, consentimento default deny, PII, atribuição, retenção, escala, threat model e plano de PRs.
- O contrato `schemaVersion: 1` exporta 14 eventos de browser e 3 eventos autoritativos de servidor por união discriminada e schemas Zod estritos. O envelope público não aceita `tenantId`, metadata livre, PII ou currency diferente de BRL.
- Escopo alterado: documentação, `packages/types` e um teste contratual; Prisma, migrations, runtime, providers, dependências, lockfile e CI permanecem inalterados.
- Gates locais finais: `pnpm lint` exit `0` (16 warnings preexistentes no storefront); `pnpm typecheck` exit `0`; `pnpm --filter @gestor/types build` exit `0`; teste focado Jest exit `0` (1 suíte, 11 testes); lint focado do teste exit `0`; `pnpm check:no-any` exit `0`; `pnpm check:features` exit `0`; `git diff --check` exit `0`.
- `@gestor/types` não possui scripts próprios de lint ou teste. O lint raiz e o Jest existente da API foram usados, sem adicionar scripts ou dependências.
- A validação na worktree reutilizou a instalação local existente por junctions ignoradas pelo Git; nenhum pacote foi instalado. Nenhum banco, provider, deploy ou migration foi acessado.
- PR #25 mergeada; CI pós-merge verde. O runtime de produção permaneceu inalterado e não houve deploy.

## Dashboard comercial premium do tenant

### Consistência de tema (pendente de prova visual autenticada)

Data: 2026-07-28
Branch: `fix/dashboard-theme-consistency`
Base: `main-copy` / `17e436a7`

- O pulso de operação deixou de usar superfície escura fixa: light usa fundo branco, borda clara e texto escuro; dark usa superfície elevada, borda escura e texto claro.
- O menu de ações rápidas agora declara explicitamente superfície e texto para ambos os temas, com hover, foco e estado disabled legíveis.
- A validação automatizada local cobre os pares de tema do status e os estados de ação. A prova autenticada foi adicionada à CI com PostgreSQL efêmero, seed suportado, login e seis capturas light/dark. O tenant efêmero agora recebe onboarding concluído somente sob `NODE_ENV=test`, pois o dashboard é corretamente bloqueado pelo `OnboardingGuard` em tenants pendentes. O login local disponível retornou `Credenciais inválidas ou erro no servidor`, portanto nenhum banco remoto foi acessado.

Data: 2026-07-28
Branch: `feat/premium-commercial-dashboard`
Base: `main-copy` / `e07ed925`

- O dashboard foi reorganizado como central operacional compacta: status real da loja, fluxo do dia e ação contextual aparecem na primeira dobra.
- KPIs, fluxo, atenção, receita, canais, cozinha, produtos, horários de pico e delivery usam apenas os contratos existentes.
- O seletor acessível oferece Hoje, Ontem e Últimos 7 dias. `/analytics/dashboard` consulta o período escolhido e o período anterior equivalente; comparações sem baseline válido aparecem como indisponíveis.
- Receita, ticket e produtos são rotulados como dados de pedidos concluídos. `cancellationRate` é exibido diretamente, sem multiplicação adicional.
- Status aberto/fechado/pausado deriva de `/tenant/me`, timezone, horários e pausa manual. Billing é permissionado por `billing.read` e reduzido a aviso compacto.
- Receita horária, impressora, SLA real e cozinha no prazo não existem no contrato atual e não foram simulados.
- `SetupWizard` foi preservado. Sidebar/AppLayout, backend, Prisma, migrations, auth, RBAC e regras de pedidos/KDS não foram alterados.
- Analytics exige simultaneamente `reports.read` e o módulo `reports`; sem o módulo, a consulta não é disparada e a UI mostra o estado de acesso indisponível sem falso erro parcial.
- Testes cobrem derivações puras, períodos, gating, estado vazio, conteúdo suportado e ausência de detalhes técnicos da sessão.
- Gates finais: lint `0`; 33 testes web `0`; build web `0` (5692 módulos); typecheck raiz `0`; check:no-any `0`; check:features `0`; diff-check `0`.
- A validação visual autenticada usou `http://localhost:5173` com fixture local e plano local ativado pela API suportada, sem banco remoto ou provider real. Capturas dark em 1440×900, 1366×768, 1024×768 e 390×844, mais light em 1440×900, ficaram sem overflow horizontal em `qa-artifacts/dashboard-premium/` (não versionado).
- A avaliação visual independente terminou `PASS` (8/12), sem bloqueadores. O aviso global de desbloqueio sonoro sobrepõe parte do cabeçalho no mobile e permanece fora deste escopo por pertencer ao layout global.

---

# Handoff — Sprint 5B: Reconciliação e Operação iFood

## UX de ativacao sonora

Data: 2026-07-28
Branch: `fix/notification-sound-activation-ux`
Base: `main-copy` / `e07ed925`

- Preferencia local de som permanece ativa por padrao, enquanto `AudioContext` usa estados reais e nao persistidos: `not-created`, `suspended`, `running`, `closed` e `unavailable`.
- O banner grande pertence apenas ao primeiro mount da sessao: nao e recuperado por rota, foco, visibilitychange ou reconexao. A ativacao bem-sucedida registra a dispensa da sessao e o remove imediatamente.
- O banner bloqueado exibe somente Ativar sons; Testar som so aparece na configuracao quando o contexto esta `running`. Erros de `resume()` viram Tentar novamente, sem expor detalhes tecnicos ao operador.
- Mobile posiciona o CTA na parte inferior, sem cobrir header ou menu. Sidebar, eventos, deduplicacao, lideranca e browser notification leader-only permanecem inalterados.
- Gates: lint `0`; testes web `0` (6 arquivos / 28 testes); build web `0`; typecheck raiz `0`; check:no-any `0`; check:features `0`; diff-check `0`.
- Pendente somente a captura autenticada: API local indisponivel e `apps/api/.env` aponta para host remoto, que ficou fora do escopo. Nenhum banco remoto, provider, push, PR, merge ou deploy foi usado.

## Objetivo e estado

A integração iFood agora possui inbox com claim idempotente, proteção contra eventos fora de ordem, reconciliação recorrente, classificação persistente de divergências, SLA de confirmação, endpoints SaaS Admin sanitizados, retry com linhagem/auditoria, métricas operacionais e rotação de chave AES-GCM.

> Operação e reconciliação validadas por testes contratuais; homologação iFood pendente.

Catálogo, estoque, promoções, segundo marketplace e dashboard analítico não foram iniciados.

## Git e gate inicial

| Item | Valor |
|---|---|
| Sprint 5A confirmada | commit `a689dd484bc59ea5ea79310969bd5ba2e75fe7c5` |
| Branch criada | `feat/ifood-reconciliation-operations` |
| Commit inicial | `a689dd484bc59ea5ea79310969bd5ba2e75fe7c5` |
| Commits da Sprint 5B | nenhum; alterações permanecem no working tree |
| Baseline lint/typecheck/build | PASS; 16 warnings React preexistentes |
| Baseline marketplace | PASS: 9 suítes, 28 testes |

## Arquitetura entregue

```text
webhook HMAC validado
→ inbox unique (provider, dedupeKey)
→ evento com createdAt/sequence/correlation ID
→ claim condicional RECEIVED/QUEUED/FAILED → PROCESSING
→ evento duplicado = sucesso sem efeitos
→ evento antigo = IGNORED sem regressão
→ regra de negócio + máquina de estados
→ PROCESSED ou FAILED reprocessável

operação pendente/aceita/falha
→ scheduler BullMQ a cada 60s
→ paginação por tenant, limite 100
→ claim otimista por updatedAt
→ GET estado atual no provider
→ transição local somente se permitida
→ SUCCEEDED ou MarketplaceDivergence
→ alerta/log/métrica/admin
```

### Eventos

| Cenário | Resultado |
|---|---|
| novo | persiste e processa |
| duplicado | incrementa contador e retorna sucesso sem efeitos |
| fora de ordem | `IGNORED`; pedido não regride |
| assinatura inválida | rejeita antes da persistência e emite log seguro |
| merchant desconhecido | inbox `FAILED`, job/webhook falha para retry e alerta mapping |
| confirmação/cancelamento final | conclui operação e aplica transição válida |
| cancelamento rejeitado | intervenção permanente |
| pedido concluído incompatível | divergência `INVALID_TRANSITION`; sem salto de estado |
| desconhecido | preservado na inbox; sem transição inventada |

### Reconciliação, SLA e divergências

- Job `operation-reconciliation-scan`: ID estável, 60s, limite 100, 3 tentativas, backoff 5s exponencial, timeout HTTP configurável e concorrência do worker 5.
- Varredura enumera tenants por conexão e filtra toda consulta/mutação operacional por `tenantId`.
- Claims otimistas impedem duas execuções simultâneas de chamar o provider para a mesma versão.
- Deadline oficial: imediato `createdAt + 8min`; agendado `preparationStartDateTime + 8min`.
- Persistência: recebimento, criação externa, início de preparo, deadline, enqueue, primeira/última tentativa, aceite, conclusão e atraso de fila.
- Tipos: `LOCAL_AHEAD`, `REMOTE_AHEAD`, `OPERATION_TIMEOUT`, `EVENT_MISSING`, `INVALID_TRANSITION`, `AUTHENTICATION_FAILURE`, `MERCHANT_MAPPING_FAILURE`, `PERMANENT_PROVIDER_REJECTION`, `UNKNOWN_EXTERNAL_STATE`.
- Métricas por tenant: pendências, maior idade, deadlines, duplicatas, fora de ordem, divergências, retries administrativos, autenticação, `429`, `5xx` e tempo até evento conclusivo.

## Administração e segurança

| Endpoint | Permissão | Finalidade |
|---|---|---|
| `GET /admin/marketplace/operations` | `saas.marketplace.read` | operações paginadas/filtradas |
| `GET /admin/marketplace/failures` | `saas.marketplace.read` | falhas/intervenção |
| `GET /admin/marketplace/divergences` | `saas.marketplace.read` | divergências e resolução |
| `GET /admin/marketplace/operations/:id` | `saas.marketplace.read` | detalhe sanitizado |
| `GET /admin/marketplace/operations/:id/history` | `saas.marketplace.read` | original e retries filhos |
| `GET /admin/marketplace/metrics` | `saas.marketplace.read` | métricas por tenant |
| `POST /admin/marketplace/operations/:id/retry` | `saas.marketplace.manage` | retry controlado, 5/min |
| `POST /admin/marketplace/divergences/:id/acknowledge` | `saas.marketplace.manage` | reconhecimento auditado |
| `POST /admin/marketplace/connections/:id/rotate-credentials` | `saas.marketplace.manage` | recifra tokens, 3/min |

Todos exigem `AdminAuthGuard`, `AdminPermissionsGuard` e `tenantId` explícito. Payloads retornados usam allowlist e não incluem raw payload, token, secret, Authorization ou ciphertext. Retry reconcilia primeiro, recusa `SUCCEEDED`/`ACCEPTED`/ativas, cria operação filha e correlation ID, audita admin/IP e limita três tentativas.

## Criptografia

- AES-256-GCM, nonce aleatório de 12 bytes e auth tag obrigatória.
- Novas cifras: `enc:v2:<keyVersion>`.
- Leitura permitida: versão atual e uma anterior explicitamente configurada.
- `enc:v1` continua legível com a chave atual para migração; plaintext falha fechado.
- Endpoint de rotação recifra sem devolver segredo.

## Banco e migration

Migration: `apps/api/prisma/migrations/20260716150000_marketplace_reconciliation_operations/migration.sql`.

Alteração aditiva:

- metadados de evento e contador de duplicatas na inbox;
- timestamps externos/SLA/último evento em `MarketplaceOrder`;
- timestamps de fila/SLA e linhagem de retry em `MarketplaceOperation`;
- enums e tabela `MarketplaceDivergence` com índices/FKs;
- backfill de `correlation_id` para eventos preexistentes.

Validação PostgreSQL 16 descartável:

- banco vazio: PASS, 45/45 migrations;
- upgrade com tenant, conexão, inbox, pedido e operação da 5A: PASS;
- operação `ACCEPTED` preservada, `admin_retry_number=0`;
- evento preservado, correlation ID preenchido, `duplicate_count=0`;
- container e diretório temporário removidos.

Rollback operacional: desligar `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED` e reverter o código preservando as tabelas. Drop de colunas/tabela/enums é destrutivo e requer migration separada, backup e aprovação.

## Testes e gates finais

| Comando | Resultado |
|---|---|
| `pnpm lint` | PASS; mesmos 16 warnings React preexistentes |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS; warnings de chunk size preexistentes |
| `pnpm check:no-any` | PASS |
| `pnpm check:features` | PASS; alertas esperados de Beta/homologação |
| `pnpm --dir apps/api exec prisma validate` | PASS |
| Jest marketplace + admin marketplace | PASS: 12 suítes, 44 testes |
| Migration PostgreSQL vazio | PASS |
| Migration sobre dados 5A | PASS |
| `git diff --check` | PASS; somente avisos LF/CRLF do Git |

Cobertura adicionada: novo/duplicado/processado, assinatura inválida, tenant/mapping, fora de ordem, reconciliação resolvida/pendente/timeout/provider indisponível/concorrente, RBAC administrativo, payload sanitizado, criptografia, adulteração, nonce, chave incorreta e versão anterior.

Nenhum teste automatizado chamou o iFood real.

## Documentação

- `docs/contracts/marketplace.md`
- `docs/contracts/queues-and-jobs.md`
- `docs/product/feature-matrix.md`
- `docs/product/known-gaps.md`
- `docs/operations/runbooks/ifood-reconciliation.md`
- documentação de variáveis de ambiente
- este handoff

## Homologação e riscos residuais

| Risco | Severidade | Recomendação |
|---|---|---|
| Homologação oficial ausente | Alta | validar OAuth, webhook, confirmação, cancelamento, deadline e logs com merchant oficial antes de produção |
| Plataforma externa de alertas ausente | Média | conectar logs/métricas/readiness ao canal on-call |
| Polling de fallback ausente | Média | manter webhook-first; só adicionar após validar presença, ACK, filtros e rate limits |
| Detalhe de pedido na ingestão depende do payload recebido | Média | validar formatos oficiais e necessidade de GET por tipo de evento na homologação |
| Tokens plaintext legados | Alta | reconectar; não existe fallback plaintext |
| Dashboard visual ausente | Baixa | endpoints operacionais já cobrem a operação mínima |

## Próximo passo recomendado

Revisar o diff, criar commit(s) da Sprint 5B, aplicar a migration em staging, sincronizar novas permissões administrativas, configurar versões de chave, manter o kill switch desligado e executar o roteiro de homologação oficial. Não iniciar catálogo ou outra sprint automaticamente.

---

# Sprint 5C — Polling de fallback e preparação para homologação iFood

Data: 2026-07-16

Branch: `feat/ifood-polling-fallback`
Base confirmada: `cbbfbf5334c1de33f64e6f68694c004c2b427773` (Sprint 5B commitada)

## Objetivo e decisões

Foi implementado polling iFood opt-in, desligado por padrão e protegido por dois kill switches. A documentação oficial foi validada antes do código. A cadência é 30 segundos; cada job consulta um merchant via `x-polling-merchants`; ACK usa lotes conservadores de 2.000 IDs e ocorre apenas após persistência/duplicata durável.

Webhook e polling reutilizam a mesma inbox e a mesma unique `(provider,dedupeKey)`. A inbox registra primeiro/último canal, contador e último recebimento. Ordenação usa `createdAt`, sequência e precedência; ID é apenas desempate estável. Presença webhook por merchant exclui conexões opt-in no polling para impedir presença dupla.

## Implementação

- `MarketplacePollingService`: scan periódico, jobs determinísticos por conexão/janela, jitter, claim contra simultaneidade, retry compatível, tenant/feature/merchant governance, persist-before-ACK e bloqueio permanente.
- Cliente/provider iFood: `GET /events/v1.0/events:polling`, 200/204, filtros configuráveis, `POST /events/v1.0/events/acknowledgment`, lotes únicos e `Retry-After` existente.
- Inbox: telemetria WEBHOOK/POLLING, deduplicação multicanal, redispatch seguro quando a fila falha, heartbeat `KEEPALIVE` 202.
- Lifecycle: sequência/tópico do último evento e precedência determinística para timestamps iguais.
- Administração: listagem sanitizada de polling e `poll-now` auditado/rate-limited.
- Readiness: fila e contagens healthy/degraded/blocked/stale no health administrativo.
- Runbook: `docs/operations/runbooks/ifood-homologation.md`.

## Migration

`20260716190000_ifood_polling_fallback` é exclusivamente aditiva:

- enums `MarketplaceEventChannel` e `MarketplacePollingStatus`;
- telemetria de canal/entrega na inbox;
- estado, timestamps e contadores de polling na conexão;
- sequência/tópico do último evento no pedido marketplace;
- três índices e duas CHECK constraints não destrutivas.

Validação PostgreSQL 16 local/descartável:

- banco vazio: PASS, 46 migrations aplicadas;
- estado Sprint 5B com conexão, inbox, pedido marketplace, operação e divergência: PASS;
- contagens antes/depois: `1|1|1|1|1`;
- defaults existentes: `DISABLED`, `WEBHOOK`, `WEBHOOK`, `deliveryCount=1`;
- nenhum banco remoto acessado e nenhum `db push` executado.

O diff Prisma pós-migration não apontou drift da Sprint 5C. Permanecem diferenças anteriores em `system_configs.platform_logo_media_id` e tipos de `tenant_settings.handoff_sound/ready_sound`; não foram alteradas por estarem fora do escopo.

## Testes e gates

| Comando | Resultado |
|---|---|
| baseline `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS; 16 warnings React preexistentes |
| `pnpm lint` pós-implementação | PASS; mesmos 16 warnings |
| `pnpm typecheck` | PASS |
| `pnpm check:no-any` | PASS |
| `pnpm check:features` | PASS com alertas Beta esperados |
| `pnpm prisma:validate` | PASS |
| build API | PASS |
| Jest marketplace | PASS: 12 suítes, 50 testes |
| `git diff --check` | PASS |
| `pnpm test` | FAIL por suites preexistentes fora do marketplace |

Falhas integrais fora do escopo observadas novamente: dois testes de `ConversationService`, compilação da fixture `location-provider.service.spec.ts`, HMAC em `webhook-security.service.spec.ts` e dois testes de `BaseMenusPage` no web-admin. Web-tenant passou 12/12 e storefront 1/1. Nenhuma falha toca arquivos da Sprint 5C.

## Riscos e próximo passo

- Homologação real ainda pendente; não chamar a integração de homologada.
- Presença deve ser configurada por merchant no portal; não usar presença webhook e polling simultaneamente para o mesmo merchant.
- Filtros `types/groups` geram auto-ACK dos eventos excluídos; ambos ficam vazios por padrão e não podem ser combinados.
- O container de validação é removido ao encerrar a sessão.
- Próximo passo: revisar o diff/SQL, aplicar migration somente em staging, configurar um tenant piloto e executar integralmente o runbook com evidências. Não iniciar catálogo ou outra sprint automaticamente.

---

# Sprint 6A — baseline global e RC de staging

Data: 2026-07-16

Branch: `release/ifood-staging-rc`
Base inicial: `cbbfbf5334c1de33f64e6f68694c004c2b427773`

## Resultado

Release candidate preparado parcialmente para staging. Integração ainda não homologada pelo iFood. Kill switches permanecem desabilitados.

Commits criados:

- `2b04dbd` — checkpoint da Sprint 5C, polling/ACK e telemetria;
- `1a48016` — cadência por token/device, agrupamento de merchants, presença coerente e concorrência;
- `7f7a20a` — restauração da confiabilidade da suíte global.

Conexões sem refresh token compartilham o OAuth client/token centralizado e agora geram um job por janela, com merchants em lotes de até 100. Conexões com refresh token usam token/device independente. Dois schedulers/workers concorrentes são protegidos por job ID determinístico e claim persistente. `presenceMode` é explícito (`WEBHOOK`, `POLLING`, `DISABLED`) e a API rejeita polling com presença contraditória.

## Baseline e gates

| Gate | Antes | Depois |
|---|---|---|
| `pnpm test` | FAIL: Conversation, Location, WebhookSecurity e BaseMenusPage | PASS: API 43 suítes/178 testes; web-admin 10; web-tenant 12; storefront 1 |
| `pnpm lint` | PASS com 16 warnings React | PASS com os mesmos 16 warnings |
| `pnpm typecheck` | PASS | PASS |
| `pnpm build` | não reexecutado no gate inicial | PASS; warnings preexistentes de chunk size |
| `pnpm check:no-any` | PASS | PASS |
| `pnpm check:features` | PASS com alertas Beta | PASS com alertas Beta/gaps registrados |
| `pnpm prisma:validate` | PASS | PASS |

Causas raiz do baseline: fixtures de Conversation desatualizadas para `findMany`/gateway estático; cast estrutural inválido no teste Location; teste HMAC sujeito à precedência de variável real do processo; teste React reutilizando nó desmontado e buscando título dividido por ícone.

## Migrations e drift

Em PostgreSQL 16 local/efêmero, passaram: banco vazio, upgrade desde pré-5A, upgrade desde 5B e redeploy de 5C. `handoff_sound` e `ready_sound` terminam como `VARCHAR(255)` e coincidem com o schema. O único diff remanescente é aditivo: coluna/index/FK `system_configs.platform_logo_media_id`, introduzidos no commit de branding sem migration. A criação da migration aguarda aprovação específica da Sprint 6A.

O smoke de startup com ambos kill switches desligados alcança inicialização dos módulos, mas termina em `P2022` no `SystemConfigService` devido ao drift de `platform_logo_media_id`. Portanto o RC ainda é **no-go** até a migration aditiva ser aprovada, criada e validada.

## Incidente de validação

Na primeira tentativa de validação, apenas `DATABASE_URL` foi sobrescrita; como o schema usa `DIRECT_URL` para migrations, o Prisma carregou o valor remoto de `apps/api/.env`. As migrations aditivas 5A, 5B e 5C foram aplicadas nesse banco remoto antes da detecção; comandos seguintes apenas retornaram “sem pendências”. Nenhuma credencial foi lida/exibida e não houve operação destrutiva, mas a ação violou a restrição de não executar migration remota.

Ações tomadas: nenhuma outra chamada Prisma foi feita até identificar a causa; todas as validações posteriores sobrescreveram `DATABASE_URL` e `DIRECT_URL` e confirmaram destino `127.0.0.1`; o incidente foi registrado. Próxima ação operacional: identificar formalmente o ambiente remoto, auditar `_prisma_migrations`/backup com o responsável do banco e manter os kill switches desligados. Como as três migrations são aditivas, o rollback imediato recomendado é funcional por flags/código; não executar `DROP` nem apagar eventos, operações ou divergências.

## Documentação e próximo passo

- contrato e matriz de feature atualizados;
- gaps e limites de readiness registrados;
- homologação/reconciliação atualizadas;
- novo [runbook de staging](../operations/runbooks/ifood-staging-rollout.md) com piloto, go/no-go e rollback.

Próximo passo: obter aprovação para a migration aditiva de branding, validar novamente as quatro trajetórias e o smoke de startup, concluir gates, criar commits de migration/documentação e somente então classificar o RC como go para staging. Não ativar tenant real nem iniciar nova sprint.

---

## Atualização RC — migration de branding aprovada e validada

Data: 2026-07-16
Branch: `release/ifood-staging-rc`

### Alteração entregue

Migration exclusivamente aditiva: `20260716210000_add_system_config_platform_logo_media`.

```sql
ALTER TABLE "system_configs"
  ADD COLUMN "platform_logo_media_id" TEXT;

CREATE INDEX "system_configs_platform_logo_media_id_idx"
  ON "system_configs"("platform_logo_media_id");

ALTER TABLE "system_configs"
  ADD CONSTRAINT "system_configs_platform_logo_media_id_fkey"
  FOREIGN KEY ("platform_logo_media_id")
  REFERENCES "media_assets"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
```

Não houve `prisma db push`, alteração destrutiva, acesso remoto adicional, nem mudança de schema fora desta coluna, índice e FK. A confirmação no PostgreSQL local foi: `media_assets.id = text`, compatível exatamente com a nova coluna `text`.

### Validação local/efêmera

Antes de cada comando Prisma, `DATABASE_URL` e `DIRECT_URL` foram sobrescritas e validadas como PostgreSQL local em `127.0.0.1:55433`, apontando para o mesmo banco efêmero. A execução abortaria para host/porta/esquema diferentes.

| Cenário | Resultado |
|---|---|
| Banco vazio | PASS, 47 migrations |
| Upgrade pré-5A | PASS, 47 migrations |
| Upgrade 5B | PASS, 47 migrations |
| Upgrade 5C | PASS, 47 migrations |
| Redeploy sobre 5C + branding | PASS, sem migrations pendentes |
| `prisma migrate diff` pós-migration | PASS, migration vazia |
| `pnpm prisma:validate` | PASS |
| Smoke de startup que falhava em `P2022` | PASS, Nest iniciou sem `P2022`; filas e automações desabilitadas |
| `pnpm --filter @gestor/api test` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS |

Checksum SHA-256 do arquivo e checksum registrado pelo Prisma: `510ce2bc60f3467cfe48614f7dbc9fc9cafe82e38c423d45f02d1c8dbef5dcf2`.

### Go/no-go e incidente separado

O RC passa a **go para staging somente como artefato validado localmente**; não autoriza aplicar migrations ou ativar polling em staging/produção. Polling continua desabilitado por padrão e protegido pelos kill switches.

O incidente histórico de `DIRECT_URL` permanece separado e aberto: antes de qualquer staging ou produção, o responsável pelo banco deve identificar formalmente o banco remoto afetado, conferir `_prisma_migrations`, confirmar backup recuperável e demonstrar que apenas as migrations aditivas 5A–5C foram aplicadas. Esta sessão não realizou nova consulta nem qualquer alteração remota.

---

## Segurança do startup e migration operacional no Dokploy

Data: 2026-07-16
Branch: `fix/production-entrypoint-safety`
Base: `main-copy` / `6cdd98a3`

### Objetivo e decisões

O startup normal da API foi separado da gestão de schema. `docker-entrypoint.sh` agora valida somente a presença de `DATABASE_URL` e `DIRECT_URL`, não imprime valores, não executa limpeza ou migration e delega ao `CMD` da imagem com `exec`. O `CMD` inicia diretamente o artefato Node compilado.

O Compose de produção ganhou o serviço manual `api-migrate`, isolado pelo profile `operations`, com `restart: "no"` e comando exclusivo `npx prisma@5.22.0 migrate deploy`. O serviço não possui dependência da API, seed ou limpeza e não participa do `docker compose up` padrão.

`clean_db.js` deixou de ser copiado para a imagem, foi desacoplado de `prisma:migrate:deploy`, exige `CLEAN_DB=true` em comando local explícito e falha fechado em `NODE_ENV=production`.

Durante a validação efêmera foi identificado que `.dockerignore` não excluía arquivos `.env`. Como o Dockerfile usa `COPY . .` no estágio de build, isso poderia incluir um `.env` local no contexto. A correção passa a excluir `.env` em qualquer diretório, preservando apenas arquivos `.env.example`; o build posterior confirmou que `prisma generate` carregou somente o schema, sem carregar `.env`.

### Arquivos e contratos afetados

- startup/infra: `.dockerignore`, `apps/api/docker-entrypoint.sh`, `apps/api/Dockerfile`, `docker-compose.prod.yml`, `apps/api/package.json`, `apps/api/clean_db.js`;
- operação: novo `docs/operations/runbooks/dokploy-deployment.md` e atualizações no rollout iFood, índice documental, ambiente, pacote Dokploy histórico e `AGENTS.md`;
- nenhum schema, migration, contrato REST, feature flag ou comportamento de domínio foi alterado.

### Validações

| Comando | Resultado |
|---|---|
| baseline e final `pnpm lint` | PASS; 16 warnings React preexistentes |
| baseline e final `pnpm typecheck` | PASS |
| `pnpm build` | PASS; warnings preexistentes de chunk size |
| `pnpm test` | PASS: API 43 suítes/178 testes; web-admin 10; web-tenant 12; storefront 1 |
| `pnpm prisma:validate` com ambas URLs sobrescritas para host local | PASS |
| `pnpm check:no-any` | PASS |
| `docker compose -f docker-compose.prod.yml config --quiet` com URLs fictícias | PASS |
| runtime direto de `docker-entrypoint.sh` com placeholders | PASS; somente startup e comando delegado, sem secret ou migration |
| prova PostgreSQL 16 efêmera | NÃO CONCLUÍDA: Docker Desktop perdeu o daemon durante o build, antes de qualquer migration |

Nenhum deploy, banco remoto, migration, seed, limpeza, push ou merge foi executado. Os kill switches do iFood permaneceram inalterados e desligados.

Tentativa posterior de prova efêmera: o build passou por `prisma generate` e pela compilação da API sem carregar `.env`, mas o Docker Desktop ficou bloqueado ao transferir a imagem final. Nenhum container de teste, migration, seed ou limpeza foi iniciado; os arquivos temporários de Compose e variáveis fictícias foram removidos.

### Pendência e próximo passo

Repetir a prova efêmera quando o daemon Docker estiver saudável: comprovar startup sem `_prisma_migrations`, duas execuções idempotentes de `api-migrate`, isolamento de falha e startup da API após schema aplicado. Depois revisar o diff e obter aprovação explícita antes de integrar em `main-copy`; não fazer deploy automaticamente.

---

## Metadados dinâmicos do storefront e títulos de abas

Data: 2026-07-17
Branch: `feat/dynamic-meta-and-page-titles`

### Objetivo e auditoria

O storefront é uma SPA Vite, mas a imagem de produção já inicia `apps/web-storefront/server.js`, um servidor Express que entrega o `index.html` inicial. A implementação anterior de SEO estava incompleta: buscava a rota inexistente `/storefront/:slug`, não escapava HTML, não emitia canonical/`og:url` e não normalizava imagens para URL absoluta. Alterações de título, favicon e descrição no React ocorrem somente após a API responder no navegador e, isoladamente, não atendem crawlers de compartilhamento.

O tenant é resolvido pelo primeiro segmento da rota pública e pelo endpoint `GET /public/storefront/:slug`; a identidade disponível sem alteração de schema é nome do tenant, `TenantSettings.logoUrl` e hero/banner em `storefrontThemeJson`. A biblioteca de mídia existente continua sendo a responsável por URLs públicas. Não existem campos específicos persistidos para descrição social, imagem social ou favicon; não foram criados campos nem uma segunda infraestrutura de upload. O fallback de descrição é o texto público padrão e a ordem de imagem é banner, logo e logo global.

O nome global canônico vem de `SystemConfig.appName`; a logo global vem de `SystemConfig.platformLogoMedia`. Foi exposto somente esse payload público e não sensível em `GET /public/storefront/branding` para permitir o fallback do renderizador. O painel tenant já concentrava labels de menu e breadcrumb em `SIDEBAR_GROUPS`; o painel SaaS Admin faz o mesmo. Os títulos da aba agora reutilizam essas configurações, com exceções amigáveis para páginas de detalhe.

### Alterações feitas

- `apps/web-storefront/server.js`: corrigida a chamada da API pública, HTML inicial com title, description, canonical, Open Graph, Twitter Card, manifest e favicon por tenant; sanitização de conteúdo HTML, URLs absolutas e cache local de cinco minutos.
- `apps/api/src/storefront/storefront.controller.ts` e `storefront.service.ts`: endpoint público mínimo de branding global, sem dados internos ou segredos.
- `apps/web-tenant/src/layouts/AppLayout.tsx`: título `{systemName} - {label atual}` sincronizado com breadcrumb/menu.
- `apps/web-admin/src/layouts/AppLayout.tsx`: título dinâmico baseado no menu, incluindo detalhes conhecidos de tenant e cardápio base.

### Validações

| Comando | Resultado |
|---|---|
| `pnpm --filter @gestor/web-storefront build` | PASS |
| TypeScript API, web-tenant e web-admin | PASS |
| `node --check apps/web-storefront/server.js` | PASS |
| `pnpm --filter @gestor/api test -- storefront.service.spec.ts` | PASS, 1 suíte/1 teste |
| `pnpm --filter @gestor/web-storefront test` | PASS, 1 arquivo/1 teste |
| `git diff --check` | PASS |

### Limitações e próximo passo

O servidor atualiza o cache interno em até cinco minutos; previews já guardados por WhatsApp/Facebook/LinkedIn/Telegram dependem do cache de cada plataforma e não são invalidáveis pela aplicação. Antes de publicação, confirmar que o deploy do storefront utiliza `Dockerfile.storefront`/`server.js`, pois um host que sirva apenas o build estático continuará sem metatags por tenant no HTML inicial. Não houve migration, acesso a ambiente remoto, deploy, push ou merge.

---

## Sprint 6A — núcleo operacional da loja

Data: 2026-07-21
Branch: `feat/sprint-6-operational-core`
Base: `main-copy` em `37ae8430`

### Alterações concluídas

- Perfil operacional acessível pela lista de clientes, com contatos, indicadores, ticket médio, último pedido, endereços, observações internas e os dez pedidos mais recentes. As consultas permanecem filtradas por tenant e usam as permissões CRM existentes.
- `GET /kds/print-jobs/:id` deixou de responder `NotImplementedException`; agora consulta o job e o pedido associado com filtro explícito do tenant e retorna 404 fora do escopo.
- Baixa teórica de estoque agrega a receita por insumo e executa em transação. Reexecuções de um mesmo pedido não duplicam movimentos; decrementos exigem saldo suficiente e toda a operação é revertida se algum insumo não puder ser baixado.

### Auditoria operacional

| Domínio | Estado | Evidência resumida |
|---|---|---|
| Perfil do cliente | Completo | rota CRM, RBAC, perfil e histórico recentes |
| PDV | Parcial | caixa obrigatório, idempotência e pedidos suportados; mesa ainda usa número visual |
| Caixa | Completo | abertura, suprimento, sangria, venda, fechamento e resumo por meio de pagamento |
| Impressão/reimpressão | Parcial | jobs, retry e fallback de navegador; hardware continua opcional |
| KDS | Parcial | estações, status, endpoint de job e polling de fallback |
| Estoque/ficha técnica | Parcial | receitas e reversão existem; baixa agora é idempotente e sem saldo negativo |

### Validações focadas

| Comando | Resultado |
|---|---|
| `pnpm --filter @gestor/api build` | PASS |
| `pnpm --filter @gestor/web-tenant build` | PASS; aviso preexistente de chunk grande |
| `pnpm --filter @gestor/api lint` | PASS |
| `pnpm --filter @gestor/web-tenant lint` | PASS |
| testes KDS/estoque focados | PASS, 2 suítes / 5 testes |
| `git diff --check` | PASS |

### Pendência e risco

Não houve migration, deploy, acesso a banco remoto, alteração de `main` ou ativação iFood. O vínculo de pedido de mesa continua por `tableNumber`, pois não há `tableId` no contrato atual; uma correção requer migration aditiva e revisão do ciclo de mesa antes de ser proposta.

---

## Sprint 6A — fechamento do retry serializável

Data: 2026-07-21
Branch: `feat/sprint-6-operational-core`

- POS, checkout público e baixa autônoma de estoque usam o mesmo wrapper `Serializable`, com no máximo três tentativas, retry exclusivo para Prisma `P2034` e backoff de 10ms/20ms limitado a 50ms.
- A unidade repetida inclui todas as escritas atômicas; WebSocket, KDS, WhatsApp e pagamentos externos continuam após o commit e são disparados uma única vez.
- Testes unitários cobrem sucesso após conflito, repetição da operação completa, limite de tentativas, preservação do último erro e ausência de retry para erros não `P2034`.
- PostgreSQL 16 local/descartável comprovou duas baixas realmente concorrentes: 1 movimento, saldo final 8 a partir de 10, sem saldo negativo, 1 pedido, 1 movimento de caixa, 1 cashback, 1 uso de cupom e 1 evento de receita. O container foi removido ao final.
- A CI executa essa prova no PostgreSQL efêmero do job após aplicar as migrations existentes.
- Gates globais: lint, typecheck, build, 51 suites/210 testes da API, testes dos frontends, Prisma validate, anti-`any`, features e diff-check aprovados.

Nenhuma migration ou alteração de schema foi criada; nenhum banco remoto, deploy, `main` ou `main-copy` foi alterado.

---

## Sprint 6C — CRM, campanhas e WhatsApp

Data: 2026-07-22
Branch: `feat/sprint-6c-crm-campaigns-whatsapp`

- `CustomerOptOut` permanece o modelo canônico e tenant-scoped, com unicidade
  `(tenantId, phone)`. O `customerId` passou a ser opcional para registrar o
  pedido recebido antes de existir vínculo com cliente; a FK usa `ON DELETE SET
  NULL`. Não existe segundo modelo concorrente de opt-out.
- O webhook normaliza telefone e palavras-chave, usa upsert idempotente antes da
  deduplicação da mensagem e não despacha o fluxo pesado de IA para opt-out.
- A migration `20260722120000_campaign_status_and_opt_out_compatibility`
  converte `running` para `processing` e `paused` para `cancelled`, preservando
  dados existentes. A máquina passa a usar `draft`, `scheduled`, `queued`,
  `processing`, `completed`, `failed` e `cancelled` na API, tipos e UI.
- Jobs validam campanha, dispatch, cliente e tenant antes do provider. IDs de
  BullMQ são determinísticos, sucesso persistido não é reenviado e a fila exige
  os três kill switches de Redis, BullMQ e campanhas.
- Quiet hours usam `TenantSettings.timezone`; timezone ausente ou inválido tem
  fallback explícito para `America/Sao_Paulo`.
- A Inbox continua canonicamente em `ChatSession` e `ChatMessage`. Mensagens de
  campanha gravam `campaignId` e `dispatchId` em `metadata`; nenhum
  `MessageHistory` paralelo foi criado.
- PostgreSQL 16 efêmero validou banco vazio, base populada pré-migration e
  reaplicação. Redis/BullMQ efêmero validou deduplicação, retry limitado,
  backoff, falha final e recuperação. O smoke integrado usou exclusivamente
  provider fake e comprovou envio elegível, opt-out com motivo, reentrega sem
  duplicação, resposta fake e ordenação da Inbox.

Nenhum banco remoto ou provider real foi acessado. Não houve deploy, merge,
alteração de `main`/`main-copy` ou aplicação/remoção de stash.

---

## Sprint 6B.2 — relação persistida Pedido–Mesa

Data: 2026-07-22
Branch: `feat/sprint-6b2-table-relation`

- Migration aditiva cria `Order.tableId` nullable, FK para `DineInTable` com `ON DELETE SET NULL` e índice `(tenantId, tableId)`; `tableNumber` não foi removido.
- O backfill normaliza espaços e só relaciona pedidos com uma única mesa de mesmo tenant. Sem correspondência e nomes ambíguos ficam nulos; a instrução é idempotente.
- PDV, garçom e criação pública escrevem `tableId` e o snapshot visual em conjunto. A API rejeita mesa inexistente/cross-tenant e conflito entre ID e nome; claim, transferência e liberação terminal usam `activeOrderId` de modo atômico e tenant-scoped.
- A UI seleciona mesas do salão pelo ID. Leituras devolvem resumo da relação quando ela existe e preservam o fallback por `tableNumber`; impressão continua baseada no snapshot legível.

PostgreSQL 16 local/descartável aplicou as 48 migrations, incluindo `20260722090000_add_order_table_relation`; a prova cobriu backfill unívoco, ambíguo e sem correspondência, FK/índice, `ON DELETE SET NULL` e reexecução idempotente. O container foi removido ao final. Nenhum banco remoto, deploy, merge, `main` ou `main-copy` foi alterado; o stash preexistente deve ser preservado.

---

## Refinamento visual — Configurações do Tenant

Data: 2026-07-24
Branch: `feat/settings-ui-refinement`
Working tree inicial: `M apps/web-tenant/src/features/settings/SettingsPage.tsx` + `?? scripts/screenshot-settings.ts`

- `apps/web-tenant/src/features/settings/SettingsPage.tsx` foi refinada visualmente sem mudar rotas, APIs, payloads, regras de negócio, sidebar ou RBAC.
- As abas Loja, Endereço, Fiscal & Pagamento e Horários agora compartilham container, navegação responsiva com estados ativo/foco, cards e ações de salvamento contextuais.
- Loja, endereço, pagamentos, upload de logo e horários preservam os handlers existentes; as mudanças são somente de estrutura visual, texto e acessibilidade.
- A correção estrutural removeu a coluna vazia do conteúdo e alinhou painéis, cards e barras de salvamento à largura das abas; a Loja usa uma grade 7/5 (Cardápio Base 7/12 + Status 5/12) e os demais painéis usam a grade de 12 colunas full-width no desktop.

### Gates determinísticos (exit codes)

| Gate | Exit code | Últimas linhas |
|---|---|---|
| `pnpm --filter @gestor/web-tenant build` | 0 | tsc --noEmit + vite build; 5686 modules; dist/index.html + CSS/JS gerados |
| `pnpm typecheck` (todos os apps) | 0 | api/web-tenant/web-admin/web-delivery/web-storefront sem erros |
| `pnpm check:no-any` | 0 | Auditoria anti-any concluída, nenhuma tipagem frouxa |
| `pnpm check:features` | 0 | Validação de stubs e gaps concluída; NotImplementedException somente em split-payment (preexistente) |

### Sessão autenticada e ambiente

- Banco: PostgreSQL 16-alpine em Docker (local/efêmero), porta host 5433, container `gestor-delivery-postgres`.
- Redis: 7-alpine em Docker (local), porta 6379, container `gestor-delivery-redis`.
- Conta de seed (seed oficial do repositório, conta não-efêmera): `demo@demo.com` / `demo123` / tenant `pizzaria-demo` (Pizzaria Demo).
- 49 migrations aplicadas via `prisma migrate deploy`, seed completo via `prisma:seed` (permissions, roles, billing foundation, base menus, tenant Pizzaria Demo, catálogo, 12 mesas dine-in).
- Nenhum banco remoto acessado. Nenhum bypass de autenticação. Backend/Prisma/migrations não foram alterados.

### Screenshots geradas (Playwright headless, storageState via localStorage inject)

Diretório (não versionado): `tmp/settings-visual-proof/`

**1440×900:**
- Loja → `settings-loja-1440x900.png`
- Endereço → `settings-endereco-1440x900.png`
- Fiscal & Pagamento → `settings-fiscal-pagamento-1440x900.png`
- Horários → `settings-horarios-1440x900.png`

**1366×768:**
- Loja → `settings-loja-1366x768.png`
- Endereço → `settings-endereco-1366x768.png`
- Fiscal & Pagamento → `settings-fiscal-pagamento-1366x768.png`
- Horários → `settings-horarios-1366x768.png`

### Revisão visual rigorosa (APROVADO)

Verificado nas 8 capturas, zoom 100%, sidebar visível, sem skeleton/toasts cobrindo painéis:

- ✅ Abas/painéis alinhados (Δleft ≤ 2px e Δright ≤ 2px em ambos viewports)
- ✅ Identidade e Contato (Loja) = full-width
- ✅ Endereço (card + barra Salvar endereço) = full-width
- ✅ Dados Fiscais & Integração + Configuração de Pagamento = full-width cada
- ✅ Horário Semanal (cards de Domingo a Sábado) = full-width
- ✅ Cardápio Base (7/12) + Status da loja (5/12) = proporção 7:5 mantida em ambos viewports
- ✅ Sem espaço vazio estrutural à direita (coluna vazia eliminada)
- ✅ Sem card torto (todos cards com cantos arredondados consistentes)
- ✅ Sem scroll horizontal (scrollWidth ≤ clientWidth+4px)
- ✅ Sidebar inalterada (mesmos grupos: DASHBOARD/CARDÁPIO/PEDIDOS/LOGÍSTICA/PDV E CAIXA/GESTÃO/CRM E MARKETING/GESTÃO & PERFORMANCE/WHATSAPP/SISTEMA)

### Gates finais

| Gate | Exit code |
|---|---|
| `pnpm --filter @gestor/web-tenant lint` | 0 (max-warnings 0) |
| `pnpm --filter @gestor/web-tenant test` | 0 (5 arquivos / 14 testes PASS) |
| `git diff --check` | 0 |

### Pendências e decisão

- Nenhuma pendência objetiva. Todos exit codes = 0.
- Screenshots reais confirmam o alinhamento estrutural pretendido em 2 resoluções desktop.
- Nenhum push, PR, merge, deploy, stash apply/drop ou commit foi realizado até aqui.
- Próximo passo: commit somente de `SettingsPage.tsx` + `docs/handoffs/current-state.md` (o arquivo `scripts/screenshot-settings.ts` e o diretório `tmp/` permanecem fora do commit, conforme protocolo).

---

## R1 - checkout summary and submit safety

Data: 2026-08-01

- Branch `feat/go-live-r1-checkout-submit-safety`, baseada no merge da PR #36 em
  `origin/main-copy` (`2da1d750`). Checkout principal, worktrees R0/E0 e
  `stash@{0}` preservados.
- Frontend submit path: `CheckoutPage.tsx` monta `CreateOrderDTO` a partir do
  carrinho/formulário e chama `POST /orders/public-checkout/:slug` por
  `api-client.ts`.
- API route: `OrdersController.checkout`; server create path:
  `OrdersService.createOrder`; transaction boundary:
  `runSerializableTransactionWithRetry` cobrindo pedido, itens, endereço,
  timeline, mesa, estoque, cashback e cupom. Efeitos externos continuam depois
  do commit.
- Existing idempotency mechanism: **YES, completed in R1**. `Order` já possuía
  `idempotencyKey` e `@@unique([tenantId, idempotencyKey])`; R1 adiciona
  fingerprint versionado, rejeição de payload incompatível, recuperação da
  corrida `P2002` e guard síncrono no cliente.
- O resumo final usa o mesmo carrinho e estados que montam o payload e cobre
  itens, quantidades, opções, slots, observações, totais, descontos/cashback,
  entrega/retirada, endereço, pagamento e troco quando aplicáveis.
- Retry de erro de rede/timeout preserva a chave enquanto o payload não muda;
  erro HTTP definitivo libera nova tentativa; sucesso fecha o guard e navega
  uma única vez. Mudança material de payload altera automaticamente a chave.
- Nenhum Prisma/schema, migration, seed, dependência, lockfile, feature flag,
  E0-OPS, Dokploy, banco remoto ou deploy foi alterado.

---

## R0 Go-Live readiness - retomada funcional documental

Data: 2026-08-01

- Worktree `Gestor-Delivery-SaaS-PRO-go-live-audit`, branch
  `docs/go-live-readiness-audit`, iniciou limpa no SHA `0ecfe5df` (base E0
  `efbfefa3`). Checkout principal e `stash@{0}` foram preservados.
- CI pos-merge da E0: CI `30678152290` e Secret scanning `30678152243` PASS.
  O remoto `main-copy` avancou para `6e5acfa3`; nao houve merge dessa deriva na
  PR R0 documental.
- Auditoria estatica R1-R10 concluida em `docs/go-live/`. Nenhum novo P0 foi
  encontrado no preset estavel. `NotImplementedException` de split payment e
  feature beta, portanto fica fora do V1.
- R1/R2/R3/R4/R9 sao P1 de prova e ajuste limitado; R5-R8 sao P2; Google login
  esta fora do V1 sem decisao comercial. Nenhuma mudanca funcional, Prisma,
  migration, seed, dependencia, feature flag, producao, Dokploy ou banco remoto
  foi realizada.
- Decisao: P1 pode iniciar por R1, mas Go-Live definitivo continua bloqueado
  exclusivamente por E0-OPS (redeploy, revogacao global de `AuthSession` e
  smokes de nova sessao). E0H permanece follow-up sem reescrita.

---

## R0 Go-Live Readiness — interrompida por P0 de segurança

Data: 2026-07-31

Branch: `docs/go-live-readiness-audit`

Base: `origin/main-copy` / `6ed4c043e693bac98cb21509e87590f080d599f2`

- O checkout principal e `stash@{0}` foram preservados; a auditoria ocorreu em
  worktree isolada.
- PR #33 foi confirmada integrada no SHA-base. PR #34 permanece aberta, Draft e
  fora de `main-copy`.
- `.env.docker` está versionado e contém valores concretos para os dois secrets
  JWT. Os valores não foram copiados para o handoff.
- O arquivo está no histórico Git. O compose de produção atual lê `.env`, não
  `.env.docker`; o uso efetivo dos valores na VPS não foi verificado porque
  acesso à produção é proibido.
- O achado foi classificado P0 de segurança e acionou a stop-rule do briefing.
  A auditoria consolidada, o escopo do Go-Live, R1-R10 e os checklists não foram
  concluídos.
- Foram criados localmente apenas `docs/go-live/README.md`,
  `docs/go-live/readiness-audit-2026-07-31.md` e
  `docs/go-live/issue-matrix.md` para registrar o bloqueador.
- Baselines: `pnpm lint` exit 1 por `eslint` ausente; `pnpm typecheck` exit 1 por
  `tsc` ausente. Nenhuma dependência foi instalada.
- Nenhum código funcional, Prisma, migration, dependência, lockfile, feature
  flag, banco, produção ou deploy foi alterado.
- Nenhum commit, push, PR, merge ou deploy foi realizado.
- Próximo passo obrigatório: E0 emergencial para rotação dos secrets, invalidação
  de sessões, saneamento do arquivo/histórico e gate de secret scanning. Retomar
  a R0 somente após evidência da contenção.
