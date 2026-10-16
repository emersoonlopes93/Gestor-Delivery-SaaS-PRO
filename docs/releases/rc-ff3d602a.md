# Release Candidate `ff3d602a`

Data da auditoria: 2026-08-09

SHA imutável: `ff3d602aa8d5aee238abb3b0574d447ac000b6f8`

Decisão: **RC APROVADO** para a etapa operacional. **Go-Live ainda bloqueado**.

Este documento consolida somente evidências versionadas, CI e validações locais. Nenhum acesso a produção, deploy, migration remota, rotação de secret, revogação global, E0-OPS ou alteração no Google Cloud foi executado.

## Production preflight — read only

Data: 2026-08-09

Decisão do preflight: **PARTIAL — acesso operacional insuficiente para provar gates críticos. Nenhuma escrita de produção foi executada.**

### Freeze e acesso

- `origin/main-copy` e o RC permanecem em `ff3d602aa8d5aee238abb3b0574d447ac000b6f8`.
- A PR #51 permanece Draft, OPEN, MERGEABLE e CLEAN, com checks verdes; não foi mergeada.
- Não há conector/CLI autenticado do Dokploy, alvo SSH conhecido, credencial PostgreSQL ou sistema de backup acessível nesta execução.
- O cliente Docker existe, mas o daemon local `desktop-linux` está indisponível e não representa produção.
- O endpoint versionado `GET https://api.kigula.dpdns.org/api/v1/health` respondeu HTTP 200, TLS válido e `status=ok`; a resposta não expõe SHA, imagem ou ambiente.

| Gate | Estado | Evidência/limite |
|---|---|---|
| RC SHA | READY | RC e `origin/main-copy` idênticos |
| PR #51/CI | READY | Draft sem merge; CI, Gitleaks, branding e smokes verdes |
| Dokploy/host/container de produção | UNKNOWN | sem endpoint/sessão autenticada ou alvo SSH conhecido |
| Imagem/SHA atualmente implantado | UNKNOWN | health não expõe versão e não há leitura do Dokploy |
| Backup/restore | BLOCKED | mecanismo/política documentados, mas último backup, retenção e restore real não comprovados |
| `_prisma_migrations` | UNKNOWN | sem conexão read-only ao PostgreSQL de produção |
| Schema drift | UNKNOWN | catálogos de produção não acessíveis |
| Env/config real | UNKNOWN | presença no ambiente local não representa o secret manager do Dokploy |
| JWT/session TTL real | UNKNOWN | valores implantados não acessíveis |
| Google backend/frontend | UNKNOWN | configuração real não acessível; Google Cloud não consultado |
| CORS/URLs/WebSocket | UNKNOWN | API pública saudável, configuração implantada não acessível |
| Redis/storage | UNKNOWN | sem leitura de serviços/volumes/credentials de produção |
| E0 secret rotation | UNKNOWN | nenhuma evidência operacional de rotação |
| Revocation tooling no RC construível | WARNING | script e dependências são copiados, mas o comando exato não foi executado no runner |
| Revocation tooling na imagem implantada | UNKNOWN | digest/SHA atual não comprovado |
| Current API health | READY | HTTP 200, TLS válido, `status=ok` |
| Rollback plan | READY | runbooks versionados; execução depende de artefato anterior e backup comprovados |

### Migrations e schema

- O RC contém 55 migrations. Sem `_prisma_migrations`, contagens de produção, applied/pending/failed/rolled-back e drift permanecem `UNKNOWN`.
- Permanecem sob revisão obrigatória se não forem comprovadas como aplicadas com sucesso: `20260608000000_drop_legacy_catalog_v2` e `20260722120000_campaign_status_and_opt_out_compatibility`.
- As seis migrations recentes — analytics event/aggregates, `businessSegment`, `operationKey`, `activeDays` e `CustomerExternalIdentity` — são aditivas no source, mas seu estado de produção é desconhecido.
- `PENDING_SAFE_ADDITIVE`, `PENDING_REQUIRES_REVIEW`, `FAILED/PARTIAL` e `DRIFT` não podem ser preenchidas sem a consulta read-only ao banco correto.
- Migration preflight: **BLOCKED** até backup confirmado, consulta de `_prisma_migrations` e verificação de catálogo/schema.

### E0 revocation preflight

