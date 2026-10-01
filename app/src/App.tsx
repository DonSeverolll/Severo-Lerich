import { useEffect } from 'react';
import { Menu } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { Orb } from './components/Orb';
import { SettingsPage } from './components/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { useApp } from './lib/store';

export function App() {
  const { view, sidebarOpen, title, hasMessages } = useApp(
    useShallow((s) => {
      const conv = s.conversations.find((c) => c.id === s.activeId);
      return { view: s.view, sidebarOpen: s.sidebarOpen, title: conv?.title, hasMessages: Boolean(conv?.messages.length) };
    }),
  );
  const { setSidebarOpen, setView } = useApp.getState();

  // Esc fecha a gaveta / volta ao chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (useApp.getState().sidebarOpen) setSidebarOpen(false);
      else if (useApp.getState().view === 'settings') setView('chat');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSidebarOpen, setView]);

  return (
    <div className="h-full flex relative overflow-hidden">
      <div className="backdrop" aria-hidden />
      <Sidebar />
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/55 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="flex-1 min-w-0 flex flex-col relative z-10" style={{ paddingTop: 'var(--safe-top)' }}>
        <header className="md:hidden flex items-center gap-3 px-3 py-2.5 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-white/5 cursor-pointer" aria-label="Abrir menu">
            <Menu size={20} style={{ color: 'var(--gold-200)' }} />
          </button>
          <Orb size={24} />
          <span className="truncate text-[14px]" style={{ color: 'var(--text-2)' }}>
            {view === 'settings' ? 'Configurações' : hasMessages ? title : 'Severo'}
          </span>
        </header>

        {view === 'settings' ? (
          <SettingsPage />
        ) : (
          <>
            <ChatArea />
            <InputArea showOrb={hasMessages} />
          </>
        )}
      </main>
    </div>
  );
}
