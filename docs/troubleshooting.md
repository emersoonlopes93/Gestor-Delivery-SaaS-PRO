# Manual de Troubleshooting e Diagnóstico Operacional (P10)

Este manual tem como objetivo auxiliar na interpretação do status de integridade do sistema, detecção de gargalos e resolução de problemas operacionais comuns em ambientes de desenvolvimento (localhost) e produção.

---

## 1. Endpoints de Diagnóstico (Health Check)

A API expõe três rotas públicas sob o prefixo `/api/v1/health` (ou o prefixo configurado em `API_PREFIX`):

### 1.1 `GET /health` (Liveness)
*   **Finalidade**: Identificar se o processo HTTP do NestJS está ativo e respondendo chamadas.
*   **Comportamento**: Extremamente rápido e leve. Não faz conexões externas a bancos de dados ou Redis.
*   **Resposta**:
    ```json
    {
      "status": "ok"
    }
    ```
*   **Código HTTP**: `200 OK`

### 1.2 `GET /health/ready` (Readiness)
*   **Finalidade**: Avaliar a capacidade da instância de atender requisições e a integridade de suas dependências críticas e secundárias.
*   **Comportamento**: Checa o PostgreSQL, Redis, BullMQ (contagem de jobs) e gateways WebSocket de forma paralela e isolada.
*   **Mapeamento de HTTP Status**:
    *   `ok` (todos os sistemas saudáveis): **HTTP 200**
    *   `degraded` (PostgreSQL ativo, mas Redis/BullMQ/WebSockets com falha): **HTTP 200**
        *(Permite que o Storefront e o checkout continuem recebendo tráfego e utilizando o fallback in-memory)*
    *   `down` (PostgreSQL fora do ar): **HTTP 503 Service Unavailable**
*   **Exemplo de Resposta (`ok`)**:
    ```json
    {
      "status": "ok",
      "timestamp": "2026-06-22T09:18:31.000Z",
      "uptime": 124.5,
      "services": {
        "database": "ok",
        "redis": "ok",
        "bullmq": "ok",
        "websocket": "ok"
      },
      "details": {
        "database": { "ok": true, "latencyMs": 12 },
        "redis": { "enabled": true, "connected": true, "latencyMs": 15, "reason": null },
        "bullmq": { "enabled": true, "connected": true, "queues": [...] },
        "websocket": { ... }
      }
    }
    ```

### 1.3 `GET /health/ready/websocket` (WebSocket Diagnostics)
*   **Finalidade**: Atestar que os gateways de comunicação em tempo real estão ativos e contabilizar clientes de transporte.
*   **Resposta**:
    ```json
    {
      "status": "ok",
      "timestamp": "2026-06-22T09:18:31.000Z",
      "gateways": {
        "orders": { "active": true, "connections": 5 },
        "delivery": { "active": true, "connections": 2 },
        "chat": { "active": true, "connections": 1 }
      }
    }
    ```

---

## 2. Resiliência Operacional e Políticas de Degradação

O sistema foi desenhado sob o princípio de degradação graciosa:
*   **Queda do Redis / Cache**: O sistema ativa imediatamente o fallback para a memória RAM local da instância (in-memory) para ler o cardápio do Storefront. O checkout continua operacional.
*   **Queda do BullMQ**: As campanhas e webhooks em lote deixam de ser processados temporariamente até o reestabelecimento do Redis, mas a criação de pedidos não é interrompida.
*   **Prevenção contra Vazamentos (PII)**: O sistema de logs estruturados do `SafeLogger` impede ativamente o vazamento de informações confidenciais em logs do console (como CPFs, e-mails, endereços e tokens), mascarando-os automaticamente.

---

## 3. Variáveis de Ambiente Relevantes para Diagnósticos

As seguintes variáveis configuradas no `.env` regulam o comportamento de diagnóstico:
*   `REDIS_HEALTH_TIMEOUT_MS` (Padrão: `1500`): O tempo máximo em milissegundos que o ping de integridade do Redis aceitará antes de retornar timeout e classificar como falha.
*   `REDIS_HEALTH_CACHE_TTL_MS` (Padrão: `30000`): Intervalo em milissegundos para manter em cache o último ping ao Redis para evitar sobrecarga de conexões de diagnóstico.

---

## 4. Passos de Resolução de Problemas (Redis/Upstash Quota)

Caso o log exiba a mensagem:
`Redis Connection Error: ERR max requests limit exceeded`

1.  O sistema acionará automaticamente a resiliência operacional (degradada) e passará a ler o cardápio do banco de dados (fallback local).
2.  Acesse o console do Upstash e avalie o consumo diário de requisições.
3.  Aumente o tempo de TTL configurado em `STOREFRONT_CACHE_TTL` no arquivo `.env` para aliviar as leituras caso o tráfego esteja muito alto no Storefront.
