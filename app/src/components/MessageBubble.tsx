import { CheckIcon, CopyIcon, MicrophoneIcon, SpeakerHighIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { enter } from '../lib/motion';
import { canSpeak, speak } from '../lib/voice';

function textOf(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return node?.props?.children ? textOf(node.props.children) : '';
}

/** Botão de copiar com troca de ícone animada (opacidade + escala + desfoque). */
function CopyButton({ text, label = 'Copiar', showLabel }: { text: string; label?: string; showLabel?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={`btn btn-ghost ${showLabel ? 'h-8 px-2.5 text-[12px]' : 'btn-icon'}`}
      aria-label={done ? 'Copiado' : label}
    >
      <span className="relative grid size-4 place-items-center">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={done ? 'ok' : 'copy'}
            initial={{ opacity: 0, scale: 0.8, filter: 'blur(2px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.8, filter: 'blur(2px)' }}
            transition={{ duration: 0.15 }}
            className="grid place-items-center"
          >
            {done ? <CheckIcon size={16} aria-hidden /> : <CopyIcon size={16} aria-hidden />}
          </motion.span>
        </AnimatePresence>
      </span>
      {showLabel && <span>{done ? 'Copiado' : label}</span>}
    </button>
  );
}

function CodeBlock({ children }: any) {
  const code = Array.isArray(children) ? children[0] : children;
  const lang = /language-([\w-]+)/.exec(code?.props?.className ?? '')?.[1] ?? '';
  return (
    <div className="my-3 overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-center justify-between pl-3.5 pr-1 py-0.5" style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>
        <span className="font-mono text-[12px]">{lang || 'código'}</span>
        <CopyButton text={textOf(code?.props?.children).replace(/\n$/, '')} label="Copiar código" showLabel />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]} components={{ pre: CodeBlock }}>
      {text}
    </ReactMarkdown>
  );
});

export function UserBubble({ text, voice }: { text: string; voice?: boolean }) {
  return (
    <motion.div variants={enter} initial="initial" animate="animate" className="flex justify-end">
      <div
        className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] px-4 py-2.5 text-[16px] leading-relaxed"
        style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
      >
        {voice && (
          <span className="mr-1.5 inline-flex align-[-2px]" style={{ color: 'var(--accent)' }} title="Enviado por voz">
            <MicrophoneIcon size={15} aria-label="Enviado por voz" />
          </span>
        )}
        {text}
      </div>
    </motion.div>
  );
}

export function AssistantText({ text, provider, live, actions = true }: { text: string; provider?: string; live?: boolean; actions?: boolean }) {
  return (
    <motion.div variants={enter} initial={live ? false : 'initial'} animate="animate" className="group">
      <div className="prose-severo">
        <Markdown text={text} />
        {live && <span className="caret" aria-hidden />}
      </div>
      {!live && actions && (
        <div className="-ml-2 mt-1 flex items-center gap-0.5 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <CopyButton text={text} label="Copiar resposta" />
          {canSpeak && (
            <button onClick={() => speak(text)} className="btn btn-ghost btn-icon" aria-label="Ouvir resposta">
              <SpeakerHighIcon size={16} aria-hidden />
            </button>
          )}
          {provider && (
            <span className="ml-1.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
              {provider === 'sistema' ? 'Aviso do app' : `Respondido por ${provider}`}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
