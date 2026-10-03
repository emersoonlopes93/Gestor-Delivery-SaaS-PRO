# Escopo Go-Live V1

## Preset V1: default-deny

Habilitar somente o nucleo estavel necessario para uma loja piloto:
autenticacao, tenant, RBAC, catalogo, storefront, checkout, pedidos, upload,
health, configuracoes, delivery basico, POS e financeiro ja suportado. Cada
tenant piloto deve ter permissao minima, catalogo publicado, horario, formas de
pagamento e cobertura de entrega configurados antes do convite.

Manter desabilitados no preset: scheduling, push notifications, iFood e demais
marketplace, campanhas/WhatsApp avancado, KDS/printing, split payment, BI,
goals, AI agent, franquia, dine-in e delivery zones avancadas. Esses recursos
nao sao evidência de bloqueio P0 por si, mas nao possuem aceite V1.

## Limitacoes assumidas

- Sem login Google no V1.
- Sem promessa de push nativo com aparelho bloqueado.
- Sem integracao externa de marketplace, pagamento ou provider novo nesta
  janela.
- R1/R2/R3/R4/R9 exigem aceite autenticado com dados controlados antes de
  ativacao para cliente.

## Rollback e piloto

1. Usar um tenant interno/piloto, com catalogo e usuarios de teste, sem dados de
   clientes reais para a primeira rodada.
2. Rollback de codigo usa SHA anterior compativel, mantendo secrets novos; nunca
   reintroduzir secrets historicos comprometidos.
3. Desabilitar a feature/tenant piloto antes de rollback amplo. Nao executar
   `db push`, seed, limpeza de banco ou migration corretiva como acao de rollback.
4. E0-OPS deve estar concluida antes de abrir o piloto: API com SHA integrado,
   revogacao global de `AuthSession`, health e smokes de nova sessao aprovados.
