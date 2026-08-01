# Auditoria de prontidão para Go-Live — 2026-07-31

## Resumo executivo

**Decisão: BLOQUEADO.**

A auditoria foi iniciada sobre `origin/main-copy` no SHA
`6ed4c043e693bac98cb21509e87590f080d599f2`. Durante a inspeção de secrets e
configuração foi confirmado que `.env.docker` é versionado e contém valores
concretos para `JWT_SECRET` e `JWT_REFRESH_SECRET`, além de se declarar como
configuração de produção e listar domínios públicos.

Os valores não são reproduzidos neste documento. O arquivo está no histórico Git
desde commits anteriores. O compose de produção atual referencia `.env`, e não
`.env.docker`, portanto não é possível afirmar sem acesso à VPS se as credenciais
versionadas são as credenciais efetivas do ambiente. Esse acesso é expressamente
proibido pelo briefing.

Credenciais de assinatura versionadas devem ser tratadas como comprometidas até
prova em contrário. O achado é P0 e aciona a regra: registrar, parar, não corrigir
na PR documental e propor uma PR emergencial separada.

## SHA e preservação

- Repositório: `emersoonlopes93/Gestor-Delivery-SaaS-PRO`
- Base: `origin/main-copy`
- SHA auditado: `6ed4c043e693bac98cb21509e87590f080d599f2`
- Worktree: `Gestor-Delivery-SaaS-PRO-go-live-audit`
- Branch: `docs/go-live-readiness-audit`
- Checkout principal: preservado, inclusive alterações locais preexistentes
- `stash@{0}`: preservado; nenhum `stash apply`, `pop` ou `drop`
- PR #33: confirmada como integrada no SHA-base
- PR #34: confirmada aberta, Draft e fora de `main-copy`

## Metodologia executada antes da parada

1. `git fetch origin --prune` e inventário de checkout, SHA, stash e worktrees.
2. Criação de worktree isolada em `origin/main-copy`.
3. Verificação explícita das PRs #33 e #34 com
   `--repo emersoonlopes93/Gestor-Delivery-SaaS-PRO`.
4. Leitura inicial da documentação canônica e buscas read-only sobre checkout,
   autenticação do entregador, endereços, mídia, safe area, filial, catálogo,
   features, filas, health, CORS e secrets.
5. Interrupção imediata após confirmação e verificação mínima do alcance do P0.

## P0 confirmado

| ID | Evidência | Estado | Severidade | Risco | Bloqueia Go-Live |
|---|---|---|---|---|---|
| SEC-001 | `.env.docker:14-16`; histórico do arquivo; `docker-compose.prod.yml:17-24` | CONFIRMADO | P0 | segurança | Sim |

### Causa provável

Um arquivo de configuração operacional foi versionado com valores reais em vez
de conter somente placeholders. A existência no histórico impede considerar a
simples remoção do HEAD como contenção suficiente.

### Limitação de evidência

O uso das mesmas credenciais pela VPS é **BLOQUEADO POR AMBIENTE**. Confirmá-lo
exigiria inspeção de secrets ou runtime de produção, que não foi autorizada. Essa
incerteza não reduz a necessidade de rotação: um segredo versionado deve ser
presumido comprometido.

## PR emergencial proposta — E0

Objetivo: conter o incidente antes de retomar a R0.

Escopo recomendado:

1. Rotacionar `JWT_SECRET` e `JWT_REFRESH_SECRET` no secret manager efetivo.
2. Reiniciar a API de forma controlada e invalidar todas as sessões existentes.
3. Remover valores concretos do arquivo rastreado, substituir por exemplo seguro
   e impedir reincidência via `.gitignore` e verificação de secrets na CI.
4. Avaliar limpeza do histórico com procedimento coordenado; a rotação deve
   ocorrer antes e não depende da reescrita do histórico.
5. Verificar outros tokens/segredos rastreados sem imprimir valores em logs.

Fora de escopo da E0:

- mudança funcional;
- Prisma ou migration;
- deploy de features;
- alteração de presets;
- correção dos achados R1-R10.

Evidência mínima para encerrar E0:

- confirmação do responsável operacional de que ambos os secrets foram rotacionados;
- prova de que tokens e refresh tokens anteriores foram rejeitados;
- smoke de login, refresh, logout e revogação global no SHA implantado;
- CI com detector de secrets e `git diff --check` verdes;
- registro sanitizado de restart/rollout e rollback;
- nenhuma credencial em logs, PR ou documentos.

Rollback:

- manter o valor anterior disponível somente no secret manager durante a janela
  controlada, sem reintroduzi-lo no Git;
- reverter a aplicação para o SHA anterior apenas se necessário, mantendo os
  secrets novos;
- nunca restaurar as credenciais versionadas.

## Itens não concluídos

A verificação consolidada dos quinze itens do proprietário, bloqueadores
adicionais, escopo do Go-Live, roadmap R1-R10 e checklist de aceitação foi
interrompida. Resultados exploratórios anteriores à parada não são classificados
como auditoria concluída.

## Validação

- Baseline `pnpm lint`: exit 1, não iniciou completamente por `eslint` ausente na
  worktree isolada.
- Baseline `pnpm typecheck`: exit 1, não iniciou por `tsc` ausente.
- Dependências não foram instaladas, conforme limite do briefing.
- Validação documental final: pendente, pois a auditoria foi interrompida.

## Decisão

**BLOQUEADO — credenciais JWT concretas estão versionadas em `.env.docker`; a
R0 só deve ser retomada após contenção, rotação comprovada e invalidação de
sessões pela PR emergencial E0.**
