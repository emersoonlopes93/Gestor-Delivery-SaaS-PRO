# AUDIT R4 — segurança da criação de filiais

Data: 2026-08-01  
Base auditada: `940d60f8096aaba87edf4b16fe5fc99dca3bab42`

## Resultado obrigatório

| Item | Resultado |
|---|---|
| Branch domain model | Uma filial é um `Tenant` distinto. `BusinessGroup` é global e agrega a matriz e seus tenants-filiais por `Tenant.businessGroupId`. |
| Tenant/Branch relation | `Tenant.businessGroupRole` distingue `headquarters` e `branch`; `BusinessGroup.headquartersTenantId` identifica a matriz. Não existe model `Branch` ou `Store/Location` separado. |
| Identity model | Não existe `User` global nem tabela de membership. `TenantUser` é a identidade autenticável tenant-scoped. A descoberta de lojas procura o mesmo e-mail normalizado em `TenantUser` dentro do mesmo `BusinessGroup`. |
| TenantUser semantics | Para a filial ser acessível pela mesma conta, o modelo atual exige um novo `TenantUser` no novo tenant, com uma nova `TenantUserRole` de owner. Isso é **A. CREATE NEW LINK**. Não é reutilização da mesma linha nem convite. |
| Unique constraint | `tenant_users_tenant_id_email_key`, model `TenantUser`, campos `(tenant_id, email)`; schema Prisma `@@unique([tenantId, email])`. O mesmo e-mail em tenants diferentes é válido. |
| Duplicate root cause | O erro observado em `tx.tenantUser.create()` prova que já havia uma linha com o mesmo par tenant/e-mail usado pela chamada. Uma primeira execução isolada do HEAD cria antes um `Tenant` com UUID novo e, portanto, não pode colidir nesse par. O fluxo não possui classificação de `P2002`, recuperação de retry ou prova de que um vínculo existente pertence à mesma operação. Assim, replay/estado já existente chega ao `create` cego e vira erro interno. Não há evidência que autorize um `upsert` genérico. |
| Existing row before create | **YES**, por definição da constraint observada; não foi acessado banco de produção para inspecionar a linha. A correção só aceitará uma linha existente quando tenant, grupo, papel, slug, nome e owner coincidirem com a operação. |
| Same tenant or different tenant | A colisão é necessariamente no mesmo tenant-alvo. Repetir o e-mail em outro tenant é permitido pelo índice composto. |
| Retry/race/data copy | O cliente tem risco de reentrada; o backend não tem chave persistente. A leitura do slug fica fora da transação e a criação inicial do grupo usa estado lido antes dela. Corridas podem gerar `P2002` de slug ou transação concorrente. Copiar o e-mail para outro tenant é a semântica intencional, não um conflito. |
| Transaction coverage | Os writes atuais de `BusinessGroup`, vínculo da matriz, `Tenant`, onboarding/settings/configs, `TenantUser`, roles, permissions e `TenantUserRole` estão numa transação interativa. Billing/subscription, menu/base menu, delivery e storefront não são provisionados nesse fluxo e permanecem para onboarding. |
| Partial-write risk | Falhas lançadas dentro da transação fazem rollback, portanto não deixam Tenant/TenantUser parciais. Há risco concorrente de grupos divergentes porque o tenant/grupo autoritativo é lido antes da transação e a transação não é `Serializable`. |
| Cleanup/rollback | Rollback Prisma existe; cleanup manual não é necessário. Não há efeitos externos pós-commit nesse fluxo. |
| Retry/idempotency | **NO** no estado auditado. A solução mínima sem migration usa o slug global determinístico como chave natural: mesma matriz/grupo + slug + nome + owner link completo recupera a filial; qualquer divergência retorna 409. Transação `Serializable` é repetida apenas em conflito serializável ou `P2002` de `Tenant.slug`. |
| Authorization | Endpoint exige `settings.manage`; o service restringe adicionalmente ao `tenant_owner` ativo e à matriz. O grupo vem exclusivamente do tenant autenticado. Admin do tenant sem role owner não cria. |
| Branch limit | Nenhum limite de filiais ou entitlement de billing existe no fluxo atual. R4 não inventará limite nem alterará billing. |
| Frontend flow | `StoreNetworkPage` envia `POST /tenant/network/branches`; o botão usa somente `mutation.isPending`, sem trava síncrona. Erros `ApiError` exibem a mensagem do servidor. |
| Double-submit risk | **YES**. Dois submits podem entrar antes do rerender que muda `isPending`. |
| Existing feature flag infrastructure | `/tenant/capabilities` é a fonte server-side consumida por `useTenantCapabilities`. `franchise` é feature beta, mas pode ser habilitada por preset/override e não representa o bloqueio universal temporário da ação de criar. |
| Migration required | **NO**. O slug global já é persistente e único; nenhuma tabela/coluna nova é necessária. |
| API contract change | Aditivo: `TenantCapabilitiesResponse.actions['branches.create']`. O POST bloqueado retorna HTTP 403 com código estável `BRANCH_CREATION_TEMPORARILY_DISABLED`. |
| Recommended minimal fix | Recarregar matriz/grupo dentro de transação `Serializable`; criar o novo link explicitamente; recuperar somente retry comprovadamente equivalente; mapear conflitos reais a 409; adicionar trava síncrona no cliente. |
| Recommended temporary disable mechanism | Capability canônica `branches.create` produzida por `FeatureControlService`, retornada por `/tenant/capabilities`, validada no controller e consumida pela UI. Leitura e gestão de filiais continuam disponíveis. |
| Implementation allowed | **YES**. Não há mudança estrutural de identidade, schema, billing ou BusinessGroup. |

## Invariantes da implementação

- Nunca vincular uma filial encontrada por slug a outro grupo.
- Nunca considerar sucesso apenas porque ocorreu qualquer `P2002`.
- Somente recuperar uma tentativa quando o recurso completo já pertence à matriz autenticada e possui o owner esperado.
- O bloqueio de release não remove `GET /tenant/network` nem a navegação das lojas existentes.
- Nenhuma migration, seed, provider, credencial ou acesso a produção faz parte da R4.