- Script: `apps/api/scripts/revoke-all-active-sessions.ts`.
- Comando: `NODE_ENV=production CONFIRM_GLOBAL_SESSION_REVOCATION=true pnpm --filter @gestor/api sessions:revoke-all-production`.
- O compose usa `apps/api/Dockerfile`, que copia explicitamente o script e os `node_modules`; `ts-node`/`tsconfig-paths` são instalados durante o build.
- Runtime execution: **UNKNOWN**. O runner usa `WORKDIR=/app/apps/api`, mas não copia `pnpm-workspace.yaml`/package raiz; portanto, o comando versionado com `pnpm --filter @gestor/api` precisa de uma prova não destrutiva dentro da imagem antes da janela E0. Não assumir silenciosamente o comando direto do package.
- Scope: todas as linhas `AuthSession` com `status=active`, abrangendo os subject types admin, tenant, driver e customer.
- A operação é idempotente por filtrar apenas sessões ativas e observa somente contagens agregadas antes/revogadas/depois.
- Dry-run: **não existe**. Expected row impact: **UNKNOWN** sem consulta ao banco.
- A execução exige os dois guardrails e continua proibida nesta fase. Não usar SQL manual como substituto.

### Checkpoints para futura autorização

1. **A — prerequisites:** sessão read-only no projeto/ambiente Dokploy correto; imagem/SHA/digest; backup recente não vazio e restore testado; presença de envs; `_prisma_migrations`; catálogo/schema; Redis/storage.
2. **B — E0-OPS:** somente após nova autorização, garantir runtime com tooling, rotacionar secrets aprovados sem reintroduzir credencial comprometida, não rotacionar `DB_PASSWORD` sem consumidores mapeados, revogar sessões e validar novas sessões.
3. **C — migration/deploy:** backup → migrations aprovadas pelo `api-migrate` → validar status → ativar exatamente a imagem do RC. Não iniciar runtime novo contra schema antigo.
4. **D — smoke:** health, tenant, storefront, OTP/refresh/logout, Google se configurado, checkouts, availability, WebSocket, driver, analytics/dashboard e Android/API.

### Fail-safe

- Falha antes de migration: manter/reimplantar o artefato anterior sem alterar banco.
- Falha de migration: não ativar o RC; preservar logs e usar recuperação Prisma aprovada, sem SQL improvisado.
- Falha após migration aditiva: preferir rollback da aplicação mantendo schema novo.
- Falha após rotação: gerar/corrigir secrets novos; nunca restaurar secret comprometido.
- Revogação bem-sucedida com login falhando: manter sessões antigas revogadas, retirar tráfego se necessário e corrigir configuração/runtime sem reintroduzir secret antigo.
- WebSocket falhando: reverter aplicação/proxy preservando secrets novos e schema aditivo.
- Google ausente: decisão humana entre bloquear lançamento ou manter Google desabilitado com OTP preservado.

### Blockers do preflight

1. Backup recente/restore point não comprovado.
2. Sem acesso read-only ao PostgreSQL: migrations e drift desconhecidos.
3. Imagem/SHA/digest atualmente implantado não comprovado.
4. Env/config, JWT TTL, CORS/URLs, Redis/storage e rotação E0 desconhecidos.
5. Tooling existe no RC, mas a execução do comando exato no runner e sua presença na imagem atualmente implantada são desconhecidas.

Próxima etapa proposta: fornecer uma sessão operacional autenticada e estritamente read-only ao Dokploy/host/PostgreSQL/backup, ou evidências exportadas equivalentes, para concluir os gates. Mesmo se todos ficarem verdes, parar em `READY FOR WRITE AUTHORIZATION` e aguardar nova autorização explícita.

## 1. Freeze e integridade

| Evidência | Resultado |
|---|---|
| `origin/main-copy` no início | `ff3d602aa8d5aee238abb3b0574d447ac000b6f8` |
| Avanço remoto durante o freeze | Não observado |
| Worktree isolada | `C:\Users\Emerson\Documents\GitHub\Gestor-Delivery-SaaS-PRO-rc` |
| Branch documental | `docs/release-candidate-ff3d602a` |
| Estado inicial da worktree | HEAD exato e árvore limpa |
| Checkout principal | Preservado, inclusive alterações Android preexistentes |
| `stash@{0}` e demais worktrees | Preservados |

### Cadeia de integração

Todas as PRs esperadas estão `MERGED` e seus merge commits são ancestrais do RC.

