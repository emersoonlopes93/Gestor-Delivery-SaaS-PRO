# 🧪 Guia de Testes — Notificações Push e Personalizadas

> **Status atualizado em 2026-07-23:**  
> Push Notifications estão **implementadas** desde 2026-07-15 (migration `20260715234118`).  
> O backend usa `web-push` real com VAPID, `PushSubscription` persistido no banco e processador BullMQ.  
> Veja o contrato completo em [`docs/contracts/push-notifications.md`](docs/contracts/push-notifications.md).
>
> **Gaps remanescentes:** Push para `tenant_user` (staff) não implementado; sem teste E2E automatizado.

## Pré-requisitos para Testes


### 1. Compilação do Prisma
```bash
cd apps/api
npx prisma migrate dev --name "add_handoff_and_ready_sounds"
npx prisma db seed
```

### 2. Build do Frontend
```bash
pnpm install
pnpm build:web-tenant
```

### 3. Iniciar o Sistema
```bash
# Terminal 1 - API
cd apps/api
pnpm start

# Terminal 2 - Web Tenant
cd apps/web-tenant
pnpm dev
```

---

## 📋 Cenários de Teste

### Teste 1: Solicitar Permissões de Notificação do Navegador

**Objetivo**: Validar que o sistema solicita e registra corretamente as permissões do navegador

**Passos**:
1. Abrir http://localhost:5173 (web-tenant) pela primeira vez
2. Verificar se uma mensagem pedindo permissão apareceu
3. Clicar em "Permitir" ou "Bloquear" (ambos devem ser tratados)
4. Abrir DevTools (F12) → Console
5. Verificar logs como:
   - `[BrowserNotifications] Service Worker registered`
   - `[BrowserNotifications] Permission result: granted` (ou denied)
   - `[BrowserNotifications] Notification permission already granted`

**Resultado Esperado**:
- ✅ Sem erros no console
- ✅ Service worker ativo (DevTools → Application → Service Workers)
- ✅ Permissões registradas no navegador

---

### Teste 2: Configuração de Sons Personalizáveis

**Objetivo**: Validar que os novos sons podem ser configurados e persistem

**Passos**:
1. Ir para `/settings/notifications`
2. Na seção "Alertas Sonoros", verificar se há 4 seletores:
   - Som de Novo Pedido ✅
   - Som de Cancelamento ✅
   - Som de Transferência (IA→Agente) ✅ **[NOVO]**
   - Som de Pedido Pronto ✅ **[NOVO]**
3. Verificar se há toggle para "Notificações do Navegador" ✅ **[NOVO]**
4. Ajustar o volume (slider)
5. Para cada som, clicar em "Testar" e escutar o áudio
6. No Console, verificar logs como: `[Test] Playing handoff sound: { volume: X, handoffSound: 'notification.mp3' }`
7. Clicar "Salvar Alterações"
8. Verificar toast de sucesso: "Configurações salvas com sucesso!"

**Resultado Esperado**:
- ✅ Todos os 4 seletores visíveis
- ✅ Todos os sons tocam corretamente quando "Testar" é clicado
- ✅ Toggle de notificações do navegador está presente
- ✅ Configurações salvas sem erros
- ✅ Valores persistem ao recarregar a página

---

### Teste 3: Reaproveitamento de Componentes (Sem Duplicação)

**Objetivo**: Validar que não há duplicação de lógica

**Checklist**:
- [ ] Verificar que `useNotificationAudio` é usado em:
  - AppLayout.tsx (com novos parâmetros handoffSound, readySound)
  - NotificationSettings.tsx (para testes de som)
- [ ] Verificar que `playAudio()` é reutilizado (não duplicado em múltiplos lugares)
- [ ] Verificar que `buildSoundUrl()` é centralizado
- [ ] Verificar que `AVAILABLE_SOUNDS` é importado de um único lugar
- [ ] Verificar que tipos são centralizados em `packages/types/`

**Comando para verificar duplicação**:
```bash
# Procurar por múltiplas definições de buildSoundUrl
grep -r "function buildSoundUrl" apps/web-tenant/src/

# Verificar imports
grep -r "AVAILABLE_SOUNDS" apps/web-tenant/src/ | head -20

# Deve retornar apenas 1 definição em useNotificationAudio.ts
grep -r "export const AVAILABLE_SOUNDS" apps/web-tenant/src/
```

**Resultado Esperado**:
- ✅ `buildSoundUrl` definido em 1 lugar apenas
- ✅ `playAudio` definido em 1 lugar apenas
- ✅ `AVAILABLE_SOUNDS` exportado de 1 lugar apenas

