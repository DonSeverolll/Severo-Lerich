import { MessageSquarePlus, Settings, Trash2, Monitor, Smartphone, Globe } from 'lucide-react';
import { isAndroid, isTauri, hasSystemTools } from '../lib/platform';
import { useShallow } from 'zustand/react/shallow';
import { useApp } from '../lib/store';
import { Orb } from './Orb';

function relativeDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.floor((today.setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return 'Últimos 7 dias';
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function Sidebar() {
  const { conversations, activeId, sidebarOpen, view, busy, agentEnabled } = useApp(
    useShallow((s) => ({
    conversations: s.conversations,
    activeId: s.activeId,
    sidebarOpen: s.sidebarOpen,
    view: s.view,
    busy: s.busy,
    agentEnabled: s.settings.agentEnabled,
    })),
  );
  const { newConversation, selectConversation, deleteConversation, setView } = useApp.getState();

  const groups: { label: string; items: typeof conversations }[] = [];
  for (const c of conversations) {
    const label = relativeDay(c.updatedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  const PlatformIcon = isAndroid ? Smartphone : isTauri ? Monitor : Globe;
  const platformText = hasSystemTools ? (agentEnabled ? 'PC · agente ativo' : 'PC · só conversa') : isAndroid ? 'Android · conversa' : 'Navegador · conversa';

  return (
    <aside
      className={`glass fixed md:relative z-30 h-full flex flex-col shrink-0 transition-transform duration-300 md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ width: 'var(--sidebar-w)', borderWidth: '0 1px 0 0', paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Orb size={34} />
        <div>
          <div className="gold-text text-[19px] font-semibold tracking-[0.22em]">SEVERO</div>
          <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            assistente pessoal
          </div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={() => !busy && newConversation()}
          disabled={busy}
          className="btn-gold w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm cursor-pointer"
        >
          <MessageSquarePlus size={16} /> Nova conversa
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 mt-1">
        {!conversations.length && (
          <p className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            Suas conversas aparecem aqui.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="px-3 pb-1 text-[10.5px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              {g.label}
            </div>
            {g.items.map((c) => {
              const active = c.id === activeId && view === 'chat';
              return (
                <div
                  key={c.id}
                  className="group flex items-center rounded-lg pr-1 transition-colors"
                  style={{ background: active ? 'rgba(226,176,74,0.1)' : undefined, boxShadow: active ? 'inset 2px 0 0 var(--gold-400)' : undefined }}
                >
                  <button
                    onClick={() => !busy && selectConversation(c.id)}
                    className="flex-1 min-w-0 text-left px-3 py-2 text-[13.5px] truncate cursor-pointer"
                    style={{ color: active ? 'var(--gold-50)' : 'var(--text-2)' }}
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => !busy && deleteConversation(c.id)}
                    className="p-1.5 rounded-md opacity-60 md:opacity-0 group-hover:opacity-100 hover:bg-white/5 cursor-pointer"
                    style={{ color: 'var(--text-3)' }}
                    aria-label="Apagar conversa"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 pb-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm cursor-pointer hover:bg-white/5"
          style={{ color: view === 'settings' ? 'var(--gold-200)' : 'var(--text-2)' }}
        >
          <Settings size={16} /> Configurações
        </button>
        <div className="flex items-center gap-2 px-3 pt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
          <PlatformIcon size={12} /> {platformText}
        </div>
      </div>
    </aside>
  );
}
