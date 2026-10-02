import { CaretRightIcon, CheckCircleIcon, CircleNotchIcon, ClockIcon, ProhibitIcon, ShieldWarningIcon, XCircleIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { enter, spring } from '../lib/motion';
import { useApp } from '../lib/store';
import { TOOL_MAP, type Preview } from '../lib/tools';
import type { ToolCall, ToolRun } from '../lib/types';

const STATUS = {
  pending: { icon: ClockIcon, color: 'var(--warning)', text: 'Aguardando' },
  running: { icon: CircleNotchIcon, color: 'var(--accent)', text: 'Executando' },
  success: { icon: CheckCircleIcon, color: 'var(--success)', text: 'Concluído' },
  error: { icon: XCircleIcon, color: 'var(--danger)', text: 'Falhou' },
  denied: { icon: ProhibitIcon, color: 'var(--text-3)', text: 'Negado' },
} as const;

function parseArgs(raw: string): Record<string, any> {
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

function summary(args: Record<string, any>): string {
  const first = args.command ?? args.path ?? args.pattern ?? Object.values(args)[0];
  const text = typeof first === 'string' ? first : first ? JSON.stringify(first) : '';
  return text.split('\n')[0];
}

function formatLatency(ms?: number): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const codeBox = 'max-h-72 overflow-auto whitespace-pre rounded-[10px] p-3 font-mono text-[12.5px] leading-relaxed';

function PreviewView({ preview }: { preview: Preview }) {
  if (preview.kind === 'command') {
    return (
      <div className="space-y-1.5">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          {preview.shell === 'pwsh' ? 'PowerShell 7' : 'PowerShell'} em <span className="font-mono">{preview.cwd}</span>
        </p>
        <pre className={codeBox} style={{ background: 'var(--code-bg)' }}>
          <span style={{ color: 'var(--text-3)' }}>PS&gt; </span>
          {preview.command}
        </pre>
      </div>
    );
  }
  if (preview.kind === 'file') {
    const lines = preview.content.split('\n');
    return (
      <div className="space-y-1.5">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          <span style={{ color: preview.linesBefore === null ? 'var(--success)' : 'var(--warning)' }}>
            {preview.linesBefore === null ? 'Novo arquivo' : `Substitui o arquivo (${preview.linesBefore} → ${lines.length} linhas)`}
          </span>{' '}
          <span className="font-mono">{preview.path}</span>
        </p>
        <pre className={codeBox} style={{ background: 'var(--code-bg)' }}>
          {lines.slice(0, 60).join('\n')}
          {lines.length > 60 ? `\n… mais ${lines.length - 60} linhas` : ''}
        </pre>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[12px]" style={{ color: 'var(--text-3)' }}>
        {preview.path}
      </p>
      <div className={codeBox} style={{ background: 'var(--code-bg)' }}>
        {preview.hunks.map((h, i) => (
          <div key={i} className={i ? 'mt-3' : ''}>
            <div style={{ color: 'var(--text-3)' }}>
              linha {h.line}
              {h.count > 1 ? `, ${h.count} ocorrências` : ''}
            </div>
            {h.oldText.split('\n').map((l, j) => (
              <div key={`o${j}`} style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
                - {l}
              </div>
            ))}
            {h.newText.split('\n').map((l, j) => (
              <div key={`n${j}`} style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 10%, transparent)' }}>
                + {l}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToolCallCard({ call, run, conversationId }: { call: ToolCall; run?: ToolRun; conversationId: string }) {
  const pending = useApp((s) => (s.pendingApproval?.callId === call.id && s.pendingApproval.conversationId === conversationId ? s.pendingApproval : null));
  const [open, setOpen] = useState(false);
  const status = run?.status ?? 'pending';
  const cfg = STATUS[status];
  const Icon = cfg.icon;
  const args = parseArgs(call.function.arguments);
  const tool = TOOL_MAP.get(call.function.name);
  const expanded = open || status === 'running';
  const latency = formatLatency(run?.latencyMs);

  return (
    <motion.div
      variants={enter}
      initial="initial"
      animate="animate"
      className="overflow-hidden rounded-[18px] border"
      style={{
        borderColor: pending ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--line)',
        background: 'var(--bg-raised)',
        boxShadow: `inset 2px 0 0 ${cfg.color}`,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2 text-left cursor-pointer"
      >
        <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }} className="grid place-items-center" style={{ color: 'var(--text-3)' }}>
          <CaretRightIcon size={14} aria-hidden />
        </motion.span>
        <Icon size={17} style={{ color: cfg.color }} className={status === 'running' ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden />
        <span className="shrink-0 text-[14px] font-medium">{tool?.label ?? call.function.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]" style={{ color: 'var(--text-3)' }}>
          {summary(args)}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums" style={{ color: 'var(--text-3)' }}>
          {latency ?? cfg.text}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {pending && (
          <motion.div
            key="approval"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: spring }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="space-y-3 px-3.5 pb-3.5"
            role="group"
            aria-label="Aprovação da ação"
          >
            {pending.preview && <PreviewView preview={pending.preview} />}
            <p className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
              <ShieldWarningIcon size={17} style={{ color: 'var(--warning)' }} aria-hidden />
              O Severo quer executar esta ação no seu PC.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => pending.resolve('yes')} className="btn btn-primary h-9 px-4" autoFocus>
                Permitir
              </button>
              <button onClick={() => pending.resolve('always')} className="btn btn-secondary h-9 px-4">
                Permitir nesta tarefa
              </button>
              <button onClick={() => pending.resolve('no')} className="btn btn-ghost h-9 px-4">
                Negar
              </button>
            </div>
          </motion.div>
        )}

        {expanded && !pending && (
          <motion.div
            key="details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="space-y-2 px-3.5 pb-3.5"
          >
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-[10px] p-3 font-mono text-[12px]" style={{ background: 'var(--code-bg)', color: 'var(--text-2)' }}>
              {JSON.stringify(args, null, 2)}
            </pre>
            {run?.output && (
              <pre
                className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] p-3 font-mono text-[12px]"
                style={{ background: 'var(--code-bg)', color: status === 'error' ? 'var(--danger)' : 'var(--text)' }}
              >
                {run.output}
              </pre>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