---

### Teste 4: Notificação de Novo Pedido (Baseline)

**Objetivo**: Validar que o sistema existente continua funcionando

**Passos**:
1. Abrir `/orders/board` (painel de operações)
2. Ativar som (clique no ícone de volume)
3. Criar um novo pedido via `/storefront` ou `/pos`
4. Verificar que:
   - Som toca (configurado em "Som de Novo Pedido")
   - Toast aparece
   - Notificação do navegador aparece (se permitido)

**Console Logs Esperados**:
- `[Websocket] Connected to orders namespace`
- `[Websocket] Novo pedido recebido!`
- `[Audio] Playing: /sounds/notification.mp3 (volume: 100%)`

**Resultado Esperado**:
- ✅ Som reproduzido corretamente
- ✅ Toast exibido
- ✅ Notificação do navegador exibida

---

### Teste 5: Notificação de Pedido Pronto

**Objetivo**: Validar novo evento de "pedido pronto"

**Passos**:
1. Configurar em `/settings/notifications`:
   - Selecionar um som diferente para "Som de Pedido Pronto" (ex: Microsoft Teams)
   - Clicar "Testar" para confirmar que toca diferente
   - Salvar
2. Abrir `/orders/board`
3. Criar um novo pedido
4. Mudar status do pedido para "Pronto para Retirada" ou "Pronto para Entrega"
5. Verificar que:
   - Som de "Pedido Pronto" toca (não o som de novo pedido)
   - Toast mostra mensagem de pedido pronto
   - Console mostra: `[Websocket] Pedido Pronto!`

**Console Logs Esperados**:
```
[Websocket] Pedido Pronto!
[Audio] Playing: /sounds/Microsoft-Teams.mp3 (volume: 100%)
```

**Resultado Esperado**:
- ✅ Som diferente reproduzido
- ✅ Toast exibido com mensagem correta
- ✅ Evento WebSocket recebido sem erros

---

### Teste 6: Notificação de Transferência IA (Handoff)

**Objetivo**: Validar notificação de transferência de IA para agente humano

**Passos**:
1. Configurar em `/settings/notifications`:
   - Selecionar "Som de Transferência (IA→Agente)"
   - Clicar "Testar" para confirmar o som
   - Salvar
2. Abrir chat WhatsApp com IA ativada
3. Durante conversa, usar ferramenta de transferência para agente humano
4. Verificar que:
   - Som de "Transferência" toca
   - Toast exibido: "👤 [Cliente] aguardando atendimento humano"
   - Notificação do navegador apareceu

**Console Logs Esperados**:
```
[Websocket] IA Handoff - Transferência para atendente humano!
[Audio] Playing: /sounds/notification.mp3 (volume: 100%)
```

**Resultado Esperado**:
- ✅ Som reproduzido
- ✅ Toast com informações do cliente
- ✅ Notificação do navegador exibida

---

### Teste 7: Funcionamento em Segundo Plano

**Objetivo**: Validar que notificações funcionam mesmo com aba em background

**Passos**:
1. Abrir `/orders/board` em uma aba
2. Abrir outra aba (ex: Google.com)
3. Voltar para a aba do navegador com `/orders/board`
4. Criar novo pedido via `/storefront`
5. Verificar que **mesmo com aba em background**:
   - Som toca
   - Notificação do navegador aparece com o título "Novo Pedido"
   - Ao clicar na notificação, volta para o `/orders/board`

**Teste com Navegador Minimizado**:
1. Minimizar o navegador completamente
2. Criar novo pedido
3. Verificar que notificação aparece em "Centro de Notificações" do SO

**Resultado Esperado**:
- ✅ Notificações funcionam em background
- ✅ Som toca mesmo com navegador em background
- ✅ Clique na notificação traz navegador para frente
- ✅ Sistema operacional mostra notificações

---

### Teste 8: Múltiplas Abas do Mesmo Site

**Objetivo**: Validar que notificações funcionam sincronizadas em múltiplas abas

**Passos**:
1. Abrir `/orders/board` em **Aba 1**
2. Abrir `/settings/notifications` em **Aba 2**
3. Na **Aba 2**, mudar:
   - Som de Novo Pedido para "Microsoft Teams"
   - Volume para 50%
   - Salvar
4. Voltar para **Aba 1**
5. Criar novo pedido via `/storefront`
6. Verificar que:
   - Som que toca é "Microsoft Teams" (não mais "notification.mp3")
   - Volume é 50%

**Resultado Esperado**:
- ✅ Mudanças em uma aba refletem em outra
- ✅ Novo pedido usa configurações atualizadas
- ✅ Cache sincronizado via React Query

