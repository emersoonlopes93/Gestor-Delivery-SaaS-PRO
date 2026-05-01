# Guia de Deploy — Gestor Delivery SaaS PRO

Este guia orienta o deploy do sistema em uma VPS Linux utilizando **Portainer**, **Traefik** e **Cloudflare**.

---

## 1. Preparação da VPS

### Requisitos
- Docker e Docker Compose instalados.
- Portainer rodando.
- Traefik configurado e rodando na rede `traefik-public`.

### Rede Traefik
Caso a rede `traefik-public` não exista, crie-a:
```bash
docker network create traefik-public
```

---

## 2. Configuração no Cloudflare (DNS)

Crie os seguintes apontamentos do tipo **A** apontando para o IP da sua VPS:

1. `api.seudominio.com` (Proxy: Ligado)
2. `admin.seudominio.com` (Proxy: Ligado)
3. `app.seudominio.com` (Proxy: Ligado)
4. `loja.seudominio.com` (Proxy: Ligado)

> [!TIP]
> No Cloudflare, em **SSL/TLS**, use o modo **Full (Strict)** para garantir a segurança ponta a ponta.

---

## 3. Deploy via Portainer

1. Acesse o Portainer -> **Stacks** -> **Add stack**.
2. Nomeie como `gestor-delivery`.
3. Cole o conteúdo do arquivo `docker-compose.prod.yml`.
4. Preencha as **Environment Variables** (abaixo).
5. Clique em **Deploy the stack**.

### Variáveis de Ambiente Obrigatórias
| Variável | Exemplo | Descrição |
| :--- | :--- | :--- |
| `API_DOMAIN` | `api.dominio.com` | Domínio da API |
| `ADMIN_DOMAIN` | `admin.dominio.com` | Domínio do Admin |
| `APP_DOMAIN` | `app.dominio.com` | Domínio do Painel Tenant |
| `STORE_DOMAIN` | `loja.dominio.com` | Domínio da Loja |
| `VITE_API_URL` | `https://api.dominio.com/api/v1` | URL da API para o Frontend |
| `JWT_SECRET` | `seu_segredo_longo` | Chave JWT |
| `JWT_REFRESH_SECRET` | `seu_segredo_longo_2` | Chave Refresh JWT |
| `CORS_ORIGINS` | `https://admin.dom.com,https://app.dom.com,https://loja.dom.com` | Origens permitidas |
| `DB_PASSWORD` | `sua_senha_db` | Senha do Postgres |

---

## 4. Gerenciamento e Atualização

### Atualizar Versão
Para atualizar o sistema após mudanças no código:
1. Faça o `git pull` na VPS (ou use o repositório git diretamente no Portainer).
2. No Portainer Stack, clique em **Editor** -> **Update the stack**.
3. Marque a opção **Prune services** para remover containers antigos.

### Migrações do Prisma
O sistema executa automaticamente `npx prisma migrate deploy` ao subir o container da API. Não é necessário rodar manualmente.

### Logs
Acompanhe os logs pelo Portainer para validar se a API conectou ao banco com sucesso:
`gestor-api` -> `Logs`.
