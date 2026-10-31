---
title: Contrato de Isolamento de Tenant
status: current
owner: engineering
last_verified: 2026-07-15
verified_against: main-copy / c63d394
---

# Contrato de Isolamento de Tenant (Multi-Tenancy)

> Este é o contrato fundamental do Gestor Delivery SaaS PRO. A violação deste contrato resulta em vazamento cruzado de dados de lojas, o que é um incidente de segurança crítico.

---

## 1. O Princípio Básico

**Todos os dados operacionais pertencem a um e apenas um `Tenant`.** 

Nenhuma query de leitura, escrita, atualização ou remoção de dados operacionais deve ser executada sem a presença do filtro `tenantId`.

## 2. O Interceptor Global

O `TenantInterceptor` (`apps/api/src/common/interceptors/tenant.interceptor.ts`) é aplicado globalmente. Ele extrai o tenant a partir da requisição HTTP de três formas possíveis, nesta ordem:

1. **Header Administrativo:** `x-tenant-id` (Requer autenticação de Super Admin SaaS)
2. **Token JWT:** O `tenantId` contido no payload de autenticação de usuários logados.
3. **Parâmetro de Rota:** Para rotas públicas (Storefront), o slug na URL ou host é resolvido para o ID.

Se a requisição for para uma rota que não seja global (`@Public()` ou `@AdminOnly()`) e o `tenantId` não for encontrado, a requisição é rejeitada automaticamente com `401 Unauthorized` ou `403 Forbidden`.

## 3. O Contexto de Tenant (CLS)

Usamos *Continuation-Local Storage* (via `async_hooks` do Node.js encapsulado pelo `nestjs-cls`) para propagar o `tenantId` invisivelmente por toda a árvore de execução HTTP, sem precisar passá-lo manualmente em cada assinatura de método.

O provedor é o `TenantContextModule` e o uso em services é feito através de injeção ou decorators que acessam esse contexto.

### 4. Regras OBRIGATÓRIAS para Services (Backend)

Sempre que injetar `PrismaService` em um domínio que pertença a tenant, você DEVE aplicar o filtro na query. O Prisma Client no Gestor Delivery SaaS PRO não usa extensions (RLS), o filtro deve ser explícito no código TypeScript.

#### ❌ ERRADO (Vazamento Cross-Tenant)
```typescript
async getOrders() {
  // Retorna os pedidos de TODAS as lojas do mundo! CRÍTICO.
  return this.prisma.order.findMany(); 
}
```

#### ✅ CORRETO
```typescript
async getOrders(tenantId: string) {
  return this.prisma.order.findMany({
    where: { tenantId } 
  });
}
```

## 5. Jobs em Background (Filas/BullMQ)

Jobs em background **não possuem contexto HTTP**. O `TenantInterceptor` não existe lá.

**Regra:** Todo Job Payload (DTO) enviado para o BullMQ DEVE conter explicitamente a string `tenantId`. 

Ao processar o Job (no Consumer/Processor), você deve ler o `tenantId` do payload e injetá-lo explicitamente em todas as chamadas subsequentes a services ou ao Prisma.

## 6. Modelos Globais vs Tenant-Scoped

Alguns modelos não levam `tenantId`. Eles são dados da Plataforma e não da Loja. Use com cuidado e certifique-se de não vincular dados de clientes neles.

**Exemplos Globais:**
- `AdminUser`
- `Tenant` (A entidade em si)
- `FeatureGlobalSetting`
- `BusinessGroup` (A rede à qual Tenants podem pertencer)

**Exemplos Tenant-Scoped (obrigatório filtrar):**
- `TenantUser`
- `Product`, `Category`
- `Order`
- `Customer`
- `Coupon`, `Campaign`

## 7. Relações entre Tenants (Franquias)

Lojas podem pertencer à mesma rede (`businessGroupId`). No entanto, o isolamento base continua sendo o `tenantId`.

Se um recurso exigir dados de múltiplas lojas da rede (ex: relatório da rede), a permissão `NETWORK_ADMIN` é validada e a query usará um `where: { tenantId: { in: networkTenantIds } }`. Nunca omita o filtro.
