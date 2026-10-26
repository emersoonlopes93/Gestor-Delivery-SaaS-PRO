# Checklist V1: ensaio interno e piloto controlado

Este checklist separa evidência técnica de operação real. Ele não autoriza
deploy, migration, seed, limpeza automática ou ativação de recursos fora do
preset V1.

## Estados de decisão

| Estado | Significado |
|---|---|
| `SANDBOX_QA_READY` | CI do SHA relevante está verde e o roteiro pode ser executado somente com tenant e pedidos descartáveis. |
| `PILOT_NOT_READY` | Estado padrão até que R1, R2, R3, R4, R9 e E0-OPS tenham aceite autenticado aplicável. |
| `PILOT_READY` | Gates de abertura de piloto concluídos, flags revisadas, rollback definido e aceite humano registrado. Não significa produção para clientes reais. |
| `PRODUCTION_NOT_READY` | Estado padrão até cumprir todos os gates de [release](../release-gates.md), inclusive staging, backup/restore, infraestrutura e aprovação manual. |

## Pré-requisitos do ensaio interno

- Identificar tenant fictício e usuário de teste com RBAC mínimo necessário.
- Usar catálogo publicado, horário, área de entrega e formas de pagamento de
  teste explicitamente configurados.
- Criar apenas pedidos descartáveis; não usar dados de cliente, segredo ou PII
  real nos anexos de evidência.
- Registrar versão/SHA do frontend e da API **quando verificáveis**. Preview
  Vercel não comprova sozinho o SHA da API Dokploy.
- Confirmar observabilidade mínima: health acessível, logs sanitizados e forma
  humana de localizar request/correlation ID.
- Definir limpeza manual não destrutiva: cancelar os pedidos do ensaio conforme
  o fluxo normal e desativar o tenant de teste se necessário. Não rodar seed,
  `db push`, truncate ou cleanup automático.

## Roteiro manual do ensaio

| # | Cenário | Esperado | Evidência mínima |
|---|---|---|---|
| 1 | Login e troca de tenant/RBAC | Usuário só vê e opera o tenant permitido; sem vazamento entre lojas. | Papel, tenant fictício, captura sanitizada. |
| 2 | Catálogo publicado e item indisponível (R9) | Item disponível aparece; produto/categoria indisponível não entra no pedido. | URL pública e resultado sem PII. |
| 3 | Checkout delivery e retirada (R1/R2) | Resumo, taxa e total são calculados pelo servidor; erro de cobertura é recuperável. | Pedido descartável e resposta sanitizada. |
| 4 | Retry/idempotência do checkout (R1) | Reenvio controlado não duplica pedido/cobrança. | IDs sanitizados e contagem antes/depois. |
| 5 | Operação e cancelamento | Transições permitidas funcionam; terminal não aceita alteração indevida. | Timeline sanitizada. |
| 6 | POS básico e caixa | Quando POS for usado, sessão de caixa exigida é respeitada e pagamento não duplica. | Sessão/pedido de teste. |
| 7 | Baixa e reversão de estoque | Baixa canônica ocorre uma vez; reversão usa o fluxo próprio e mantém histórico. | Movimentos sanitizados. |
| 8 | CMV por pedido | Consulta mostra cobertura `KNOWN`/`PARTIAL`/`UNKNOWN`; custo insuficiente não vira valor inventado. | Tela/resposta sanitizada. |
| 9 | Editar economia após baixa | Retorna `409 ORDER_ECONOMIC_EDIT_REQUIRES_RECONCILIATION`; linhas, total, movimentos e CMV não mudam. | Código/resposta e antes/depois. |
| 10 | Editar somente observação após baixa | Nota geral/item persiste após recarregar, sem alterar linhas, total, estoque ou CMV. | Antes/depois sanitizado. |
| 11 | Financeiro básico | Lançamentos suportados são visíveis; não interpretar como DRE ou margem histórica real. | Tela sanitizada. |
| 12 | Saúde e sessão (E0-OPS) | Health, nova sessão e revogação aplicável respondem conforme ambiente controlado. | Timestamp, ambiente e resultado. |

## Registro de evidência

Para cada cenário, registrar ambiente, data/hora, SHA de API/frontend quando
verificável, tenant fictício, executor, `PASS`/`FAIL`/`NOT_RUN`, link ou log
sanitizado e observações. Não registrar senha, token, telefone, endereço ou
outro dado pessoal.

## Gates para abrir piloto controlado

- R1, R2, R3, R4 e R9 com aceite autenticado nos cenários que lhes cabem.
- E0-OPS concluída: API no SHA integrado, revogação global de `AuthSession`,
  health e smoke de nova sessão aprovados.
- CI do SHA aplicável verde; flags de marketplace, BI, KDS/printing, campanhas,
  WhatsApp avançado, split payment, metas, AI, franquia, dine-in e delivery
  zones avançadas permanecem desligadas.
- Zero P0/P1 demonstrado no núcleo habilitado e rollback de código/feature/tenant
  documentado.
- Dependências humanas de Dokploy/Vercel e smoke autenticado concluídas; não
  inferir aprovação da API a partir de Preview Vercel.

Os gates de produção para clientes reais continuam em
[release-gates.md](../release-gates.md) e não são reduzidos por este checklist.

## Pendências de maior valor

| Item | Já há evidência? | Próxima prova/ação mínima | Bloqueia ensaio interno? | Bloqueia piloto/cliente real? |
|---|---|---|---|---|
| R1/R2: checkout, entrega, retirada e idempotência autenticados | CI e testes técnicos; sem aceite humano atual | Executar cenários 3–4 em tenant descartável | Não | Sim |
| R3/R4: entregador e filial com RBAC | Não verificado nesta rodada | Aceite autenticado com fixtures de driver/admin | Não | Sim |
| R9: indisponibilidade pública | Não verificado nesta rodada | Exercitar cenário 2 com horário controlado | Não | Sim |
| E0-OPS: sessão/health no ambiente alvo | CI técnico; ambiente Dokploy não pareado | Rodar smoke autenticado no ambiente controlado | Não | Sim |
| Pareamento Preview/API Dokploy | Não verificado | Registrar URL e SHA da API antes de QA integrada | Não | Sim |
| Backup/restore, Redis/BullMQ, storage e staging | Não verificado nesta rodada | Cumprir [release gates](../release-gates.md) | Não | Sim, produção |
| Marketplaces, BI e automações avançadas | Fora do preset V1 | Manter flags desligadas; avaliar em fase própria | Não | Não, enquanto desligados |

## GO / NO-GO do ensaio

**GO para ensaio interno**: CI do SHA relevante verde, tenant descartável e
RBAC disponíveis, flags avançadas desligadas, roteiro e rollback definidos.

**NO-GO para piloto controlado**: qualquer P0/P1 no núcleo habilitado, ausência
de aceite autenticado obrigatório, ambiente/API não identificados ou rollback
indefinido. Recursos opcionais desligados não são bloqueio por si só.
