# Rotação de secrets de assinatura e sessão

## Escopo E0

Este runbook cobre `JWT_SECRET`, `JWT_REFRESH_SECRET` e qualquer credencial
adicional confirmada no mesmo arquivo de ambiente rastreado. Nunca registrar
valores, hashes parciais, tamanhos, tokens, cookies ou headers Authorization.

## Pré-requisitos obrigatórios

1. sessão Dokploy autenticada, projeto, environment e serviço API confirmados;
2. SHA implantado, branch de origem e health atual registrados sem secrets;
3. destino de banco confirmado sem imprimir URLs completas;
4. backup recente, não vazio e utilizável confirmado;
5. `CLEAN_DB` ausente ou `false`, sem migration, seed ou limpeza na janela;
6. responsável operacional presente e usuários avisados de logout global;
7. fonte canônica de variáveis confirmada e definições duplicadas eliminadas.

## Execução

1. Com uma conta controlada, capturar access e refresh tokens antigos somente
   em memória protegida fora do repositório; não imprimi-los.
2. O proprietário gera diretamente no Dokploy dois valores independentes com
   pelo menos 256 bits de entropia para os dois JWT secrets. Não usar shell,
   chat, arquivo do repositório, artefato de CI ou histórico de comandos.
3. Atualizar somente o serviço API e reiniciar/redeployar de modo controlado.
4. Executar, no destino de banco já confirmado, o comando abaixo. Ele exige os
   dois guardrails e retorna apenas contagens agregadas:

   ```bash
   NODE_ENV=production CONFIRM_GLOBAL_SESSION_REVOCATION=true pnpm --filter @gestor/api sessions:revoke-all-production
   ```

5. Registrar somente: sessões ativas antes, sessões revogadas e sessões ativas
   depois.

## Validação pós-rotação

- access e refresh tokens antigos retornam HTTP 401 ou 403;
- novo login, rota protegida, refresh, logout e refresh pós-logout obedecem ao
  contrato de autenticação;
- validar os fluxos aplicáveis de web-tenant, web-admin, web-delivery,
  customer auth, health e WebSocket com contas controladas;
- inspecionar logs por padrões seguros: sem secrets, JWTs, Authorization,
  cookies, refresh tokens, loop de 401, crash ou stack trace crítico.

## Rollback

Nunca restaurar secrets comprometidos. Se a primeira configuração nova falhar,
gerar outro par novo, corrigir a fonte de configuração e reiniciar a API. Um
rollback de código pode apontar para SHA anterior, mas permanece com secrets
novos e sessões antigas inválidas.

## Histórico

Após a rotação, inventariar commits e refs afetadas e abrir E0H — coordinated
Git history purge. Não executar `git filter-repo`, BFG, reescrita de refs ou
force push sem autorização separada e coordenação de colaboradores.
