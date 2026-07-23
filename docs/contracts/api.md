# Contrato — API REST

> **Status:** Estável  
> **Última revisão:** 2026-07-23  
> **Verificado contra:** `main-copy / 78daea7a`

---

## 1. Visão geral

A API REST é servida por `apps/api` (NestJS) na porta `3333`.  
Toda comunicação é JSON. Autenticação via Bearer JWT no header `Authorization`.

```
Base URL: http(s)://<host>:3333
Content-Type: application/json
Authorization: Bearer <accessToken>
```

---

## 2. Versionamento e prefixos de rota

| Prefixo | Contexto | Guard |
|---------|----------|-------|
| `/auth/*` | Autenticação de TenantUser | público / `TenantAuthGuard` |
| `/auth/customer/*` | Autenticação de Customer | público / `CustomerAuthGuard` |
| `/admin/*` | Painel SaaS Admin | `AdminAuthGuard` + `AdminPermissionsGuard` |
| `/public/*` | Recursos públicos (storefront) | sem autenticação |
| `/*` (demais) | Operação do tenant | `TenantAuthGuard` + `PermissionsGuard` |

---

## 3. Padrões de resposta

### Sucesso

```json
{ "data": { ... } }          // recurso único
{ "data": [...], "meta": { "total": 100, "page": 1, "limit": 20 } }  // lista paginada
{ "success": true }          // operação sem retorno de dados
```

### Erro

```json
{
  "statusCode": 400,
  "message": "Descrição do erro em português",
  "error": "Bad Request"
}
```

---

## 4. Códigos HTTP utilizados

| Código | Quando |
|--------|--------|
| `200` | Sucesso (GET, PUT, PATCH, DELETE) |
| `201` | Recurso criado (POST) |
| `204` | Sem conteúdo (DELETE sem retorno) |
| `400` | Requisição inválida / violação de negócio |
| `401` | Token ausente ou inválido |
| `403` | Permissão insuficiente |
| `404` | Recurso não encontrado |
| `409` | Conflito (duplicata, estado inválido) |
| `422` | Entidade não processável (validação de DTO) |
| `429` | Rate limit atingido |
| `500` | Erro interno |
| `503` | Serviço indisponível (Redis/BullMQ offline) |

---

## 5. Paginação

Todos os endpoints de listagem suportam:

```
GET /orders?page=1&limit=20&search=pizza&status=completed
```

Resposta:
```json
{
  "data": [...],
  "meta": { "total": 150, "page": 1, "limit": 20, "lastPage": 8 }
}
```

---

## 6. Multi-tenancy na API

- `tenantId` é **sempre** extraído do JWT — nunca aceito no body ou query string.
- O `TenantInterceptor` injeta `tenantId` no contexto de cada request automaticamente.
- Endpoints `/public/*` resolvem o tenant pelo `slug` na URL, não por JWT.

---

## 7. Rate limiting

| Endpoint | Limite | Janela |
|----------|--------|--------|
| `POST /auth/login` | 10 req | 1 min |
| `POST /auth/refresh` | 30 req | 1 min |
| `POST /admin/marketplace/*/retry` | 5 req | 1 min |
| `POST /admin/marketplace/*/rotate-credentials` | 3 req | 1 min |
| Demais endpoints autenticados | 300 req | 1 min |

---

## 8. WebSocket

Eventos em tempo real são publicados via Socket.IO no namespace `/events`.  
Veja `docs/contracts/events-and-websockets.md` para o contrato completo.

---

## 9. Swagger / OpenAPI

Disponível em `/api/docs` quando `SWAGGER_ENABLED=true`.  
Desabilitado por padrão em produção.

---

## 10. Referências

- Entry point: `apps/api/src/main.ts`
- Interceptor de tenant: `apps/api/src/common/interceptors/tenant.interceptor.ts`
- Rate limit: `apps/api/src/common/guards/throttle.guard.ts`
- DTOs: `packages/types/src/`
