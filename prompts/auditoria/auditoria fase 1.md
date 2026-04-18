Quero que você atue como um ARQUITETO DE SOFTWARE SÊNIOR + AUDITOR TÉCNICO DE CODEBASE e faça uma AUDITORIA TÉCNICA COMPLETA da implementação da Fase 1 do meu sistema SaaS de gestão de delivery.

## Objetivo da auditoria
Validar se a Fase 1 foi implementada corretamente, com base arquitetural sólida, segura, escalável e preparada para a evolução dos módulos de negócio.

Quero que você audite de forma crítica, sem assumir que “está tudo certo” só porque existe código.

Sua missão é verificar se a implementação está realmente correta nos seguintes pilares:
- fundação do monorepo
- arquitetura backend
- multi-tenant
- autenticação
- RBAC do tenant
- RBAC do SaaS Admin
- separação de contextos
- contratos compartilhados
- core neutro e plugável
- tipagem forte
- ausência de `any`, `as any` e tipagem insegura
- prontidão real para iniciar a Fase 2

---

# Contexto do produto
Este projeto é um sistema de GESTÃO DE DELIVERY para:
- restaurantes
- pizzarias
- açaiterias
- sushis
- lanchonetes e similares

## Foco principal do produto
O foco principal é a OPERAÇÃO DA LOJA / TENANT:
- pedidos
- dashboard
- PDV
- KDS
- kanban
- entregadores
- rastreamento
- CRM
- estoque
- caixa
- relatórios
- cardápio digital online
- combos
- complementos
- cupons
- cashback
- fidelidade
- metas

## Papel do SaaS Admin
O SaaS Admin existe apenas como camada de ORQUESTRAÇÃO da plataforma:
- multi-tenant
- planos
- billing futuro
- suporte
- financeiro interno
- auditoria
- governança
- ativação de módulos
- controle de capacidades por tenant

---

# Escopo auditado
A auditoria deve verificar a implementação da **FASE 1**, que deveria conter:

- fundação do monorepo
- apps base
- packages base
- backend foundation
- schema Prisma inicial
- auth base
- multi-tenant base
- RBAC Tenant
- RBAC SaaS Admin
- frontend base `web-tenant`
- frontend base `web-admin`
- contratos compartilhados

---

# Regra arquitetural obrigatória 1: core neutro e plugável
O projeto deve possuir ou caminhar claramente para um `packages/core` **neutro, agnóstico de UI e framework**, e preparado para **módulos plugáveis**.

## O que significa isso
O `core` deve conter apenas elementos compartilháveis e neutros, como:
- enums
- constants
- contratos
- status
- regras puras
- capabilities
- feature definitions
- policies
- helpers puros
- mapeamentos de permissões
- contratos de módulo

## O que NÃO deve estar no core
- componentes React
- controllers NestJS
- acesso direto ao banco
- regras presas ao frontend
- regras específicas do SaaS Admin sem abstração
- lógica específica de tela
- lógica acoplada a um módulo concreto sem contrato claro

## O que a auditoria deve verificar
1. se o `core` está realmente neutro
2. se existe acoplamento indevido ao frontend/backend
3. se o `core` está preparado para evolução por módulos plugáveis
4. se permissões, capabilities e contratos estão em lugar correto
5. se a arquitetura atual favorece ativação/desativação futura de módulos por plano/tenant
6. se há sinais de que o projeto pode escalar por módulos sem virar monólito caótico

---

# Regra arquitetural obrigatória 2: contratos compartilhados
O sistema deve ter contratos compartilhados claros e tipados para:
- auth
- session
- actor context
- tenant context
- roles
- permissions
- respostas padrão
- payloads centrais
- enums e status centrais

## O que a auditoria deve verificar
1. se os contratos realmente existem
2. se estão em packages compartilhados e não duplicados
3. se backend e frontend reutilizam os mesmos contratos
4. se há redefinição duplicada de tipos
5. se existem contratos frágeis, implícitos ou inconsistentes

---

# Regra arquitetural obrigatória 3: tipagem forte
A tipagem forte é obrigatória em todo o projeto.

