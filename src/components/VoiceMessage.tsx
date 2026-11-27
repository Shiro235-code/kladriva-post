"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Mic, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { sb } from "@/lib/supabase";
import { cx } from "@/lib/utils";

export const VOICE_BUCKET = "voice-messages";
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;
export const VOICE_MAX_DURATION_MS = 300_000;
const ORPHAN_KEY = (uid: string) => `kp-unpublished-voice:${uid}`;

export type VoicePayload = {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationMs: number;
  waveform: number[];
  messageId?: string;
};

type VoiceScope = { kind: "dm" | "group"; scopeId: string; messageId: string };
type OrphanVoice = VoiceScope & { path: string };

export function voiceExtension(mime: string) {
  const type = mime.toLowerCase().split(";")[0].trim();
  if (type === "audio/webm") return "webm";
  if (type === "audio/ogg" || type === "application/ogg") return "ogg";
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/m4a") return "m4a";
  if (type === "audio/mpeg" || type === "audio/mp3") return "mp3";
  if (type === "audio/wav" || type === "audio/x-wav" || type === "audio/wave") return "wav";
  if (type === "audio/aac" || type === "audio/x-aac") return "aac";
  return null;
}

export function voiceObjectPath(kind: VoiceScope["kind"], scopeId: string, uid: string, messageId: string, extension: string) {
  const prefix = kind === "dm" ? "dm" : "group";
  return `${prefix}/${scopeId}/${uid}/${messageId}.${extension}`;
}

export function createVoiceMessageId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function uploadVoice(path: string, voice: VoicePayload) {
  if (voice.blob.size > VOICE_MAX_BYTES) throw new Error("Le fichier vocal dépasse la limite de 10 Mo.");
  if (voice.durationMs <= 0 || voice.durationMs > VOICE_MAX_DURATION_MS) throw new Error("La durée du message vocal doit être comprise entre 1 ms et 5 minutes.");
  if (!voiceExtension(voice.mimeType)) throw new Error("Ce format audio n’est pas pris en charge.");
  const { error } = await sb().storage.from(VOICE_BUCKET).upload(path, voice.blob, {
    contentType: voice.mimeType.split(";")[0].trim(),
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    // A retry after an ambiguous network response may find the same UUID object
    // already present. Confirm it through authenticated Storage access; never overwrite it.
    if (/already exists|duplicate|409/i.test(error.message)) {
      const { data: existing, error: readError } = await sb().storage.from(VOICE_BUCKET).download(path);
      if (!readError && existing?.size === voice.blob.size) return;
    }
    throw new Error(error.message || "Le message vocal n’a pas pu être téléversé.");
  }
}

export async function cleanupUnpublishedVoice(uid: string) {
  if (typeof localStorage === "undefined") return;
  let queued: OrphanVoice[];
  try { queued = JSON.parse(localStorage.getItem(ORPHAN_KEY(uid)) || "[]") as OrphanVoice[]; }
  catch { return; }
  const remaining: OrphanVoice[] = [];
  for (const orphan of queued) {
    const extension = orphan.path?.split(".").pop() || "";
    const validPath = (orphan.kind === "dm" || orphan.kind === "group")
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orphan.scopeId || "")
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orphan.messageId || "")
      && ["webm", "ogg", "m4a", "mp3", "wav", "aac"].includes(extension)
      && orphan.path === voiceObjectPath(orphan.kind, orphan.scopeId, uid, orphan.messageId, extension);
    if (!validPath || !orphan.messageId || !orphan.scopeId) continue;
    try {
      const table = orphan.kind === "dm" ? "messages" : "group_messages";
      const scopeColumn = orphan.kind === "dm" ? "conversation_id" : "group_id";
      const { data: sent, error: lookupError } = await sb().from(table).select("id")
        .eq("id", orphan.messageId).eq(scopeColumn, orphan.scopeId).eq("sender_id", uid).maybeSingle();
      if (lookupError) { remaining.push(orphan); continue; }
      if (sent) continue; // The insert succeeded despite a lost response; retain its audio.
      const { error: removeError } = await sb().storage.from(VOICE_BUCKET).remove([orphan.path]);
      if (removeError) remaining.push(orphan);
    } catch { remaining.push(orphan); }
  }
  try {
    if (remaining.length) localStorage.setItem(ORPHAN_KEY(uid), JSON.stringify(remaining));
    else localStorage.removeItem(ORPHAN_KEY(uid));
  } catch { /* A later chat visit will retry. */ }
}

