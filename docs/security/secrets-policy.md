# Política de secrets

## Fonte canônica

Valores reais de ambiente pertencem exclusivamente ao secret manager do Dokploy
ou a um mecanismo operacional aprovado. Arquivos `.env` reais não podem ser
versionados, enviados no contexto Docker ou anexados a CI.

Os únicos arquivos de ambiente permitidos no Git são exemplos com placeholders
inequivocamente inválidos, como `REPLACE_IN_DOKPLOY_SECRET_MANAGER`. Examples
nunca podem conter URLs com credenciais, chaves, tokens, senhas ou material de
assinatura utilizável.

## Prevenção

- `.gitignore` bloqueia `.env` e `.env.*`, preservando somente `*.example`.
- `.dockerignore` aplica a mesma política em qualquer diretório; `COPY . .`
  não pode levar arquivos reais ao build.
- O workflow `Secret scanning` usa Gitleaks com saída redigida, checkout de
  histórico completo e permissões somente de leitura.
- Allowlists devem ser específicas por ocorrência e justificadas; não são
  aceitas exclusões amplas de diretórios.

## Resposta a incidente

Todo secret que tenha sido versionado deve ser tratado como comprometido:

1. interromper a reprodução e não registrar o valor em saída, ticket ou log;
2. remover o valor do HEAD e substituir por exemplo seguro;
3. identificar o ambiente e o responsável pelo secret;
4. rotacionar o secret e invalidar credenciais/sessões dependentes;
5. validar a rejeição de credenciais antigas e o fluxo com credenciais novas;
6. inventariar histórico e planejar purga coordenada separadamente.

A rotação não autoriza reescrita de histórico. Purga de refs, force push,
reclone de colaboradores e recriação de PRs exigem mudança coordenada.
