import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CircleNotchIcon,
  EyeIcon,
  EyeSlashIcon,
  LightningIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { completeWithFallback } from '../lib/llm';
import { enter } from '../lib/motion';
import { hasSystemTools } from '../lib/platform';
import { DEFAULT_PROVIDERS, KEY_LINKS } from '../lib/providers';
import { DEFAULT_SETTINGS, useApp, type ThemePref } from '../lib/store';
import type { Provider } from '../lib/types';
import { canSpeak } from '../lib/voice';

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="border-t py-7 first:border-t-0 first:pt-2" style={{ borderColor: 'var(--line)' }}>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
      {desc && (
        <p className="mt-1 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {desc}
        </p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[15px]">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[13px]" style={{ color: 'var(--text-2)' }}>
            {hint}
          </span>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-150"
        style={{ background: checked ? 'var(--accent)' : 'var(--line-strong)' }}
      >
        <span
          className="absolute top-0.5 left-0.5 size-5 rounded-full shadow-sm transition-transform duration-200"
          style={{ background: checked ? 'var(--on-accent)' : 'var(--bg-raised)', transform: `translateX(${checked ? 20 : 0}px)`, transitionTimingFunction: 'var(--ease-out)' }}
        />
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
        {label}
      </label>
      {children(id)}
      {hint && (
        <p className="mt-1.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
          {hint}
        </p>
      )}
    </div>
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
      const out = await completeWithFallback([{ ...p, enabled: true }], [{ role: 'user', content: 'Responda apenas: ok' }], [], {}, AbortSignal.timeout(30_000));
      setTest({ state: 'ok', msg: `Funcionando (${((Date.now() - started) / 1000).toFixed(1)} s): "${(out.message.content ?? '').trim().slice(0, 30)}"` });
    } catch (e) {
      setTest({ state: 'fail', msg: (e as Error).message.replace('Todos os provedores falharam:\n- ', '').slice(0, 220) });
    }
  };

  return (
    <motion.li layout="position" transition={{ duration: 0.2 }} className="rounded-[18px] border p-4" style={{ borderColor: 'var(--line)', background: 'var(--bg-raised)' }}>
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full font-mono text-[12px]" style={{ background: 'var(--surface)', color: 'var(--text-2)' }}>
          {index + 1}
        </span>
        {builtin ? (
          <span className="text-[15px] font-medium">{p.name}</span>
        ) : (
          <input className="field max-w-[200px] !py-1.5" aria-label="Nome do provedor" value={p.name} onChange={(e) => updateProvider(p.id, { name: e.target.value })} />
        )}
        {KEY_LINKS[p.id] && (
          <a href={KEY_LINKS[p.id]} target="_blank" rel="noreferrer" className="hidden items-center gap-1 text-[13px] underline-offset-4 hover:underline sm:inline-flex" style={{ color: 'var(--accent)' }}>
            Obter chave <ArrowSquareOutIcon size={13} aria-hidden />
          </a>
        )}
        <span className="flex-1" />
        <button disabled={index === 0} onClick={() => move(-1)} className="btn btn-ghost btn-icon" aria-label={`Subir ${p.name} na ordem`}>
          <ArrowUpIcon size={16} aria-hidden />
        </button>
        <button disabled={index === total - 1} onClick={() => move(1)} className="btn btn-ghost btn-icon" aria-label={`Descer ${p.name} na ordem`}>
          <ArrowDownIcon size={16} aria-hidden />
        </button>
        {!builtin && (
          <button onClick={() => setProviders(useApp.getState().settings.providers.filter((x) => x.id !== p.id))} className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} aria-label={`Remover ${p.name}`}>
            <TrashIcon size={16} aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3" style={{ opacity: p.enabled ? 1 : 0.6 }}>
        <Switch checked={p.enabled} onChange={(v) => updateProvider(p.id, { enabled: v })} label="Usar este provedor" />
        <Field label="Chave de API" hint="Várias chaves separadas por vírgula são usadas em rodízio.">
          {(id) => (
            <div className="flex gap-1.5">
              <input
                id={id}
                className="field font-mono !text-[13px]"
                type={show ? 'text' : 'password'}
                value={p.apiKey}
                placeholder={builtin ? 'Cole sua chave aqui' : 'Opcional para servidores locais'}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
              />
              <button onClick={() => setShow(!show)} className="btn btn-ghost btn-icon shrink-0" aria-label={show ? 'Ocultar chave' : 'Mostrar chave'} aria-pressed={show}>
                {show ? <EyeSlashIcon size={17} aria-hidden /> : <EyeIcon size={17} aria-hidden />}
              </button>
            </div>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Modelo">{(id) => <input id={id} className="field font-mono !text-[13px]" value={p.model} onChange={(e) => updateProvider(p.id, { model: e.target.value })} />}</Field>
          <Field label="URL base (compatível com OpenAI)">
            {(id) => <input id={id} className="field font-mono !text-[13px]" value={p.baseUrl} onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })} />}
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runTest} disabled={test.state === 'running'} className="btn btn-secondary h-9 px-3.5">
            {test.state === 'running' ? <CircleNotchIcon size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <LightningIcon size={16} aria-hidden />}
            Testar conexão
          </button>
          <AnimatePresence mode="wait">
            {test.msg && (
              <motion.p key={test.msg} variants={enter} initial="initial" animate="animate" exit="exit" role="status" className="min-w-0 break-words text-[13px]" style={{ color: test.state === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
                {test.msg}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.li>
  );
}

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'dark', label: 'Escuro' },
  { value: 'light', label: 'Claro' },
];