export async function queueUnpublishedVoice(uid: string, orphan: OrphanVoice) {
  let persisted = false;
  try {
    const key = ORPHAN_KEY(uid);
    const queued = JSON.parse(localStorage.getItem(key) || "[]") as OrphanVoice[];
    if (!queued.some((item) => item.messageId === orphan.messageId)) localStorage.setItem(key, JSON.stringify([...queued, orphan]));
    persisted = true;
  } catch { /* Still try immediate cleanup below. */ }
  if (!persisted) {
    try {
      const table = orphan.kind === "dm" ? "messages" : "group_messages";
      const scopeColumn = orphan.kind === "dm" ? "conversation_id" : "group_id";
      const { data: sent, error: lookupError } = await sb().from(table).select("id").eq("id", orphan.messageId).eq(scopeColumn, orphan.scopeId).eq("sender_id", uid).maybeSingle();
      if (!lookupError && !sent) await sb().storage.from(VOICE_BUCKET).remove([orphan.path]);
    } catch { /* Local storage and network may both be unavailable; never delete without confirming no message row. */ }
  }
}

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function preferredMime() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return [
    "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg",
    "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", "audio/mpeg", "audio/wav",
  ].find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
}

function waveformFromBuffer(buffer: AudioBuffer, bars = 48) {
  const channel = buffer.getChannelData(0);
  const result: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const start = Math.floor(bar * channel.length / bars);
    const end = Math.max(start + 1, Math.floor((bar + 1) * channel.length / bars));
    let peak = 0;
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(channel[i]));
    result.push(peak);
  }
  return result;
}

function Waveform({ values, progress = 0, onSeek, disabled = false }: { values: number[] | null; progress?: number; onSeek?: (fraction: number) => void; disabled?: boolean }) {
  const seek = (clientX: number, element: HTMLElement) => {
    if (!onSeek || disabled) return;
    const rect = element.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  };
  return values?.length ? <div
    role="slider"
    tabIndex={disabled ? -1 : 0}
    aria-label="Position du message vocal"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(progress * 100)}
    aria-valuetext={`${Math.round(progress * 100)} %`}
    onClick={(event) => seek(event.clientX, event.currentTarget)}
    onKeyDown={(event) => {
      if (!onSeek || disabled) return;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); onSeek(Math.min(1, progress + 0.04)); }
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); onSeek(Math.max(0, progress - 0.04)); }
      if (event.key === "Home") { event.preventDefault(); onSeek(0); }
      if (event.key === "End") { event.preventDefault(); onSeek(1); }
    }}
    className={cx("h-10 flex flex-1 items-center gap-[2px] cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-cobalt", disabled && "cursor-default")}
  >{values.map((value, index) => <span key={index} className={cx("flex-1 rounded-full transition-colors", index / values.length <= progress ? "bg-cobalt" : "bg-line-strong")} style={{ height: `${Math.max(2, Math.round(value * 30))}px` }} />)}</div>
    : <div className="h-10 flex-1 flex items-center"><div className="h-px w-full bg-line-strong" /></div>;
}

