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

  const certificatePem = import.meta.env.VITE_QZ_CERTIFICATE_PEM?.trim();
  const signatureEndpoint = import.meta.env.VITE_QZ_SIGNATURE_ENDPOINT?.trim();

  // Se não houver certificado/assinatura configurados, deixamos o QZ Tray usar
  // seu fluxo padrão de autorização. O modo "vazio" fazia a integração parecer
  // silenciosa mesmo quando o browser ainda não tinha sido autorizado.
  if (certificatePem) {
    qz.security.setCertificatePromise((resolve) => resolve(certificatePem));
    qz.security.setSignatureAlgorithm('SHA512');

    if (signatureEndpoint) {
      qz.security.setSignaturePromise((dataToSign) => async (resolve, reject) => {
        try {
          const response = await fetch(signatureEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataToSign }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const payload = (await response.json()) as { signature?: string };
          if (!payload.signature) {
            throw new Error('Assinatura ausente na resposta.');
          }

          resolve(payload.signature);
        } catch (error) {
          reject(error);
        }
      });
    }
  }

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
