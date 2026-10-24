# Roadmap R1-R10

| PR | Objetivo e escopo | Fora de escopo | Provaveis pontos | Prisma/migration | Risco e aceite | Dependencia/rollback |
|---|---|---|---|---|---|---|
| P1-R1 | Provar e corrigir minimamente resumo, envio e idempotencia de pedido | provider novo, schema e redesign | `CheckoutPage.tsx`, `orders.service.ts`, `orders.atomicity.spec.ts` | Nao esperado | duplo clique/retry cria um pedido; total e resumo corretos | tenant de teste; rollback por codigo |
| P1-R2 | Cobrir checkout progressivo, endereco, entrega/retirada e cobertura | geocoder/provider novo | `CheckoutPage.tsx`, `checkout-validator.service.ts` | Nao esperado | erros recuperaveis; endereco e taxa validados pelo servidor | area de entrega controlada |
| P1-R3 | Confirmar login de entregador sem slug digitado | mudanca de identidade | `web-delivery/LoginPage.tsx`, `driver-auth.*` | Nao esperado | dominio/subdominio e falha sem tenant seguros | fixture de driver |
| P1-R4 | Definir e provar criar/desativar filial com RBAC/isolamento | apagar tenant/dados | tenant/admin services, DTOs e specs | A confirmar apos contrato | filial inativa nao autentica/opera; dados preservados | admin de teste; rollback de status |
| P1-R9 | Provar indisponibilidade por categoria/produto/dia no publico | scheduling completo | catalog publication, storefront service e specs | Nao esperado | item indisponivel nao entra em pedido | horario controlado |
| P2-R5 | Separar preview de configuracao e storefront publico | novo editor | customization/storefront specs | Nao esperado | preview sem vazamento; publicar explicito | tenant de teste |
| P2-R6 | Fazer prova visual mobile light/dark/safe area | nova funcionalidade | layout, CSS e notificacoes | Nao | screenshots autenticadas sem corte/scroll | aparelho/emulador |
| P2-R7 | Provar upload, categoria e fallback de nicho | storage provider novo | upload/catalog/UI | Nao esperado | arquivo invalido falha seguro; fallback renderiza | storage de teste |
| P2-R8 | Provar importacao opcional de cardapio base | importacao automatica | menu import service/UI/specs | Nao esperado | preview/confirmacao; reexecucao nao duplica | tenant vazio |
| P2-R10 | Decidir se Google login tem caso comercial | implementacao OAuth sem decisao | auth, privacy, provider config | Possivel, somente se aprovado | threat model, consentimento e E2E antes de ativar | credenciais do provider; kill switch |

Todas as PRs devem ter testes unitarios/E2E proporcionais, `lint`, `typecheck`,
`check:no-any`, `check:features` e `git diff --check`. Nenhuma PR acima autoriza
deploy, migration ou seed por si so.
