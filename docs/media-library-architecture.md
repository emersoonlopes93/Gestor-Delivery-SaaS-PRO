# Arquitetura da Camada de Mídia (Media Library)

Este documento descreve o funcionamento, a segurança e as políticas de gerenciamento de arquivos de mídia (imagens e uploads) do Gestor Delivery SaaS PRO.

---

## 1. Drivers de Armazenamento (Storage)

O sistema suporta dois drivers de armazenamento, configurados através da variável de ambiente `MEDIA_STORAGE_DRIVER` (ou a legada `STORAGE_DRIVER`):

1. **`local`**: Armazena os arquivos no disco local do servidor. Ideal para desenvolvimento e testes locais. Os arquivos são salvos na pasta especificada por `MEDIA_UPLOAD_DIR` (padrão: `uploads`) e servidos por meio da URL base configurada em `MEDIA_PUBLIC_BASE_URL` ou o prefixo estático da API.
2. **`r2`**: Armazena os arquivos no Cloudflare R2 (compatível com a API AWS S3). É o **driver obrigatório em produção**. Ele aproveita a infraestrutura global da Cloudflare e a ausência de taxas de transferência de dados de saída (egress bandwidth fees).

---

## 2. Variáveis de Ambiente (Configuração)

As variáveis abaixo controlam o comportamento da camada de mídias:

| Variável | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `MEDIA_STORAGE_DRIVER` | `local` \| `r2` | `local` | Define o driver de armazenamento ativo. |
| `MEDIA_UPLOAD_DIR` | `string` | `uploads` | Diretório local para gravação de arquivos (apenas driver `local`). |
| `MEDIA_PUBLIC_BASE_URL`| `string` | *(auto)* | URL pública para servir arquivos estáticos locais (ex: `http://localhost:3333/api/v1/static`). |
| `MEDIA_MAX_SIZE_BYTES` | `number` | `10485760` | Tamanho máximo permitido para cada upload em bytes (10MB). |

### Variáveis Obrigatórias para Cloudflare R2 (`MEDIA_STORAGE_DRIVER=r2`)
* `R2_ACCOUNT_ID`: ID da conta Cloudflare.
* `R2_ACCESS_KEY_ID`: Chave de acesso gerada no painel R2.
* `R2_SECRET_ACCESS_KEY`: Chave secreta correspondente.
* `R2_BUCKET`: Nome do bucket criado no R2.
* `R2_PUBLIC_BASE_URL`: URL pública ou domínio personalizado do bucket para servir os arquivos (ex: `https://pub-xxx.r2.dev`).
* `R2_REGION`: Região S3 (usar `auto`).

---

## 3. Segurança e Hardening de Mídia

### 3.1 Tipos de Arquivos Suportados (MIME Types)
Para garantir a segurança do servidor e dos clientes, apenas as seguintes extensões e tipos de mídia são aceitos:
* **MIME types**: `image/jpeg`, `image/png`, `image/webp`.
* Todas as mídias são convertidas automaticamente para **WebP** com qualidade otimizada pelo `sharp` antes do armazenamento final.

### 3.2 Bloqueio de SVG, HTML e Scripts (Prevenção de Ataques)
* **Validação de Magic Numbers**: O sistema lê o buffer do arquivo em memória e verifica a assinatura binária real (magic numbers) para garantir que arquivos de script ou documentos maliciosos (como arquivos HTML ou SVG) não tenham sido renomeados com extensões falsas (ex: `.jpg`).
* **Verificação de Conteúdo**: Os primeiros 1024 bytes do buffer do arquivo são escaneados para detectar tags ou atributos XML, SVG ou scripts injetados (como `<svg`, `<html`, `<script`, `onload=`, `onerror=`). Se qualquer um desses padrões for detectado, o upload é imediatamente bloqueado com um erro HTTP 400 (Bad Request).
* **Ausência de SVG**: SVGs não são permitidos em nenhuma hipótese no storefront devido a riscos de XSS armazenado (Cross-Site Scripting).

