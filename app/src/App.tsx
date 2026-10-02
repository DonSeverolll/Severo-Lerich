import { ListIcon } from '@phosphor-icons/react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { SettingsPage } from './components/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { fade } from './lib/motion';
import { useApp } from './lib/store';
import { useTheme } from './lib/theme';

export function App() {
  useTheme();
  const { view, title, hasMessages } = useApp(
    useShallow((s) => {
      const conv = s.conversations.find((c) => c.id === s.activeId);
      return { view: s.view, title: conv?.title, hasMessages: Boolean(conv?.messages.length) };
    }),
  );
  const { setSidebarOpen, setView } = useApp.getState();

  // Esc fecha a gaveta ou volta das configurações.
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
    <MotionConfig reducedMotion="user">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:px-4 focus:py-2" style={{ background: 'var(--bg-raised)' }}>
        Pular para o conteúdo
      </a>
      <div className="relative flex h-full overflow-hidden">
        <div className="ambient" aria-hidden />
        <Sidebar />

        <main id="conteudo" className="relative z-10 flex min-w-0 flex-1 flex-col" style={{ paddingTop: 'var(--safe-top)' }}>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 md:hidden" style={{ borderColor: 'var(--line)' }}>
            <button onClick={() => setSidebarOpen(true)} className="btn btn-ghost btn-icon" aria-label="Abrir menu">
              <ListIcon size={22} aria-hidden />
            </button>
            <span className="truncate text-[15px] font-medium">{view === 'settings' ? 'Configurações' : hasMessages ? title : 'Severo'}</span>
          </header>

          <AnimatePresence mode="wait" initial={false}>
            {view === 'settings' ? (
              <motion.div key="settings" variants={fade} initial="initial" animate="animate" exit="exit" className="flex min-h-0 flex-1 flex-col">
                <SettingsPage />
              </motion.div>
            ) : (
              <motion.div key="chat" variants={fade} initial="initial" animate="animate" exit="exit" className="flex min-h-0 flex-1 flex-col">
                <ChatArea />
                <InputArea showOrb={hasMessages} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  );
}