export function VoiceRecorder({ draft, onDraft, disabled, onRecordingChange, className }: { draft: VoicePayload | null; onDraft: (draft: VoicePayload | null) => void; disabled?: boolean; onRecordingChange?: (recording: boolean) => void; className?: string }) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkBytesRef = useRef(0);
  const sizeLimitRef = useRef(false);
  const cancelRef = useRef(false);
  const elapsedRef = useRef(0);
  const segmentStartedRef = useRef(0);
  const pausedRef = useRef(false);
  const waveformRef = useRef<number[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!draft) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(draft.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft]);

  const stopVisualiser = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  };

  const releaseMicrophone = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stopVisualiser();
  };

  const updateLevels = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) { const normalized = (sample - 128) / 128; energy += normalized * normalized; }
    const level = Math.min(1, Math.sqrt(energy / samples.length) * 3.5);
    waveformRef.current = [...waveformRef.current.slice(-47), level];
    if (mountedRef.current) setLevels(waveformRef.current);
    animationRef.current = requestAnimationFrame(updateLevels);
  };

  const finishRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") elapsedRef.current += performance.now() - segmentStartedRef.current;
    if (recorder.state !== "inactive") recorder.stop();
  };

  const startRecording = async () => {
    setError("");
    onDraft(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("L’enregistrement vocal n’est pas pris en charge par ce navigateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      chunksRef.current = [];
      chunkBytesRef.current = 0;
      sizeLimitRef.current = false;
      cancelRef.current = false;
      pausedRef.current = false;
      elapsedRef.current = 0;
      waveformRef.current = [];
      setLevels([]);
      setDuration(0);
      const mime = preferredMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Context) {
        const context = new Context();
        audioContextRef.current = context;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        await context.resume().catch(() => {});
        updateLevels();
      }

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        if (chunkBytesRef.current + event.data.size > VOICE_MAX_BYTES) {
          sizeLimitRef.current = true;
          if (recorder.state === "recording") recorder.stop();
          return;
        }
        chunksRef.current.push(event.data);
        chunkBytesRef.current += event.data.size;
      };
      recorder.onerror = () => setError("L’enregistrement a échoué. Tu peux réessayer.");
      recorder.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        releaseMicrophone();
        recorderRef.current = null;
        if (mountedRef.current) { setRecording(false); setPaused(false); onRecordingChange?.(false); }
        if (cancelRef.current || !mountedRef.current) { chunksRef.current = []; return; }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || chunksRef.current[0]?.type || "" });
        chunksRef.current = [];
        if (!blob.size) { setError(sizeLimitRef.current ? "Le fichier a dépassé 10 Mo avant de contenir un segment utilisable. Réenregistre un message plus court." : "Aucun son n’a été capturé. Vérifie le microphone et réessaie."); return; }
        const mimeType = blob.type || recorder.mimeType;
        const extension = voiceExtension(mimeType);
        if (!extension) { setError(`Le format audio ${mimeType || "inconnu"} n’est pas autorisé. Réessaie avec un navigateur compatible.`); return; }
        if (blob.size > VOICE_MAX_BYTES) { setError("Le fichier vocal dépasse la limite de 10 Mo. Réenregistre un message plus court."); return; }
        let actualDuration = Math.round(elapsedRef.current);
        let capturedWaveform = waveformRef.current;
        try {
          const DecodeContext = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (DecodeContext) {
            const context = new DecodeContext();
            const decoded = await context.decodeAudioData(await blob.arrayBuffer());
            actualDuration = Math.round(decoded.duration * 1000);
            capturedWaveform = waveformFromBuffer(decoded);
            await context.close();
          }
        } catch { /* Use real-time microphone samples and the active-recording timer when decoding is unavailable. */ }
        if (actualDuration <= 0 || actualDuration > VOICE_MAX_DURATION_MS) { setError("La durée réelle dépasse la limite de cinq minutes. Réenregistre un message plus court."); return; }
        onDraft({ blob, mimeType, extension, durationMs: actualDuration, waveform: capturedWaveform });
        setDuration(actualDuration);
        if (sizeLimitRef.current) setError("La limite de 10 Mo a été atteinte. L’enregistrement a été arrêté au dernier segment valide.");
      };
      recorder.start(1000);
      segmentStartedRef.current = performance.now();
      setRecording(true);
      onRecordingChange?.(true);
      timerRef.current = setInterval(() => {
        const activeElapsed = elapsedRef.current + (pausedRef.current ? 0 : performance.now() - segmentStartedRef.current);
        setDuration(activeElapsed);
        if (activeElapsed >= VOICE_MAX_DURATION_MS - 500 && recorder.state === "recording") void finishRecording();
      }, 100);
    } catch (cause) {
      releaseMicrophone();
      onRecordingChange?.(false);
      const name = cause instanceof DOMException ? cause.name : "";
      if (mountedRef.current) setError(name === "NotAllowedError" || name === "PermissionDeniedError" ? "Accès au microphone refusé. Autorise-le dans les réglages du navigateur pour enregistrer un vocal." : cause instanceof Error ? cause.message : "Impossible d’accéder au microphone.");
    }
  };

  const pauseOrResume = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      elapsedRef.current += performance.now() - segmentStartedRef.current;
      recorder.pause();
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      setPaused(true);
      pausedRef.current = true;
    } else if (recorder.state === "paused") {
      segmentStartedRef.current = performance.now();
      recorder.resume();
      setPaused(false);
      pausedRef.current = false;
      updateLevels();
    }
  };

  const cancel = () => {
    cancelRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    else releaseMicrophone();
    setRecording(false);
    onRecordingChange?.(false);
    pausedRef.current = false;
    setPaused(false);
    setDuration(0);
    setError("");
    onDraft(null);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      cancelRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      releaseMicrophone();
    };
  }, []);

  return <div className={cx("min-w-0", className)}>
    {recording ? <div className="mb-2 flex items-center gap-2 rounded-2xl border border-coral/20 bg-coral-soft/50 px-3 py-2">
      <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-40" /><span className="relative inline-flex h-3 w-3 rounded-full bg-coral" /></span>
      <span className="w-10 text-xs font-bold tabular-nums">{formatTime(duration)}</span>
      <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px]" aria-label="Signal réel du microphone">{levels.map((level, index) => <span key={index} className="flex-1 rounded-full bg-coral" style={{ height: `${Math.max(2, Math.round(level * 28))}px` }} />)}</div>
      <button type="button" onClick={pauseOrResume} className="icon-btn !h-9 !w-9" aria-label={paused ? "Reprendre l’enregistrement" : "Mettre l’enregistrement en pause"}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
      <button type="button" onClick={() => void finishRecording()} className="icon-btn !h-9 !w-9 text-cobalt" aria-label="Arrêter l’enregistrement"><Square size={15} fill="currentColor" /></button>
      <button type="button" onClick={cancel} className="icon-btn !h-9 !w-9 text-muted" aria-label="Annuler l’enregistrement"><Trash2 size={16} /></button>
    </div> : draft ? <div className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-cobalt/20 bg-cobalt-soft/45 px-3 py-2">
      <audio src={previewUrl || undefined} controls className="h-10 min-w-[180px] flex-1" aria-label="Préécouter le message vocal" />
      <span className="text-xs font-semibold tabular-nums text-muted">{formatTime(draft.durationMs)}</span>
      <div className="hidden min-w-20 flex-1 items-center gap-[2px] sm:flex" aria-label="Forme d’onde réelle de l’enregistrement">{draft.waveform.map((level, index) => <span key={index} className="flex-1 rounded-full bg-cobalt/70" style={{ height: `${Math.max(2, Math.round(level * 22))}px` }} />)}</div>
      <button type="button" onClick={() => void startRecording()} disabled={disabled} className="icon-btn !h-9 !w-9" aria-label="Réenregistrer le message vocal"><RotateCcw size={16} /></button>
      <button type="button" onClick={() => { setError(""); onDraft(null); }} className="icon-btn !h-9 !w-9 text-muted" aria-label="Annuler le message vocal"><Trash2 size={16} /></button>
    </div> : <button type="button" disabled={disabled} onClick={() => void startRecording()} className="icon-btn !h-11 !w-11 shrink-0 disabled:opacity-40" aria-label="Enregistrer un message vocal" title="Message vocal"><Mic size={21} /></button>}
    {error && <p role="alert" className="mb-2 flex items-start gap-1.5 px-2 text-xs text-coral"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</p>}
  </div>;
}

