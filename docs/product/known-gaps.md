---
title: Limitações e Gaps Conhecidos
status: current
owner: engineering
last_verified: 2026-07-23
verified_against: main-copy / 78daea7a
---

# Gaps Conhecidos e Limitações (Known Gaps)

> Documentação das limitações técnicas e funcionais da plataforma atual, identificadas por auditorias ou débitos técnicos explícitos no código.

---

## Agendamento (Beta)

| Gap | Severidade | Impacto / recomendação |
|-----|-----------|------------------------|
| Slots não distinguem entrega e retirada | Média | A capacidade é compartilhada; modelar modalidade somente após validação de produto. |
| Sem feriados ou bloqueios ad hoc | Média | Fechamentos dependem dos horários operacionais; criar modelo de exceção em sprint futura. |
| Sem ativação operacional por proximidade do horário | Média | Pedido agendado aparece imediatamente; avaliar job idempotente antes de automatizar. |
| Alteração de data/slot exige cancelar e recriar | Baixa | Preserva consistência de capacidade; adicionar reschedule transacional futuramente. |
| Geração concorrente não possui constraint única de intervalo | Baixa | Operação normal é idempotente em aplicação; avaliar migration com deduplicação segura. |

## iFood bidirecional (Beta)

| Gap | Severidade | Impacto / recomendação |
|---|---|---|
| Homologação oficial pendente | Alta | Confirmação, cancelamento, OAuth e HMAC estão cobertos por mocks contratuais, mas exigem tenant/merchant oficial e evidências do portal iFood antes de produção. |
| Credenciais legadas em texto puro não são migradas automaticamente | Alta | O runtime falha fechado; reconectar cada integração para gravar tokens com AES-256-GCM. |
| UI visual de reconciliação ausente | Baixa | Endpoints SaaS Admin protegidos cobrem listagem, detalhe, histórico, retry, reconhecimento e métricas; dashboard visual permanece opcional. |
| Ingestão usa o payload do evento como detalhe quando disponível | Média | Avaliar busca oficial completa por tipo de evento na homologação sem ampliar a Sprint 5A. |
| Sem exportador Prometheus e plataforma externa de alertas | Média | Métricas por tenant, logs estruturados, divergências e readiness existem; integrar alert manager externo antes de produção em escala. |
| Polling ainda não homologado no ambiente oficial | Alta | Implementação agrupa merchants por token/device, persiste antes do ACK e limita headers/lotes; manter desligado até evidência com merchant oficial. |
| Incidente histórico de `DIRECT_URL` em validação | Alta | A migration aditiva de branding corrigiu o drift local; antes de staging/produção, o responsável pelo banco deve identificar formalmente o alvo remoto afetado, auditar `_prisma_migrations`, confirmar backup e confirmar que somente 5A–5C foram aplicadas. Não executar novas migrations remotas até essa evidência. |
| Alerta externo e dashboard visual ausentes | Média | Readiness e métricas sanitizadas existem, mas o canal on-call ainda depende do provedor de logs. |

---

## 1. Notificações Push — Implementadas (gaps remanescentes)

- **Severidade dos gaps:** Média
- **Componente:** `NotificationsModule` (`apps/api/src/notifications/`)
- **Status:** ✅ Implementado desde 2026-07-15 (migration `20260715234118_create_push_subscriptions`)
- **Implementação:**
  - `PushService` usa `web-push` real com VAPID; entra em modo degradado (warn) sem chaves
  - `PushSubscriptionService` com upsert e unique `(tenantId, recipientId, recipientType, endpoint)`
  - `PushNotificationProcessor` (BullMQ) com `findMany` tenant-scoped e remoção de subscriptions expiradas (HTTP 404/410)
  - Contrato: `docs/contracts/push-notifications.md`
- **Gaps remanescentes:**

| Gap | Severidade | Recomendação |
|-----|-----------|-------------|
| Push para `tenant_user` (staff) não implementado | Média | Adicionar `recipientType: 'tenant_user'` no processor e endpoints |
| Notificação de cancelamento de pedido para entregador ausente | Média | Disparar em `OrdersService` ao cancelar pedido com driver atribuído |
| Sem teste E2E automatizado do fluxo completo | Alta | Criar spec com service worker mockado e validar envio real |


