# Política e Diretrizes de Segurança de Tipagem (Type Safety)

Este documento estabelece as regras oficiais, restrições estritas e as exceções técnicas justificadas para a segurança de tipos (Type Safety) no monorepo do **Gestor Delivery SaaS PRO**.

---

## 🎯 Objetivo

Garantir robustez estática contínua do ecossistema, eliminando regressões de tipagem frouxa ou insegura que possam mascarar bugs de runtime. O projeto impõe **zero regressões não autorizadas** para padrões que enfraquecem o compilador TypeScript.

---

## 🚫 Padrões Banidos (Regras Estritas)

É estritamente proibido reintroduzir ou utilizar os seguintes padrões no código de qualquer aplicação ou pacote do monorepo, sob pena de falha imediata no pipeline de CI/CD:

1. **`any` / `as any`**: Desativa por completo a validação estática do compilador.
2. **`Record<string, any>` / `any[]` / `Array<any>`**: Tipos compostos contendo `any`. Substitua por `Record<string, unknown>`, `unknown[]`, ou tipos e tipos genéricos explícitos.
3. **`Promise<any>`**: Assinaturas assíncronas que mascaram o tipo de retorno retornado por operações assíncronas. Substitua por `Promise<void>`, `Promise<unknown>`, ou o tipo específico do retorno.
4. **Casts Duplos Inseguros (`as X as Y` / `as unknown as` / `as object as`)**: Burlar o checker forçando a coerção de tipos incompatíveis no mesmo fluxo de atribuição.
5. **Diretivas do Compilador (`@ts-ignore` / `@ts-nocheck`)**: Silenciar erros de compilação sem tratá-los ou documentá-los.

---

## 📋 A Allowlist Técnica Oficial

Existem exatamente **dois pontos isolados** de exceção técnica inevitável no monorepo para acomodar APIs externas complexas e integrações dinâmicas de terceiros. Estes são monitorados rigorosamente e estão centralizados para não poluir os componentes ou a lógica de negócio do sistema.

### 1. Centralização do Leaflet Draw Helper

* **Arquivo**: `apps/web-tenant/src/lib/leaflet-draw-helper.ts`
* **Linhas de Exceção**: `30`
* **Código Afetado**: `const drawMap = map as unknown as L.DrawMap;`
* **Motivo Técnico**: O construtor da ferramenta de polígonos `L.Draw.Polygon` exige um objeto do tipo `L.DrawMap`. Como as assinaturas estendidas do `@types/leaflet-draw` colidem estaticamente com o `@types/leaflet` puro, o compilador exige um cast duplo para aceitar a coerção do mapa inicializado.
* **Plano Futuro de Remoção**: Configurar um arquivo de definição de tipos global (`.d.ts`) local no projeto estendendo e mesclando implicitamente as interfaces `L.Map` e `L.DrawMap`, unificando as assinaturas e eliminando o cast duplo dinâmico.

### 2. Manipulador do Escopo Global do Navegador (`Window`)

* **Arquivo**: `apps/web-storefront/src/lib/window-helper.ts`
* **Linhas de Exceção**: `9`, `17`, `28`
* **Código Afetado**: `const win = window as unknown as Record<string, unknown>;`
* **Motivo Técnico**: O objeto global `Window` padrão do navegador não possui indexabilidade de chave arbitrária via string. Integrações dinâmicas como SDKs de terceiros (Google Maps API, Gateways de Pagamento, etc.) injetam propriedades dinâmicas e exigem registro de callbacks no escopo global para comunicação inter-frame. O cast de narrowing centralizado permite a leitura e a escrita dessas propriedades globais dinâmicas de modo isolado sem quebrar o TypeScript global.
* **Plano Futuro de Remoção**: Substituir as coerções genéricas de string (`Record<string, unknown>`) criando interfaces específicas declaradas no escopo do namespace `global.d.ts` (ex: `interface Window { google?: any; myCallback?: () => void }`), garantindo que todas as chaves dinâmicas usadas pelo sistema sejam declaradas de antemão de forma estática.

---

## ⚙️ Integração no Pipeline de CI

A proteção e auditoria de tipos são automatizadas e aplicadas a cada push ou pull request na branch principal através das ferramentas configuradas:

1. **Validação Estática**: Executando o script independente:
   ```bash
   pnpm check:no-any
   ```
2. **Execução no Pipeline (`.github/workflows/ci.yml`)**:
   Inserido como o passo de qualidade técnica **Check No Any (Type Safety)** logo após a etapa de lint e precedendo o build produtivo real de todas as aplicações.

---

## 💡 Melhores Práticas Recomendadas

* **Narrowing de Enums**: Quando houver enums idênticos declarados entre o banco de dados (ex: Prisma Client) e os pacotes de tipos da aplicação (ex: `@gestor/types`), utilize mappers explícitos com estruturas `Record<EnumA, EnumB>` para converter os tipos de forma segura e estática.
* **Usar `unknown` em vez de `any`**: Ao ler dados brutos de fontes dinâmicas (como respostas de rede ou parsing de JSON), declare-os como `unknown` e execute narrowing via Type Guards (`typeof`, `instanceof`, ou funções customizadas com assinatura `x is Type`) para garantir validação antes do uso.
* **Tipagem Infecciosa**: Lembre-se que um único tipo `any` silencia toda a árvore de dependências abaixo dele. Evite-o sempre.
