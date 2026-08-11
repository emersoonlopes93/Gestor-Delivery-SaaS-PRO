import type { PrinterDevice } from '../../hooks/usePrinting';

export type PaperWidthMm = 58 | 80;

export function getPaperWidth(device?: Pick<PrinterDevice, 'paperWidth'> | null): PaperWidthMm {
  return device?.paperWidth === 80 ? 80 : 58;
}

export function formatThermalContent(content: string, paperWidth: PaperWidthMm) {
  const charactersPerLine = paperWidth === 58 ? 32 : 48;
  return content.split('\n').flatMap((line) => {
    if (!line) return [''];
    const lines: string[] = [];
    for (let index = 0; index < line.length; index += charactersPerLine) {
      lines.push(line.slice(index, index + charactersPerLine));
    }
    return lines;
  }).join('\n');
}
