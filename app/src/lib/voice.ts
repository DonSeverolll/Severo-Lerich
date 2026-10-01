import { httpFetch } from './platform';
import { splitKeys } from './providers';
import { useApp } from './store';

/**
 * Voz: grava o microfone (MediaRecorder), alimenta o orbe com o nível do áudio, para sozinho
 * após ~1,6 s de silêncio e transcreve com o Whisper da Groq (gratuito, mesma chave do chat).
 */

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let raf = 0;
let resolveStop: ((blob: Blob | null) => void) | null = null;

export const isRecording = () => recorder?.state === 'recording';

function pickMime(): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function cleanup(): void {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  audioCtx?.close().catch(() => {});
  stream = null;
  audioCtx = null;
  recorder = null;
  useApp.getState().set({ micLevel: 0 });
}

/** Começa a gravar; a promessa resolve com o áudio quando a gravação parar (silêncio ou stopRecording). */
export async function startRecording(): Promise<Blob | null> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microfone indisponível neste dispositivo.');
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });

  audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);

  const mime = pickMime();
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise<Blob | null>((resolve) => {
    resolveStop = resolve;
    recorder!.onstop = () => {
      const type = recorder?.mimeType || mime || 'audio/webm';
      cleanup();
      resolve(chunks.length ? new Blob(chunks, { type }) : null);
    };
  });

  const started = performance.now();
  let lastVoice = started;
  let heardVoice = false;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / data.length);
    const level = Math.min(1, rms * 6);
    useApp.getState().set({ micLevel: level });
    const now = performance.now();
    if (level > 0.08) {
      lastVoice = now;
      heardVoice = true;
    }
    // Para sozinho: 1,6 s de silêncio depois de falar, ou 8 s sem ouvir nada, ou 60 s no total.
    if ((heardVoice && now - lastVoice > 1600) || (!heardVoice && now - started > 8000) || now - started > 60_000) {
      stopRecording();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  recorder.start(250);
  raf = requestAnimationFrame(tick);
  return done;
}

export function stopRecording(): void {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else if (resolveStop) {
    cleanup();
    resolveStop(null);
  }
  resolveStop = null;
}

export function cancelRecording(): void {
  if (recorder) recorder.ondataavailable = null;
  stopRecording();
}

export async function transcribe(audio: Blob): Promise<string> {
  const { settings } = useApp.getState();
  const groq = settings.providers.find((p) => p.id === 'groq');
  const key = groq ? splitKeys(groq.apiKey)[0] : undefined;
  if (!key) throw new Error('Para usar voz, configure a chave da Groq em Configurações (o Whisper da Groq é gratuito).');

  const ext = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', audio, `fala.${ext}`);
  form.append('model', settings.whisperModel);
  form.append('response_format', 'json');
  if (settings.voiceLanguage) form.append('language', settings.voiceLanguage);

  const res = await httpFetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcrição falhou (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return String(data.text ?? '').trim();
}

// ---------------------------------------------------------------- fala (TTS)

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Remove Markdown/código para ler em voz alta só o texto. */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (código omitido) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>|~-]{1,3}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak || !text.trim()) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(plain(text).slice(0, 3000));
    const lang = useApp.getState().settings.voiceLanguage || 'pt';
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang === 'pt' ? 'pt-br' : lang)) ?? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? (lang === 'pt' ? 'pt-BR' : lang);
    u.rate = 1.05;
    useApp.getState().set({ orb: 'speaking' });
    const end = () => {
      if (useApp.getState().orb === 'speaking') useApp.getState().set({ orb: 'idle', micLevel: 0 });
      resolve();
    };
    u.onend = end;
    u.onerror = end;
    // Pulso do orbe acompanhando as palavras.
    u.onboundary = () => {
      useApp.getState().set({ micLevel: 0.55 });
      setTimeout(() => useApp.getState().set({ micLevel: 0.15 }), 120);
    };
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (canSpeak) window.speechSynthesis.cancel();
}