function ThemePicker() {
  const theme = useApp((s) => s.settings.theme);
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex rounded-full border p-1" style={{ borderColor: 'var(--line)', background: 'var(--bg-raised)' }}>
      {THEMES.map((t) => {
        const active = theme === t.value;
        return (
          <button
            key={t.value}
            role="radio"
            aria-checked={active}
            onClick={() => useApp.getState().updateSettings({ theme: t.value })}
            className="relative h-9 rounded-full px-4 text-[14px] font-medium cursor-pointer"
            style={{ color: active ? 'var(--text)' : 'var(--text-2)' }}
          >
            {active && <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-full" style={{ background: 'var(--surface-hover)' }} transition={{ type: 'spring', duration: 0.35, bounce: 0 }} />}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ClearData() {
  const [confirming, setConfirming] = useState(false);
  const count = useApp((s) => s.conversations.length);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!confirming ? (
        <button onClick={() => setConfirming(true)} disabled={!count} className="btn btn-danger h-9 px-4">
          <TrashIcon size={16} aria-hidden /> Apagar todas as conversas
        </button>
      ) : (
        <motion.div variants={enter} initial="initial" animate="animate" className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar exclusão">
          <span className="text-[14px]">
            Apagar {count} {count === 1 ? 'conversa' : 'conversas'} deste aparelho?
          </span>
          <button
            onClick={() => {
              useApp.setState({ conversations: [], activeId: null });
              setConfirming(false);
            }}
            className="btn btn-danger h-9 px-4"
            autoFocus
          >
            Apagar
          </button>
          <button onClick={() => setConfirming(false)} className="btn btn-ghost h-9 px-4">
            Cancelar
          </button>
        </motion.div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const { updateSettings, setProviders, setView } = useApp.getState();

  const addCustom = () =>
    setProviders([
      ...settings.providers,
      { id: `custom-${Date.now().toString(36)}`, name: 'Personalizado', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', apiKey: '', enabled: true },
    ]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-5 py-6 sm:px-6" style={{ maxWidth: 'var(--chat-w)', paddingBottom: 'calc(40px + var(--safe-bottom))' }}>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setView('chat')} className="btn btn-ghost btn-icon -ml-2" aria-label="Voltar para a conversa">
            <ArrowLeftIcon size={20} aria-hidden />
          </button>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Configurações</h1>
        </div>

        <Section title="Aparência">
          <ThemePicker />
        </Section>

        <Section
          title="Provedores de IA"
          desc="O Severo tenta na ordem abaixo. Provedores sem chave são pulados e, se um falhar, o próximo assume. As chaves ficam salvas só neste aparelho."
        >
          <motion.ul layout className="space-y-3">
            {settings.providers.map((p, i) => (
              <ProviderCard key={p.id} p={p} index={i} total={settings.providers.length} />
            ))}
          </motion.ul>
          <div className="flex flex-wrap gap-2">
            <button onClick={addCustom} className="btn btn-secondary h-9 px-4">
              <PlusIcon size={16} aria-hidden /> Adicionar provedor
            </button>
            <button
              onClick={() => setProviders(DEFAULT_PROVIDERS.map((d) => ({ ...d, apiKey: settings.providers.find((p) => p.id === d.id)?.apiKey ?? '' })))}
              className="btn btn-ghost h-9 px-4"
            >
              <ArrowCounterClockwiseIcon size={16} aria-hidden /> Restaurar padrão
            </button>
          </div>
        </Section>

        <Section title="Voz" desc="Toque no orbe para falar. A transcrição usa o Whisper da Groq, com a mesma chave da Groq acima.">
          <Switch
            checked={settings.speakReplies}
            onChange={(v) => updateSettings({ speakReplies: v })}
            label="Responder em voz quando eu falar"
            hint={canSpeak ? 'Usa as vozes instaladas no sistema.' : 'Este aparelho não oferece síntese de voz; a resposta aparece só em texto.'}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Idioma da fala" hint="Código ISO, como pt, en ou es.">
              {(id) => <input id={id} className="field" value={settings.voiceLanguage} onChange={(e) => updateSettings({ voiceLanguage: e.target.value.trim() })} />}
            </Field>
            <Field label="Modelo de transcrição">
              {(id) => <input id={id} className="field font-mono !text-[13px]" value={settings.whisperModel} onChange={(e) => updateSettings({ whisperModel: e.target.value.trim() })} />}
            </Field>
          </div>
        </Section>

        {hasSystemTools && (
          <Section title="Agente no PC" desc="Permite que o Severo execute comandos no PowerShell e leia, crie e edite arquivos. Cada ação aparece na conversa.">
            <Switch checked={settings.agentEnabled} onChange={(v) => updateSettings({ agentEnabled: v })} label="Ferramentas do sistema" />
            <Switch
              checked={settings.autoApprove}
              onChange={(v) => updateSettings({ autoApprove: v })}
              label="Aprovação automática"
              hint="Executa comandos e alterações sem pedir confirmação. Use só em tarefas de confiança."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Pasta de trabalho" hint="Vazio usa a sua pasta de usuário.">
                {(id) => <input id={id} className="field font-mono !text-[13px]" value={settings.workingDir} placeholder="C:\Users\voce\projetos" onChange={(e) => updateSettings({ workingDir: e.target.value })} />}
              </Field>
              <Field label="Shell">
                {(id) => (
                  <select id={id} className="field" value={settings.shell} onChange={(e) => updateSettings({ shell: e.target.value as 'powershell' | 'pwsh' })}>
                    <option value="powershell">Windows PowerShell 5.1</option>
                    <option value="pwsh">PowerShell 7</option>
                  </select>
                )}
              </Field>
              <Field label="Máximo de passos por tarefa">
                {(id) => (
                  <input id={id} className="field tabular-nums" type="number" min={1} max={200} value={settings.maxIterations} onChange={(e) => updateSettings({ maxIterations: Math.max(1, Number(e.target.value) || DEFAULT_SETTINGS.maxIterations) })} />
                )}
              </Field>
              <Field label="Tempo limite por comando, em segundos">
                {(id) => (
                  <input id={id} className="field tabular-nums" type="number" min={5} max={1800} value={settings.commandTimeoutSec} onChange={(e) => updateSettings({ commandTimeoutSec: Math.max(5, Number(e.target.value) || DEFAULT_SETTINGS.commandTimeoutSec) })} />
                )}
              </Field>
            </div>
          </Section>
        )}

        <Section title="Dados" desc="Conversas e configurações ficam salvas apenas neste aparelho.">
          <ClearData />
        </Section>

        <p className="pt-4 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
          Severo {__APP_VERSION__}. Interface baseada no OpenJarvis (Apache-2.0).
        </p>
      </div>
    </div>
  );
}
