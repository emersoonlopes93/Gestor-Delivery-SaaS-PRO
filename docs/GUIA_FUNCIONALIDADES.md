# 🚀 Guia de Operação: Funcionalidades Fases 3 & 4

Este guia documenta o funcionamento técnico e as instruções de uso das funcionalidades implementadas e estabilizadas para o **Gestor Delivery SaaS PRO**.

---

## 💰 1. Módulo Financeiro Real (Fase 3)
Anteriormente baseado em dados fictícios, o módulo financeiro agora está conectado diretamente ao motor de transações e analytics do backend.

### Como funciona:
- **Origem dos Dados:** Consome o endpoint `/finance/transactions`.
- **DRE Gerencial:** Os indicadores de **Receita**, **Custos** e **CMV** são calculados em tempo real pelo `AnalyticsService`, considerando a depreciação teórica de estoque baseada nas vendas.

### Como usar:
1. Acesse o menu **Financeiro** no Dashboard do Tenant.
2. Utilize os filtros por data e categoria para analisar o fluxo de caixa.
3. Clique em **Exportar (CSV)**: O sistema gerará um arquivo com as transações filtradas em tempo real.

---

## 🛵 2. Rastreamento de Entregadores em Tempo Real (Fase 4)
O rastreamento via GPS foi estabelecido entre o App do Entregador (PWA) e o Cliente Final.

### Como funciona:
- **Fluxo de Dados:** O PWA do entregador captura a geolocalização (`navigator.geolocation`) e envia para a API via `POST /delivery/drivers/:id/location` a cada 10 segundos.
- **Broadcast:** O backend recebe a coordenada e a transmite via **WebSockets** (`DeliveryTrackingGateway`) para todos os clientes que possuem pedidos ativos vinculados àquele entregador.

### Como usar:
1. No App do Entregador, ative o botão **"Iniciar Rastreamento"**.
2. No Storefront (Cliente), abra o status do pedido; o mapa atualizará automaticamente a posição do entregador.

---

## 👥 3. CRM com Segmentação RFM (Fase 4)
O sistema agora classifica automaticamente seus clientes com base no comportamento de compra (Recência, Frequência e Valor Monetário).

### Como funciona:
- **Algoritmo RFM:** O `CrmSegmentationService` analisa o histórico de pedidos e atribui cada cliente a um grupo:
  *   **Champions:** Compram muito e recentemente.
  *   **Loyal:** Compram com frequência.
  *   **At Risk:** Eram clientes bons, mas não compram há algum tempo.
  *   **Hibernating:** Não compram há muito tempo.

### Como usar:
1. Acesse o menu **CRM > Clientes**.
2. Visualize a "Etiqueta de Segmento" ao lado do nome de cada cliente.
3. Use essas informações para criar campanhas de marketing direcionadas (ex: cupons para clientes "At Risk").

---

## 🔐 4. Impersonação de Suporte (Fase 4)
Permite que administradores do sistema (Master Admin) acessem o painel de um tenant para prestar suporte técnico sem saber a senha do cliente.

### Como funciona:
- **Segurança:** O admin master gera um token de acesso especial que é registrado no `AuditLog` para transparência (quem acessou, quando e por que motivo).

### Como usar:
1. No **SaaS Admin**, vá para a lista de **Tenants**.
2. Clique no ícone de "Cadeado" ou botão **Acessar Loja** no tenant desejado.
3. Você será redirecionado para o painel do cliente com privilégios de administrador de suporte.

---

## 🏢 5. Multi-unidade e Configurações Fiscais
Preparação para grupos de negócios e conformidade com NF-e.

### Como funciona:
- **Multi-unidade:** Se um tenant estiver vinculado a um `BusinessGroup`, um banner corporativo aparecerá nas configurações.
- **Campos Fiscais:** Integração de campos essenciais para emissão de notas (Regime Tributário, CFOP, NCM).

### Como usar:
1. Vá em **Configurações > Dados Fiscais**.
2. Preencha o **Regime Tributário** (MEI, Simples Nacional, etc).
3. Estes dados serão utilizados automaticamente por futuros módulos de faturamento automático.

---

## 🛠️ Comandos de Infraestrutura

Caso precise resetar ou atualizar o ambiente:

```bash
# Sincronizar o banco de dados com o schema atual
pnpm db:migrate

# Gerar o client do Prisma (necessário após mudanças de tipos)
pnpm db:generate

# Popular o banco com dados de teste (Pizzaria Demo)
pnpm db:seed

# Rodar todos os serviços em modo desenvolvimento
pnpm dev:all
```

---

> **Nota Técnica:** Todas as dependências circulares de módulos (KDS, Storefront, Printer) foram resolvidas durante a auditoria de Abril/2026, garantindo que a aplicação suba sem erros de injeção de dependência.

pnpm -r exec rm -rf node_modules
pnpm install