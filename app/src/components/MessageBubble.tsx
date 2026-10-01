import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Mic, Volume2 } from 'lucide-react';
import { canSpeak, speak } from '../lib/voice';

function textOf(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return node?.props?.children ? textOf(node.props.children) : '';
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/5"
      style={{ color: 'var(--text-3)' }}
      aria-label="Copiar"
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {label && <span className="text-[11px]">{done ? 'Copiado' : label}</span>}
    </button>
  );
}

function CodeBlock({ children }: any) {
  const code = Array.isArray(children) ? children[0] : children;
  const lang = /language-([\w-]+)/.exec(code?.props?.className ?? '')?.[1] ?? '';
  return (
    <div className="my-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-3 py-1 text-[11px]" style={{ background: 'rgba(226,176,74,0.07)', color: 'var(--text-3)' }}>
        <span className="font-mono">{lang || 'código'}</span>
        <CopyButton text={textOf(code?.props?.children).replace(/\n$/, '')} label="Copiar" />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text, live }: { text: string; live?: boolean }) {
  return (
    <div className={`prose-gold ${live ? 'cursor-blink' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]} components={{ pre: CodeBlock }}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

export function UserBubble({ text, voice }: { text: string; voice?: boolean }) {
  return (
    <div className="flex justify-end fade-in">
      <div
        className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap"
        style={{ background: 'linear-gradient(135deg, rgba(240,201,106,0.2), rgba(201,149,58,0.12))', border: '1px solid var(--border-strong)', color: 'var(--gold-50)' }}
      >
        {voice && <Mic size={12} className="inline mr-1.5 -mt-0.5" style={{ color: 'var(--gold-300)' }} />}
        {text}
      </div>
    </div>
  );
}

export function AssistantText({ text, provider, live }: { text: string; provider?: string; live?: boolean }) {
  return (
    <div className="group fade-in">
      <Markdown text={text} live={live} />
      {!live && (
        <div className="flex items-center gap-1 mt-1.5 opacity-70 md:opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={text} />
          {canSpeak && (
            <button onClick={() => speak(text)} className="p-1 rounded cursor-pointer hover:bg-white/5" style={{ color: 'var(--text-3)' }} aria-label="Ouvir">
              <Volume2 size={12} />
            </button>
          )}
          {provider && (
            <span className="text-[10.5px] ml-1" style={{ color: 'var(--text-3)' }}>
              via {provider}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