## 2. Timezone Hardcoded em Automações (RESOLVIDO)

- **Severidade:** Resolvido (anteriormente Alta)
- **Componente:** `CampaignProcessor` (`apps/api/src/campaigns/services/campaign.processor.ts`)
- **Resolução:** A janela de silêncio (08h às 21h) agora respeita a configuração de `timezone` definida no `TenantSettings`. Configuração ausente ou timezone IANA inválido usa explicitamente `America/Sao_Paulo`, sem depender do timezone do host e sem derrubar o worker.

## 3. Swagger Inconsistente

- **Severidade:** Baixa
- **Componente:** `apps/api/src/main.ts`
- **Problema:** O Swagger está renomeado para `PedeHub API` invés de usar variáveis globais e reflete documentação parcialmente abandonada (desabilitado por padrão no `.env.example`).
- **Impacto:** Dificulta a auto-documentação real da API para clientes externos se a documentação for exposta.
- **Ação:** Refatorar init do Swagger para consumir variáveis de pacote ou remover menções a projetos passados.

## 4. Vazamento Potencial de Chaves Locais (.env)

- **Severidade:** Crítica (se houver chaves reais)
- **Componente:** `apps/api/.env`
- **Problema:** O arquivo de desenvolvimento pode conter chaves copiadas ou injetadas pela equipe. 
- **Ação:** Garantir que o `.gitignore` não permita commits, rotacionar qualquer credencial exposta acidentalmente no histórico.

## 5. Zonas de Entrega Beta e Neighborhood Coming Soon

- **Severidade:** Média
- **Componente:** Catálogo de Entrega
- **Problema:** Apenas a entrega por `raio` (distância circular) é `stable`. Zonas desenhadas (polígonos) são `beta` e regras tarifárias por Bairro estão como `coming_soon`, o que é restritivo no Brasil, onde a tabela de bairro é o modelo logístico mais comum.
- **Impacto:** Alguns restaurantes podem ter dificuldade de embarcar sem o modelo logístico que já utilizam.
- **Ação:** Priorizar a implantação e homologação do módulo `delivery_neighborhood`.

## 6. BullMQ e Redis Opcionais

- **Severidade:** Arquitetural (Trade-off intencional)
- **Componente:** `redis` e automações.
- **Problema:** Para reduzir barreira de adoção, o sistema roda sem Redis, mas isso desabilita as automações de Marketing (Campanhas) e Webhooks robustos.
- **Impacto:** Sem Redis ativado em produção, lojas não terão features avançadas disponíveis.
- **Ação:** Manter configurável, mas alertar de forma visual no SaaS Admin caso a instalação esteja sem Redis.

## 7. Scripts de Manutenção — RESOLVIDO

- **Severidade anterior:** Alta
- **Componente:** `clean_schema.js`, `clean_schema2.js`
- **Status:** ✅ **RESOLVIDO em 2026-07-23**
- **Ação tomada:**
  - Scripts movidos para `scripts/maintenance/` com:
    - Barreira `--force` obrigatória
    - Falha fechada em `NODE_ENV=production`
    - Verificação de existência do schema antes de executar
    - README com instruções de uso seguro
  - Scripts originais removidos da raiz do repositório
- **Nota:** `drop_models.js` não existe mais na raiz (verificado em 2026-07-23).

## 8. Operação de loja

| Gap | Severidade | Impacto / recomendação |
|---|---|---|
| Remoção do legado `tableNumber` | Média | `Order.tableId` já é nullable e dual-write está ativo; `tableNumber` permanece como snapshot histórico. A remoção exige rollout separado e migration destrutiva aprovada. |
| Mesa inativa não pode ser representada | Baixa | O enum atual possui somente `free`, `occupied` e `waiting_bill`; uma flag/estado inativo exige migration e revisão de UI. |
| Bridge USB/rede nativa ausente | Baixa | QZ Tray, Bluetooth e o fallback do navegador são opcionais; não introduzir bridge sem desenho de segurança e operação. |
| KDS depende de polling quando WebSocket/Redis não estão disponíveis | Baixa | A UI atualiza a cada 10 segundos; manter o polling como fallback até existir observabilidade operacional de tempo real. |
