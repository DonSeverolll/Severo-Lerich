import { ArrowRightIcon, KeyIcon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { runTurn } from '../lib/agent';
import { easeOut } from '../lib/motion';
import { hasSystemTools } from '../lib/platform';
import { useApp } from '../lib/store';
import { orbTap } from '../lib/voice-flow';
import { AssistantText, UserBubble } from './MessageBubble';
import { Orb } from './Orb';
import { ToolCallCard } from './ToolCallCard';

const SUGGESTIONS_PC = ['Organize minha pasta Downloads', 'O que está usando mais memória?', 'Renomeie minhas fotos pela data'];
const SUGGESTIONS = ['Explique um assunto difícil', 'Escreva uma mensagem a um cliente', 'Monte um plano de estudos'];

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const ORB_HINT = {
  idle: 'Toque no orbe para falar',
  listening: 'Ouvindo. Toque para enviar',
  thinking: 'Pensando',
  speaking: 'Falando. Toque para parar',
  error: 'Algo deu errado. Toque para tentar de novo',
} as const;

/** Estado vazio: o orbe é o protagonista. Entrada em sequência curta, uma única vez. */
function EmptyState() {
  const { orb, hasKey } = useApp(useShallow((s) => ({ orb: s.orb, hasKey: s.settings.providers.some((p) => p.enabled && p.apiKey.trim()) })));
  const suggestions = hasSystemTools ? SUGGESTIONS_PC : SUGGESTIONS;
  const item = (i: number) => ({
    initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: easeOut, delay: 0.08 * i } },
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-5 pb-6 pt-4 text-center">
      <motion.div {...item(0)}>
        <Orb size="min(220px, 52vw, 30vh)" onClick={orbTap} label="Falar com o Severo" />
      </motion.div>
      <motion.p {...item(1)} className="mt-8 text-[14px]" style={{ color: 'var(--text-2)' }} aria-live="polite">
        {ORB_HINT[orb]}
      </motion.p>
      <motion.h1 {...item(2)} className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">
        {greeting()}. Como posso ajudar?
      </motion.h1>

      {!hasKey && (
        <motion.button
          {...item(3)}
          onClick={() => useApp.getState().setView('settings')}
          className="btn btn-secondary mt-6 h-10 px-4"
        >
          <KeyIcon size={17} aria-hidden /> Adicionar chave de API
        </motion.button>
      )}

      <motion.ul {...item(hasKey ? 3 : 4)} className="mt-8 flex w-full max-w-[560px] flex-col gap-2 sm:items-center" aria-label="Sugestões">
        {suggestions.map((s) => (
          <li key={s} className="w-full sm:w-auto">
            <button
              onClick={() => runTurn(s)}
              className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-full border px-4 py-2 text-left text-[14px] transition-colors duration-150 cursor-pointer hover:bg-[var(--surface-hover)] sm:justify-center"
              style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
            >
              <span>{s}</span>
              <ArrowRightIcon size={15} aria-hidden className="shrink-0 opacity-60 transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </motion.ul>
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

  const answered = new Set(conversation.messages.filter((m) => m.role === 'tool').map((m) => (m as { tool_call_id: string }).tool_call_id));
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
      <div className="mx-auto w-full space-y-6 px-4 py-6 sm:px-6" style={{ maxWidth: 'var(--chat-w)' }}>
        {conversation.messages.map((m, i) => {
          if (m.role === 'user') return <UserBubble key={i} text={m.content} voice={m.voice} />;
          if (m.role !== 'assistant') return null;
          return (
            <div key={i} className="space-y-3">
              {m.content && <AssistantText text={m.content} provider={m.provider} actions={!m.tool_calls?.length} />}
              {m.tool_calls?.map((tc) => (
                <ToolCallCard
                  key={tc.id}
                  call={tc}
                  run={conversation.toolRuns[tc.id] ?? (answered.has(tc.id) ? { status: 'success', output: '' } : undefined)}
                  conversationId={conversation.id}
                />
              ))}
            </div>
          );
        })}
        {streamingText && <AssistantText text={streamingText} live />}
        {waiting && (
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <Orb size={24} state="thinking" />
            <span className="text-[14px]" style={{ color: 'var(--text-2)' }}>
              {activeProvider ? `Pensando com ${activeProvider}` : 'Pensando'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
