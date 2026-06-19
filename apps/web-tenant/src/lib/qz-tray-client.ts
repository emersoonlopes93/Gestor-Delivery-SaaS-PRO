import qz from 'qz-tray';
import { EscPosBuilder } from './escpos58';

let securityConfigured = false;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Erro desconhecido no QZ Tray.';
}

function configureUnsignedSecurity() {
  if (securityConfigured) return;

  // Sem certificado configurado, o QZ Tray mostra a janela de autorização.
  // A assinatura/certificado pode ser plugada depois para modo silencioso completo.
  qz.security.setCertificatePromise((resolve) => resolve());
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise(() => (resolve) => resolve());
  securityConfigured = true;
}

export async function connectQzTray() {
  configureUnsignedSecurity();

  if (qz.websocket.isActive()) return true;

  try {
    await qz.websocket.connect();
    return true;
  } catch (error) {
    throw new Error(`Nao foi possivel conectar ao QZ Tray. Confirme que ele esta aberto no Windows. Detalhe: ${getErrorMessage(error)}`);
  }
}

export async function listQzPrinters() {
  await connectQzTray();
  const printers = await qz.printers.find();
  return Array.isArray(printers) ? printers : [printers];
}

function buildEscPosTicket(content: string) {
  const builder = new EscPosBuilder();
  builder.textLine(content).feed(3).cut();
  const payload = builder.build();
  return String.fromCharCode(...payload);
}

export async function printTextViaQz(printerName: string, content: string) {
  if (!printerName?.trim()) {
    throw new Error('Nome da impressora QZ nao informado.');
  }

  await connectQzTray();
  const config = qz.configs.create(printerName, {
    encoding: 'ISO-8859-1',
    altPrinting: true,
  });

  await qz.print(config, [{
    type: 'raw',
    format: 'command',
    flavor: 'plain',
    data: buildEscPosTicket(content),
  }]);
}
