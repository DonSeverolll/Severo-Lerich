import readline from 'node:readline/promises';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { Config } from '../config.js';
import { highlightCode } from './highlight.js';
import { MarkdownStream } from './markdown-stream.js';

export type Approval = 'yes' | 'no' | 'all';

const out = (s: string) => process.stdout.write(s);

/** Toda a saída visual e a entrada do usuário passam por aqui. */
export class TerminalUI {
  readonly rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
      historySize: 200,
    });
  }

  close(): void {
    this.rl.close();
  }

  banner(config: Config, keyCount: number, version: string): void {
    const line = chalk.gray('─'.repeat(Math.min(process.stdout.columns || 80, 80)));
    out(`${line}\n`);
    out(`${chalk.bold.cyan('  Severo')} ${chalk.gray(`v${version}`)}  ${chalk.gray('agente autônomo local')}\n`);
    out(chalk.gray(`  modelo: ${config.model}  ·  gateway: ${config.baseUrl}  ·  chaves: ${keyCount}\n`));
    out(chalk.gray(`  shell: ${config.shell}  ·  cwd: ${config.cwd}\n`));
    out(
      `  aprovação: ${config.autoApprove ? chalk.red.bold('AUTOMÁTICA (--auto-approve)') : chalk.green('manual')}` +
        chalk.gray('  ·  /ajuda para comandos  ·  Ctrl+C interrompe\n'),
    );
    out(`${line}\n`);
  }

  async prompt(): Promise<string> {
    let text = await this.rl.question(chalk.cyan.bold('\n› '));
    // Linha terminando em "\" continua na próxima (entrada multilinha).
    while (text.endsWith('\\')) {
      text = text.slice(0, -1) + '\n' + (await this.rl.question(chalk.cyan('… ')));
    }
    return text;
  }

  async ask(question: string, signal?: AbortSignal): Promise<string> {
    return this.rl.question(question, { signal });
  }

  async confirm(question: string, signal?: AbortSignal): Promise<Approval> {
    for (;;) {
      const answer = (
        await this.rl.question(`${chalk.yellow.bold('?')} ${question} ${chalk.gray('[S]im / [n]ão / [t]odos nesta sessão: ')}`, { signal })
      )
        .trim()
        .toLowerCase();
      if (answer === '' || answer === 's' || answer === 'sim' || answer === 'y' || answer === 'yes') return 'yes';
      if (answer === 'n' || answer === 'nao' || answer === 'não' || answer === 'no') return 'no';
      if (answer === 't' || answer === 'todos' || answer === 'a' || answer === 'all') return 'all';
    }
  }

  spinner(text: string): Ora {
    return ora({ text, color: 'cyan', discardStdin: false, stream: process.stderr }).start();
  }

  markdownStream(): MarkdownStream {
    return new MarkdownStream(out);
  }

  assistantStart(): void {
    out(`\n${chalk.magenta.bold('◆')} `);
  }

  reasoning(text: string): void {
    out(chalk.gray.italic(text));
  }

  toolHeader(name: string, summary: string): void {
    out(`\n${chalk.yellow('⚙')} ${chalk.bold.yellow(name)} ${chalk.white(summary)}\n`);
  }

  toolOk(text: string): void {
    out(`  ${chalk.green('✔')} ${chalk.gray(text)}\n`);
  }

  toolError(text: string): void {
    out(`  ${chalk.red('✖')} ${chalk.red(text)}\n`);
  }

  fileChanged(kind: 'criado' | 'sobrescrito' | 'editado', filePath: string, detail: string): void {
    const color = kind === 'criado' ? chalk.green : chalk.blue;
    out(`  ${color('✎')} ${color.bold(kind)} ${chalk.underline(filePath)} ${chalk.gray(detail)}\n`);
  }

  commandOutput(chunk: string, isStderr: boolean): void {
    out(isStderr ? chalk.red(chunk) : chalk.gray(chunk));
  }

  showCommand(command: string, language: string, cwd: string): void {
    const body = highlightCode(command, language)
      .split('\n')
      .map((l) => `  ${chalk.gray('$')} ${l}`)
      .join('\n');
    out(`${body}\n  ${chalk.gray(`em ${cwd}`)}\n`);
  }

  showCode(code: string, language: string | undefined, maxLines = 40): void {
    const lines = code.split('\n');
    const shown = highlightCode(lines.slice(0, maxLines).join('\n'), language).split('\n');
    const width = String(Math.min(lines.length, maxLines)).length;
    shown.forEach((l, i) => out(`  ${chalk.gray(String(i + 1).padStart(width))} ${chalk.gray('│')} ${l}\n`));
    if (lines.length > maxLines) out(chalk.gray(`  … (+${lines.length - maxLines} linhas)\n`));
  }

  /** Mostra uma substituição como diff unificado simples. */
  showDiff(startLine: number, oldText: string, newText: string, maxLines = 60): void {
    out(chalk.cyan(`  @@ linha ${startLine} @@\n`));
    const oldLines = oldText.split(/\r?\n/);
    const newLines = newText.split(/\r?\n/);
    const print = (lines: string[], sign: string, color: (s: string) => string) => {
      lines.slice(0, maxLines).forEach((l) => out(color(`  ${sign} ${l}\n`)));
      if (lines.length > maxLines) out(chalk.gray(`    … (+${lines.length - maxLines} linhas)\n`));
    };
    print(oldLines, '-', chalk.red);
    print(newLines, '+', chalk.green);
  }

  info(text: string): void {
    out(`${chalk.cyan('ℹ')} ${text}\n`);
  }

  warn(text: string): void {
    out(`${chalk.yellow('⚠')} ${chalk.yellow(text)}\n`);
  }

  error(text: string): void {
    out(`${chalk.red('✖')} ${chalk.red(text)}\n`);
  }

  dim(text: string): void {
    out(chalk.gray(text) + '\n');
  }
}