### 3.3 Proteção contra Path Traversal
* Todas as operações de leitura, escrita e deleção do driver local resolvem os caminhos de forma absoluta usando `path.resolve`.
* O sistema valida estritamente se o caminho do arquivo resultante inicia com o diretório base de mídias (`MEDIA_UPLOAD_DIR`). Se houver elementos de navegação de diretório (como `../`), a operação é bloqueada e um alerta de segurança é gerado.

---

## 4. Multi-Tenant e Isolamento

As mídias são estritamente isoladas por inquilino (tenant) para garantir a privacidade dos dados:
* **Estrutura de Diretórios**: Os arquivos são gravados organizados sob a pasta `tenants/{tenantId}/{scope}/{uuid}.webp` tanto no disco local quanto no Cloudflare R2.
* **Validação de Ownership**: 
  * O endpoint de delete valida estritamente que a mídia sendo apagada pertence ao inquilino autenticado no token JWT antes de executar a exclusão física ou no banco de dados.
  * O serviço de personalização de temas (`TenantService`) valida se o `backgroundImageMediaId` fornecido pelo inquilino pertence realmente a ele antes de associá-lo. Também força a URL final a ser a URL oficial do banco, impedindo sequestro de URL (URL hijacking).
* **Mídias do Sistema (`isSystem: true`)**: Estão preparadas no banco de dados com `tenantId: null` para representar backgrounds globais do sistema, e não são expostas ou manipuláveis por inquilinos individuais nesta fase.

---

## 5. Ciclo de Vida e Política de Deleção

Quando um recurso de mídia é removido:
1. **Deleção Física**: O arquivo correspondente é excluído de forma síncrona do disco local ou do Cloudflare R2.
2. **Consistência de Configurações**: Se a mídia deletada for o background atual do storefront do inquilino (`backgroundImageMediaId === assetId`), as configurações em `TenantSettings` são limpas automaticamente (`backgroundImageMediaId = null`, `backgroundImageUrl = null`).
3. **Invalidação do Cache**: O cache de storefront público correspondente a esse inquilino (`storefront:{slug}:delivery` e `storefront:{slug}:pickup`) é limpo no Redis ou na memória, garantindo propagação instantânea da deleção e evitando links quebrados.

---

## 6. Guia de Migração: Local ➔ Cloudflare R2

Para migrar de armazenamento local para o Cloudflare R2 em ambiente de produção ou homologação:

1. No Cloudflare, crie um bucket R2 com o nome desejado.
2. Gere um par de credenciais API com permissão de escrita e leitura no bucket.
3. Configure as variáveis de ambiente correspondentes no arquivo `.env` do seu servidor:
   ```env
   # Trocar para R2
   MEDIA_STORAGE_DRIVER=r2
   
   # Configurações do R2
   R2_ACCOUNT_ID=seu_account_id_cloudflare
   R2_ACCESS_KEY_ID=sua_access_key_r2
   R2_SECRET_ACCESS_KEY=seu_secret_access_key_r2
   R2_BUCKET=nome_do_seu_bucket_r2
   R2_PUBLIC_BASE_URL=https://cdn.seudominio.com.br
   R2_REGION=auto
   ```
4. Reinicie a API. O sistema iniciará utilizando o driver Cloudflare R2. Mídias antigas em ambiente local continuarão acessíveis via URLs estáticas antigas, mas novos uploads serão direcionados ao R2. Recomenda-se fazer o upload dos arquivos da pasta `uploads/` local diretamente para a raiz do bucket R2 mantendo a mesma estrutura de diretórios `tenants/...`.

---

## 7. Preparação para a Galeria Global Futura

A tabela `media_assets` já foi projetada prevendo a evolução do sistema para:
* **Galeria própria do Tenant**: Consultas baseadas em `tenantId` com o escopo necessário.
* **Galeria Global**: Recursos com `isSystem: true` e `tenantId: null` para disponibilizar imagens de banco de imagens gratuitas do sistema para os inquilinos.
* **Busca e Categorias**: Filtros flexíveis por `category` e `tagsJson` (ex: pesquisar por tags de produtos como 'bebidas', 'doces').
