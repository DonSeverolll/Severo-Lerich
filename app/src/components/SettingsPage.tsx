import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, Loader2, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import { completeWithFallback } from '../lib/llm';
import { hasSystemTools } from '../lib/platform';
import { DEFAULT_PROVIDERS, KEY_LINKS } from '../lib/providers';
import { DEFAULT_SETTINGS, useApp } from '../lib/store';
import type { Provider } from '../lib/types';
import { canSpeak } from '../lib/voice';

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--gold-200)' }}>
        {title}
      </h2>
      {desc && (
        <p className="text-[12.5px] mt-1 mb-3 leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {desc}
        </p>
      )}
      <div className="space-y-3 mt-3">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="mt-0.5 shrink-0 w-10 h-[22px] rounded-full relative transition-colors cursor-pointer"
        style={{ background: checked ? 'var(--gold-500)' : 'rgba(255,255,255,0.12)' }}
      >
        <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all" style={{ left: checked ? 21 : 3 }} />
      </button>
      <span>
        <span className="text-[14px]">{label}</span>
        {hint && (
          <span className="block text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] mb-1" style={{ color: 'var(--text-2)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ProviderCard({ p, index, total }: { p: Provider; index: number; total: number }) {
  const { updateProvider, setProviders } = useApp.getState();
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; msg?: string }>({ state: 'idle' });
  const builtin = DEFAULT_PROVIDERS.some((d) => d.id === p.id);

  const move = (delta: number) => {
    const list = [...useApp.getState().settings.providers];
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    setProviders(list);
  };

  const runTest = async () => {
    setTest({ state: 'running' });
    const started = Date.now();
    try {
      const out = await completeWithFallback(
        [{ ...p, enabled: true }],
        [{ role: 'user', content: 'Responda apenas: ok' }],
        [],
        {},
        AbortSignal.timeout(30_000),
      );
      setTest({ state: 'ok', msg: `${((Date.now() - started) / 1000).toFixed(1)}s · "${(out.message.content ?? '').slice(0, 30)}"` });
    } catch (e) {
      setTest({ state: 'fail', msg: (e as Error).message.replace('Todos os provedores falharam:\n- ', '').slice(0, 220) });
    }
  };

  return (
    <div className="rounded-xl p-3 space-y-2.5" style={{ border: '1px solid var(--border)', background: 'rgba(10,8,5,0.4)', opacity: p.enabled ? 1 : 0.55 }}>
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold shrink-0" style={{ background: 'rgba(226,176,74,0.15)', color: 'var(--gold-300)' }}>
          {index + 1}
        </span>
        {builtin ? (
          <span className="font-medium text-[14px]">{p.name}</span>
        ) : (
          <input className="input !py-1 !text-[14px] max-w-[180px]" value={p.name} onChange={(e) => updateProvider(p.id, { name: e.target.value })} />
        )}
        {KEY_LINKS[p.id] && (
          <a href={KEY_LINKS[p.id]} target="_blank" rel="noreferrer" className="text-[11.5px] flex items-center gap-1 hover:underline" style={{ color: 'var(--gold-400)' }}>
            obter chave <ExternalLink size={11} />
          </a>
        )}
        <span className="flex-1" />
        <button disabled={index === 0} onClick={() => move(-1)} className="p-1 rounded hover:bg-white/5 disabled:opacity-25 cursor-pointer" aria-label="Subir">
          <ArrowUp size={14} />
        </button>
        <button disabled={index === total - 1} onClick={() => move(1)} className="p-1 rounded hover:bg-white/5 disabled:opacity-25 cursor-pointer" aria-label="Descer">
          <ArrowDown size={14} />
        </button>
        {!builtin && (
          <button onClick={() => setProviders(useApp.getState().settings.providers.filter((x) => x.id !== p.id))} className="p-1 rounded hover:bg-white/5 cursor-pointer" style={{ color: 'var(--danger)' }} aria-label="Remover">
            <Trash2 size={14} />
          </button>
        )}
        <Toggle checked={p.enabled} onChange={(v) => updateProvider(p.id, { enabled: v })} label="" />
      </div>

      <Field label="Chave(s) de API — várias separadas por vírgula fazem rotação">
        <div className="flex gap-2">
          <input
            className="input font-mono !text-[13px]"
            type={show ? 'text' : 'password'}
            value={p.apiKey}
            placeholder={builtin ? 'cole sua chave aqui' : 'opcional para servidores locais'}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
          />
          <button onClick={() => setShow(!show)} className="px-2.5 rounded-lg hover:bg-white/5 cursor-pointer" style={{ color: 'var(--text-3)' }} aria-label="Mostrar chave">
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </Field>

      <div className="grid sm:grid-cols-2 gap-2.5">
        <Field label="Modelo">
          <input className="input font-mono !text-[13px]" value={p.model} onChange={(e) => updateProvider(p.id, { model: e.target.value })} />
        </Field>
        <Field label="URL base (compatível com OpenAI)">
          <input className="input font-mono !text-[13px]" value={p.baseUrl} onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })} />
        </Field>
      </div>

      <div className="flex items-center gap-2 text-[12px]">
        <button
          onClick={runTest}
          disabled={test.state === 'running'}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-white/5"
          style={{ border: '1px solid var(--border)', color: 'var(--gold-200)' }}
        >
          {test.state === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Testar
        </button>
        {test.msg && (
          <span className="break-all" style={{ color: test.state === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
            {test.state === 'ok' ? '✓ ' : '✕ '}
            {test.msg}
          </span>
        )}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const { updateSettings, setProviders } = useApp.getState();

  const addCustom = () =>
    setProviders([
      ...settings.providers,
      { id: `custom-${Date.now().toString(36)}`, name: 'Personalizado', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', apiKey: '', enabled: true },
    ]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 py-6 space-y-4" style={{ maxWidth: 'var(--chat-w)', paddingBottom: 'calc(32px + var(--safe-bottom))' }}>
        <h1 className="gold-text text-[26px] font-semibold">Configurações</h1>

        <Section
          title="Provedores de IA (fallback)"
          desc="O Severo tenta de cima para baixo: provedores sem chave são pulados e, se um falhar (limite, erro, modelo indisponível), passa automaticamente para o próximo. As chaves ficam salvas só neste aparelho."
        >
          {settings.providers.map((p, i) => (
            <ProviderCard key={p.id} p={p} index={i} total={settings.providers.length} />
          ))}
          <div className="flex flex-wrap gap-2">
            <button onClick={addCustom} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/5" style={{ border: '1px dashed var(--border-strong)', color: 'var(--gold-200)' }}>
              <Plus size={14} /> Adicionar provedor (Ollama, LM Studio, gateway próprio…)
            </button>
            <button
              onClick={() => setProviders(DEFAULT_PROVIDERS.map((d) => ({ ...d, apiKey: settings.providers.find((p) => p.id === d.id)?.apiKey ?? '' })))}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/5"
              style={{ color: 'var(--text-3)' }}
            >
              <RotateCcw size={13} /> Restaurar ordem e modelos padrão
            </button>
          </div>
        </Section>

        <Section title="Voz" desc="Toque no orbe dourado para falar. A transcrição usa o Whisper da Groq (gratuito) com a mesma chave da Groq acima.">
          <Toggle
            checked={settings.speakReplies}
            onChange={(v) => updateSettings({ speakReplies: v })}
            label="Responder em voz quando eu falar"
            hint={canSpeak ? 'Usa as vozes do sistema.' : 'A síntese de voz não está disponível neste dispositivo; a resposta aparece só em texto.'}
          />
          <div className="grid sm:grid-cols-2 gap-2.5">
            <Field label="Idioma da fala (código ISO, ex.: pt, en, es)">
              <input className="input" value={settings.voiceLanguage} onChange={(e) => updateSettings({ voiceLanguage: e.target.value.trim() })} />
            </Field>
            <Field label="Modelo de transcrição">
              <input className="input font-mono !text-[13px]" value={settings.whisperModel} onChange={(e) => updateSettings({ whisperModel: e.target.value.trim() })} />
            </Field>
          </div>
        </Section>

        {hasSystemTools && (
          <Section title="Agente no PC" desc="Permite que o Severo execute comandos no PowerShell e leia/crie/edite arquivos para cumprir tarefas. Cada ação aparece na conversa.">
            <Toggle checked={settings.agentEnabled} onChange={(v) => updateSettings({ agentEnabled: v })} label="Ativar ferramentas do sistema" />
            <Toggle
              checked={settings.autoApprove}
              onChange={(v) => updateSettings({ autoApprove: v })}
              label="Aprovação automática"
              hint="Executa comandos e alterações sem pedir confirmação. Use só se confiar no modelo e nas tarefas."
            />
            <div className="grid sm:grid-cols-2 gap-2.5">
              <Field label="Pasta de trabalho (vazio = sua pasta de usuário)">
                <input className="input font-mono !text-[13px]" value={settings.workingDir} placeholder="C:\Users\voce\projetos" onChange={(e) => updateSettings({ workingDir: e.target.value })} />
              </Field>
              <Field label="Shell">
                <select className="input" value={settings.shell} onChange={(e) => updateSettings({ shell: e.target.value as 'powershell' | 'pwsh' })}>
                  <option value="powershell">Windows PowerShell 5.1</option>
                  <option value="pwsh">PowerShell 7 (pwsh)</option>
                </select>
              </Field>
              <Field label="Máximo de passos por tarefa">
                <input className="input" type="number" min={1} max={200} value={settings.maxIterations} onChange={(e) => updateSettings({ maxIterations: Math.max(1, Number(e.target.value) || DEFAULT_SETTINGS.maxIterations) })} />
              </Field>
              <Field label="Tempo limite por comando (segundos)">
                <input className="input" type="number" min={5} max={1800} value={settings.commandTimeoutSec} onChange={(e) => updateSettings({ commandTimeoutSec: Math.max(5, Number(e.target.value) || DEFAULT_SETTINGS.commandTimeoutSec) })} />
              </Field>
            </div>
          </Section>
        )}

        <Section title="Dados" desc="Conversas e configurações ficam salvas apenas neste aparelho.">
          <button
            onClick={() => {
              if (confirm('Apagar todas as conversas deste aparelho?')) useApp.setState({ conversations: [], activeId: null });
            }}
            className="rounded-lg px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/5"
            style={{ border: '1px solid rgba(229,115,95,0.4)', color: 'var(--danger)' }}
          >
            Apagar todas as conversas
          </button>
        </Section>

        <p className="text-center text-[11px] pt-2" style={{ color: 'var(--text-3)' }}>
          Severo v{__APP_VERSION__} · interface baseada no OpenJarvis (Apache-2.0)
        </p>
      </div>
    </div>
  );
}
