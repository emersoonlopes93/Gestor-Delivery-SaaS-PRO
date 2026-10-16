## Resumo

Corrige o avanço otimista do onboarding: a etapa só avança depois de salvar a cobertura de entrega, marcar a etapa oficial e revalidar o estado no servidor.

## Evidência

- `PUT /delivery/coverage` é aguardado antes do avanço.
- A marcação de etapa e a revalidação são aguardadas em sequência.
- Falhas deixam o tenant na etapa atual e permitem retry.
- O retry retoma a primeira fase pendente e nao repete o `PUT` depois que a cobertura foi persistida.
- O botao de entrega e o handler bloqueiam submits concorrentes ate o fim da operacao.
- Nenhum schema, migration ou algoritmo de tarifa foi alterado.

## Validação local

- web-tenant lint: PASS
- web-tenant test: PASS (46 testes em 10 arquivos)
- web-tenant build: PASS (tsc + Vite)
- `git diff --check`: PASS

O E2E autenticado e os gates globais devem ser confirmados pela CI desta Draft PR.

## Checklist manual controlada

Em um ambiente local de teste com o seed oficial, validar: salvar delivery, duplo clique em
**Proximo**, falha de rede durante a revalidacao, retry, refresh, estado em Configuracoes,
pickup-only e reabertura do onboarding. Confirmar uma unica operacao, ausencia de avancos antes
do `2xx` e ausencia de duplicacao da cobertura.

O padrao autenticado existente usa credenciais de seed por variaveis de ambiente. Nesta sessao,
API e web locais nao estavam em execucao, portanto o E2E autenticado nao foi marcado como aprovado.
