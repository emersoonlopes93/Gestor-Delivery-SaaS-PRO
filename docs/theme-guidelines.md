# Diretrizes de Tema (Light/Dark Mode)

Para garantir que o sistema funcione corretamente em ambos os temas e evitar problemas visuais como textos invisíveis ou fundos errados, siga estas regras:

## Classes Proibidas (Hardcoded)

**NUNCA** use classes que fixam cores específicas, pois elas não se adaptam ao Dark Mode:
- ❌ `bg-white` (use `bg-card` ou `bg-background`)
- ❌ `text-black` (use `text-foreground`)
- ❌ `text-gray-900` (use `text-foreground`)
- ❌ `border-gray-200` (use `border-border`)
- ❌ `disabled:opacity-50` (use o padrão do componente UI)

## Classes Permitidas (Semânticas)

Sempre prefira tokens semânticos que mudam automaticamente entre temas:
- ✅ `bg-background`: Fundo principal da página.
- ✅ `bg-card`: Fundo de cartões e elementos elevados.
- ✅ `text-foreground`: Texto principal.
- ✅ `text-muted-foreground`: Texto secundário/desativado.
- ✅ `border-border`: Bordas padrão.
- ✅ `bg-primary`: Cor de destaque do sistema.

## Validação Automática

O projeto possui um script de validação que bloqueia padrões críticos:
```bash
pnpm check:theme:critical
```

E um relatório de warnings para melhoria contínua:
```bash
pnpm check:theme:report
```

## Exceções Justificadas

Caso precise usar uma cor fixa por um motivo técnico real, utilize o comentário de allowlist:
```tsx
<div className="bg-white" /> // @allow-theme-risk: background fixo para exportação de imagem
```
