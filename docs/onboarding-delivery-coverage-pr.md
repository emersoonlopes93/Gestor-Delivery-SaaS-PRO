## Resumo

Corrige o avanço otimista do onboarding: a etapa só avança depois de salvar a cobertura de entrega, marcar a etapa oficial e revalidar o estado no servidor.

## Evidência

- `PUT /delivery/coverage` é aguardado antes do avanço.
- A marcação de etapa e a revalidação são aguardadas em sequência.
- Falhas deixam o tenant na etapa atual e permitem retry.
- Nenhum schema, migration ou algoritmo de tarifa foi alterado.

## Validação local

- web-tenant lint: PASS
- web-tenant test: PASS (46 testes em 10 arquivos)
- web-tenant build: PASS (tsc + Vite)
- `git diff --check`: PASS

O E2E autenticado e os gates globais devem ser confirmados pela CI desta Draft PR.
