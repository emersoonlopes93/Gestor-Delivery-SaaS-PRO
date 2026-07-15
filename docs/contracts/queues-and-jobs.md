# Queues and Jobs Contract

Este documento descreve os contratos, topologias e diretrizes mandatórias para o processamento assíncrono (BullMQ/Redis) no ecosistema Gestor Delivery SaaS PRO.

## 1. Topologia de Filas e Responsabilidades

Atualmente operamos com as seguintes filas canônicas:

| Fila | Finalidade | Principais Jobs | Consumer | Idempotência Esperada |
|------|------------|-----------------|----------|-----------------------|
| `campaign-dispatch` | Disparo e automação de campanhas via WhatsApp | `system-feed-queue`, `system-automation-scan`, (default/dispatch) | `CampaignProcessor` | Sim (verificar status prévio e cooldown/opt-out) |
| `marketplace-events` | Ingestão e sincronização de eventos de integrações externas | `order-status-sync`, (inbox event) | `MarketplaceEventProcessor` | Sim (verificar transição de estado na DB) |
| `orders` | (Reservada) Confirmações automáticas, KDS, Spooler | (Reservada) | (A ser implementado) | Sim |

## 2. Configurações Globais (Defaults)

As configurações de BullMQ definidas centralmente em `app.module.ts` ditam as regras mínimas de resiliência:

- **Tentativas (`attempts`)**: 5
- **Backoff**: Exponencial com *delay* de 5.000 ms (5s, 10s, 20s, 40s...).
- **Retenção de Concluídos (`removeOnComplete`)**: Retidos por 24 horas (`age: 86400`) e até 1.000 registros para evitar acúmulo infinito.
- **Retenção de Falhos (`removeOnFail`)**: Retidos por 7 dias (`age: 604800`) e até 5.000 registros. *Estes jobs atuam como uma Dead-Letter Queue implícita*.

> **Nota de Resiliência**: Nunca sobrescreva esses defaults para criar retries "infinitos" nas pontas.

## 3. Contrato de Payload (Mínimo Esperado)

Sempre que possível, prefira o trafego de IDs e referências em vez de objetos complexos (JSON completos). Isso garante que o consumer recupere o estado mais recente da entidade, evitando condições de corrida (Stale Data).

Recomendação mínima (pode variar por domínio, mas deve possuir identificadores claros):
```ts
interface BaseJobPayload {
  tenantId: string; // OBRIGATÓRIO: Ação sempre deve estar associada a um tenant
  correlationId?: string; // Para trace distribuído (opcional)
  schemaVersion?: number; // Versionamento, caso as assinaturas do job mudem drasticamente
}
```

**Proibido no Payload**:
- Senhas, Segredos, Tokens Pessoais.
- Dados íntegros de Cartão de Crédito.
- Objetos inteiros (como a instância de `Order` completa via Prisma).

## 4. Comportamento Sem Infraestrutura

Se uma funcionalidade depende do processamento assíncrono (Ex: Campanhas Automáticas), e o BullMQ não está acessível no startup do serviço, o mecanismo de acionamento (Producer) **DEVE** lançar uma `ServiceUnavailableException`.
- A API não deve engolir exceções nem retornar `sucesso` fingindo ter enfileirado a ação.
- Em ambientes de desenvolvimento/teste onde filas não são mockadas e `REDIS_ENABLED=false`, evite ativar funcionalidades baseadas em filas.

## 5. Princípio da Idempotência

Todo Consumer (`@Processor`) para eventos com efeitos colaterais críticos (webhooks, faturamento, mensagens) **DEVE** implementar deduplicação e checagens lógicas.

**Estratégias obrigatórias**:
- Consultar o banco de dados antes da execução (Ex: A campanha X já está com `status: 'completed'`? Se sim, retorne sucesso imediatamente ignorando a re-execução).
- Manter o estado determinístico (Atualizar status da ordem apenas se transição for permitida).

## 6. Dead-Letter e Falhas Permanentes

Quando um job esgota as 5 tentativas de Retry, ele permanecerá na fila com status `failed`.
- Estes jobs estarão disponíveis para leitura via endpoints de auditoria administrativa (`/admin/queues` ou similar).
- Não há processamento automático de dead-letters nativo; a re-execução (`retry()`) de um job retido dependerá de intervenção manual da equipe ou de ferramentas de console de Admin SaaS baseados na visibilidade exposta na API.
