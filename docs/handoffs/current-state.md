# Estado Atual — Handoff

> **Sessão:** Sprint 4 — Agendamento Production-Ready
> **Data:** 2026-07-16
> **Branch:** `main-copy`
> **Commit inicial:** `b73fa2878c212d9b8b2c62f57bb255fd9ed568e1`
> **Commits produzidos:** nenhum (alterações permanecem no working tree)

---

## 1. Objetivo e estado inicial

Concluir o menor fluxo seguro de agendamento entre painel tenant, storefront, checkout, pedidos e banco, sem redesenhar o domínio.

| Componente | Estado inicial | Gap principal |
|------------|----------------|---------------|
| Controller | CRUD de settings/janelas parcial | Cinco endpoints lançavam `NotImplementedException` |
| Service | Slots e scheduled orders parciais | Sem conflito de janelas e com mutações cross-tenant inseguras em alguns caminhos |
| Checkout | Consulta prévia de capacidade | Instante não precisava coincidir com o slot e reserva ocorria após criar o pedido |
| Concorrência | Read-then-increment | Overbooking da última vaga e pedido parcial possíveis |
| Storefront | Selector integrado | Enviava somente a data local, formatava no timezone do navegador e não atualizava slot vencido |
| Feature | Catálogo `stable`, matriz `Stub` | Classificação contraditória |
| Prisma | Migration de scheduling existente | Prisma Client não gerava por relação inversa ausente em `MediaAsset` (gap preexistente) |

Baseline:

| Comando | Resultado |
|---------|-----------|
| `pnpm lint` | Executado com falha — warning preexistente em `web-admin/IntegrationsPage.tsx` com `max-warnings=0` |
| `pnpm typecheck` | Executado com falha — Prisma Client desatualizado/relação `platformLogoMedia` incompleta |
| `pnpm build` | Executado com falha — mesmos erros do Prisma Client |
| `pnpm check:features` | Executado com sucesso — scheduling ainda aparecia entre controllers com stubs |

## 2. Alterações e decisões

### Backend

- Implementados os stubs de CRUD manual de slots e consulta/edição de scheduled order.
- Settings e janelas continuam protegidos por `TenantAuthGuard`, `PermissionsGuard` e permissões de scheduling.
- Validação de janelas agora rejeita formato inválido, duplicidade/sobreposição e horários que cruzam meia-noite.
- `TenantSettings.timezone` tornou-se a autoridade; `SchedulingSettings.timezone` é fallback legado.
- Gerador não cria slot parcial no fim da janela, reativa intervalos existentes e desativa slots fora das janelas atuais.
- Checkout revalida feature efetiva, settings, modalidade, tenant, loja, slot, instante exato, janela, antecedência, horizonte e capacidade.
- Pedido, `ScheduledOrder` e ocupação do slot são criados na mesma transação. `SELECT ... FOR UPDATE` serializa checkouts concorrentes.
- Cancelamento do pedido ou do agendamento libera capacidade de forma transacional e tenant-safe.
- Feature `scheduling` foi classificada como `beta`, nunca `stable`.
- Logs estruturados/contextuais foram adicionados; request/correlation ID continua fornecido pelo interceptor HTTP global.

### Frontend tenant

- Rota e item de navegação passaram a respeitar `FeatureGate('scheduling')` e permissão.
- Formulário mostra timezone da loja, valida janela antes de enviar, confirma exclusão, mostra falha de carga e permite retry.
- Adicionado teste de validação de janela normal/inválida/cross-midnight.

### Storefront

- Selector usa data e formatação no timezone da loja, respeita horizonte máximo e envia o ISO de `slot.startTime`.
- Mudança de modalidade limpa o agendamento.
- Erro de slot/capacidade preserva o checkout, limpa somente a seleção e força atualização dos slots.
- Payload público só anuncia scheduling quando a feature efetiva e settings estão habilitados.

### Banco e migrations