| PR | Merge commit | Ancestral do RC |
|---|---|---|
| #33 | `6ed4c043e693bac98cb21509e87590f080d599f2` | SIM |
| #34 | `4b979a9d64c7441a31455972c86306893bdd28c0` | SIM |
| #35 | `efbfefa31992fcd5d485067bd0b3323ef56c14e4` | SIM |
| #36 | `2da1d7506b46e97ac9a4fcbdbff01131ecebcb0e` | SIM |
| #37 | `23b67f686029d8f94b377fbad14e46f8514f30de` | SIM |
| #38 | `8d7acb4af96bdebd4647d624f700119a06e6529e` | SIM |
| #39 | `c386a13d9826ee36d60f2dd12cae714905070fc5` | SIM |
| #40 | `940d60f8096aaba87edf4b16fe5fc99dca3bab42` | SIM |
| #41 | `7b9d89c6a0b7f79f79c2a168080a85fec4d44657` | SIM |
| #42 | `b1492d5ee780dee635ee9b68ae6de29c53e46d25` | SIM |
| #43 | `012795d37aeacdff1f345b24a49aa30f23baadf5` | SIM |
| #44 | `0a434924ece44153db215d09c28a1759bbc4da02` | SIM |
| #45 | `7222f947c4202f0c0ca74eb1376f0b9011baf049` | SIM |
| #46 | `785aad147cc55d9a69941979a341e88f90f248fa` | SIM |
| #47 | `7f0f9dea027fa4c5f73e8ffcbb02c621eee43b68` | SIM |
| #48 | `f74db71f03d40c9937ec8f05f6edc86600c873c8` | SIM |
| #49 | `2b943b7bd9bdac7aed47533693534cff6c412ad2` | SIM |
| #50 | `ff3d602aa8d5aee238abb3b0574d447ac000b6f8` | SIM |

## 2. Contratos funcionais

| Contrato | Estado | Evidência versionada principal |
|---|---|---|
| R1 checkout idempotente | PRESENT | `CheckoutSubmitGuard`, chave de idempotência e testes de submissão/fluxo |
| R2 checkout guiado | PRESENT | fluxo e testes de checkout do storefront |
| R2.5 smart showcase | PRESENT | `SmartShowcase` compartilhado e consumido pelo storefront |
| R3 driver auth multi-tenant | PRESENT | autenticação do entregador tenant-bound e testes/auditoria |
| R4 branch creation capability OFF | PRESENT | capability `branches.create` desabilitada e consumida pela UI |
| R5 preview/storefront parity | PRESENT | preview usa payload e componentes compartilhados do storefront |
| R6 mobile safe-area/theme | PRESENT | CSS de safe area, contrato mobile e E2E visual da CI |
| R7 business segment + media | PRESENT | schema/types de `businessSegment` e fallback de mídia compartilhado |
| R8 base-menu import capability OFF | PRESENT | `baseMenu.import` OFF, transação/idempotência e testes |
| R9 product/category availability | PRESENT | `activeDays`, `AvailabilityService`, rotas bulk e testes |
| R10 Google customer identity | PRESENT | `CustomerExternalIdentity` tenant-scoped e linking por OTP |
| Customer Session Hardening | PRESENT | issuer unificado, `sid`, `AuthSession`, rotation e revogação |
| Android branding guard | PRESENT | script guard, nome e identidade canônica verificados |

Nenhum contrato esperado foi classificado como `MISSING` ou `CHANGED`.

## 3. Customer Session Hardening

O fluxo confirmado é:

```text
OTP / Google / primeiro link Google+OTP
                  ↓
       CustomerSessionService
                  ↓
 access 15 min + sid / refresh rotativo single-use
                  ↓
 AuthSession / logout e revogação server-side
```

- `CustomerSessionService` é o emissor comum para OTP, Google vinculado e conclusão do primeiro link.
- Access token herda TTL canônico de 15 minutos e contém `sub`, `tenantId`, `type=customer` e `sid`.
- O hash SHA-256 do refresh é persistido server-side, não o token bruto.
- Rotation consome o refresh atual uma única vez, detecta reuse/family replay e preserva o vencimento absoluto original.
- Logout revoga a sessão; guard valida sessão ativa, expiry, subject, customer e tenant.
- JWT customer legado sem `sid` é rejeitado.
- Guest checkout permanece independente de `AuthSession`.
- O cliente faz refresh single-flight e no máximo um retry após 401; falha definitiva encerra somente a sessão local e preserva carrinho/address draft.

### `RISK-RC-01` — refresh token em Zustand/localStorage

O `refreshToken` ainda integra o estado persistido `customer-storage`. Em cenário de XSS, pode ser exfiltrado. As mitigações presentes são rotation single-use, TTL, `sid`, `AuthSession`, revogação server-side e isolamento tenant/customer.

Classificação: **risco conhecido, aceito e não bloqueante para este RC**.

Follow-up: iniciativa própria para cookie HttpOnly, incluindo desenho de CORS, CSRF e transporte. O transporte não foi alterado neste RC.

