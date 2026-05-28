# Guia de Implantação e Deploy Seguro — Gestor Delivery SaaS PRO

Este guia oferece o passo a passo completo e detalhado para realizar o deploy do ecossistema SaaS PRO em produção. O projeto foi projetado sob uma arquitetura de monorepo pnpm moderna e suporta dois caminhos principais de deploy: **Plataformas Serverless & PaaS (Vercel, Render, Cloudflare R2, Upstash Redis)** ou **Infraestrutura VPS (Docker, Portainer, Traefik)**.

---

## 🏗️ 1. Arquitetura de Produção Recomendada (PaaS)

Para máxima escalabilidade, segurança e custo-benefício, a arquitetura de produção ideal é composta por:
1. **Backend (NestJS):** Hospedado no **Render** (Web Service).
2. **Frontends (React/Vite):** Hospedados na **Vercel** (Tenant, Admin e Storefront separados).
3. **Banco de Dados (PostgreSQL):** Hospedado em **Neon**, **Supabase** ou no próprio Render.
4. **Fila e Cache (Redis):** Hospedado no **Upstash Redis** ou **Redis Cloud** com criptografia TLS ativa.
5. **Armazenamento (Cloudflare R2):** Buckets S3-compatíveis e CDN global da Cloudflare.

---

## 🚀 2. Deploy do Backend (API NestJS) no Render

A API é o cérebro do sistema, gerenciando o banco de dados (Prisma) e tarefas em segundo plano (BullMQ).

