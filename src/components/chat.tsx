"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock3, ImagePlus, MoreHorizontal, Reply, SendHorizontal, Smile, X } from "lucide-react";
import { cx, groupColor, groupGradient, groupIcon } from "@/lib/utils";
import { compressImage } from "@/lib/media";
import { sb } from "@/lib/supabase";
import { createVoiceMessageId, VoiceMessagePlayer, VoiceRecorder, type VoicePayload } from "./VoiceMessage";

/* ---------------- Avatar de groupe : rond, comme WhatsApp ---------------- */
export function GroupAvatar({
  group,
  size = 48,
  className,
}: {
  group: { name?: string; color?: string; icon?: string; avatar_url?: string | null };
  size?: number;
  className?: string;
}) {
  if (group.avatar_url?.startsWith("https://")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={group.avatar_url} alt={group.name || "Groupe"} width={size} height={size} className={cx("rounded-full object-cover shrink-0 bg-line", className)} style={{ width: size, height: size }} />
    );
  }
  const Icon = groupIcon(group.icon);
  return (
    <span className={cx("rounded-full grid place-items-center shrink-0", className)} style={{ width: size, height: size, background: groupGradient(group.color), color: groupColor(group.color).fg }} aria-label={group.name}>
      <Icon size={size * 0.46} strokeWidth={2} aria-hidden />
    </span>
  );
}

/* ---------------- Envoi d'une image de discussion ---------------- */
export async function uploadChatImage(uid: string, file: File): Promise<string> {
  const small = await compressImage(file, { maxSize: 1600, quality: 0.8 });
  const path = `${uid}/chat-${crypto.randomUUID()}.${small.name.split(".").pop() || "jpg"}`;
  const { error } = await sb().storage.from("media").upload(path, small, { contentType: small.type, cacheControl: "31536000" });
  if (error) throw new Error("L'image n'a pas pu être envoyée.");
  return sb().storage.from("media").getPublicUrl(path).data.publicUrl;
}

/* ---------------- Sélecteur d'emojis ---------------- */
const EMOJIS = [
  "😀", "😂", "🥹", "😊", "😍", "🤩", "😎", "🤔", "😅", "😭", "😴", "🙃",
  "👍", "👏", "🙏", "💪", "🤝", "👋", "✌️", "👌", "🔥", "✨", "🎉", "💯",
  "❤️", "💙", "💚", "💛", "🧡", "💜", "✅", "❌", "⚡", "💡", "🚀", "📚",
  "💻", "📱", "🧠", "🎯", "📌", "⏰", "☕", "🍕", "⚽", "🎧", "📸", "🌍",
];

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => document.addEventListener("mousedown", away), 0);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-2 z-30 w-[312px] bg-surface border border-line rounded-2xl shadow-[var(--shadow-pop)] p-2 grid grid-cols-8 gap-0.5 picker-in" role="dialog" aria-label="Emojis">
      {EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} className="h-9 rounded-lg text-[22px] hover:bg-surface-2 transition">
          {e}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Barre de saisie (façon WhatsApp) ---------------- */
