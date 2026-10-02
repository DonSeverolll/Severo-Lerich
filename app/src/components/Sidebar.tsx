import { DesktopIcon, DeviceMobileIcon, GearIcon, GlobeIcon, NotePencilIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { spring } from '../lib/motion';
import { hasSystemTools, isAndroid, isTauri } from '../lib/platform';
import { useApp } from '../lib/store';
import type { Conversation } from '../lib/types';
import { Orb } from './Orb';

function groupLabel(ts: number): string {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const diff = Math.round((day(Date.now()) - day(ts)) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return 'Últimos 7 dias';
  const label = new Date(ts).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function useIsDesktop(): boolean {
  const query = '(min-width: 768px)';
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

function ConversationItem({ c, active, disabled }: { c: Conversation; active: boolean; disabled: boolean }) {
  const { selectConversation, deleteConversation } = useApp.getState();
  return (
    <li className="group relative flex items-center">
      <button
        onClick={() => selectConversation(c.id)}
        disabled={disabled}
        aria-current={active ? 'page' : undefined}
        className="flex-1 min-w-0 truncate rounded-[10px] py-2 pl-3 pr-10 text-left text-[14px] transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed"
        style={{ background: active ? 'var(--accent-soft)' : undefined, color: active ? 'var(--text)' : 'var(--text-2)' }}
      >
        {c.title}
      </button>
      <button
        onClick={() => deleteConversation(c.id)}
        disabled={disabled}
        className="btn btn-ghost btn-icon absolute right-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        aria-label={`Apagar a conversa "${c.title}"`}
      >
        <TrashIcon size={16} aria-hidden />
      </button>
    </li>
  );
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { conversations, activeId, view, busy, agentEnabled } = useApp(
    useShallow((s) => ({ conversations: s.conversations, activeId: s.activeId, view: s.view, busy: s.busy, agentEnabled: s.settings.agentEnabled })),
  );
  const { newConversation, setView } = useApp.getState();

  const groups: { label: string; items: Conversation[] }[] = [];
  const listed = conversations.filter((c) => c.messages.length);
  for (const c of listed) {
    const label = groupLabel(c.updatedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  const PlatformIcon = isAndroid ? DeviceMobileIcon : isTauri ? DesktopIcon : GlobeIcon;
  const platformText = hasSystemTools ? (agentEnabled ? 'PC, agente ativo' : 'PC, só conversa') : isAndroid ? 'Android' : 'Navegador';

  return (
    <div className="flex h-full flex-col" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Orb size={30} />
        <span className="text-[17px] font-semibold tracking-[-0.01em]">Severo</span>
        <span className="flex-1" />
        {onClose && (
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Fechar menu">
            <XIcon size={20} aria-hidden />
          </button>
        )}
      </div>

      <div className="px-3">
        <button onClick={() => newConversation()} disabled={busy} className="btn btn-secondary h-10 w-full">
          <NotePencilIcon size={18} aria-hidden /> Nova conversa
        </button>
      </div>

      <nav aria-label="Conversas" className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
        {!listed.length && (
          <p className="px-3 py-8 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
            Nenhuma conversa ainda.
          </p>
        )}
        {groups.map((g) => (
          <section key={g.label} className="mb-4">
            <h2 className="px-3 pb-1 text-[12px] font-medium" style={{ color: 'var(--text-3)' }}>
              {g.label}
            </h2>
            <ul>
              {g.items.map((c) => (
                <ConversationItem key={c.id} c={c} active={c.id === activeId && view === 'chat'} disabled={busy} />
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="border-t px-3 pt-2 pb-3" style={{ borderColor: 'var(--line)' }}>
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          aria-current={view === 'settings' ? 'page' : undefined}
          className="flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-[14px] transition-colors duration-150 cursor-pointer hover:bg-[var(--surface-hover)]"
          style={{ background: view === 'settings' ? 'var(--accent-soft)' : undefined, color: view === 'settings' ? 'var(--text)' : 'var(--text-2)' }}
        >
          <GearIcon size={18} aria-hidden /> Configurações
        </button>
        <div className="flex items-center gap-2 px-3 pt-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
          <PlatformIcon size={14} aria-hidden /> {platformText}
        </div>
      </div>
    </div>
  );
}

/** Barra lateral fixa no desktop; gaveta com scrim no celular. */
export function Sidebar() {
  const open = useApp((s) => s.sidebarOpen);
  const setOpen = useApp.getState().setSidebarOpen;
  const desktop = useIsDesktop();

  if (desktop) {
    return (
      <aside className="relative z-20 h-full shrink-0 border-r" style={{ width: 'var(--sidebar-w)', background: 'var(--bg-raised)', borderColor: 'var(--line)' }}>
        <SidebarContent />
      </aside>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-30"
            style={{ background: 'var(--scrim)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-40 border-r"
            style={{ width: 'min(var(--sidebar-w), 86vw)', background: 'var(--bg-raised)', borderColor: 'var(--line)', boxShadow: 'var(--shadow-raised)' }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%', transition: { duration: 0.2, ease: [0.65, 0, 0.35, 1] } }}
            transition={spring}
          >
            <SidebarContent onClose={() => setOpen(false)} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