## Proibição formal
É EXPRESSAMENTE PROIBIDO:
- usar `any`
- usar `as any`
- usar tipagem solta para contornar erro estrutural
- usar casts inseguros sem justificativa técnica real
- retornar dados sem contrato explícito
- aceitar payloads não tipados em fronteiras críticas
- duplicar tipos equivalentes em múltiplos lugares quando deveriam estar compartilhados

## Strict typing como regra arquitetural
Considere como esperado:
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`

## O que a auditoria deve verificar
1. se existem usos de `any`
2. se existem usos de `as any`
3. se existem casts inseguros equivalentes
4. se há DTOs/responses sem tipo explícito
5. se stores/hooks/clients no frontend estão tipados
6. se services/guards/controllers no backend estão tipados
7. se Prisma está sendo usado com tipos coerentes
8. se existe vazamento de `unknown` mal resolvido
9. se lint/tsconfig realmente reforçam strict typing
10. se a base está preparada para crescer sem degradação de tipos

---

# Regra arquitetural obrigatória 4: separação rigorosa de contextos
Você deve validar a separação rigorosa entre:

## Contexto 1 — Tenant / Loja
Contexto operacional da loja.  
Tudo que é da operação deve respeitar `tenant_id`.

## Contexto 2 — SaaS Admin
Contexto interno da plataforma.  
Não deve ser tratado como “um tenant especial”.

## O que a auditoria deve verificar
1. se usuários tenant e admin estão realmente separados
2. se roles/permissões tenant e admin estão separados
3. se guards tenant e admin estão separados
4. se rotas tenant e admin estão separadas
5. se payloads/session contexts distinguem corretamente os dois atores
6. se existe risco de cruzamento entre contextos
7. se o `JwtStrategy` compartilhado, caso exista, é seguro
8. se um token admin pode acessar algo de tenant indevidamente
9. se um token tenant pode acessar algo admin indevidamente

---

# Regra arquitetural obrigatória 5: multi-tenant correto
O projeto deve usar arquitetura de banco compartilhado com isolamento por `tenant_id`.

## O que a auditoria deve verificar
1. se as entidades corretas possuem `tenant_id`
2. se os índices e uniques estão adequados
3. se serviços e queries exigem tenant context quando necessário
4. se existe risco de vazamento entre tenants
5. se há endpoints sem enforcement de tenant
6. se o tenant context é resolvido de forma segura
7. se há pontos de bypass do isolamento

---

# Regra arquitetural obrigatória 6: RBAC forte
A auditoria deve validar tanto o RBAC do tenant quanto o RBAC do SaaS Admin.

## Tenant RBAC
Validar:
- roles
- permissions
- role_permissions
- user_roles
- guards
- decorators
- enforcement real no backend
- proteção coerente no frontend

## SaaS Admin RBAC
Validar:
- arquitetura separada
- roles e permissions separadas
- guards próprios
- decorators próprios
- enforcement real no backend
- proteção coerente no frontend

## O que a auditoria deve verificar
1. se RBAC existe de verdade ou só estruturalmente
2. se endpoints estão realmente protegidos
3. se há rotas autenticadas sem checagem granular de permissão
4. se as permissões seeded batem com as permissões do código
5. se frontend esconde UI sem permissão, mas sem confiar só nisso
6. se backend continua sendo o guardião real da autorização

---

# Regra arquitetural obrigatória 7: base escalável para módulos futuros
Mesmo sem implementar módulos de negócio agora, a base deve estar pronta para crescer de forma modular.

## O que a auditoria deve verificar
1. se a estrutura do monorepo é escalável
2. se packages estão bem separados
3. se apps tenant/admin/storefront estão bem delimitados
4. se a arquitetura favorece novos módulos:
   - catálogo
   - pedidos
   - KDS
   - PDV
   - CRM
   - estoque
   - delivery
   - relatórios
5. se a base favorece módulos plugáveis por capability/feature flag/plano
6. se existe acoplamento prematuro que prejudique a Fase 2

---

# O que você deve fazer na auditoria
Quero uma auditoria real, não uma descrição superficial.

## Passo 1 — Ler e mapear a implementação
- mapear estrutura de pastas
- mapear apps
- mapear packages
- mapear módulos backend
- mapear schema Prisma
- mapear autenticação
- mapear guards/decorators
- mapear contratos compartilhados
- mapear frontend base

## Passo 2 — Verificar aderência arquitetural
Comparar a implementação com as regras acima e apontar:
- aderência total
- aderência parcial
- ausência
- desvio arquitetural

## Passo 3 — Procurar problemas reais
Quero que você procure especificamente:
- vazamento entre contextos tenant/admin
- falhas de tenant isolation
- uso de `any`
- uso de `as any`
- casts inseguros
- duplicação de contratos
- endpoints sem autorização granular
- endpoints sem tenant enforcement
- dependências erradas do core
- acoplamento indevido do core ao framework ou UI
- contratos frouxos
- tipagem implícita perigosa
- problemas de escalabilidade futura

## Passo 4 — Classificar os achados
Classifique cada achado como:
- crítico
- alto
- médio
- baixo

## Passo 5 — Propor correções objetivas
Para cada problema encontrado, informar:
- causa
- impacto
- correção recomendada
- prioridade

---

# Checklist obrigatória
Quero que você mantenha no output uma **CHECKLIST VISÍVEL**, marcando com:
- `[x]` para validado/conforme
- `[ ]` para ausente/não validado
- `[~]` para parcialmente conforme ou com risco

Exemplo esperado:

- [x] Estrutura inicial do monorepo
- [x] Separação de apps base
- [~] Core neutro, mas ainda com acoplamentos indevidos
- [x] Contratos compartilhados base
- [ ] Proibição efetiva de `any`
- [~] Strict typing parcial
- [x] Multi-tenant base
- [~] Enforcement de tenant em parte dos endpoints
- [x] RBAC Tenant
- [x] RBAC SaaS Admin
- [~] Proteção frontend coerente, mas dependente de ajustes
- [ ] Testes críticos de auth/autorização

Essa checklist deve aparecer no resultado final e refletir a auditoria real.

---

# Formato obrigatório da resposta
Sua resposta final deve conter exatamente estas seções:

## 1. Resumo executivo
Resumo curto com seu veredito sobre a Fase 1.

## 2. Checklist de auditoria
Checklist visível e atualizada.

## 3. Aderência arquitetural
Análise por pilar:
- monorepo
- backend foundation
- core neutro e plugável
- contratos compartilhados
- tipagem forte
- multi-tenant
- auth
- RBAC Tenant
- RBAC SaaS Admin
- frontend base

## 4. Achados críticos
Somente problemas críticos.

## 5. Achados de alta prioridade
Problemas altos.

## 6. Achados médios e baixos
Problemas não bloqueantes, mas relevantes.

## 7. Uso de tipagem insegura
Seção específica listando:
- ocorrências de `any`
- ocorrências de `as any`
- outros casts inseguros
- ausência de strict typing
- contratos implícitos

## 8. Avaliação do core
Seção específica respondendo:
- o core está neutro?
- o core está plugável?
- o core está acoplado a alguma camada?
- o core está pronto para módulos futuros?
- o core contém contratos no lugar certo?

## 9. Correções recomendadas
Lista objetiva de correções por prioridade.

## 10. Veredito final
Responder claramente uma destas opções:
- **Pronto para Fase 2**
- **Pronto para Fase 2 com ajustes obrigatórios**
- **Não está pronto para Fase 2**

---

# Restrições da auditoria
- não invente funcionalidades que não existem
- não assuma que “está ok” sem verificar
- não responda de forma genérica
- não ignore acoplamentos
- não ignore tipagem insegura
- não ignore vazamento entre contextos
- não ignore ausência de enforcement real
- não confunda existência estrutural com segurança real
- não suavize problemas críticos

---

# Resultado esperado
Ao final, quero um diagnóstico técnico confiável da Fase 1, incluindo:
- qualidade da fundação
- segurança do multi-tenant
- robustez do RBAC
- neutralidade e plugabilidade do core
- qualidade dos contratos
- maturidade da tipagem
- prontidão real para entrar na Fase 2