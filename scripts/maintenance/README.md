# Scripts de Manutenção

> ⚠️ **ATENÇÃO** — Scripts nesta pasta são destrutivos ou de uso restrito.  
> **NUNCA executar sem ler este README e sem backup prévio.**

---

## Regras de uso

- Todos os scripts exigem `--force` explicitamente.
- Todos os scripts falham fechado em `NODE_ENV=production`.
- Sempre faça backup antes de executar em qualquer ambiente com dados reais.
- Nunca executar diretamente em staging ou produção.

---

## Scripts disponíveis

### `clean_schema.js`

**Propósito:** Remove campos de relações legadas de catálogo v2 do `schema.prisma`.  
**Origem:** Necessário durante a migração catálogo v2 → v3 (migration `20260608000000_drop_legacy_catalog_v2`).  
**Status:** Histórico — não deve mais ser necessário após a migration aplicada.

```bash
node scripts/maintenance/clean_schema.js --force
```

### `clean_schema2.js`

**Propósito:** Remove linhas com referências a modelos legados de catálogo v2.  
**Origem:** Alternativa mais agressiva ao `clean_schema.js`.  
**Status:** Histórico — não deve mais ser necessário após a migration aplicada.

```bash
node scripts/maintenance/clean_schema2.js --force
```

---

## Após executar qualquer script

```bash
pnpm prisma:validate  # Verifica integridade do schema
pnpm typecheck        # Garante que tipos seguem o schema
```
