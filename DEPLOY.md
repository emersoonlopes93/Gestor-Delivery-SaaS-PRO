# Guia de Deploy — Gestor Delivery SaaS PRO

Este guia orienta como gerar as imagens Docker e fazer o deploy do sistema em uma VPS Linux utilizando **Portainer**, **Traefik** e **Cloudflare**.

---

## 1. Gerando as Imagens (Build)

O sistema utiliza um monorepo com PNPM. Para facilitar o build em produção, existe um script chamado `build-prod.sh` na raiz do projeto.

### Passo a passo para o Build:

1.  **Clone o repositório na VPS**:
    ```bash
    git clone https://github.com/seu-usuario/seu-repo.git
    cd seu-repo
    ```

2.  **Dê permissão de execução ao script**:
    ```bash
    chmod +x build-prod.sh
    ```

3.  **Execute o build**:
    ```bash
    ./build-prod.sh
    ```

Este script irá gerar as seguintes imagens locais:
- `gestor-api:latest`
- `gestor-admin:latest` (Painel SaaS Admin)
- `gestor-tenant:latest` (Painel do Lojista)
- `gestor-storefront:latest` (Loja do Cliente)

---

## 2. Preparação da VPS

### Requisitos
- Docker e Docker Compose instalados.
- Portainer instalado e rodando.
- Rede do Traefik (`traefik-public`) criada.

### Criando a rede do Traefik
```bash
docker network create --driver overlay traefik-public
```

---

## 3. Configuração no Cloudflare (DNS)

Aponte os seguintes subdomínios (tipo **A**) para o IP da sua VPS:

1.  `api.seudominio.com` (API)
2.  `admin.seudominio.com` (SaaS Admin)
3.  `app.seudominio.com` (Painel Tenant)
4.  `loja.seudominio.com` (Storefront)

> [!IMPORTANT]
> No Cloudflare, configure o SSL/TLS para o modo **Full (Strict)**.

---

## 4. Deploy via Portainer

1.  Acesse o Portainer -> **Stacks** -> **Add stack**.
2.  Nome: `gestor-delivery`.
3.  Método: **Web editor** (ou repositório Git).
4.  Cole o conteúdo de `docker-compose.prod.yml`.
5.  Configure as **Environment Variables**:

| Variável | Exemplo | Descrição |
| :--- | :--- | :--- |
| `API_DOMAIN` | `api.dominio.com` | Domínio da API |
| `ADMIN_DOMAIN` | `admin.dominio.com` | Domínio do Admin |
| `APP_DOMAIN` | `app.dominio.com` | Domínio do Painel Tenant |
| `STORE_DOMAIN` | `loja.dominio.com` | Domínio da Loja |
| `VITE_API_URL` | `https://api.dominio.com/api/v1` | URL da API para os Frontends |
| `JWT_SECRET` | `uma_chave_aleatoria` | Segredo JWT |
| `DB_PASSWORD` | `senha_segura` | Senha do Banco de Dados |

6.  Clique em **Deploy the stack**.

---

## 5. Manutenção e Atualização

### Como atualizar o sistema?
Sempre que houver mudanças no código:
1.  Rode `git pull`.
2.  Rode `./build-prod.sh` novamente para atualizar as imagens locais.
3.  No Portainer, vá na Stack -> **Editor** -> **Update the stack**.
4.  Marque **Prune services** e clique em **Update**.

### Banco de Dados (Prisma)
As migrações são executadas automaticamente pelo container da API no momento da inicialização (`npx prisma migrate deploy`).

### Logs
Para verificar se tudo está rodando bem:
`Portainer -> Containers -> gestor-api -> Logs`.
