# Admin Access Runbook

## Admin Inicial

- Nao usar senha padrao em producao.
- Criar admin inicial por procedimento seguro e auditavel.
- Gerar senha forte fora do repositorio.
- Trocar senha no primeiro acesso, se o fluxo suportar.
- Registrar quem criou e quando.

## Permissoes

- Revisar perfis SaaS admin antes do go-live.
- `saas.billing.audit` deve ficar apenas em perfis financeiros/operacionais autorizados.
- `saas.support.impersonate` deve ser restrito a suporte senior/operacao.
- Acesso a health/admin deve exigir token admin valido.

## Impersonation

- Exigir motivo claro.
- Logar admin, tenant, motivo e duracao.
- Nunca emitir refresh token para impersonation.
- Revisar logs de impersonation semanalmente no inicio da operacao.

## 2FA

2FA ainda deve ser tratado como roadmap obrigatorio para hardening. Ate existir 2FA, reduza superficie:

- senhas fortes;
- acessos individuais;
- logs revisaveis;
- menor privilegio;
- revogacao imediata no desligamento de operador.

## Checklist Periodico

- [ ] Usuarios admin ativos revisados.
- [ ] Permissoes criticas revisadas.
- [ ] Impersonations revisadas.
- [ ] Admins inativos removidos.
- [ ] Secrets de emergencia rotacionados quando necessario.
