# Checklist de aceite Go-Live V1

## Portao E0 e operacao

- [x] PR #35 integrada e CI pos-merge verde (CI `30678152290`, scanning `30678152243`).
- [x] HEAD sanitizado e secret scanning ativo; tokens JWT anteriores rejeitados conforme confirmacao operacional sanitizada.
- [ ] E0-OPS: SHA integrado redeployado somente na API, com health 200.
- [ ] Revogacao global de `AuthSession` executada com backup e destino do banco confirmados; registrar somente contagens agregadas.
- [ ] Nova sessao: login, rota protegida, refresh, logout e refresh apos logout aprovados.
- [ ] Health, WebSocket aplicavel e logs sanitizados confirmados.
- [ ] `DB_PASSWORD` classificado sem expor valor; fonte canonica e ausencia de duplicatas confirmadas.
- [x] E0H registrado como follow-up coordenado; nenhuma reescrita historica executada.

## Aceite P1 funcional

- [ ] R1: duplo clique/retry cria exatamente um pedido; resumo e total correspondem ao servidor.
- [ ] R2: entrega, retirada, cobertura e endereco invalido possuem resultado claro e recuperavel.
- [ ] R3: entregador autentica sem digitar slug e falha segura fora do tenant.
- [ ] R4: criar/desativar filial respeita RBAC, tenant e preserva dados.
- [ ] R9: categoria/produto indisponivel por status/regra nao aparece compravel no storefront.

## Preset e piloto

- [ ] Tenant piloto controlado, sem clientes reais, com catalogo, horario, pagamento e cobertura revisados.
- [ ] Beta/coming-soon desabilitados: scheduling, push, iFood/marketplace, campanhas, KDS, printing, split payment, BI, AI, franquia e dine-in.
- [ ] Rollback ensaiado sem recuperar secrets comprometidos e sem `db push`, seed ou limpeza de banco.
- [ ] Todas as PRs candidatas possuem CI verde, `git diff --check` e testes proporcionais.

Nao marcar este checklist como aprovado por evidencia estatica isolada; os itens
de runtime requerem ambiente autenticado e dados controlados.
