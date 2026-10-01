import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { runTurn } from '../lib/agent';
import { hasSystemTools } from '../lib/platform';
import { useApp } from '../lib/store';
import { orbTap } from '../lib/voice-flow';
import { AssistantText, UserBubble } from './MessageBubble';
import { Orb } from './Orb';
import { ToolCallCard } from './ToolCallCard';

const SUGGESTIONS_PC = ['Organize minha pasta Downloads por tipo de arquivo', 'Quais programas estão usando mais memória agora?', 'Crie um script Python que renomeie fotos pela data'];
const SUGGESTIONS = ['Me explique um assunto difícil de forma simples', 'Escreva uma mensagem profissional para um cliente', 'Monte um plano de estudos para esta semana'];

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function EmptyState() {
  const { orb, hasKey } = useApp(useShallow((s) => ({ orb: s.orb, hasKey: s.settings.providers.some((p) => p.enabled && p.apiKey.trim()) })));
  const suggestions = hasSystemTools ? SUGGESTIONS_PC : SUGGESTIONS;
  const hint =
    orb === 'listening' ? 'Ouvindo… toque para enviar' : orb === 'thinking' ? 'Pensando…' : orb === 'speaking' ? 'Falando… toque para parar' : 'Toque no orbe para falar';

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 text-center">
      <Orb size="min(240px, 58vw, 34vh)" onClick={orbTap} label="Falar com o Severo" />
      <div className="mt-10 text-[13px] tracking-[0.18em] uppercase" style={{ color: 'var(--gold-400)' }}>
        {hint}
      </div>
      <h1 className="gold-text mt-3 text-[28px] sm:text-[34px] font-semibold leading-tight">{greeting()}. Como posso ajudar?</h1>
      {!hasKey && (
        <button onClick={() => useApp.getState().setView('settings')} className="mt-4 text-[13px] underline underline-offset-4 cursor-pointer" style={{ color: 'var(--warning)' }}>
          Configure ao menos uma chave de API para começar
        </button>
      )}
      <div className="mt-7 flex flex-wrap justify-center gap-2 max-w-xl">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => runTurn(s)}
            className="rounded-full px-3.5 py-1.5 text-[12.5px] cursor-pointer hover:border-[var(--border-strong)] transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--text-2)', background: 'rgba(20,16,10,0.5)' }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatArea() {
  const { conversation, streamingText, busy, activeProvider } = useApp(
    useShallow((s) => ({
      conversation: s.conversations.find((c) => c.id === s.activeId),
      streamingText: s.streamingText,
      busy: s.busy,
      activeProvider: s.activeProvider,
    })),
  );
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  if (!conversation || !conversation.messages.length) return <EmptyState />;

  const toolResults = new Set(conversation.messages.filter((m) => m.role === 'tool').map((m) => (m as { tool_call_id: string }).tool_call_id));
  const last = conversation.messages[conversation.messages.length - 1];
  const waiting = busy && !streamingText && (last.role === 'user' || last.role === 'tool');

  return (
    <div
      ref={scroller}
      className="flex-1 overflow-y-auto"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <div className="mx-auto w-full px-4 sm:px-6 py-6 space-y-5" style={{ maxWidth: 'var(--chat-w)' }}>
        {conversation.messages.map((m, i) => {
          if (m.role === 'user') return <UserBubble key={i} text={m.content} voice={m.voice} />;
          if (m.role === 'assistant') {
            return (
              <div key={i} className="space-y-2.5">
                {m.content && <AssistantText text={m.content} provider={m.provider} />}
                {m.tool_calls?.map((tc) => (
                  <ToolCallCard key={tc.id} call={tc} run={conversation.toolRuns[tc.id] ?? (toolResults.has(tc.id) ? { status: 'success', output: '' } : undefined)} conversationId={conversation.id} />
                ))}
              </div>
            );
          }
          return null;
        })}
        {streamingText && <AssistantText text={streamingText} live />}
        {waiting && (
          <div className="flex items-center gap-3 fade-in" style={{ color: 'var(--text-3)' }}>
            <Orb size={26} state="thinking" />
            <span className="text-[13px]">{activeProvider ? `Pensando com ${activeProvider}…` : 'Pensando…'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
