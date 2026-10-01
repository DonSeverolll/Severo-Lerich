import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { ShellKind } from '../config.js';

export interface RunOptions {
  command: string;
  cwd: string;
  shell: ShellKind;
  timeoutMs: number;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  durationMs: number;
}

/** Limite de memória por stream; o que passar disso mantém só o final. */
const MAX_CAPTURE = 2_000_000;

function buildInvocation(shell: ShellKind, command: string): { file: string; args: string[]; verbatim: boolean } {
  switch (shell) {
    case 'powershell':
    case 'pwsh': {
      // UTF-8 na saída, sem barras de progresso, e exit code do último comando nativo propagado.
      const script = [
        '$ProgressPreference = "SilentlyContinue"',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '$OutputEncoding = [System.Text.Encoding]::UTF8',
        command,
        'if (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE } else { exit 1 } }',
        'if ($LASTEXITCODE) { exit $LASTEXITCODE }',
      ].join('\n');
      // -EncodedCommand (UTF-16LE base64) elimina qualquer problema de escape de aspas.
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      return {
        file: shell === 'pwsh' ? 'pwsh.exe' : 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        verbatim: false,
      };
    }
    case 'cmd':
      return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"chcp 65001>nul & ${command}"`], verbatim: true };
    case 'bash':
      return { file: 'bash', args: ['-c', command], verbatim: false };
  }
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* já encerrado */
    }
  }
}

/** Executa um comando no shell escolhido transmitindo stdout/stderr em tempo real. */
export function runCommand(opts: RunOptions): Promise<RunResult> {
  const { file, args, verbatim } = buildInvocation(opts.shell, opts.command);
  const started = Date.now();

  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(opts.signal.reason);

    const child = spawn(file, args, {
      cwd: opts.cwd,
      // Força UTF-8 em ferramentas que escrevem no code page do console quando a saída é um pipe.
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
      stdio: ['ignore', 'pipe', 'pipe'], // sem stdin: comandos interativos recebem EOF em vez de travar
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    const append = (buf: string, chunk: string) => {
      const next = buf + chunk;
      return next.length > MAX_CAPTURE ? next.slice(-MAX_CAPTURE) : next;
    };

    const outDecoder = new StringDecoder('utf8');
    const errDecoder = new StringDecoder('utf8');
    child.stdout.on('data', (data: Buffer) => {
      const s = outDecoder.write(data);
      stdout = append(stdout, s);
      opts.onStdout?.(s);
    });
    child.stderr.on('data', (data: Buffer) => {
      const s = errDecoder.write(data);
      stderr = append(stderr, s);
      opts.onStderr?.(s);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, opts.timeoutMs);

    const onAbort = () => {
      aborted = true;
      killTree(child.pid);
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', (err) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(new Error(`Falha ao iniciar ${file}: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      stdout += outDecoder.end();
      stderr += errDecoder.end();
      resolve({ exitCode: code, stdout, stderr, timedOut, aborted, durationMs: Date.now() - started });
    });
  });
}
