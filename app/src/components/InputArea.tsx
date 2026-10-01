import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { runTurn, stopAgent } from '../lib/agent';
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

  const status = phase === 'listening' ? 'Ouvindo… toque no orbe para enviar' : phase === 'transcribing' ? 'Transcrevendo…' : '';

  return (
    <div className="shrink-0 px-3 sm:px-6 pt-2" style={{ paddingBottom: 'calc(14px + var(--safe-bottom))' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 'var(--chat-w)' }}>
        {(status || voiceError) && (
          <div className="text-center text-[12px] mb-2" style={{ color: voiceError ? 'var(--danger)' : 'var(--gold-300)' }}>
            {voiceError || status}
          </div>
        )}
        <div className="glass flex items-end gap-2 rounded-[22px] p-2 pl-2.5" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.35)' }}>
          {showOrb && (
            <div className="p-0.5 self-center">
              <Orb size={40} onClick={orbTap} label="Falar (voz)" />
            </div>
          )}
          <textarea
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
            placeholder={phase === 'listening' ? 'Ouvindo…' : 'Pergunte ou peça algo ao Severo…'}
            className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-6 py-2 px-1.5 max-h-[200px]"
            style={{ color: 'var(--text)' }}
          />
          {busy ? (
            <button onClick={stopAgent} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer" style={{ border: '1px solid var(--border-strong)', color: 'var(--gold-200)' }} aria-label="Parar">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button onClick={send} disabled={!text.trim()} className="btn-gold shrink-0 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer" aria-label="Enviar">
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          )}
        </div>
        {hasSystemTools && agent && autoApprove && (
          <div className="text-center text-[11px] mt-1.5" style={{ color: 'var(--warning)' }}>
            Aprovação automática ligada: o Severo executa ações no PC sem perguntar.
          </div>
        )}
      </div>
    </div>
  );
}
