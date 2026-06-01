# Personalização do Storefront

O Storefront foi projetado para ser "White-Label", permitindo que cada tenant personalize a aparência de sua loja de forma segura.

## Como funciona a personalização

A personalização é baseada em **Presets** e **CSS Variables**. Não permitimos injeção de CSS livre por motivos de segurança e estabilidade.

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

- `--storefront-primary`: Cor principal da marca.
- `--storefront-primary-foreground`: Cor de texto contrastante sobre a primária (calculada automaticamente).
- `--storefront-radius`: Arredondamento global de botões e cards.

### Layouts Disponíveis

O componente `ProductRenderer` permite alternar o visual da vitrine baseado na configuração do tenant:

- `grid`: Grade padrão com imagens grandes.
- `list`: Lista otimizada para muitos itens.
- `compact`: Visual minimalista para cardápios densos.
- `square`: Foco em imagens quadradas (Instagram style).
- `premium-card`: Layout com sombras e bordas destacadas.

## Adicionando Novos Layouts

Para adicionar um novo preset de layout:
1. Adicione o novo tipo em `packages/theme/src/index.ts`.
2. Implemente o componente visual em `packages/storefront-ui/src/components`.
3. Atualize o `switch` no `ProductRenderer`.
