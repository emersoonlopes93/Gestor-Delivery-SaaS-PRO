# Isolamento Multi-tenant (Backend)

Este sistema utiliza uma abordagem de isolamento via **Prisma Client Extension** e **AsyncLocalStorage**.

## Core Components

1.  **TenantContextService**: Gerencia o `tenantId` da requisição atual usando `AsyncLocalStorage`.
2.  **TenantInterceptor**: Captura o `tenantId` do usuário autenticado e popula o `TenantContextService`.
3.  **PrismaService (tenantClient)**: Filtra automaticamente todas as queries por `tenantId` para modelos que pertencem ao inquilino.

## Como utilizar

Sempre que estiver escrevendo um serviço que lida com dados de um inquilino (ex: Produtos, Pedidos, Usuários do Inquilino), utilize o `tenantClient`:

```typescript
// No seu serviço
constructor(private readonly prisma: PrismaService) {}

async getMyData() {
  // Isso filtrará automaticamente por where: { tenantId: contextId }
  return this.prisma.tenantClient.product.findMany();
}
```

## Modelos Excluídos do Isolamento

Os seguintes modelos são globais ou de administração e **NÃO** são filtrados automaticamente:
- `Tenant`
- `AdminUser`
- `AdminRole`
- `AdminPermission`
- `AdminRolePermission`
- `AdminUserRole`

## Considerações Importantes

- **findUnique**: A extensão converte automaticamente `findUnique` para `findFirst` quando o isolamento está ativo, pois o `tenantId` é adicionado ao filtro `where`, o que invalida filtros baseados apenas no ID primário para operações `findUnique` padrão.
- **Admin Context**: Quando um Admin do SaaS faz uma requisição, o `tenantId` no contexto é nulo, e o `tenantClient` se comporta como o cliente raw (sem filtros de isolamento), permitindo visão global.