let activeVoiceAudio: HTMLAudioElement | null = null;

async function downloadVoice(path: string) {
  let result = await sb().storage.from(VOICE_BUCKET).download(path);
  const status = result.error && "statusCode" in result.error ? String(result.error.statusCode) : "";
  if (result.error && (status === "401" || /jwt|token expired|unauthorized/i.test(result.error.message))) {
    await sb().auth.refreshSession();
    result = await sb().storage.from(VOICE_BUCKET).download(path);
  }
  if (result.error || !result.data) throw new Error("Ce message vocal est indisponible ou tu n’as pas l’autorisation de l’écouter.");
  return result.data;
}

export function VoiceMessagePlayer({ path, durationMs }: { path: string; durationMs: number | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [waveformUnavailable, setWaveformUnavailable] = useState(false);
  const [current, setCurrent] = useState(0);
  const [actualDuration, setActualDuration] = useState(durationMs ? durationMs / 1000 : 0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);

  const load = useCallback(async () => {
    setLoading(true); setError(""); setWaveformUnavailable(false);
    try {
      const blob = await downloadVoice(path);
      if (!mountedRef.current) return false;
      const url = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      const audio = audioRef.current;
      if (audio) { audio.src = url; audio.load(); }
      try {
        const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) throw new Error("Web Audio indisponible");
        const context = new Context();
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        if (mountedRef.current) { setWaveform(waveformFromBuffer(decoded)); setActualDuration(decoded.duration); }
        await context.close();
      } catch {
        if (mountedRef.current) { setWaveform(null); setWaveformUnavailable(true); }
      }
      return !!audio;
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : "Impossible de télécharger ce message vocal.");
      return false;
    } finally { if (mountedRef.current) setLoading(false); }
  }, [path]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError("");
    if (audio.paused && !audio.src) {
      const loaded = await load();
      if (!loaded || !audioRef.current?.src) return;
    }
    if (audio.paused) {
      if (activeVoiceAudio && activeVoiceAudio !== audio) activeVoiceAudio.pause();
      activeVoiceAudio = audio;
      try { await audio.play(); }
      catch { setError("Appuie encore sur lecture pour démarrer l’audio dans ce navigateur."); }
    } else audio.pause();
  };

  const seek = (fraction: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) { audio.currentTime = fraction * audio.duration; setCurrent(audio.currentTime); }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (audioRef.current && activeVoiceAudio === audioRef.current) activeVoiceAudio = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed]);

  const progress = actualDuration > 0 ? Math.max(0, Math.min(1, current / actualDuration)) : 0;
  return <div className="w-full min-w-[220px] max-w-[360px] py-1">
    <audio ref={audioRef} preload="none" onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onDurationChange={(event) => { if (Number.isFinite(event.currentTarget.duration)) setActualDuration(event.currentTarget.duration); }} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); if (activeVoiceAudio === audioRef.current) activeVoiceAudio = null; }} onEnded={() => { setPlaying(false); setCurrent(0); if (activeVoiceAudio === audioRef.current) activeVoiceAudio = null; }} onError={() => { if (audioRef.current?.src) setError("La lecture a échoué. Réessaie pour renouveler le téléchargement privé."); }} className="hidden" />
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => void togglePlay()} disabled={loading} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cobalt text-white transition hover:brightness-110 disabled:opacity-60" aria-label={playing ? "Mettre en pause" : loading ? "Chargement du message vocal" : "Lire le message vocal"}>
        {loading ? <LoaderCircle size={18} className="animate-spin" /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1"><Waveform values={waveform} progress={progress} onSeek={seek} disabled={!waveform || !actualDuration} /></div>
      <button type="button" onClick={() => setSpeed((value) => value === 1 ? 1.5 : value === 1.5 ? 2 : 1)} className="min-w-10 rounded-lg px-1.5 py-1 text-[11px] font-bold text-ink-2 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-cobalt" aria-label={`Vitesse de lecture ${speed} fois`}>{speed}×</button>
    </div>
    <div className="ml-12 mt-0.5 flex justify-between text-[10px] tabular-nums text-muted"><span>{formatTime(current * 1000)}</span><span>{formatTime(actualDuration * 1000)}</span></div>
    {waveformUnavailable && <p className="ml-12 text-[10px] text-muted">Forme d’onde indisponible sur cet appareil.</p>}
    {error && <button type="button" onClick={() => { setError(""); setCurrent(0); void load(); }} className="ml-12 mt-1 text-left text-[11px] text-coral hover:underline" aria-label="Réessayer le téléchargement audio">{error}</button>}
  </div>;
}