## 4. Android

| Item | Resultado |
|---|---|
| Target | `apps/web-tenant/android` |
| App | `PedeHub Lojista` |
| `applicationId` | `com.getcapacitor.app` |
| Namespace atual | `com.getcapacitor.myapp` |
| `My App` ativo | NÃO |
| Branding guard | PRESENT e PASS |
| Identidade alterada nesta auditoria | NÃO |

## 5. Inventário de migrations

Há **55 migrations Prisma** no RC. A CI aplicou o conjunto completo em PostgreSQL efêmero, mas isso não comprova o estado do banco de produção. Sem acesso remoto, nenhuma migration pode ser classificada como atualmente aplicada ou pendente em produção.

Estado de produção de todas as linhas abaixo: **UNKNOWN — MUST VERIFY IN PRODUCTION**. A confirmação deve ser read-only antes de qualquer mutação. `A` = aditiva; `M` = mista/alteração estrutural; `D` = destrutiva. “Runtime” indica a área que passa a depender do schema após ativação do código.

| Migration | Feature/PR | Tipo | Backfill | Runtime | Confirmar | Rollback concern |
|---|---|---:|---:|---|---:|---|
| `20260524065825_` | baseline histórico | A | não | sistema inteiro | SIM | não reverter baseline |
| `20260525032531_add_quick_replies` | quick replies | A | não | WhatsApp/chat | SIM | manter schema novo |
| `20260525120000_add_google_ai_provider` | AI provider | A | não | agente IA | SIM | enum/schema |
| `20260527_fix_notification_sounds` | notificações | M | sim | tenant settings | SIM | DML; restaurar por backup |
| `20260527222954_add_memory_config_fields` | agente IA | M | não | tenant settings | SIM | defaults alterados |
| `20260528090658_ai_agent_layered_config` | agente IA | A | não | agente IA | SIM | schema novo |
| `20260531185153_billing_foundation` | billing | M | não | billing | SIM | remove índice legado |
| `20260531233000_billing_cycle_idempotency` | billing | A | não | billing | SIM | constraint/idempotência |
| `20260601090000_billing_payment_foundation` | billing | A | não | pagamentos | SIM | schema financeiro |
| `20260602090000_customer_addresses` | checkout | A | não | endereço/checkout | SIM | dados novos |
| `20260602153000_ai_provider_runtime_resolution` | agente IA | M | não | agente IA | SIM | default de modelo |
| `20260604_add_handoff_and_ready_sounds` | notificações | M | sim | tenant settings | SIM | DML + NOT NULL |
| `20260604051648_add_handoff_and_ready_sounds` | mídia/notificações | M | não | tenant settings/media | SIM | mudança de tipo |
| `20260604120000_add_scheduling_settings_windows_order_schedule_fields` | scheduling | A | não | scheduling/orders | SIM | schema novo |
| `20260605220000_alter_whatsapp_instance_phone_number_length` | WhatsApp | M | não | WhatsApp | SIM | mudança de tipo |
| `20260607210500_add_fractional_pricing_v3` | catálogo | A | não | preços | SIM | schema novo |
| `20260608000000_drop_legacy_catalog_v2` | catálogo legado | D | não | catálogo | SIM | **DROP TABLE; não reverter automaticamente** |
| `20260609090000_phase9_campaign_automation_metrics` | campanhas | A | não | campanhas | SIM | schema novo |
| `20260609100000_phase10_loyalty_wallet` | loyalty/wallet | A | não | loyalty | SIM | ledger novo |
| `20260609173000_phase12_crm_enterprise` | CRM | A | não | CRM | SIM | schema novo |
| `20260610090000_billing_ledger_foundation` | billing ledger | M | sim | billing | SIM | DML/ledger; backup |
| `20260610093000_add_billing_audit_permission` | RBAC billing | M | sim | autorização | SIM | seed de permissão |
| `20260610120000_session_security_webhooks` | sessões/webhooks | A | não | auth/webhooks | SIM | schema novo |
| `20260614190000_phase13_storefront_commercial_improvements` | storefront | A | não | storefront | SIM | schema novo |
| `20260615120000_base_menu_templates_db` | base menu | A | não | base menu | SIM | templates persistidos |
| `20260615153000_add_base_menu_manage_permission` | RBAC base menu | M | sim | autorização | SIM | seed de permissão |
| `20260618013000_professional_printing_devices` | printing | M | não | impressão | SIM | constraint/nullable |
| `20260618065552_marketplace_ifood_p1` | iFood | M | não | marketplace/orders | SIM | tipo/default |
| `20260619113000_formalize_business_group_network` | business group | M | sim | tenant/network | SIM | DML relacional |
| `20260619120000_add_system_app_name` | branding | A | não | system config | SIM | schema novo |
| `20260619153000_monetization_p1_foundation` | monetização | M | sim | billing | SIM | DML financeiro |
| `20260620120000_tenant_feature_entitlement_overrides` | entitlements | A | não | feature control | SIM | schema novo |
| `20260621120000_storefront_public_settings_controls` | storefront | M | não | storefront | SIM | defaults alterados |
| `20260625090000_add_openrouter_fields` | OpenRouter | A | não | agente IA | SIM | schema novo |
| `20260625110000_sync_production_db_drift` | drift histórico | A | não | automações/feedback | SIM | confirmar intenção histórica |
| `20260627120000_delivery_estimated_minutes` | delivery | A | não | delivery/checkout | SIM | schema novo |
| `20260628110000_add_openrouter_provider_enum` | OpenRouter | A | não | agente IA | SIM | enum novo |
| `20260629150000_onboarding_order_modes` | onboarding | A | não | onboarding | SIM | schema novo |
| `20260630140000_feature_global_settings` | feature control | A | não | admin/features | SIM | schema novo |
| `20260630180000_feature_tenant_overrides` | feature control | A | não | tenant/features | SIM | schema novo |
| `20260708163000_order_auto_accept_mvp` | auto accept | M | sim | orders/RBAC | SIM | seed de permissão |
| `20260715234118_create_push_subscriptions` | push | A | não | notificações | SIM | schema novo |
| `20260716050000_marketplace_bidirectional_operations` | marketplace | A | não | marketplace | SIM | schema operacional |
| `20260716150000_marketplace_reconciliation_operations` | marketplace | M | sim | reconciliação | SIM | DML + NOT NULL |
| `20260716190000_ifood_polling_fallback` | iFood | A | não | marketplace | SIM | schema novo |
| `20260716210000_add_system_config_platform_logo_media` | branding/media | A | não | system config | SIM | FK novo |
| `20260722090000_add_order_table_relation` | pedidos/mesas | M | sim | orders | SIM | DML relacional |
| `20260722120000_campaign_status_and_opt_out_compatibility` | campanhas | D/M | sim | campanhas | SIM | **enum rewrite + DML; revisão operacional** |
| `20260729120000_add_analytics_event_ingestion` | analytics / #30 | A | não | ingestão analytics | SIM | backward-compatible |
| `20260729180000_add_analytics_daily_aggregates` | analytics / #30 | A | não | agregação analytics | SIM | backward-compatible |
| `20260803120000_add_business_segment_to_tenant_settings` | R7 / #45 | A | não | business segment | SIM | backward-compatible |
| `20260803183000_add_base_menu_import_operation_key` | R8 / #46 | A | não | idempotência base menu | SIM | backward-compatible |
| `20260803210000_add_active_days_to_product_categories` | R9 / #47 | A | não | availability | SIM | default `[]`; backward-compatible |
| `20260804030000_add_customer_external_identities` | R10 / #48 | A | não | Google identity | SIM | backward-compatible |
| `p9_add_performance_indices` | performance | A | não | consultas | SIM | índices; custo/lock ao aplicar |

