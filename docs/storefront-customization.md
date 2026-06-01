# Personalização do Storefront

O Storefront foi projetado para ser "White-Label", permitindo que cada tenant personalize a aparência de sua loja de forma segura.

## Como funciona a personalização

A personalização é baseada em **Presets** e **CSS Variables**. Não permitimos injeção de CSS livre por motivos de segurança e estabilidade.

### Persistência das Configurações

As configurações de personalização são salvas na tabela `tenant_settings` através de dois campos JSON:
- `storefrontThemeJson`: Armazena tokens de cor, radius e fontes (`StorefrontThemeSettings`).
- `storefrontLayoutJson`: Armazena preferências de layout de produtos e categorias (`StorefrontLayoutSettings`).

### Fluxo de Dados

1. O tenant configura a aparência no painel administrativo (`web-tenant`).
2. O backend (`apps/api`) valida os enums e sanitiza as cores usando helpers do `@gestor/theme`.
3. O `web-storefront` solicita o payload público da loja, que agora inclui o objeto `customization`.
4. O `StorefrontThemeProvider` e o `ProductRenderer` aplicam as configurações em tempo real.

### Cores de Branding

As cores principais são aplicadas através do `StorefrontThemeProvider`.
Internamente, o helper `applyStorefrontThemeVariables` do pacote `@gestor/theme` converte as configurações do tenant em variáveis CSS seguras:

```tsx
<StorefrontThemeProvider 
  settings={{ 
    primaryColor: tenant.primaryColor, // Ex: "#0c93e9"
    borderRadius: 'lg'
  }}
>
  {/* Conteúdo da loja */}
</StorefrontThemeProvider>
```

### Variáveis CSS Utilizadas

- `--storefront-background`: Cor de fundo da página.
- `--storefront-foreground`: Cor principal do texto.
- `--storefront-primary`: Cor principal da marca.
- `--storefront-primary-foreground`: Cor de texto contrastante sobre a primária.
- `--storefront-card`: Cor de fundo de cards e modais.
- `--storefront-card-foreground`: Cor de texto dentro de cards.
- `--storefront-border`: Cor de bordas e divisores.
- `--storefront-muted`: Cor para elementos de fundo secundários.
- `--storefront-muted-foreground`: Cor para textos de menor importância.
- `--storefront-radius`: Arredondamento global de botões e cards.

### Layouts de Produto Disponíveis

O componente `ProductRenderer` permite alternar o visual da vitrine baseado na configuração do tenant:

- `grid`: Grade padrão com imagens grandes, ideal para a maioria dos negócios.
- `list`: Lista otimizada para muitos itens, excelente para mobile.
- `compact`: Visual minimalista para cardápios densos e pedidos rápidos.
- `square`: Foco em imagens quadradas, estilo Instagram, bom para sobremesas e fotos fortes.
- `premium-card`: Layout elegante com sombras e bordas destacadas, para uma experiência sofisticada.

## Adicionando Novos Layouts

Para adicionar um novo preset de layout:
1. Adicione o novo tipo em `packages/theme/src/index.ts`.
2. Implemente o componente visual em `packages/storefront-ui/src/components`.
3. Adicione as props necessárias ao `StorefrontProduct` se houver novos campos.
4. Atualize o `switch` no `ProductRenderer`.
