# Theme Guidelines - Gestor Delivery SaaS PRO

## Tokens Permitidos

### Texto
- `text-foreground` - texto principal
- `text-muted-foreground` - texto secundário
- `text-primary-foreground` - texto em fundo primary
- `text-destructive-foreground` - texto em fundo destructive
- `text-card-foreground` - texto em cards
- `text-accent-foreground` - texto em accents

### Background
- `bg-background` - fundo principal
- `bg-card` - fundo de cards
- `bg-muted` - fundo secundário
- `bg-primary` - fundo de ações primárias
- `bg-destructive` - fundo de ações destrutivas
- `bg-accent` - fundo de destaques

### Border
- `border-border` - borda padrão
- `border-input` - borda de inputs
- `border-primary` - borda de elementos primários

## Classes Proibidas

### Texto
- `text-transparent`
- `text-white` (use `text-primary-foreground`)
- `text-black` (use `text-foreground`)
- `text-gray-*` (use tokens semânticos)
- `dark:text-gray-*` (use tokens semânticos)
- `dark:text-black`
- `dark:text-slate-900`
- `text-muted-foreground/30`
- `text-muted-foreground/40`
- `text-muted-foreground/50`

### Background
- `bg-transparent` (exceto para mapas/overlays)
- `bg-gray-*` (use tokens semânticos)
- `dark:bg-gray-*` (use tokens semânticos)
- `bg-muted/20`, `bg-muted/30` (use `bg-muted`)

### Opacity
- `opacity-20`, `opacity-30`, `opacity-40` (use tokens semânticos)
- `disabled:opacity-50` (use `disabled:opacity-70`)

## Padrões de Componentes

### Button

```tsx
// Primary
<Button variant="primary">Salvar</Button>

// Secondary
<Button variant="secondary">Cancelar</Button>

// Destructive
<Button variant="destructive">Excluir</Button>

// Ghost
<Button variant="ghost">Ação</Button>
```

### Input

```tsx
<input 
  className="bg-card text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70"
/>
```

### Card

```tsx
<div className="bg-card text-card-foreground border border-border">
  {/* conteúdo */}
</div>
```

### Badge/Status

```tsx
<Badge variant="success">Ativo</Badge>
<StatusBadge status="success">Conectado</StatusBadge>
```

### Empty State

```tsx
<EmptyState 
  icon={Icon}
  title="Nenhum item encontrado"
  description="Não há itens para exibir no momento."
/>
```

### Tabs

```tsx
// Ativo
<div className="bg-primary text-primary-foreground">Tab Ativa</div>

// Inativo
<div className="bg-card text-foreground border-border hover:bg-muted">Tab Inativa</div>
```

## Como Validar Light/Dark

### Manual
1. Alternar entre temas usando o toggle de tema
2. Verificar se todos os textos são legíveis em ambos os temas
3. Verificar se botões e cards têm contraste adequado
4. Verificar se inputs e placeholders são visíveis

### Automático
```bash
pnpm check:theme
```

## Exemplos de Boas Práticas

### ✅ CORRETO
```tsx
<div className="bg-card text-card-foreground border border-border">
  <h2 className="text-foreground">Título</h2>
  <p className="text-muted-foreground">Descrição</p>
</div>
```

### ❌ INCORRETO
```tsx
<div className="bg-gray-100 dark:bg-gray-800 border-gray-200">
  <h2 className="text-gray-900 dark:text-white">Título</h2>
  <p className="text-gray-600 dark:text-gray-400">Descrição</p>
</div>
```

## Componentes Base Disponíveis

- `Button` - Botões com variantes
- `Badge` - Badges simples
- `StatusBadge` - Badges de status
- `Card` - Cards padronizados
- `EmptyState` - Estados vazios
- `PageHeader` - Cabeçalhos de página

## Localização

`apps/web-tenant/src/components/ui/`

## Migration Guide

Para migrar código existente:

1. Identificar classes hardcoded (use `pnpm check:theme`)
2. Substituir por tokens semânticos conforme tabela acima
3. Usar componentes base quando disponível
4. Testar em ambos os temas

## Allowlist para Classes Especiais

Comente a linha quando usar classes proibidas intencionalmente:

```tsx
// @allowlist - mapa/overlay
<div className="bg-transparent">...</div>

// @allowlist - elemento decorativo
<div className="opacity-30">...</div>
```