### Classificação operacional

- `CONFIRMED APPLIED` em produção: **nenhuma**, por ausência de evidência versionada atual do alvo.
- `CONFIRMED PENDING` em produção: **nenhuma**, pelo mesmo motivo.
- `UNKNOWN — MUST VERIFY IN PRODUCTION`: **55**.
- As seis migrations mais recentes são aditivas e não exigem backfill explícito.
- O histórico contém migration destrutiva (`drop_legacy_catalog_v2`) e migration operacionalmente complexa (`campaign_status_and_opt_out_compatibility`). Sua mera presença não prova pendência. Se o status read-only indicar qualquer uma pendente, o deploy fica **BLOQUEADO PARA REVISÃO OPERACIONAL**.
- Para migrations aditivas desconhecidas: **PRE-DEPLOY REQUIRED CHECK**.

### Gates de schema/migration

| Gate | Resultado |
|---|---|
| `pnpm db:generate` | PASS, exit 0 |
| Atalho raiz `pnpm prisma:validate` | FAIL, exit 1: wrapper não localiza o binário e exige `DIRECT_URL` |
| `pnpm --filter @gestor/api exec prisma validate` com URLs locais sintéticas | PASS, exit 0; nenhuma conexão remota |
| PostgreSQL efêmero local | ENVIRONMENT BLOCKED: daemon Docker indisponível |
| PostgreSQL efêmero CI | PASS no tree idêntico; migrate, analytics e smokes verdes |

