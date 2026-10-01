#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { Agent } from './agent.js';
import { APP_ROOT, loadConfig, parseShell, type Config } from './config.js';
import { LLMClient } from './llm/client.js';
import { ALL_TOOLS } from './tools/index.js';
import { TerminalUI } from './ui/terminal.js';

const VERSION: string = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).version;

interface CliOptions {
  autoApprove?: boolean;
  model?: string;
  cwd?: string;
  baseUrl?: string;
  shell?: string;
  maxIterations?: string;
}

const HELP = `
${chalk.bold('Comandos:')}
  /ajuda            mostra esta ajuda
  /auto             liga/desliga a aprovação automática de ações
  /modelo <nome>    troca o modelo
  /cd <pasta>       muda o diretório de trabalho do agente
  /limpar           apaga o histórico da conversa
  /status           mostra configuração, mensagens e tokens usados
  /sair             encerra
${chalk.gray('Termine uma linha com \\ para continuar digitando na próxima. Ctrl+C interrompe a tarefa atual.')}`;

async function main(goalParts: string[], opts: CliOptions): Promise<void> {
  const config: Config = loadConfig({
    autoApprove: opts.autoApprove || undefined,
    model: opts.model,
    cwd: opts.cwd,
    baseUrl: opts.baseUrl?.replace(/\/+$/, ''),
    shell: opts.shell ? parseShell(opts.shell) : undefined,
    maxIterations: opts.maxIterations ? Number.parseInt(opts.maxIterations, 10) || undefined : undefined,
  });

  const ui = new TerminalUI();
  const client = new LLMClient(config);
  const agent = new Agent(config, client, ui, ALL_TOOLS);

  let running: AbortController | null = null;
  let lastSigint = 0;
  const onSigint = () => {
    if (running) {
      ui.warn('\nInterrompendo…');
      running.abort(new Error('Interrompido pelo usuário'));
      return;
    }
    if (Date.now() - lastSigint < 2000) {
      ui.close();
      process.exit(0);
    }
    lastSigint = Date.now();
    process.stdout.write(chalk.gray('\n(Ctrl+C novamente para sair)\n'));
    ui.rl.prompt(true);
  };
  ui.rl.on('SIGINT', onSigint);
  process.on('SIGINT', onSigint);

  const runGoal = async (goal: string): Promise<boolean> => {
    running = new AbortController();
    try {
      await agent.run(goal, running.signal);
      return true;
    } catch (err) {
      if (running.signal.aborted) ui.warn('Tarefa interrompida.');
      else ui.error(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      running = null;
    }
  };

  ui.banner(config, client.keyCount, VERSION);

  // Modo one-shot: `severo "objetivo"` executa e sai.
  if (goalParts.length) {
    const ok = await runGoal(goalParts.join(' '));
    ui.close();
    process.exit(ok ? 0 : 1);
  }

  let closed = false;
  ui.rl.on('close', () => {
    closed = true;
    if (!running) {
      process.stdout.write(chalk.gray('\nAté mais!\n'));
      process.exit(0);
    }
  });

  while (!closed) {
    let input: string;
    try {
      input = (await ui.prompt()).trim();
    } catch {
      break;
    }
    if (!input) continue;

    if (input.startsWith('/')) {
      const [cmd, ...rest] = input.slice(1).split(/\s+/);
      const arg = rest.join(' ').trim();
      switch (cmd.toLowerCase()) {
        case 'sair':
        case 'exit':
        case 'quit':
          ui.close();
          return;
        case 'ajuda':
        case 'help':
          console.log(HELP);
          break;
        case 'auto':
          ui.info(`Aprovação automática: ${agent.toggleAutoApprove() ? chalk.red.bold('LIGADA') : chalk.green('desligada')}`);
          break;
        case 'modelo':
        case 'model':
          if (!arg) ui.info(`Modelo atual: ${config.model}`);
          else {
            config.model = arg;
            ui.info(`Modelo alterado para ${arg}`);
          }
          break;
        case 'cd': {
          const target = path.resolve(config.cwd, arg || '.');
          if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) ui.error(`Pasta não encontrada: ${target}`);
          else {
            config.cwd = target;
            agent.refreshSystemPrompt();
            ui.info(`Diretório de trabalho: ${target}`);
          }
          break;
        }
        case 'limpar':
        case 'clear':
          agent.reset();
          ui.info('Histórico apagado.');
          break;
        case 'status':
          ui.info(
            `modelo ${config.model} · cwd ${config.cwd} · shell ${config.shell} · auto-approve ${config.autoApprove ? 'sim' : 'não'}\n` +
              `  mensagens no histórico: ${agent.messageCount} · tokens: ${agent.usage.prompt_tokens} entrada / ${agent.usage.completion_tokens} saída`,
          );
          break;
        default:
          ui.warn(`Comando desconhecido: /${cmd}. Use /ajuda.`);
      }
      continue;
    }

    await runGoal(input);
  }
}

const program = new Command()
  .name('severo')
  .description('Agente autônomo de IA para o terminal: lê/escreve arquivos e executa comandos para cumprir objetivos.')
  .version(VERSION)
  .argument('[objetivo...]', 'objetivo a executar sem modo interativo (one-shot)')
  .option('-y, --auto-approve', 'executa comandos e alterações sem pedir confirmação')
  .option('-m, --model <modelo>', 'modelo a usar (sobrescreve LLM_MODEL)')
  .option('-C, --cwd <pasta>', 'diretório de trabalho do agente')
  .option('--base-url <url>', 'URL base do gateway (sobrescreve LLM_BASE_URL)')
  .option('--shell <shell>', 'powershell | pwsh | cmd | bash')
  .option('--max-iterations <n>', 'máximo de ciclos por objetivo')
  .action(async (goal: string[], opts: CliOptions) => {
    try {
      await main(goal, opts);
    } catch (err) {
      console.error(chalk.red(`✖ ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
