import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_PROVIDERS } from './providers';
import type { Preview } from './tools';
import type { Conversation, OrbState, Provider, StoredMessage, ToolRun } from './types';

export interface Settings {
  providers: Provider[];
  temperature?: number;
  /** Ferramentas do sistema (PowerShell/arquivos) — só têm efeito no app desktop. */
  agentEnabled: boolean;
  autoApprove: boolean;
  workingDir: string;
  shell: 'powershell' | 'pwsh';
  maxIterations: number;
  commandTimeoutSec: number;
  /** Fala a resposta quando a pergunta foi feita por voz. */
  speakReplies: boolean;
  voiceLanguage: string;
  whisperModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  providers: DEFAULT_PROVIDERS,
  agentEnabled: true,
  autoApprove: false,
  workingDir: '',
  shell: 'powershell',
  maxIterations: 30,
  commandTimeoutSec: 120,
  speakReplies: true,
  voiceLanguage: 'pt',
  whisperModel: 'whisper-large-v3-turbo',
};

export interface PendingApproval {
  conversationId: string;
  callId: string;
  preview?: Preview;
  resolve: (answer: 'yes' | 'no' | 'always') => void;
}

interface AppState {
  settings: Settings;
  conversations: Conversation[];
  activeId: string | null;
  sidebarOpen: boolean;
  view: 'chat' | 'settings';
  // estado efêmero (não persistido)
  orb: OrbState;
  micLevel: number;
  busy: boolean;
  streamingText: string;
  activeProvider: string | null;
  pendingApproval: PendingApproval | null;

  updateSettings: (patch: Partial<Settings>) => void;
  updateProvider: (id: string, patch: Partial<Provider>) => void;
  setProviders: (providers: Provider[]) => void;
  newConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  appendMessage: (conversationId: string, message: StoredMessage) => void;
  setToolRun: (conversationId: string, callId: string, patch: Partial<ToolRun>) => void;
  setView: (view: AppState['view']) => void;
  setSidebarOpen: (open: boolean) => void;
  set: (patch: Partial<Pick<AppState, 'orb' | 'micLevel' | 'busy' | 'streamingText' | 'activeProvider' | 'pendingApproval'>>) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || 'Nova conversa';
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      conversations: [],
      activeId: null,
      sidebarOpen: false,
      view: 'chat',
      orb: 'idle',
      micLevel: 0,
      busy: false,
      streamingText: '',
      activeProvider: null,
      pendingApproval: null,

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      updateProvider: (id, patch) =>
        set((s) => ({
          settings: { ...s.settings, providers: s.settings.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
        })),
      setProviders: (providers) => set((s) => ({ settings: { ...s.settings, providers } })),

      newConversation: () => {
        const id = uid();
        const now = Date.now();
        set((s) => ({
          conversations: [{ id, title: 'Nova conversa', createdAt: now, updatedAt: now, messages: [], toolRuns: {} }, ...s.conversations],
          activeId: id,
          view: 'chat',
        }));
        return id;
      },
      selectConversation: (id) => set({ activeId: id, view: 'chat', sidebarOpen: false }),
      deleteConversation: (id) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          return { conversations, activeId: s.activeId === id ? (conversations[0]?.id ?? null) : s.activeId };
        }),
      appendMessage: (conversationId, message) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const isFirstUser = message.role === 'user' && !c.messages.some((m) => m.role === 'user');
            return {
              ...c,
              title: isFirstUser ? titleFrom(message.content) : c.title,
              updatedAt: Date.now(),
              messages: [...c.messages, message],
            };
          }),
        })),
      setToolRun: (conversationId, callId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id !== conversationId
              ? c
              : { ...c, toolRuns: { ...c.toolRuns, [callId]: { ...(c.toolRuns[callId] ?? { status: 'pending', output: '' }), ...patch } } },
          ),
        })),
      setView: (view) => set({ view, sidebarOpen: false }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      set: (patch) => set(patch),
    }),
    {
      name: 'severo-app',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings, conversations: s.conversations.slice(0, 200), activeId: s.activeId }),
      // Novos campos de configuração recebem o padrão sem apagar o que o usuário já salvou.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const conversations = (p.conversations ?? []).map((c) => ({
          ...c,
          toolRuns: Object.fromEntries(
            Object.entries(c.toolRuns ?? {}).map(([id, r]) =>
              r.status === 'running' || r.status === 'pending' ? [id, { ...r, status: 'error' as const, output: `${r.output}
(interrompido)` }] : [id, r],
            ),
          ),
        }));
        return { ...current, ...p, conversations, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } };
      },
    },
  ),
);

export function activeConversation(): Conversation | undefined {
  const s = useApp.getState();
  return s.conversations.find((c) => c.id === s.activeId);
}