### Passo 1: Criar um Novo "Web Service" no Render
1. Acesse o painel do [Render](https://render.com) e clique em **New** -> **Web Service**.
2. Conecte o seu repositório Git.
3. Defina as seguintes configurações básicas:
   * **Name:** `gestor-api`
   * **Language:** `Node`
   * **Region:** Escolha a mais próxima dos seus clientes (ex: `us-east` ou `oregon`).
   * **Branch:** `main` (ou sua branch de produção).

### Passo 2: Comandos de Build e Execução
Como utilizamos um monorepo PNPM, precisamos instruir o Render a instalar as dependências corretas, gerar os clientes Prisma e construir o backend (`apps/api`):

* **Build Command:**
  ```bash
  pnpm install --frozen-lockfile --prod=false && pnpm --filter @gestor/api prisma:generate && pnpm --filter @gestor/api... build
  ```
* **Start Command:**
  ```bash
  pnpm --filter @gestor/api prisma:migrate:deploy && pnpm --filter @gestor/api start:prod
  ```
  *(Nota: O comando de migração executa `npx prisma migrate deploy` automaticamente antes de subir a API, garantindo que o banco de dados esteja sempre sincronizado sem downtime).*

### Passo 3: Variáveis de Ambiente no Render
Adicione as variáveis abaixo na seção **Environment** do Render:

| Variável | Valor/Exemplo | Descrição |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Modo de execução do NestJS |
| `PORT` | `3333` | Porta exposta pelo container |
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require&connect_timeout=30&pool_timeout=30` | String de conexão do PostgreSQL (Supabase/Neon) com pooler |
| `DIRECT_URL` | `postgresql://user:pass@host/db?sslmode=require&connect_timeout=30&pool_timeout=30` | **Obrigatório para Neon/Supabase**. Conexão direta sem pooler para migrations (remova `-pooler` do hostname) |
| `JWT_SECRET` | `sua-chave-secreta-e-longa` | Chave de assinatura para tokens JWT dos usuários |
| `JWT_REFRESH_SECRET` | `outra-chave-secreta-e-longa-diferente` | **Obrigatória**. Chave para assinatura do refresh token |
| `REDIS_HOST` | `sua-instancia.upstash.io` | Host do Redis (Ex: Upstash ou Redis Cloud) |
| `REDIS_PORT` | `6379` | Porta de conexão do Redis |
| `REDIS_PASSWORD` | `sua-senha-do-redis` | Senha de autenticação do Redis |
| `REDIS_TLS` | `true` | **Obrigatório para Produção**. Ativa conexão criptografada SSL/TLS |
| `STORAGE_DRIVER` | `r2` | Define o Cloudflare R2 como provedor de uploads |
| `R2_ACCOUNT_ID` | `sua-cloudflare-account-id` | ID da conta Cloudflare obtido no painel do R2 |
| `R2_ACCESS_KEY_ID` | `sua-access-key-id` | Chave de acesso gerada no Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | `sua-secret-access-key` | Chave secreta gerada no Cloudflare R2 |
| `R2_BUCKET` | `gestor-delivery-uploads` | Nome do bucket criado no R2 |
| `R2_PUBLIC_BASE_URL` | `https://cdn.seudominio.com` | URL pública da CDN/Bucket R2 para acesso às imagens |

> [!IMPORTANT]
> A nossa API possui uma validação de segurança estrita no arquivo [env.validation.ts](file:///c:/Users/emers/Documents/GitHub/Gestor%20Delivery%20SaaS%20PRO/apps/api/src/config/env.validation.ts). Se `NODE_ENV` for `production`, a API recusará inicializar caso o Redis esteja apontado para `localhost` ou `127.0.0.1`, protegendo sua aplicação de falhas silenciosas de conexão local em produção.

---

## 🎨 3. Deploy dos Frontends na Vercel

O monorepo possui três frontends React autônomos baseados em **Vite**. Eles devem ser criados na Vercel como **três projetos diferentes**.

### Passo 1: Criar os Projetos na Vercel
Para cada aplicação frontend, crie um novo projeto no painel da [Vercel](https://vercel.com):

1. **Painel do Lojista (web-tenant):**
   * **Root Directory:** `apps/web-tenant`
   * **Build Command:** `pnpm build`
   * **Output Directory:** `dist`
2. **Painel Admin do SaaS (web-admin):**
   * **Root Directory:** `apps/web-admin`
   * **Build Command:** `pnpm build`
   * **Output Directory:** `dist`
3. **Cardápio Digital do Cliente (web-storefront):**
   * **Root Directory:** `apps/web-storefront`
   * **Build Command:** `pnpm build`
   * **Output Directory:** `dist`

### Passo 2: SPA Fallback & Proxy Config (`vercel.json`)
Cada frontend já possui um arquivo `vercel.json` na raiz de seu diretório. Esse arquivo foi ajustado estrategicamente com regras de rewrite para garantir que chamadas de `/api` sejam direcionadas corretamente e que rotas dinâmicas do React Router (como `/dashboard`, `/orders` ou `/cardapio/:slug`) não resultem em erro `404` ao recarregar a página.

A estrutura do `vercel.json` configurada é a seguinte:
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.seudominio.com/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

> [!IMPORTANT]
> Substitua o destino `https://api.seudominio.com` no `vercel.json` de cada frontend pela URL oficial gerada pela sua API no Render (ou seu domínio apontado). A regra `/api/:path*` deve obrigatoriamente estar posicionada **antes** do fallback catch-all `/(.*) -> /index.html` para evitar que as chamadas de API fiquem presas em loops HTML.

### Passo 3: Variáveis de Ambiente nos Frontends
Configure as seguintes variáveis na Vercel para cada respectivo projeto:

* **Para `web-tenant` e `web-admin`:**
  * `VITE_API_URL` = `https://api.seu-subdominio.com/api/v1` (URL pública da API hospedada no Render).
* **Para `web-storefront`:**
  * `VITE_API_URL` = `https://api.seu-subdominio.com/api/v1`

---

## 🪣 4. Armazenamento de Mídia no Cloudflare R2

O sistema utiliza o Cloudflare R2 para uploads seguros. Os arquivos são organizados de maneira isolada por Tenant (Multi-tenant):

```
tenants/{tenantId}/logos/{uuid}.webp
tenants/{tenantId}/combos/{uuid}.webp
tenants/{tenantId}/products/{uuid}.webp
```

### Configurando o R2:
1. Acesse o painel da Cloudflare -> **R2** -> **Create bucket**.
2. Dê o nome ao bucket (ex: `gestor-delivery-uploads`).
3. Vá nas configurações do bucket e habilite **Public Bucket** ou configure um **Custom Domain** (recomendado para usar CDN própria).
4. **Configuração de CORS (Obrigatória):** Adicione a seguinte regra de CORS para permitir que seus frontends na Vercel e sua API carreguem mídias com segurança:
   ```json
   [
     {
       "AllowedOrigins": ["https://*.vercel.app", "https://seudominio.com", "http://localhost:5173"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": [],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

---

## 🐳 5. Alternativa VPS: Deploy via Docker + Portainer + Traefik

Se você preferir rodar tudo em sua própria VPS Linux, o monorepo conta com scripts otimizados de build e orquestração.

### Requisitos da VPS
* Docker e Docker Compose instalados.
* Portainer ativo para monitoramento.
* Rede do Traefik (`traefik-public`) criada.

### Passo 1: Gerando as Imagens Docker locais
O monorepo possui o utilitário [build-prod.sh](file:///c:/Users/emers/Documents/GitHub/Gestor%20Delivery%20SaaS%20PRO/build-prod.sh). Execute-o para criar as imagens otimizadas:
```bash
# 1. Clone o repositório na VPS
git clone https://github.com/seu-usuario/seu-repo.git
cd seu-repo

# 2. Dê permissão e execute o build
chmod +x build-prod.sh
./build-prod.sh
```
Isso gerará as imagens locais prontas:
* `gestor-api:latest`
* `gestor-admin:latest`
* `gestor-tenant:latest`
* `gestor-storefront:latest`

### Passo 2: Criando a Rede Pública do Traefik
```bash
docker network create --driver overlay traefik-public
```

### Passo 3: Configuração do Cloudflare DNS
Aponte os subdomínios (Tipo **A**) para o IP da sua VPS:
* `api.seudominio.com` -> IP da VPS
* `admin.seudominio.com` -> IP da VPS
* `app.seudominio.com` (Tenant) -> IP da VPS
* `loja.seudominio.com` (Storefront) -> IP da VPS

*Nota: No Cloudflare, configure o SSL/TLS para o modo **Full (Strict)**.*

### Passo 4: Deploy no Portainer
1. Acesse o Portainer -> **Stacks** -> **Add stack**.
2. Dê o nome de `gestor-delivery`.
3. Copie o conteúdo do seu arquivo `docker-compose.prod.yml` no editor.
4. Preencha as variáveis de ambiente necessárias (conforme tabela abaixo) e clique em **Deploy the stack**.

---

## 🔑 6. Tabela Completa de Variáveis de Ambiente de Produção

Utilize esta lista consolidada para preencher os painéis do Render, Vercel ou Portainer:

| Categoria | Variável | Exemplo de Valor | Escopo |
| :--- | :--- | :--- | :--- |
| **Geral** | `NODE_ENV` | `production` | API |
| **Geral** | `PORT` | `3333` | API |
| **Banco de Dados** | `DATABASE_URL` | `postgresql://postgres:senha@neon-host.db.neon.tech/main?sslmode=require&connect_timeout=30&pool_timeout=30` | API |
| **Banco de Dados** | `DIRECT_URL` | `postgresql://postgres:senha@neon-host.db.neon.tech/main?sslmode=require&connect_timeout=30&pool_timeout=30` | API (remova `-pooler` do hostname) |
| **Segurança** | `JWT_SECRET` | `8f5b8210d7a6e191b...` *(gere um hash de 32+ caracteres)* | API |
| **Segurança** | `JWT_REFRESH_SECRET` | `9b8c7d6e5a4f3e2d1...` *(gere outro hash diferente)* | API |
| **Mensageria & Fila** | `REDIS_HOST` | `redis-10023.c302.us-east-1-4.ec2.cloud.redislabs.com` | API |
| **Mensageria & Fila** | `REDIS_PORT` | `10023` | API |
| **Mensageria & Fila** | `REDIS_PASSWORD` | `sua-senha-segura-redis` | API |
| **Mensageria & Fila** | `REDIS_TLS` | `true` | API |
| **Storage (Cloudflare R2)**| `STORAGE_DRIVER` | `r2` | API |
| **Storage (Cloudflare R2)**| `R2_ACCOUNT_ID` | `a1b2c3d4e5f6g7h8i9j0` | API |
| **Storage (Cloudflare R2)**| `R2_ACCESS_KEY_ID` | `28f645baef0745cd12c332` | API |
| **Storage (Cloudflare R2)**| `R2_SECRET_ACCESS_KEY` | `98d6c54bfaed0234acfe456ef` | API |
| **Storage (Cloudflare R2)**| `R2_BUCKET` | `gestor-delivery-uploads` | API |
| **Storage (Cloudflare R2)**| `R2_PUBLIC_BASE_URL` | `https://cdn.pizzariademo.com` | API |
| **Integração Frontend** | `VITE_API_URL` | `https://api.seudominio.com/api/v1` | Frontends |

---

## 🛠️ 7. Manutenção, Logs e Migrações

### Como Atualizar em Produção?
Sempre que fizer novas modificações e subir para a branch de produção (`main`):
1. **No Render (API):** O Render detecta o novo commit e executa o build automaticamente. O comando `pnpm --filter @gestor/api prisma:migrate` rodará as migrations pendentes de forma segura.
2. **Na Vercel (Frontends):** A Vercel detecta os novos commits e realiza o build/deploy automático das três aplicações de forma isolada.
3. **Na VPS (Alternativa):**
   ```bash
   git pull
   ./build-prod.sh
   # No Portainer, vá na stack, clique em "Update the stack" marcando a opção "Prune services".
   ```

### Logs de Auditoria e Diagnósticos
* **Render:** Acesse o serviço `gestor-api` -> **Logs** no painel da Render para monitorar a inicialização.
* **Vercel:** Acesse o painel de cada frontend -> **Deployments** -> **Runtime Logs** para validar requisições e comunicações da API.
* **Banco local/Migrates:** Caso queira inspecionar o status das migrações manuais localmente:
  ```bash
  pnpm --filter @gestor/api prisma status
  ```
