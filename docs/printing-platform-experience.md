# Experiência de impressão por plataforma

Data da última validação: 2026-08-10.

## Matriz canônica

| Plataforma | Bluetooth Classic | Navegador/sistema | Impressora térmica integrada | USB direto | Rede/IP direta | Bridge |
| --- | --- | --- | --- | --- | --- | --- |
| Android Capacitor | Sim | Oculto | Não | Não | Não | Não |
| Mobile web | Não | Sim | Não | Não | Não | Não |
| Desktop web | Não | Sim | Sim, via QZ Tray | Não | Não | Não |

A detecção usa a plataforma nativa do Capacitor e o user agent do navegador. A largura do viewport não concede capability de hardware.

## Fluxo canônico

- Um pedido confirmado mantém os tickets de produção do KDS e, quando existe impressora principal ativa com impressão automática, cria também um `PrintJob` `MAIN` de recibo completo.
- O job `MAIN` usa chave idempotente por pedido, tipo e estação; retries e reprocessamentos não criam outra impressão automática do mesmo evento.
- `PrinterSettings` executa somente o spooler `/printing/spooler/*`. Os endpoints paralelos `/kds/spooler/*` permanecem como dívida técnica e não foram reescritos.
- O poller começa automaticamente apenas com `PrinterDevice` ativo, auto-print habilitado, endereço configurado e adapter compatível com a plataforma. Há uma instância por montagem da página, com cleanup em unmount e troca de tenant/dispositivo.
- O claim usa atualização condicional dentro de transação. Tenant, estação, status e lock ainda precisam corresponder no momento da atualização; somente o consumidor vencedor recebe o job. Locks com mais de cinco minutos continuam recuperáveis.
- `stationId`, device, claim, ACK e fail são validados no tenant ativo.

## Estados apresentados

Um registro persistido ativo significa apenas **Configurada**. **Disponível** depende de evidência viva do adapter QZ durante a sessão. Bluetooth abre e fecha a conexão em cada impressão, portanto não mantém um estado persistente de “Conectada”. Falhas são apresentadas com orientação humana; o detalhe técnico fica recolhido.

## Limites conhecidos

- A impressão do navegador é manual e reutiliza `thermal-print.ts`.
- QZ Tray precisa estar instalado e aberto no desktop; sua ausência não derruba a página.
- Bluetooth exige o plugin nativo já existente e uma impressora previamente pareada no Android.
- Validação final ainda requer hardware Android real e um runtime QZ real.
