import { ArrowUpIcon, StopIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { runTurn, stopAgent } from '../lib/agent';
import { enter } from '../lib/motion';
import { hasSystemTools } from '../lib/platform';
import { useApp } from '../lib/store';
import { onVoicePhase, orbTap, type VoicePhase } from '../lib/voice-flow';
import { Orb } from './Orb';

export function InputArea({ showOrb }: { showOrb: boolean }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [voiceError, setVoiceError] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const { busy, autoApprove, agent } = useApp(useShallow((s) => ({ busy: s.busy, autoApprove: s.settings.autoApprove, agent: s.settings.agentEnabled })));

  useEffect(
    () =>
      onVoicePhase((p, info) => {
        setPhase(p);
        if (info) {
          setVoiceError(info);
          setTimeout(() => setVoiceError(''), 6000);
        }
      }),
    [],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    runTurn(t);
  };

  const status = voiceError || (phase === 'listening' ? 'Ouvindo. Toque no orbe para enviar.' : phase === 'transcribing' ? 'Transcrevendo o áudio.' : '');

  return (
    <div className="shrink-0 px-3 pt-2 sm:px-6" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 'var(--chat-w)' }}>
        <div aria-live="polite" className="min-h-0">
          <AnimatePresence>
            {status && (
              <motion.p key={status} variants={enter} initial="initial" animate="animate" exit="exit" className="mb-2 text-center text-[13px]" style={{ color: voiceError ? 'var(--danger)' : 'var(--text-2)' }}>
                {status}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="composer flex items-end gap-1.5 rounded-[18px] border p-1.5 transition-[border-color,box-shadow] duration-150"
          style={{ background: 'var(--bg-raised)', borderColor: 'var(--line)', boxShadow: 'var(--shadow-raised)' }}
        >
          {showOrb && (
            <div className="grid size-11 shrink-0 place-items-center">
              <Orb size={34} onClick={orbTap} label="Falar por voz" />
            </div>
          )}
          <label htmlFor="composer" className="sr-only">
            Mensagem para o Severo
          </label>
          <textarea
            id="composer"
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={phase === 'listening' ? 'Ouvindo' : 'Pergunte ou peça algo'}
            className={`max-h-[200px] min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 outline-none ${showOrb ? 'px-1' : 'px-3'}`}
            style={{ color: 'var(--text)' }}
          />
          {busy ? (
            <button type="button" onClick={stopAgent} className="btn btn-secondary size-11 shrink-0" aria-label="Parar resposta">
              <StopIcon size={16} weight="fill" aria-hidden />
            </button>
          ) : (
            <button type="submit" disabled={!text.trim()} className="btn btn-primary size-11 shrink-0" aria-label="Enviar mensagem">
              <ArrowUpIcon size={19} weight="bold" aria-hidden />
            </button>
          )}
        </form>

        {hasSystemTools && agent && autoApprove && (
          <p className="mt-2 text-center text-[12px]" style={{ color: 'var(--warning)' }}>
            Aprovação automática ligada: o Severo executa ações no PC sem perguntar.
          </p>
        )}
      </div>
    </div>
  );
}
