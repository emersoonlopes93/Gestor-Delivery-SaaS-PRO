---
title: Limitações e Gaps Conhecidos
status: current
owner: engineering
last_verified: 2026-07-15
verified_against: main-copy / c63d394
---

# Gaps Conhecidos e Limitações (Known Gaps)

> Documentação das limitações técnicas e funcionais da plataforma atual, identificadas por auditorias ou débitos técnicos explícitos no código.

---

## Agendamento (Beta)

| Gap | Severidade | Impacto / recomendação |
|-----|-----------|------------------------|
| Slots não distinguem entrega e retirada | Média | A capacidade é compartilhada; modelar modalidade somente após validação de produto. |
| Sem feriados ou bloqueios ad hoc | Média | Fechamentos dependem dos horários operacionais; criar modelo de exceção em sprint futura. |
| Sem ativação operacional por proximidade do horário | Média | Pedido agendado aparece imediatamente; avaliar job idempotente antes de automatizar. |
| Alteração de data/slot exige cancelar e recriar | Baixa | Preserva consistência de capacidade; adicionar reschedule transacional futuramente. |
| Geração concorrente não possui constraint única de intervalo | Baixa | Operação normal é idempotente em aplicação; avaliar migration com deduplicação segura. |

---

## 1. Notificações Push Não Funcionais (Stub)

- **Severidade:** Alta
- **Componente:** `PushService` (`apps/api/src/notifications/push.service.ts`)
- **Problema:** A documentação antiga referia push notifications web como funcionais. O serviço existe e chaves VAPID são lidas, mas não há modelo `PushSubscription` no banco de dados e os métodos fazem apenas chamadas de `logger` sem integração real.
- **Impacto:** Clientes não recebem avisos push em seus dispositivos ao minimizar a aba.
- **Ação:** Implementar biblioteca `web-push`, model Prisma e handlers Service Worker.

## 2. Timezone Hardcoded em Automações (RESOLVIDO)

- **Severidade:** Resolvido (anteriormente Alta)
- **Componente:** `CampaignProcessor` (`apps/api/src/campaigns/services/campaign.processor.ts`)
- **Resolução:** A janela de silêncio (08h às 21h) agora respeita a configuração de `timezone` definida no `TenantSettings`. Caso o tenant não possua configuração explícita, a aplicação fará o fallback para `America/Sao_Paulo`.

## 3. Swagger Inconsistente

- **Severidade:** Baixa
- **Componente:** `apps/api/src/main.ts`
- **Problema:** O Swagger está renomeado para `PedeHub API` invés de usar variáveis globais e reflete documentação parcialmente abandonada (desabilitado por padrão no `.env.example`).
- **Impacto:** Dificulta a auto-documentação real da API para clientes externos se a documentação for exposta.
- **Ação:** Refatorar init do Swagger para consumir variáveis de pacote ou remover menções a projetos passados.

## 4. Vazamento Potencial de Chaves Locais (.env)

- **Severidade:** Crítica (se houver chaves reais)
- **Componente:** `apps/api/.env`
- **Problema:** O arquivo de desenvolvimento pode conter chaves copiadas ou injetadas pela equipe. 
- **Ação:** Garantir que o `.gitignore` não permita commits, rotacionar qualquer credencial exposta acidentalmente no histórico.

## 5. Zonas de Entrega Beta e Neighborhood Coming Soon

- **Severidade:** Média
- **Componente:** Catálogo de Entrega
- **Problema:** Apenas a entrega por `raio` (distância circular) é `stable`. Zonas desenhadas (polígonos) são `beta` e regras tarifárias por Bairro estão como `coming_soon`, o que é restritivo no Brasil, onde a tabela de bairro é o modelo logístico mais comum.
- **Impacto:** Alguns restaurantes podem ter dificuldade de embarcar sem o modelo logístico que já utilizam.
- **Ação:** Priorizar a implantação e homologação do módulo `delivery_neighborhood`.

## 6. BullMQ e Redis Opcionais

- **Severidade:** Arquitetural (Trade-off intencional)
- **Componente:** `redis` e automações.
- **Problema:** Para reduzir barreira de adoção, o sistema roda sem Redis, mas isso desabilita as automações de Marketing (Campanhas) e Webhooks robustos.
- **Impacto:** Sem Redis ativado em produção, lojas não terão features avançadas disponíveis.
- **Ação:** Manter configurável, mas alertar de forma visual no SaaS Admin caso a instalação esteja sem Redis.

## 7. Scripts Perigosos na Raiz

- **Severidade:** Alta
- **Componente:** `drop_models.js`, `clean_schema.js`
- **Problema:** Scripts de manutenção avulsos que podem apagar o banco se rodados sem cuidado em ambientes produtivos conectados por URL direta.
- **Ação:** Arquivá-los em `/scripts/maintenance/` e forçar barreira de confirmação (ex: `--force` ou variável `NODE_ENV!=production`).
