# Impressão Bluetooth Android (Capacitor)

Este documento detalha o funcionamento, configuração e testes da arquitetura de impressão Bluetooth Classic/SPP do Gestor PRO, com foco nativo em Android via Capacitor. O dispositivo alvo homologado é a mini impressora térmica **Goldensky MTP-58 (ou GS-MTP5)**.

---

## 1. Por que não PWA/Web Bluetooth?

O `Web Bluetooth API` presente nos navegadores modernos (Chrome) suporta primariamente protocolos GATT (Bluetooth Low Energy - BLE). Mini impressoras térmicas acessíveis como a MTP-58 utilizam majoritariamente o protocolo **Bluetooth Classic** com o perfil **SPP** (Serial Port Profile), que o navegador **não** tem permissão de acessar por motivos de segurança do W3C.

Para interagir com o SPP, precisamos do acesso nativo (`BluetoothSocket` RFCOMM) presente no SDK do Android. Por isso, a impressão via Bluetooth foi delegada para o aplicativo Android gerado via Capacitor, enquanto a versão web de desktop atua apenas como monitor ou interface para impressoras USB/Rede (Fase P2).

---

## 2. O Fluxo de Auto-Print

1. **Backend Retém o Estado**: Quando um pedido é confirmado, o backend injeta um job na tabela `PrintJob`.
2. **Aplicativo (Spooler)**: O celular do restaurante fica com a tela `PrinterSettings` aberta. No modo Capacitor, essa tela executa um _polling_ silencioso usando o hook `usePrintSpooler` (`/printing/spooler/next`).
3. **Locking e Atomicidade**: O endpoint devolve um job e imediatamente faz o "Lock" desse job na nuvem vinculando-o ao ID do celular. Nenhum outro celular puxará o mesmo ticket.
4. **Envio Bluetooth**: O plugin nativo `BluetoothPrinterPlugin` traduz o ticket para formato ESC/POS e envia os bytes diretos.
5. **ACK/Fail**: Se a impressora não falhar e a conexão for mantida, o app envia o ACK para a nuvem confirmando que imprimiu. Se o papel acabar ou bluetooth desconectar, ele lança `Fail` e o job volta para a fila (`pending`).

---

## 3. Preparando o Ambiente Android e Gerando o APK

Se você for testar ou distribuir o aplicativo para o cliente:

### Requisitos
- Android Studio instalado.
- Dispositivo Android físico para testar Bluetooth. (Emuladores não possuem suporte robusto a Bluetooth Classic).

### Comandos de Build
No terminal raiz do projeto:

```bash
# Gere o build web
pnpm --filter @gestor/web-tenant build

# Sincronize com o projeto Capacitor Android
cd apps/web-tenant
npx cap sync android

# Abra o Android Studio para compilar e gerar o APK
npx cap open android
```

No Android Studio:
1. Conecte seu celular Android via cabo USB e habilite o modo desenvolvedor/depuração USB.
2. Dê `Run` no projeto (Play Button verde).

---

## 4. Pareando a Goldensky MTP-58

1. Ligue a impressora.
2. Vá nas configurações Bluetooth do sistema operacional do seu celular Android.
3. Procure por "MTP-58" (ou similar) e pareie.
4. O PIN padrão geralmente é `0000` ou `1234`.
5. Abra o app do **Gestor PRO Lojista**.
6. Vá na tela "Configuração de Impressora" > "Adicionar Impressora (Android)".
7. Clique em **Buscar Bluetooth Pareados**. Sua MTP-58 deve aparecer na lista. Clique no ícone de "Mais (+)" para registrá-la na Estação de destino (ex: "Geral").

---

## 5. Troubleshooting (Resolução de Problemas)

### A Impressora não aparece no App
- Certifique-se de que você pareou a impressora diretamente nas **Configurações do Android** primeiro. O nosso plugin (`listPairedDevices`) busca apenas aparelhos já registrados.

### Erro de permissão
- A partir do Android 12, o app precisa da permissão "Dispositivos Próximos" (`BLUETOOTH_CONNECT`). Se a janela não abrir, vá nas Configurações > Aplicativos > Gestor > Permissões e conceda o acesso a Dispositivos Próximos.

### Imprime caracteres estranhos (chineses) ou símbolos aleatórios
- O plugin ESC/POS (`escpos58.ts`) utiliza um filtro "limpador" de acentos e converte para caracteres simples por garantia. Se mesmo assim ocorrerem anomalias, certifique-se de não estar utilizando fontes customizadas não suportadas no Content gerado pelo backend.

### Papel não avança
- A impressora pode estar pausada ou superaquecida. Reinicie a impressora. O `escpos58.ts` sempre envia os bytes para cortar e ejetar `feed(3)` no final de cada ticket.

### O botão "Iniciar Auto-Print" fica desabilitado
- Ele fica desabilitado no navegador Google Chrome do seu computador/celular. É preciso abrir através do aplicativo instalável (`.apk` nativo Capacitor). Se estiver no app e continuar desativado, o Capacitor pode ter falhado na injeção da `Bridge` web. Reinicie o App.
