---
title: Validação Independente da Documentação
status: current
owner: engineering
last_verified: 2026-07-15
---

# Validação Independente da Documentação (Auditoria Adversarial)

> Relatório gerado por revisão independente da base documental consolidada contra o código executável.

---

## 1. Resumo

* **Nível de confiança da documentação:** Moderado a Alto (com exceções críticas detalhadas abaixo).
* **Quantidade de afirmações verificadas:** ~45 (comandos, contratos, status de features, isolamento).
* **Quantidade de inconsistências:** 5 descobertas na validação.
* **Bloqueadores para adoção do `AGENTS.md`:** Nenhum. O `AGENTS.md` reflete corretamente as restrições arquiteturais.

---

## 2. Achados

| ID | Severidade | Documento | Afirmação | Evidência no código | Correção recomendada |
| -- | ---------- | --------- | --------- | ------------------- | -------------------- |
| V-001 | Alta | `feature-matrix.md` | Feature `scheduling` marcada como `Stable`. | `apps/api/src/scheduling/scheduling.controller.ts` (linhas 138, 144, 151, 186, 192) lança `NotImplementedException` para as rotas. | Reclassificar `scheduling` como `Beta` ou `Stub` e adicionar ao `known-gaps.md`. |
| V-002 | Alta | `feature-matrix.md` | `kds` marcado como `Beta`. | `apps/api/src/kds/kds.controller.ts` lança `NotImplementedException('Not implemented yet')`. | Reclassificar como `Stub` ou adicionar nota de não-funcional. |
| V-003 | Média | `feature-matrix.md` | (Omissão) `split_payment` não listado. | `split-payment.controller.ts` lança `NotImplementedException` para endpoints e não tem feature flag explícita na matriz. | Listar feature na matriz como `Stub`. |
| V-004 | Resolvido | `feature-matrix.md` | `ifood_marketplace` permanece `Beta`. | Stubs removidos na Sprint 5A; confirmação/cancelamento são reais por contrato, com homologação externa pendente. | Manter Beta até homologação oficial. |
| V-005 | Baixa | `known-gaps.md` | Refere-se a `drop_models.js` apagando o banco. | O script na verdade faz replace com regex no arquivo `schema.prisma` diretamente, removendo as definições de model. | Atualizar a descrição do risco de `drop_models.js` (apaga definições do schema.prisma). |

---

## 3. Comandos validados

Os comandos descritos no `AGENTS.md` e `docs/getting-started/local-development.md` foram verificados contra os `scripts` definidos no `package.json` raiz e de pacotes.

| Comando | Resultado | Evidência |
| ------- | --------- | --------- |
| `pnpm install` | Existente, natural do pnpm | — |
| `pnpm dev:api` | Verificado com sucesso | Presente em `package.json` |
| `pnpm dev:web-tenant` | Verificado com sucesso | Presente em `package.json` |
| `pnpm dev:all` | Verificado com sucesso | Presente em `package.json` |
| `pnpm build` | Verificado com sucesso | Presente em `package.json` |
| `pnpm lint` | Verificado com sucesso | Presente em `package.json` |
| `pnpm typecheck` | Verificado com sucesso | Presente em `package.json` |
| `pnpm check:no-any` | Verificado com sucesso | Presente em `package.json` |
| `pnpm check:boundaries` | Verificado com sucesso | Presente em `package.json` |
| `pnpm check:theme` | Verificado com sucesso | Presente em `package.json` |
| `pnpm db:migrate` | Verificado com sucesso | Presente em `package.json` (executa `prisma migrate dev`) |
| `pnpm db:seed` | Verificado com sucesso | Presente em `package.json` |
| `pnpm smoke:p1` | Verificado com sucesso | Presente em `package.json` |

---

## 4. Links inválidos

| Documento | Link | Problema |
| --------- | ---- | -------- |
| N/A | N/A | Todos os links gerados na auditoria atual no `docs/README.md` usam links relativos consistentes. |

---

## 5. Contratos incompletos

| Contrato | Informação ausente | Risco |
| -------- | ------------------ | ----- |
| `order-lifecycle.md` | Resolvido na Sprint 5A: documenta deferimento local, `202` assíncrono e conclusão somente por evento oficial. | Homologação externa ainda pendente. |

---

## 6. Pontos de verificação especial (Checklist)

1. **`drop_models.js`**: O script altera o arquivo fonte `schema.prisma` removendo as entidades via regex, em vez de apagar do banco. O risco é corromper o esquema e forçar uma re-geração destrutiva do prisma.
2. **Referência a `drop_models.js`**: Não há referências em scripts no `package.json`. É puramente ad-hoc.
3. **Timezone das Campanhas**: Sim, está de fato *hardcoded* (`timeZone: 'America/Sao_Paulo'`) em `apps/api/src/campaigns/services/campaign.processor.ts` na linha 262.
4. **Impacto do Timezone**: Afeta os *Repeatable Jobs* (BullMQ) para automações recorrentes da plataforma.
5. **Config de Timezone no Tenant**: O arquivo de DTO `update-tenant-settings.dto.ts` existe, mas não suporta passagem do timezone para os jobs.
6. **Push Notifications**: Permanecem stub no código (`apps/api/src/notifications/push.service.ts`). O `models.prisma` não possui tabela.
7. **README web-delivery**: Identificado como Protótipo e PWA. (Condizente).
8. **Scheduling endpoints**: Lançam intensivamente `NotImplementedException`, contradizendo `Stable`.

---

## 7. Status final

**Status: Aprovada com ressalvas.**

A arquitetura descrita, as regras de `AGENTS.md`, o setup local e as variáveis de ambiente estão sólidas e perfeitamente descritas, refletindo o projeto com precisão. O isolamento de Tenant e o Lifecycle de Pedidos documentados estão aderentes ao código.

A **ressalva** recai exclusivamente sobre a `feature-matrix.md`, onde o otimismo na declaração de módulos operacionais (Scheduling, KDS, Pagamentos, Marketplace) mascara a dependência de exceptions `NotImplementedException` ou lógicas *stubbed* na camada de controllers e providers.

### Recomendação Final
Atualizar a matriz de features para refletir que `scheduling`, `kds` e fluxos completos do `ifood_marketplace` estão em estágio **Stub** (ou contêm Stubs parciais), e não *Stable* ou puramente *Beta*. A matriz de features do `AGENTS.md` também deve ser ajustada.
