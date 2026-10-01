import chalk from 'chalk';
import { highlightCode } from './highlight.js';

/**
 * Renderiza tokens em streaming. Texto comum sai imediatamente; blocos ```cercados``` são
 * acumulados e impressos com destaque de sintaxe quando a cerca fecha.
 */
export class MarkdownStream {
  private line = '';
  private flushed = 0;
  private inFence = false;
  private lang = '';
  private code: string[] = [];
  private wroteAnything = false;

  constructor(private readonly out: (s: string) => void = (s) => process.stdout.write(s)) {}

  get hasOutput(): boolean {
    return this.wroteAnything;
  }

  write(chunk: string): void {
    for (const ch of chunk) {
      if (ch === '\n') this.endLine();
      else {
        this.line += ch;
        this.flushPartial();
      }
    }
  }

  /** Finaliza o stream (fecha bloco de código aberto, imprime linha pendente). */
  end(): void {
    if (this.inFence) {
      if (this.line) this.code.push(this.line);
      this.printCode();
      this.inFence = false;
    } else if (this.line.length > this.flushed) {
      this.emit(this.line.slice(this.flushed));
    }
    if (this.wroteAnything && !this.line.endsWith('\n')) this.emit('\n');
    this.line = '';
    this.flushed = 0;
  }

  private emit(s: string): void {
    if (s) {
      this.wroteAnything = true;
      this.out(s);
    }
  }

  private flushPartial(): void {
    if (this.inFence) return;
    const t = this.line.trimStart();
    // Pode ser o início de uma cerca: segura até a linha terminar.
    if ('```'.startsWith(t) || t.startsWith('```')) return;
    this.emit(this.line.slice(this.flushed));
    this.flushed = this.line.length;
  }

  private endLine(): void {
    const t = this.line.trim();
    if (!this.inFence && t.startsWith('```')) {
      this.inFence = true;
      this.lang = t.slice(3).trim();
      this.code = [];
    } else if (this.inFence && t.startsWith('```')) {
      this.printCode();
      this.inFence = false;
    } else if (this.inFence) {
      this.code.push(this.line);
    } else {
      this.emit(this.line.slice(this.flushed) + '\n');
    }
    this.line = '';
    this.flushed = 0;
  }

  private printCode(): void {
    const body = highlightCode(this.code.join('\n'), this.lang || undefined);
    const bar = chalk.gray('│ ');
    const label = chalk.gray(`┌─ ${this.lang || 'código'}`);
    this.emit(`${label}\n${body.split('\n').map((l) => bar + l).join('\n')}\n${chalk.gray('└─')}\n`);
    this.code = [];
  }
}
