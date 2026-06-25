/**
 * Utilitário para conversão de texto para comandos ESC/POS básicos (58mm)
 * Oculta acentos e caracteres complexos para evitar lixo em impressoras chinesas.
 */

const ESC = 0x1B;
const GS = 0x1D;

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.initialize();
  }

  private initialize() {
    this.buffer.push(ESC, 0x40); // ESC @
  }

  public alignCenter() {
    this.buffer.push(ESC, 0x61, 1); // ESC a 1
    return this;
  }

  public alignLeft() {
    this.buffer.push(ESC, 0x61, 0); // ESC a 0
    return this;
  }

  public boldOn() {
    this.buffer.push(ESC, 0x45, 1); // ESC E 1
    return this;
  }

  public boldOff() {
    this.buffer.push(ESC, 0x45, 0); // ESC E 0
    return this;
  }

  public feed(lines = 1) {
    this.buffer.push(ESC, 0x64, lines); // ESC d n
    return this;
  }

  public cut() {
    // GS V 0 - Partial cut
    this.buffer.push(GS, 0x56, 0);
    return this;
  }

  private normalizeText(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^\x20-\x7E\n]/g, ''); // remove chars nao printáveis (deixa ascii + newline)
  }

  public text(str: string) {
    const normalized = this.normalizeText(str);
    for (let i = 0; i < normalized.length; i++) {
      this.buffer.push(normalized.charCodeAt(i));
    }
    return this;
  }

  public textLine(str: string) {
    return this.text(str + '\n');
  }

  public build(): number[] {
    return this.buffer;
  }
}
