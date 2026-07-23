# Contrato — Autenticação

> **Status:** Estável  
> **Última revisão:** 2026-07-23  
> **Verificado contra:** `main-copy / 78daea7a`

---

## 1. Identidades suportadas

O sistema suporta quatro identidades distintas, cada uma com seu próprio módulo de autenticação, estratégia JWT e guard:

| Identidade | Model Prisma | Guard | JWT Subject |
|------------|-------------|-------|-------------|
| `TenantUser` | `TenantUser` | `TenantAuthGuard` | `tenant_user:<id>` |
| `Customer` | `Customer` | `CustomerAuthGuard` | `customer:<id>` |
| `Driver` | `Driver` | `DriverAuthGuard` | `driver:<id>` |
| `AdminUser` | `AdminUser` | `AdminAuthGuard` | `admin:<id>` |

---

## 2. Fluxo de autenticação

### Login de TenantUser / Driver

```
POST /auth/login
  → valida email + senha (bcrypt)
  → gera accessToken (15min) + refreshToken (7d)
  → persiste Session no banco (tenantId, userId, deviceInfo, expiresAt)
  → retorna { accessToken, refreshToken, user }
```

### Login de Customer (B2C)

```
POST /auth/customer/login
  → valida phone + OTP ou email + senha
  → gera accessToken (1h) + refreshToken (30d)
  → retorna { accessToken, refreshToken, customer }
```

### Refresh de token

```
POST /auth/refresh
  → valida refreshToken (assinatura + expiração)
  → verifica Session ativa no banco
  → gera novo par de tokens
  → invalida refreshToken anterior (rotação)
```

### Logout

```
POST /auth/logout
  → invalida a Session no banco (status: revoked)
  → refreshToken não pode mais ser usado
```

---

## 3. Estrutura do JWT

```json
{
  "sub": "tenant_user:<uuid>",
  "tenantId": "<uuid>",
  "sessionId": "<uuid>",
  "roles": ["owner"],
  "permissions": ["orders.read", "catalog.create"],
  "iat": 1234567890,
  "exp": 1234568790
}
```

---

## 4. Sessões

- Sessões são persistidas no model `Session` com `tenantId`, `userId`, `userType`, `deviceInfo` e `expiresAt`.
- Uma sessão revogada invalida todos os tokens emitidos para aquela sessão.
- `TenantInterceptor` extrai `tenantId` do JWT e injeta no contexto de cada request.

---

## 5. Regras inegociáveis

- **Nunca** aceitar `tenantId` de um body de request — sempre extrair do JWT.
- **Nunca** logar `accessToken`, `refreshToken` ou senhas.
- **Nunca** emitir token sem uma Session válida no banco.
- Tokens de identidades diferentes (ex: Customer vs TenantUser) **não são intercambiáveis**.

---

## 6. Configuração de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `JWT_SECRET` | Sim | Segredo de assinatura HS256 |
| `JWT_EXPIRATION` | Não | Expiração do accessToken (padrão: `15m`) |
| `JWT_REFRESH_SECRET` | Sim | Segredo para refreshToken |
| `JWT_REFRESH_EXPIRATION` | Não | Expiração do refreshToken (padrão: `7d`) |

---

## 7. Referências

- Guards: `apps/api/src/auth/guards/`
- Strategies: `apps/api/src/auth/strategies/`
- DTOs: `packages/types/src/auth.ts`
- Módulo: `apps/api/src/auth/auth.module.ts`
