type ThermalPrintOptions = {
  title?: string;
  paperWidthMm?: 58 | 80;
  fontSizePx?: number;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printThermalText(content: string, options: ThermalPrintOptions = {}) {
  const printWindow = window.open('', '_blank', 'width=360,height=640');
  if (!printWindow) return false;

  const paperWidthMm = options.paperWidthMm ?? 58;
  const fontSizePx = options.fontSizePx ?? (paperWidthMm === 58 ? 10 : 12);
  const escapedContent = escapeHtml(content.trimEnd());

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => printWindow.close(), 250);
  };

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(options.title ?? 'Imprimir Ticket')}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: ${paperWidthMm}mm auto;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            width: ${paperWidthMm}mm;
            min-height: 0;
            margin: 0;
            padding: 0;
            background: #fff;
          }

          body {
            color: #000;
            font-family: "Courier New", Courier, monospace;
            font-size: ${fontSizePx}px;
            line-height: 1.22;
          }

          pre {
            width: ${paperWidthMm}mm;
            margin: 0;
            padding: 0 2mm 2mm;
            white-space: pre-wrap;
            word-break: break-word;
            overflow-wrap: anywhere;
          }

          @media screen {
            body {
              padding: 8px;
            }

            pre {
              border: 1px dashed #999;
            }
          }

          @media print {
            html,
            body,
            pre {
              width: ${paperWidthMm}mm;
            }
          }
        </style>
      </head>
      <body>
        <pre>${escapedContent}</pre>
      </body>
    </html>
  `);
  printWindow.document.close();
  return true;
}
