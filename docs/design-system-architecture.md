# Arquitetura do Design System

Esta documentação descreve a nova arquitetura de componentes compartilhados do projeto Gestor Delivery SaaS PRO.

## Estrutura de Pacotes

A arquitetura é dividida em três camadas principais para garantir isolamento e escalabilidade:

### 1. `@gestor/theme`
- **Responsabilidade**: Tokens, tipos, helpers de cor e validações.
- **Uso**: Compartilhado por todos os apps e pacotes de UI.
- **Diferencial**: Não contém componentes React, apenas lógica e definições de tema.

### 2. `@gestor/ui`
- **Responsabilidade**: Componentes administrativos (Dashboard, Painéis, Formulários).
- **Uso**: `web-tenant` e `web-admin`.
- **Foco**: Operação, tabelas, modais complexos e produtividade.

### 3. `@gestor/storefront-ui`
- **Responsabilidade**: Componentes voltados ao consumidor final (Vitrine, Checkout).
- **Uso**: `web-storefront`.
- **Foco**: Conversão, mobile-first e personalização visual via branding do tenant.

## Componentes Disponíveis (@gestor/storefront-ui)

- `StorefrontShell`: Wrapper raiz que garante aplicação de tema e isolamento.
- `StorefrontThemeProvider`: Gerenciador de variáveis CSS e modo de cor.
- `ProductRenderer`: Orquestrador de vitrine com suporte a 5 layouts (`grid`, `list`, `compact`, `square`, `premium-card`).
- `CategoryNavigation`: Navegação responsiva por categorias (`tabs`, `scroll`, `sections`).
- `StorefrontButton`: Botão otimizado para conversão no storefront.
- `StorefrontBadge`: Badges de destaque para produtos e estados.
- `StorefrontEmptyState`: Estados vazios estilizados para a vitrine.

## Princípios de Design

- **Isolamento de Tema**: O storefront utiliza o atributo `data-storefront-theme` e variáveis `--storefront-*`, garantindo que o tema dark do painel administrativo não "vaze" para a loja pública.
- **Segurança de Cores**: Cores dinâmicas vindas do banco de dados são sanitizadas e aplicadas via CSS Variables, nunca via classes Tailwind dinâmicas (JIT).
- **Type Safety**: Todos os componentes são tipados e utilizam `forwardRef` para máxima compatibilidade com bibliotecas de terceiros.

## Componentes Disponíveis (@gestor/ui)

- `Button`: Suporta variantes `primary`, `secondary`, `outline`, `ghost`, `destructive`, `link`.
- `Card`: Container padrão com bordas arredondadas e sombra sutil.
- `Input`: Campo de texto padronizado com estados `disabled` e `error`.
- `StatusBadge`: Badge semântico para status (`success`, `warning`, `error`, `info`, `neutral`).
- `Table`: Conjunto de componentes para tabelas (`TableHeader`, `TableBody`, etc.).
- `PageHeader`: Cabeçalho de página com título, descrição e ações.
- `EmptyState`: Componente para estados vazios com ícone e call-to-action.
- `FormField`: Wrapper para labels e mensagens de erro em formulários.