export function ChatComposer({
  placeholder,
  onSend,
  onTyping,
  disabled,
  reply,
  onCancelReply,
}: {
  placeholder: string;
  onSend: (text: string, image: File | null, replyToId?: string | null, voice?: VoicePayload | null) => Promise<boolean>;
  onTyping?: () => void;
  disabled?: boolean;
  reply?: ChatReply | null;
  onCancelReply?: () => void;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<VoicePayload | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voiceMessageId = useRef<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => { if (!voice) voiceMessageId.current = null; }, [voice]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(168, el.scrollHeight) + "px";
  }, [text]);

  const canSend = (text.trim().length > 0 || !!image || !!voice) && !recordingVoice && !busy && !disabled;

  const submit = async () => {
    if (!canSend || submitting.current) return;
    submitting.current = true;
    const t = voice ? "" : text.trim();
    const img = voice ? null : image?.file ?? null;
    setBusy(true);
    setText("");
    setImage(null);
    const outgoingVoice = voice ? { ...voice, messageId: voiceMessageId.current || (voiceMessageId.current = createVoiceMessageId()) } : null;
    let ok = false;
    try { ok = await onSend(t, img, reply?.id ?? null, outgoingVoice); } catch { ok = false; }
    if (!ok) {
      setText(t);
      if (img) setImage({ file: img, url: URL.createObjectURL(img) });
    } else { setVoice(null); onCancelReply?.(); }
    setBusy(false);
    submitting.current = false;
    areaRef.current?.focus();
  };

  const insertEmoji = (e: string) => {
    const el = areaRef.current;
    if (!el) return setText((t) => t + e);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + e.length;
    });
  };

  return (
    <div className="border-t border-line bg-surface shrink-0 px-2 sm:px-4 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
      {reply && <div className="mb-2 flex items-center gap-3 rounded-2xl border-l-[3px] border-cobalt bg-cobalt-soft/60 px-3 py-2.5">
        <Reply size={16} className="text-cobalt shrink-0" />
        <div className="min-w-0 flex-1"><p className="text-xs font-bold text-cobalt">Réponse à {reply.author || "un message"}</p><p className="text-sm text-ink-2 truncate">{reply.audio_path ? "Message vocal" : reply.content || (reply.image_url ? "Image" : "Message")}</p></div>
        <button type="button" onClick={onCancelReply} className="icon-btn !w-8 !h-8 shrink-0" aria-label="Annuler la réponse"><X size={16} /></button>
      </div>}
      {image && (
        <div className="relative inline-block mb-2 ml-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="Image à envoyer" className="h-28 rounded-xl border border-line object-cover" />
          <button type="button" onClick={() => setImage(null)} className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-ink text-surface grid place-items-center" aria-label="Retirer l'image">
            <X size={14} />
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-1.5 sm:gap-2"
      >
        {!voice && !recordingVoice ? <>
          <div className="relative flex items-center">
            <button type="button" onClick={() => setEmoji((v) => !v)} className="icon-btn !w-11 !h-11" aria-label="Emojis" aria-expanded={emoji}><Smile size={23} /></button>
            {emoji && <EmojiPicker onPick={insertEmoji} onClose={() => setEmoji(false)} />}
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} className="icon-btn !w-11 !h-11" aria-label="Joindre une image"><ImagePlus size={22} /></button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !f.type.startsWith("image/")) return;
            setImage({ file: f, url: URL.createObjectURL(f) });
            areaRef.current?.focus();
          }} />
          <div className="flex-1 min-w-0 bg-surface-2 border border-line rounded-[24px] px-4 py-2.5 focus-within:border-cobalt focus-within:bg-surface transition">
            <textarea ref={areaRef} value={text} rows={1} onChange={(e) => { setText(e.target.value); onTyping?.(); }} onPaste={(e) => {
              const f = e.clipboardData.files?.[0];
              if (f?.type.startsWith("image/")) { e.preventDefault(); setImage({ file: f, url: URL.createObjectURL(f) }); }
            }} onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            }} placeholder={placeholder} maxLength={4000} className="w-full bg-transparent outline-none focus-visible:outline-none resize-none text-[15.5px] leading-[1.4] block max-h-[168px] scroll-thin" aria-label="Message" />
          </div>
          <VoiceRecorder draft={voice} onDraft={setVoice} disabled={disabled || busy || !!text.trim() || !!image} onRecordingChange={setRecordingVoice} />
        </> : <VoiceRecorder draft={voice} onDraft={setVoice} disabled={disabled || busy} onRecordingChange={setRecordingVoice} className="min-w-0 flex-1" />}
        <button
          type="submit"
          disabled={!canSend}
          className={cx(
            "w-12 h-12 shrink-0 rounded-full grid place-items-center transition",
            canSend ? "bg-cobalt text-white hover:brightness-110 active:scale-95" : "bg-surface-2 text-muted border border-line",
          )}
          aria-label={voice ? "Envoyer le message vocal" : "Envoyer le message"}
          title={voice ? "Envoyer le vocal" : "Envoyer (Entrée)"}
        >
          {busy ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <SendHorizontal size={21} strokeWidth={2.2} className="translate-x-[1px]" />}
        </button>
      </form>
    </div>
  );
}

