# Web Delivery — App do Entregador (PWA)

> ⚠️ **Status: Em Desenvolvimento** — Este app é um protótipo e ainda não está funcional para produção.

## Escopo Planejado

- Autenticação do entregador (login com telefone)
- Recebimento de pedidos para entrega (push notifications)
- Tracking GPS em tempo real com envio periódico para o backend
- Visualização do endereço de entrega e rota
- Confirmação de entrega
- Histórico de entregas realizadas
- Dashboard com métricas do dia

## Pré-requisitos para Go-Live

1. **PWA Manifest** — Configurar `manifest.json` e service worker para instalação
2. **Autenticação** — Implementar fluxo de login do entregador (endpoint `POST /auth/driver/login` a ser criado)
3. **API Integration** — Usar `VITE_API_URL` em vez de URL hardcoded
4. **Push Notifications** — Configruar Firebase Cloud Messaging ou similar
5. **Offline Support** — Service worker para cache de dados essenciais

## Stack

- React + Vite + TypeScript
- TailwindCSS
- PWA (manifest + service worker)
- Geolocation API
