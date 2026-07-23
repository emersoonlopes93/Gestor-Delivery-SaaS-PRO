# Contrato — Feature Flags e Feature Control

> **Status:** Estável  
> **Última revisão:** 2026-07-23  
> **Verificado contra:** `main-copy / 78daea7a`  
> **Fonte canônica:** `packages/core/src/constants/features.ts`

---

## 1. Catálogo de features

O catálogo é a **única fonte de verdade** para o status de cada feature. Está em:

```
packages/core/src/constants/features.ts
```

Cada feature tem:

```typescript
interface FeatureDefinition {
  key: string;           // identificador único
  name: string;          // nome legível
  status: 'stable' | 'beta' | 'coming_soon' | 'stub';
  module: string;        // módulo NestJS responsável
  requiredPermission?: string;
}
```

---

## 2. Status possíveis

| Status | Significado | Padrão em produção |
|--------|-------------|-------------------|
| `stable` | Implementado, testado, apto para produção | Ativo |
| `beta` | Implementado mas sujeito a mudanças | Inativo (requer override) |
| `coming_soon` | Planejado ou em desenvolvimento ativo | Inativo |
| `stub` | Declarado sem implementação real | Inativo |

---

## 3. Resolução de acesso (ordem de precedência)

```
1. FeatureTenantOverride (banco) — força ativação/desativação por loja
2. BillingEntitlements (plano) — features do plano contratado
3. Status no FEATURE_CATALOG — stable = ativo, beta/coming_soon = inativo
4. VITE_FEATURE_* (env frontend) — fallback apenas no frontend
```

---

## 4. `FeatureControlModule`

O `FeatureControlModule` é a central de governança. Expõe:

- `GET /feature-control` — lista todas as features com status por tenant
- `POST /feature-control/:key/override` — cria/atualiza override manual (admin SaaS)
- `DELETE /feature-control/:key/override` — remove override

**Guards:** `AdminAuthGuard` + permissão `saas.features.manage`.

---

## 5. Regras inegociáveis

- **Nunca** habilitar feature `beta` ou `coming_soon` em preset de produção sem deliberação explícita.
- **Nunca** marcar feature como `stable` sem testes e implementação completa.
- **Nunca** duplicar o catálogo em outros arquivos — usar `@gestor/core`.
- Features dependentes de infraestrutura (ex: Redis) devem ter kill switch explícito.

---

## 6. Kill switches de infraestrutura

| Variável | Feature controlada |
|----------|-------------------|
| `BULLMQ_ENABLED=true` | Filas BullMQ (campanhas, push, jobs) |
| `CAMPAIGNS_DISPATCH_ENABLED=true` | Despacho de campanhas WhatsApp |
| `CAMPAIGN_AUTOMATION_ENABLED=true` | Automações recorrentes |
| `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED=true` | Pedidos bidirecionais iFood |
| `MARKETPLACE_IFOOD_POLLING_ENABLED=true` | Polling de eventos iFood |
| `PUSH_NOTIFICATIONS_ENABLED=true` | Processador de push BullMQ |

---

## 7. Referências

- Catálogo: `packages/core/src/constants/features.ts`
- Módulo: `apps/api/src/feature-control/`
- Override model: `FeatureTenantOverride` no schema Prisma
- Global setting: `FeatureGlobalSetting` no schema Prisma
- Matriz de features: `docs/product/feature-matrix.md`