/* ---------------- Bulle de message ---------------- */
export type Delivery = "pending" | "sent" | "read";
export type ChatReply = { id: string; author: string; content: string; image_url: string | null; audio_path?: string | null; audio_duration_ms?: number | null };

export function SwipeReply({ children, onReply }: { children: React.ReactNode; onReply: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return <div
    onTouchStart={(event) => { const touch = event.touches[0]; start.current = { x: touch.clientX, y: touch.clientY }; }}
    onTouchEnd={(event) => {
      if (!start.current) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      if (dx > 64 && Math.abs(dx) > Math.abs(dy) * 1.35) onReply();
      start.current = null;
    }}
  >{children}</div>;
}

export function Bubble({
  mine,
  text,
  image,
  time,
  delivery,
  name,
  nameTone,
  groupedTop,
  groupedBottom,
  onImage,
  reply,
  hasReply,
  onJumpReply,
  onReply,
  readCount,
  audioPath,
  audioDurationMs,
}: {
  mine: boolean;
  text: string;
  image?: string | null;
  time: string;
  delivery?: Delivery;
  name?: string;
  nameTone?: string;
  groupedTop?: boolean;
  groupedBottom?: boolean;
  onImage?: (src: string) => void;
  reply?: ChatReply | null;
  hasReply?: boolean;
  onJumpReply?: (id: string) => void;
  onReply?: () => void;
  readCount?: number;
  audioPath?: string | null;
  audioDurationMs?: number | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menuOpen]);

  const menu = onReply ? <div ref={menuRef} className={cx("absolute top-0 z-20", mine ? "-left-10" : "-right-10")}>
    <button type="button" onClick={() => setMenuOpen((open) => !open)} className="icon-btn !w-8 !h-8 bg-surface/90 shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" aria-label="Actions du message" aria-haspopup="menu" aria-expanded={menuOpen}><MoreHorizontal size={17} /></button>
    {menuOpen && <div role="menu" className="absolute top-8 left-0 min-w-36 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onReply(); }} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-surface-2"><Reply size={15} />Répondre</button>
    </div>}
  </div> : null;
  const quoted = hasReply ? <button type="button" disabled={!reply?.id} onClick={() => reply?.id && onJumpReply?.(reply.id)} className={cx("w-full mb-1.5 rounded-xl border-l-[3px] px-2.5 py-1.5 text-left", mine ? "bg-white/10 border-white/75 text-white" : "bg-cobalt-soft/65 border-cobalt text-ink", !reply?.id && "cursor-default")} aria-label={reply?.id ? "Afficher le message cité" : "Message cité indisponible"}>
    <span className={cx("block text-[11px] font-bold truncate", mine ? "text-white" : "text-cobalt")}>{reply?.author || "Message indisponible"}</span>
    <span className="block text-xs truncate opacity-85">{reply ? reply.audio_path ? "Message vocal" : reply.content || (reply.image_url ? "Image" : "Message") : "Ce message a été supprimé ou n’est pas accessible."}</span>
  </button> : null;

  const onlyEmoji = !image && !audioPath && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,8}$/u.test(text.trim()) && !/^[\d#*\s]+$/.test(text.trim());
  const meta = (
    <span className={cx("inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap", mine && !onlyEmoji ? "text-white/75" : "text-muted")}>
      {time}
      {mine && delivery === "pending" && <Clock3 size={12} aria-label="En cours d’envoi" title="En cours d’envoi" />}
      {mine && delivery === "sent" && !(readCount && readCount > 0) && <Check size={14} aria-label="Enregistré sur le serveur" title="Enregistré sur le serveur" />}
      {mine && delivery === "sent" && readCount !== undefined && readCount > 0 && <><CheckCheck size={15} className={onlyEmoji ? "text-cobalt" : "text-[#9be7ff]"} aria-label={`Lu par ${readCount}`} title={`Lu par ${readCount}`} /><span>Lu par {readCount}</span></>}
      {mine && delivery === "read" && <CheckCheck size={15} className={onlyEmoji ? "text-cobalt" : "text-[#9be7ff]"} aria-label="Lu par le destinataire" title="Lu par le destinataire" />}
    </span>
  );

  if (onlyEmoji) {
    return (
      <div className={cx("relative group flex flex-col", mine ? "items-end" : "items-start")}>
        {menu}
        {name && !groupedTop && <span className="text-[12.5px] font-bold mb-0.5 px-1" style={{ color: nameTone }}>{name}</span>}
        <span className="text-[44px] leading-none px-1">{text}</span>
        <span className="px-1 mt-1">{meta}</span>
      </div>
    );
  }

  return (
    <div
      onContextMenu={(event) => { if (onReply) { event.preventDefault(); setMenuOpen(true); } }}
      className={cx(
        "relative group max-w-[min(78%,560px)] shadow-[0_1px_0.5px_rgba(11,20,26,0.08)]",
        mine ? "bg-cobalt text-white" : "bg-surface text-ink border border-line",
        "rounded-[18px]",
        mine ? groupedTop && "rounded-tr-[6px]" : groupedTop && "rounded-tl-[6px]",
        mine ? groupedBottom && "rounded-br-[6px]" : groupedBottom && "rounded-bl-[6px]",
        image || audioPath ? "p-2" : "px-3 pt-1.5 pb-1.5",
        delivery === "pending" && "opacity-70",
      )}
    >
      {menu}
      {name && !groupedTop && (
        <p className={cx("text-[12.5px] font-bold", image ? "px-2 pt-1 pb-1" : "")} style={{ color: nameTone }}>
          {name}
        </p>
      )}
      {quoted}
      {audioPath && <VoiceMessagePlayer path={audioPath} durationMs={audioDurationMs ?? null} />}
      {image && (
        <button type="button" onClick={() => onImage?.(image)} className="block" aria-label="Agrandir l'image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" loading="lazy" className="rounded-[14px] max-h-[340px] w-auto max-w-full object-cover" />
        </button>
      )}
      {text ? (
        <p className={cx("text-[15px] leading-[1.38] whitespace-pre-wrap break-words", image && "px-2 pt-1.5 pb-0.5")}>
          {text}
          <span className="float-right ml-2.5 mt-[7px]">{meta}</span>
        </p>
      ) : audioPath ? (
        <div className="flex justify-end px-1 pt-0.5">{meta}</div>
      ) : (
        <div className="flex justify-end px-2 pb-1 pt-1">{meta}</div>
      )}
    </div>
  );
}

/* ---------------- Visionneuse simple ---------------- */
export function ImageViewer({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [src, onClose]);
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[95] bg-black/92 grid place-items-center fade-in" onClick={onClose} role="dialog" aria-label="Image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-w-[94vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" aria-label="Fermer">
        <X size={22} />
      </button>
    </div>
  );
}

export function DaySeparator({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  const label =
    d.toDateString() === today.toDateString()
      ? "Aujourd'hui"
      : d.toDateString() === y.toDateString()
        ? "Hier"
        : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return <p className="self-center text-[12px] font-semibold text-muted bg-surface border border-line rounded-lg px-3 py-1 my-3 first-letter:uppercase shadow-sm">{label}</p>;
}

export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Fond de discussion discret, avec le motif en escalier de la marque. */
export const CHAT_BG: React.CSSProperties = {
  backgroundColor: "var(--surface-2)",
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><path d='M4 56h14V42h14V28h14V14h14' stroke='%23808aa8' stroke-opacity='0.09' stroke-width='2' fill='none'/></svg>\")",
};