---

### Teste 9: Permissões Negadas

**Objetivo**: Validar que sistema funciona mesmo sem permissão de notificações

**Passos**:
1. Ir para Configurações do Navegador e revogar permissão de notificações para `localhost:5173`
2. Recarregar página
3. Criar novo pedido
4. Verificar que:
   - Som toca normalmente
   - Toast exibido normalmente
   - Nenhum erro no console
   - Notificação do navegador NÃO aparece (graceful degradation)

**Console Logs Esperados**:
```
[BrowserNotifications] Notification permission denied
[Websocket] Novo pedido recebido!
[Audio] Playing: /sounds/notification.mp3
```

**Resultado Esperado**:
- ✅ Sistema funciona sem permissão
- ✅ Som e toast funcionam
- ✅ Sem erros no console

---

### Teste 10: Persistência de Configurações

**Objetivo**: Validar que configurações persistem entre sessões

**Passos**:
1. Ir para `/settings/notifications`
2. Configurar:
   - Som de Novo Pedido: Microsoft Teams
   - Som de Transferência: Notification
   - Som de Pedido Pronto: Microsoft Teams
   - Volume: 75%
   - Notificações de Navegador: Desativadas
3. Clicar "Salvar Alterações"
4. **Fechar completamente o navegador**
5. Reabrir e ir para `/settings/notifications`
6. Verificar que todas as configurações foram restauradas

**SQL Query para Debug** (se necessário):
```sql
SELECT 
  new_order_sound, 
  cancellation_sound, 
  handoff_sound, 
  ready_sound, 
  notification_volume,
  browser_notifications_enabled
FROM tenant_settings 
WHERE tenant_id = '<seu_tenant_id>';
```

**Resultado Esperado**:
- ✅ Todas as configurações persistem
- ✅ Valores recuperados do banco de dados
- ✅ Sem erros de loading

---

## 🔍 Troubleshooting

### Som não toca
- [ ] Verificar se navegador permite autoplay
- [ ] Verificar se arquivo `/sounds/notification.mp3` existe
- [ ] Verificar DevTools → Console para erros de áudio
- [ ] Testar manualmente clicando em "Testar" em `/settings/notifications`

### Notificação do navegador não aparece
- [ ] Verificar se permissão foi concedida
- [ ] Verificar se Service Worker está registrado
- [ ] Verificar DevTools → Application → Service Workers
- [ ] Se bloqueado: liberar em Configurações do Navegador

### WebSocket não conecta
- [ ] Verificar se API está rodando (http://localhost:3333)
- [ ] Verificar URL em `VITE_API_URL`
- [ ] Verificar DevTools → Network → WS (WebSocket)
- [ ] Procurar por erros de CORS

### Configurações não salvam
- [ ] Verificar se API `/tenant/settings` responde
- [ ] Verificar se banco de dados está acessível
- [ ] Procurar por erros 400/500 em DevTools → Network
- [ ] Verificar se usuário tem permissão `settings.manage`

---

## 📊 Relatório de Teste

Ao completar os testes, gerar um relatório com:

```markdown
## ✅ Testes Completos

| Teste | Status | Notas |
|-------|--------|-------|
| 1. Permissões do Navegador | ✅ | Service worker registrado |
| 2. Configuração de Sons | ✅ | Todos os 4 seletores funcional |
| 3. Sem Duplicação | ✅ | Verificado - buildSoundUrl único |
| 4. Novo Pedido | ✅ | Som + Toast + Notificação |
| 5. Pedido Pronto | ✅ | Evento WebSocket funcionando |
| 6. Transferência IA | ✅ | Toast e som de handoff |
| 7. Segundo Plano | ✅ | Notificações em background |
| 8. Múltiplas Abas | ✅ | Cache sincronizado |
| 9. Permissões Negadas | ✅ | Graceful degradation |
| 10. Persistência | ✅ | Configs salvas no banco |

**Data**: [data]
**Ambiente**: Chrome 130 | macOS 14.6
**Notas Adicionais**: Nenhuma
```

---

## 🎯 Checklist Final

- [ ] Todos os 10 testes passaram
- [ ] Nenhum erro no console
- [ ] Sons tocam corretamente em todos os cenários
- [ ] Notificações do navegador funcionam
- [ ] Sem duplicação de código
- [ ] Configurações persistem
- [ ] Funciona em segundo plano
- [ ] Múltiplas abas sincronizadas
- [ ] Sistema é degradável (funciona sem permissões)

---

**Sucesso! 🎉 Notificações personalizadas implementadas e testadas com sucesso!**
