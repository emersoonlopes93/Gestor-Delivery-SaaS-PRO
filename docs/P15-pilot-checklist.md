# P15 - Tenant Piloto Real

## Checklist de onboarding

- Dados da loja
- Logo e imagem de capa
- Slug público
- Endereco e origem da loja
- Horarios de funcionamento
- Entrega e retirada
- Taxas de entrega por raio
- Tempo estimado de entrega
- Categorizacao do cardapio
- Produtos e complementos
- Formas de pagamento aceitas
- Usuario dono
- Equipe minima
- Impressora e notificacoes, se aplicavel
- Billing/plano MVP
- Modulos premium bloqueados

## Roteiro minimo de configuracao

1. Criar tenant piloto com plano `mvp-starter`.
2. Cadastrar dono da loja.
3. Preencher endereco/origem efetiva.
4. Configurar faixas de entrega por raio.
5. Definir tempo estimado por faixa.
6. Cadastrar pelo menos 2 categorias.
7. Cadastrar pelo menos 5 produtos ativos.
8. Cadastrar ao menos 1 produto com adicional/complemento.
9. Validar storefront e checkout.
10. Validar bloqueio de endereco fora de cobertura.
11. Validar suspensao financeira.

## Dados de rollback

- Suspender billing do tenant piloto.
- Remover pedidos de teste criados durante o piloto.
- Desativar o tenant, se necessario.
- Reverter overrides de modulo premium.
- Restaurar `pizzaria-demo` sem alteracoes.

## Roteiro para cliente piloto

- Abrir painel.
- Configurar entrega.
- Cadastrar um produto.
- Abrir storefront.
- Fazer um pedido de teste.
- Acompanhar o pedido no painel.
- Concluir o pedido.
- Validar se a tela de entrega foi entendida.
- Registrar duvidas e pontos de atrito.
