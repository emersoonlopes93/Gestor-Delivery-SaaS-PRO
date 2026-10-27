# Escopo Go-Live V1

## Preset V1: default-deny

Habilitar somente o nucleo estavel necessario para uma loja piloto:
autenticacao, tenant, RBAC, catalogo, storefront, checkout, pedidos, upload,
health, configuracoes, delivery basico, POS e financeiro ja suportado. Uma loja
V1 pode autenticar e configurar a operacao, publicar o cardapio, receber pedido,
operar pedido e cancelamento, usar o POS basico e acompanhar os lancamentos
financeiros efetivamente suportados. Cada tenant piloto deve ter permissao
minima, catalogo publicado, horario, formas de pagamento e cobertura de entrega
configurados antes do convite.

Manter desabilitados no preset: scheduling, push notifications, iFood/99Food e
demais marketplaces, campanhas/WhatsApp avancado, KDS/printing, split payment, BI,
goals, AI agent, franquia, dine-in e delivery zones avancadas. Esses recursos
nao sao evidência de bloqueio P0 por si, mas nao possuem aceite V1.

## Limitacoes assumidas

- Sem login Google no V1.
- Sem promessa de push nativo com aparelho bloqueado.
- Sem integracao externa de marketplace, pagamento ou provider novo nesta
  janela.
- Estoque usa baixa canonica quando aplicavel. O CMV historico e consultavel por
  pedido, com cobertura `KNOWN`/`PARTIAL`/`UNKNOWN`; total de custo permanece
  nulo quando a evidencia nao e suficiente. Esta V1 nao promete CMV historico
  agregado, lucro real, DRE real ou retrocalculo de historico legado.
- Depois de qualquer baixa teorica historica, inclusive revertida, itens,
  quantidades e opcoes do pedido nao podem ser alterados. O endpoint de edicao
  retorna `409 ORDER_ECONOMIC_EDIT_REQUIRES_RECONCILIATION`; observacoes pelos
  fluxos cobertos continuam permitidas conforme status e RBAC, sem alterar
  linhas, total, estoque ou CMV. Delta economico, lineage e reconciliacao da
  P1.6 permanecem fora do requisito enquanto esse bloqueio conservador vigorar.
- CI comprova os contratos automatizados integrados ate a #168; aceite
  operacional autenticado ainda e obrigatorio antes de abrir piloto. Preview
  frontend nao prova, por si so, a versao da API Dokploy.
- R1/R2/R3/R4/R9 exigem aceite autenticado com dados controlados antes de
  ativacao para cliente.
- A adesao comercial self-service registra a oferta e a assinatura Billing V2,
  mas nao confirma pagamento. Cobranca SaaS automatica, gateway de producao e
  enforcement global continuam fora do V1 ate haver uma politica comercial e
  uma integracao de pagamento efetivamente homologadas.

## Rollback e piloto

1. Usar um tenant interno/piloto, com catalogo e usuarios de teste, sem dados de
   clientes reais para a primeira rodada.
2. Rollback de codigo usa SHA anterior compativel, mantendo secrets novos; nunca
   reintroduzir secrets historicos comprometidos.
3. Desabilitar a feature/tenant piloto antes de rollback amplo. Nao executar
   `db push`, seed, limpeza de banco ou migration corretiva como acao de rollback.
4. E0-OPS deve estar concluida antes de abrir o piloto: API com SHA integrado,
   revogacao global de `AuthSession`, health e smokes de nova sessao aprovados.