`RC-DEBT-02`: corrigir separadamente o wrapper raiz de `prisma:validate`. Não bloqueia este RC porque o comando canônico validou o schema e a CI aplicou todas as migrations no mesmo tree.

## 6. Configuração de produção

Nenhum valor real ou secreto foi lido ou impresso. “Exemplo” indica apenas que o repositório documenta a chave/placeholder; não comprova configuração real.

| Variable/grupo | Componente | Obrigatória | Secret | Exemplo | Ausência segura | Failure mode | Verificar |
|---|---|---:|---:|---:|---:|---|---:|
| `DATABASE_URL` | API/Prisma | SIM | SIM | SIM | NÃO | API/migrations não conectam | SIM |
| `DIRECT_URL` | Prisma/migrate | SIM | SIM | SIM | NÃO | entrypoint/migrate falha | SIM |
| `DB_*` / dependências da senha | PostgreSQL/Dokploy | conforme composição | SIM | SIM | NÃO | conexão quebrada após rotação | SIM |
| `JWT_SECRET` | API | SIM | SIM | SIM | NÃO | startup/auth inseguro ou falha | SIM |
| `JWT_REFRESH_SECRET` | API | SIM | SIM | SIM | NÃO | refresh/revogação incompatível | SIM |
| `JWT_EXPIRES_IN` | API | SIM, fixar `15m` | NÃO | SIM | default existe | drift do contrato | SIM |
| `JWT_REFRESH_EXPIRES_IN` | API | SIM, fixar política | NÃO | SIM | default `7d` existe | drift de lifetime | SIM |
| `CORS_ORIGINS` | API/proxy | SIM | NÃO | SIM | NÃO em produção | browser bloqueado ou origem ampla | SIM |
| `GOOGLE_CLIENT_ID` | API | somente Google | NÃO | SIM | SIM se Google OFF | Google login indisponível | SIM |
| `VITE_GOOGLE_CLIENT_ID` | storefront build | somente Google | NÃO | SIM | SIM se Google OFF | botão/fluxo Google indisponível | SIM |
| `VITE_API_URL` | frontends | SIM | NÃO | SIM | NÃO | chamadas apontam para host incorreto/localhost | SIM |
| `VITE_WS_URL` | tenant/delivery | SIM | NÃO | SIM | NÃO para realtime | WebSocket não conecta | SIM |
| `PUBLIC_API_URL` | API/links | SIM | NÃO | SIM | depende do fluxo | links/callbacks incorretos | SIM |
| `WEB_TENANT_URL` | API/web | SIM | NÃO | SIM | NÃO | links/origins incorretos | SIM |
| `WEB_ADMIN_URL` | API/web | SIM | NÃO | SIM | conforme uso | admin/callback incorreto | SIM |
| `WEB_STOREFRONT_URL` / `VITE_STOREFRONT_BASE_URL` | storefront/tenant | SIM | NÃO | SIM | NÃO | preview/link público incorreto | SIM |
| `VITE_TENANT_URL` | storefront/tenant | conforme fluxo | NÃO | SIM | depende do fluxo | retorno ao painel incorreto | SIM |
| `REDIS_ENABLED`, host/port/password/TLS | API | SIM para cache/jobs habilitados | senha: SIM | SIM | somente com recursos OFF | cache, filas e realtime auxiliares degradam | SIM |
| `BULLMQ_ENABLED`, campaign switches | jobs | conforme features | NÃO | SIM | SIM se jobs OFF | jobs/campanhas não processam | SIM |
| `STORAGE_DRIVER`/`MEDIA_STORAGE_DRIVER` + R2 | upload/media | SIM para mídia persistente | credenciais: SIM | SIM | NÃO em produção persistente | upload/perda de mídia local | SIM |

Notas obrigatórias:

- O compose permite fallback `CORS_ORIGINS=*`; isso não é aceitável como configuração final de produção.
- URLs Vite são compiladas no bundle e precisam apontar para HTTPS público; `localhost` no Android significa o próprio dispositivo.
- Backend e frontend Google devem usar client ID compatível. Estado real dos dois: **UNKNOWN**.
- `GOOGLE AUTH = CODE READY / PRODUCTION CONFIG PENDING`.

## 7. Segurança e E0