- **Nenhuma migration nova de scheduling.** A modelagem necessária já está coberta por:
  - `20260604120000_add_scheduling_settings_windows_order_schedule_fields`
  - `20260629150000_onboarding_order_modes`
- Schema recebeu somente a relação inversa Prisma `MediaAsset.systemConfigs`, sem alteração física de banco, para permitir `prisma generate/validate` do estado já declarado em `SystemConfig`.
- Não foi usado `prisma db push`.

## 3. Contratos e documentação

- Criado `docs/contracts/scheduling.md` como contrato canônico.
- Atualizados `docs/README.md`, `docs/scheduling-audit.md`, `docs/product/feature-matrix.md` e `docs/product/known-gaps.md`.
- Contratos relacionados preservados: isolamento de tenant, lifecycle de pedidos, feature flags e migrations.

## 4. Testes e gates finais

| Comando | Resultado |
|---------|-----------|
| `pnpm lint` | Executado com sucesso — 16 warnings preexistentes permitidos no storefront, sem erros |
| `pnpm typecheck` | Executado com sucesso |
| `pnpm build` | Executado com sucesso |
| `pnpm check:features` | Executado com sucesso — nenhum `NotImplementedException` em scheduling |
| `pnpm check:no-any` | Executado com sucesso |
| `pnpm prisma:validate` | Executado com sucesso |
| Testes específicos API (scheduling + storefront slots) | Executado com sucesso |
| `pnpm --filter @gestor/web-tenant test` | Executado com sucesso — 12 testes |
| `pnpm --filter @gestor/web-storefront test` | Executado com sucesso — 1 teste |
| `pnpm test` | Executado com falha — 2 testes preexistentes de `web-admin/BaseMenusPage` falharam; testes tenant/storefront passaram |
| `pnpm --filter @gestor/api test` | Executado com falha — falhas preexistentes em location, billing webhook e AI conversation; o teste de storefront afetado foi corrigido e passa |

## 5. Validação manual

| Cenário | Resultado |
|---------|-----------|
| Fluxo E2E com criação de janelas/pedidos em banco local | Bloqueado por dependência externa — `DATABASE_URL` disponível aponta para banco remoto e não foi usado para escrita sem ambiente isolado autorizado |
| Concorrência da última vaga | Executado com sucesso em teste transacional — lock ocorre antes da leitura e pedido não é criado quando a capacidade está cheia |
| Cross-tenant | Executado com sucesso em teste — slot de outro tenant é rejeitado sem criação parcial |
| Timezone `America/Sao_Paulo` | Executado com sucesso em testes API/frontend — data local e UTC validados |

A homologação manual de Push Notifications da Sprint 3 permanece pendente e não foi alterada.

## 6. Riscos e gaps residuais

| Gap | Severidade | Recomendação |
|-----|-----------|-------------|
| Capacidade compartilhada entre delivery/pickup | Média | Adicionar modalidade à modelagem somente após decisão de produto e migration em etapas |
| Sem feriados/bloqueios ad hoc | Média | Criar exceções tenant-safe em sprint futura |
| Pedido agendado aparece imediatamente e pode ser confirmado cedo | Média | Deliberar job idempotente de ativação operacional |
| Reschedule exige cancelar e recriar | Baixa | Implementar troca de slot com locks ordenados em sprint futura |
| Sem unique constraint de intervalo para geração concorrente | Baixa | Deduplicar dados e adicionar constraint em migration segura |
| Cache do payload pode demorar até o TTL para esconder toggle recém-desabilitado | Baixa | Invalidar cache na mudança; checkout já bloqueia imediatamente |
| Suíte completa contém falhas fora de scheduling | Média | Corrigir BaseMenus, location mock, webhook HMAC e conversation mocks separadamente |

## 7. Próximo passo recomendado

Provisionar PostgreSQL local/efêmero com dados de dois tenants, aplicar `prisma migrate deploy` e executar a homologação manual de 15 passos descrita na Sprint 4. Depois, corrigir as falhas preexistentes da suíte completa. Não iniciar Sprint 5 antes dessa homologação.
