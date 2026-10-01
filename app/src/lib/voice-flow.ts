import { runTurn, stopAgent } from './agent';
import { useApp } from './store';
import { cancelRecording, isRecording, speak, startRecording, stopRecording, stopSpeaking, transcribe } from './voice';

export type VoicePhase = 'idle' | 'listening' | 'transcribing';

let phase: VoicePhase = 'idle';
const listeners = new Set<(p: VoicePhase, info?: string) => void>();

function setPhase(p: VoicePhase, info?: string) {
  phase = p;
  listeners.forEach((l) => l(p, info));
}

export function onVoicePhase(fn: (p: VoicePhase, info?: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const voicePhase = () => phase;

/**
 * Toque no orbe:
 * - parado → começa a ouvir; ao calar, transcreve, envia e (se configurado) fala a resposta;
 * - ouvindo → encerra a gravação agora;
 * - IA falando/pensando → interrompe.
 */
export async function orbTap(): Promise<void> {
  const app = useApp.getState();
  if (isRecording()) {
    stopRecording();
    return;
  }
  if (app.orb === 'speaking' && !app.busy) {
    stopSpeaking();
    app.set({ orb: 'idle', micLevel: 0 });
    return;
  }
  if (app.busy) {
    stopAgent();
    stopSpeaking();
    return;
  }

  try {
    stopSpeaking();
    app.set({ orb: 'listening' });
    setPhase('listening');
    const audio = await startRecording();
    if (!audio || audio.size < 2000) {
      setPhase('idle');
      useApp.getState().set({ orb: 'idle' });
      return;
    }
    setPhase('transcribing');
    useApp.getState().set({ orb: 'thinking' });
    const text = await transcribe(audio);
    setPhase('idle');
    if (!text) {
      useApp.getState().set({ orb: 'idle' });
      return;
    }
    const reply = await runTurn(text, { voice: true });
    if (reply && useApp.getState().settings.speakReplies) await speak(reply);
  } catch (err) {
    cancelRecording();
    setPhase('idle', (err as Error).message);
    useApp.getState().set({ orb: 'error', micLevel: 0 });
    setTimeout(() => useApp.getState().orb === 'error' && useApp.getState().set({ orb: 'idle' }), 2500);
  }
}

export function cancelVoice(): void {
  cancelRecording();
  setPhase('idle');
  useApp.getState().set({ orb: 'idle', micLevel: 0 });
}