| Controle | Estado |
|---|---|
| E0 code containment | MERGED pela #35 |
| Gitleaks | Ativo e verde no RC |
| Revocation tooling | Empacotado na imagem/API; protegido por `NODE_ENV=production` e confirmação explícita |
| E0-OPS | NÃO EXECUTADO; PRE-GO-LIVE BLOCKER |
| E0H | Follow-up histórico separado; não executar implicitamente |
| Secrets expostos nesta auditoria | NENHUM |

E0-OPS, quando autorizado em janela separada, deve confirmar imagem/SHA, comprovar rotação real dos secrets aplicáveis, mapear todos os consumidores de `DB_PASSWORD` antes de rotacioná-la, revogar `AuthSession` globalmente e executar smoke de novo login/refresh/logout/WebSocket. Nada disso foi executado aqui.

## 8. CI do RC

| Prova | Resultado |
|---|---|
| CI pós-merge do SHA, run `31300824997` | SUCCESS |
| `build-and-migrate` | SUCCESS |
| Prisma migrate em PostgreSQL efêmero | SUCCESS |
| analytics com PostgreSQL + Redis | SUCCESS |
| `dashboard-theme-e2e` | SUCCESS |
| `notification-audio-e2e` + mobile safe-area | SUCCESS |
| `storefront-consent-e2e` | SUCCESS |
| `smoke-with-ephemeral-seed` | SUCCESS |
| Gitleaks, run `31300824990` | SUCCESS |
| Secret scanning push, run `31300823609` | SUCCESS |
| Branding guard | SUCCESS dentro de `build-and-migrate` |
| Prova PostgreSQL pré-merge, run `31246727716` | SUCCESS |
| PR tree | `d4cf7960322101440176f771c6bae2f3d1e0b3fc` |
| Merge tree | `d4cf7960322101440176f771c6bae2f3d1e0b3fc` |
| Equivalência | EXATA |

`CI-DEBT-01`: algumas GitHub Actions emitem aviso de depreciação do runtime Node 20. Risco aceito, não bloqueante; atualizar as actions em manutenção separada.

## 9. Gates locais

| Gate | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | PASS, exit 0 |
| `pnpm db:generate` | PASS, exit 0 |
| `pnpm lint` | PASS, exit 0; 17 warnings preexistentes no storefront |
| `pnpm typecheck` | PASS, exit 0 |
| `pnpm check:no-any` | PASS, exit 0 |
| `pnpm check:features` | PASS, exit 0; avisos conhecidos de features beta/credenciais |
| `pnpm check:android-tenant-branding` | PASS, exit 0 |
| Customer auth/session | PASS, 4 suites/25 testes |
| Availability | PASS, 1 suite/3 testes |
| Base-menu import | PASS, 2 suites/8 testes |
| Storefront | PASS, 12 arquivos/63 testes |
| Web-tenant | PASS, 18 arquivos/80 testes |
| Build shared packages | PASS |
| Build API | PASS |
| Build web-tenant | PASS |
| Build web-storefront | PASS |
| Build web-delivery | PASS |
| `git diff --check` antes da documentação | PASS, exit 0 |

Warnings não bloqueantes: configuração antiga do `ts-jest`, loader/config do Vite e tamanho de chunks.

## 10. Dependências operacionais

| Dependência | Obrigatória | Evidência no repo | Pre-deploy | Smoke | Rollback concern |
|---|---:|---|---|---|---|
| PostgreSQL | SIM | Prisma, compose, entrypoint | backup não vazio, restore point, status read-only, conexão | health + leitura/escrita controlada tenant-scoped | não fazer rollback destrutivo automático |
| Redis | para cache/jobs habilitados | config/compose/BullMQ | conexão, auth/TLS, políticas de feature | cache/filas e WebSocket relacionado | desabilitar jobs com kill switch se necessário |
| WebSocket | SIM para realtime | Socket.IO/gateways/frontends | URL HTTPS/WSS, origem/proxy | conexão autenticada e eventos | reverter app/proxy; preservar sessões coerentes |
| Storage/upload | SIM para mídia persistente | drivers local/R2 | bucket, credenciais, public URL | upload e leitura | não perder objetos; preservar compatibilidade de URL |
| Google OAuth | se requisito de lançamento | backend + storefront R10 | IDs reais e domínio/origens autorizados | login já vinculado e first-link | desligar Google sem afetar OTP |
| Dokploy/imagem | SIM | Dockerfile, compose e runbook | imagem imutável vinculada ao SHA | startup/health/logs | redeploy da imagem anterior |
| Domains/TLS/proxy | SIM | URLs/CORS/runbook | DNS, certificados, headers e origins | HTTPS/WSS por domínio público | reverter rotas sem mudar DB |

## 11. Runbook operacional documentado

