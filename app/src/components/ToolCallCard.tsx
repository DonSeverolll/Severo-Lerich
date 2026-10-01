import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, CircleSlash, Clock, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { useApp } from '../lib/store';
import { TOOL_MAP, type Preview } from '../lib/tools';
import type { ToolCall, ToolRun } from '../lib/types';

const STATUS = {
  pending: { icon: Clock, color: 'var(--warning)', text: 'aguardando' },
  running: { icon: Loader2, color: 'var(--gold-300)', text: 'executando' },
  success: { icon: CheckCircle2, color: 'var(--success)', text: 'ok' },
  error: { icon: XCircle, color: 'var(--danger)', text: 'erro' },
  denied: { icon: CircleSlash, color: 'var(--text-3)', text: 'negado' },
} as const;

function parseArgs(raw: string): Record<string, any> {
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

function summary(call: ToolCall, args: Record<string, any>): string {
  const first = args.command ?? args.path ?? args.pattern ?? Object.values(args)[0];
  const text = typeof first === 'string' ? first : first ? JSON.stringify(first) : '';
  const line = text.split('\n')[0];
  return line.length > 70 ? `${line.slice(0, 70)}…` : line;
}

function PreviewView({ preview }: { preview: Preview }) {
  const box = 'rounded-lg p-2.5 overflow-auto max-h-72 text-[12px] leading-relaxed font-mono whitespace-pre';
  if (preview.kind === 'command') {
    return (
      <div>
        <div className="text-[11px] mb-1" style={{ color: 'var(--text-3)' }}>
          {preview.shell} em {preview.cwd}
        </div>
        <pre className={box} style={{ background: '#0a0805', color: 'var(--gold-200)' }}>
          <span style={{ color: 'var(--text-3)' }}>PS&gt; </span>
          {preview.command}
        </pre>
      </div>
    );
  }
  if (preview.kind === 'file') {
    const lines = preview.content.split('\n');
    return (
      <div>
        <div className="text-[11px] mb-1" style={{ color: preview.linesBefore === null ? 'var(--success)' : 'var(--warning)' }}>
          {preview.linesBefore === null ? 'novo arquivo' : `sobrescrever (${preview.linesBefore} → ${lines.length} linhas)`} · {preview.path}
        </div>
        <pre className={box} style={{ background: '#0a0805', color: 'var(--text)' }}>
          {lines.slice(0, 60).join('\n')}
          {lines.length > 60 ? `\n… (+${lines.length - 60} linhas)` : ''}
        </pre>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11px] mb-1" style={{ color: 'var(--text-3)' }}>
        {preview.path}
      </div>
      <div className={box} style={{ background: '#0a0805' }}>
        {preview.hunks.map((h, i) => (
          <div key={i} className="mb-2">
            <div style={{ color: 'var(--gold-400)' }}>
              @@ linha {h.line} @@{h.count > 1 ? ` (${h.count} ocorrências)` : ''}
            </div>
            {h.oldText.split('\n').map((l, j) => (
              <div key={`o${j}`} style={{ color: '#f0a090', background: 'rgba(229,115,95,0.08)' }}>
                - {l}
              </div>
            ))}
            {h.newText.split('\n').map((l, j) => (
              <div key={`n${j}`} style={{ color: '#b9d68a', background: 'rgba(143,194,122,0.08)' }}>
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
  const expanded = open || Boolean(pending) || status === 'running';

  return (
    <div className="rounded-xl overflow-hidden text-[13px] fade-in" style={{ border: `1px solid ${pending ? 'var(--border-strong)' : 'var(--border)'}`, background: 'rgba(20,16,10,0.7)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer">
        {expanded ? <ChevronDown size={13} style={{ color: 'var(--text-3)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-3)' }} />}
        <Icon size={14} style={{ color: cfg.color }} className={status === 'running' ? 'animate-spin' : ''} />
        <span className="font-medium shrink-0" style={{ color: 'var(--gold-200)' }}>
          {tool?.label ?? call.function.name}
        </span>
        <span className="truncate font-mono text-[11.5px]" style={{ color: 'var(--text-3)' }}>
          {summary(call, args)}
        </span>
        <span className="flex-1" />
        <span className="text-[11px] shrink-0" style={{ color: 'var(--text-3)' }}>
          {run?.latencyMs != null ? (run.latencyMs < 1000 ? `${run.latencyMs}ms` : `${(run.latencyMs / 1000).toFixed(1)}s`) : cfg.text}
        </span>
      </button>

      {pending && (
        <div className="px-3 pb-3 space-y-3">
          {pending.preview && <PreviewView preview={pending.preview} />}
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--warning)' }}>
            <ShieldAlert size={15} /> O Severo quer executar esta ação no seu PC.
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => pending.resolve('yes')} className="btn-gold rounded-lg px-4 py-1.5 text-[13px] cursor-pointer">
              Permitir
            </button>
            <button
              onClick={() => pending.resolve('always')}
              className="rounded-lg px-4 py-1.5 text-[13px] cursor-pointer"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--gold-200)' }}
            >
              Permitir tudo nesta tarefa
            </button>
            <button onClick={() => pending.resolve('no')} className="rounded-lg px-4 py-1.5 text-[13px] cursor-pointer hover:bg-white/5" style={{ color: 'var(--text-2)' }}>
              Negar
            </button>
          </div>
        </div>
      )}

      {expanded && !pending && (
        <div className="px-3 pb-3 space-y-2">
          <pre className="rounded-lg p-2 text-[11.5px] font-mono overflow-auto max-h-40 whitespace-pre-wrap" style={{ background: '#0a0805', color: 'var(--text-2)' }}>
            {JSON.stringify(args, null, 2)}
          </pre>
          {run?.output && (
            <pre className="rounded-lg p-2 text-[11.5px] font-mono overflow-auto max-h-72 whitespace-pre-wrap" style={{ background: '#0a0805', color: status === 'error' ? '#f0a090' : 'var(--text)' }}>
              {run.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
