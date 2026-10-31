# Compatibilidade entre temas no web-tenant

O `web-tenant` deve tratar os temas light, dark e system como variações do
mesmo design semântico. Novos componentes não devem depender de uma superfície
clara implícita.

## Regras de implementação

- Use `bg-background`, `bg-card`, `bg-popover`, `text-foreground`,
  `text-muted-foreground` e `border-border` para superfícies e texto neutros.
- Use tokens `primary`, `destructive` e `status-*` para ações e estados. Uma cor
  fixa só é aceitável quando faz parte da informação visual e mantém contraste
  nos dois temas.
- Elementos deliberadamente brancos, como papel de impressão e fundo de QR
  Code, devem receber `@allow-theme-risk` na mesma linha para documentar a
  exceção ao gate.
- Gráficos Recharts devem reutilizar
  `src/components/charts/chart-theme.ts`; tooltip, eixos, cursor e grade não
  podem usar cores claras inline.
- Mapas Leaflet devem usar a classe `theme-aware-map`. O filtro dark deve ser
  aplicado somente a `.leaflet-tile-pane`, preservando marcadores, polígonos e
  controles operacionais.
- A preferência `system` deve ser exibida pela UI através de `resolvedTheme`,
  que acompanha mudanças de `prefers-color-scheme` em tempo real.

## Gates

- `pnpm check:theme` bloqueia padrões críticos e neutros claros sem variante
  dark no `web-tenant`.
- `pnpm --filter @gestor/web-tenant test` cobre contratos de tema e layout.
- `scripts/dashboard-theme-e2e.ts` valida dashboard, zonas de entrega,
  relatórios, estoque e promoções em desktop/mobile e light/dark, incluindo
  overflow, erros de console/rede e screenshots da CI.

O relatório amplo (`pnpm check:theme:report`) continua útil para priorização,
mas não é gate porque contém dívida histórica que precisa ser reduzida de forma
incremental.