### Phase 0 — freeze e pré-condições

1. Reconfirmar que imagem e artefatos correspondem exatamente a `ff3d602a`.
2. Reconfirmar CI verde.
3. Criar backup não vazio e restore point testável.
4. Verificar env/config sem imprimir secrets.
5. Consultar read-only o status de todas as migrations e interromper se uma migration destrutiva/backfill não revisada estiver pendente.

### Phase 1 — E0-OPS, somente com autorização própria

6. Validar que a imagem contém o tooling de revogação.
7. Comprovar rotação real dos secrets necessários.
8. Mapear dependências de `DB_PASSWORD` antes de qualquer rotação.
9. Revogar sessões globalmente somente após confirmação explícita.
10. Fazer smoke de novo login, refresh, logout e WebSocket.

### Phase 2/3 — staging da imagem, migrations e ativação

11. Fixar/stagear exatamente a imagem do RC; rejeitar SHA diferente.
12. **Não ativar o novo runtime contra schema antigo.** O “deploy” anterior às migrations significa apenas preparar a imagem.
13. Executar `prisma migrate deploy` pelo serviço operacional aprovado (`api-migrate`), somente após backup e inventário; nunca `db push` ou SQL improvisado.
14. Validar `_prisma_migrations` e ausência de falha.
15. Ativar/reiniciar a aplicação com a imagem do RC e observar startup/health.

Esta ordem resolve o conflito entre o rótulo “deploy → migrations” e o runbook Dokploy: **E0-OPS → stage da imagem → migrations → ativação do deploy → smoke**. Ativar o RC antes do schema é proibido quando o runtime depende de colunas/tabelas novas.

### Phase 4 — smoke de produção

16. Health/API.
17. Tenant admin.
18. Storefront guest.
19. Customer OTP, refresh e logout/revogação.
20. Google somente se a configuração real estiver pronta.
21. Checkout guest e autenticado.
22. Availability de produto/categoria.
23. WebSocket.
24. Driver auth.
25. Dashboard/analytics.
26. Compatibilidade Android/API.
27. Upload/mídia quando aplicável.

### Phase 5 — decisão

28. Declarar GO somente se todos os gates operacionais e smokes forem verdes; em qualquer falha, NO-GO e executar o fail-safe aplicável.

## 12. Rollback e fail-safe

- Antes de migrations: falha no staging/deploy deve reter ou reativar a imagem anterior; nenhum rollback de DB é necessário.
- Após migrations aditivas recentes: preferir rollback da aplicação para a imagem anterior mantendo o schema novo. As seis migrations recentes são backward-compatible por desenho.
- Não reverter automaticamente DDL/DML histórico, enums, drops, ledgers, permissions ou backfills. Restaurar banco somente por decisão operacional explícita e restore point validado.
- Se migration falhar parcialmente, não iniciar o novo app; preservar logs, consultar `_prisma_migrations` e seguir recuperação Prisma aprovada, sem SQL improvisado.
- Se o app iniciar mas o smoke falhar, retirar tráfego/reimplantar imagem anterior; manter schema aditivo e investigar offline.
- Google pode ser considerado indisponível sem bloquear OTP, desde que a decisão de lançamento aceite Google OFF.
- Jobs/campanhas devem permanecer sob seus kill switches durante diagnóstico quando houver risco de processamento assíncrono.

## 13. Bloqueios de Go-Live e riscos aceitos

### Bloqueios operacionais

1. E0-OPS ainda não executado.
2. Backup/restore point e estado real das migrations de produção ainda não confirmados.
3. Env/config real, incluindo CORS, URLs, JWT, DB, Redis/storage e Google se exigido, ainda não confirmado.
4. Deploy controlado do SHA não realizado.
5. Smoke de produção não realizado.

### Riscos/dívidas aceitos para o RC

1. `RISK-RC-01`: refresh token persistido em Zustand/localStorage.
2. `CI-DEBT-01`: depreciação futura do runtime Node 20 em GitHub Actions.
3. `RC-DEBT-02`: wrapper raiz de `prisma:validate` incorreto; validação canônica e CI passaram.
4. Estado operacional de produção permanece desconhecido por design desta auditoria sem acesso remoto.

## 14. Decisão

**RC APROVADO — código, migrations, configuração e riscos inventariados; SHA `ff3d602a` congelado; cadeia #33–#50 íntegra; contratos presentes; CI e gates proporcionais verdes; runbook operacional e fail-safe prontos. Go-Live permanece bloqueado até autorização e conclusão de E0-OPS, confirmação/aplicação das migrations, deploy e smoke de produção.**
