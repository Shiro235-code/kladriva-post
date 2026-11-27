"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock3, Copy, ImagePlus, MoreHorizontal, Pencil, Reply, SendHorizontal, Smile, Trash2, X } from "lucide-react";
import { cx, groupColor, groupGradient, groupIcon } from "@/lib/utils";
import { compressImage } from "@/lib/media";
import { sb } from "@/lib/supabase";
import { createVoiceMessageId, VoiceMessagePlayer, VoiceRecorder, type VoicePayload } from "./VoiceMessage";
import { MESSAGE_REACTIONS, type MessageReactionEmoji, type ReactionView } from "./MessageInteractions";

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
        <div className="min-w-0 flex-1"><p className="text-xs font-bold text-cobalt">Réponse à {reply.author || "un message"}</p><p className="text-sm text-ink-2 truncate">{reply.deleted_at ? "Message supprimé" : reply.audio_path ? "Message vocal" : reply.content || (reply.image_url ? "Image" : "Message")}</p></div>
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
export type ChatReply = { id: string; author: string; content: string; image_url: string | null; audio_path?: string | null; audio_duration_ms?: number | null; deleted_at?: string | null };

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
  edited,
  deleted,
  canEdit,
  reactions = [],
  onReact,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
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
  edited?: boolean;
  deleted?: boolean;
  canEdit?: boolean;
  reactions?: ReactionView[];
  onReact?: (emoji: MessageReactionEmoji) => Promise<boolean> | boolean;
  onEdit?: (content: string) => Promise<boolean> | boolean;
  onDeleteForMe?: () => Promise<boolean> | boolean;
  onDeleteForEveryone?: () => Promise<boolean> | boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(text);
  const [savingEdit, setSavingEdit] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null);

  const openMenuAt = (x: number, y: number) => {
    const width = Math.min(280, window.innerWidth - 24);
    const height = Math.min(390, window.innerHeight - 24);
    setMenuPosition({ left: Math.max(12, Math.min(x, window.innerWidth - width - 12)), top: Math.max(12, Math.min(y - height / 2, window.innerHeight - height - 12)) });
    setMenuOpen(true);
  };
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLElement>("button")?.focus(), 0);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [menuOpen]);

  useEffect(() => () => { if (longPressRef.current) clearTimeout(longPressRef.current); }, []);

  const closeMenu = () => setMenuOpen(false);
  const runAction = async (action?: () => Promise<boolean> | boolean) => { closeMenu(); if (action) await action(); };
  const canInteract = !!onReply && !deleted && !text.startsWith("Message vocal…");
  const startLongPress = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch" || !canInteract) return;
    const { clientX, clientY } = event;
    longPressOrigin.current = { x: clientX, y: clientY };
    longPressRef.current = setTimeout(() => { longPressTriggered.current = true; openMenuAt(clientX, clientY); }, 520);
  };
  const endLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    if (longPressTriggered.current) window.setTimeout(() => { longPressTriggered.current = false; }, 500);
  };
  const moveLongPress = (event: React.PointerEvent<HTMLElement>) => {
    const origin = longPressOrigin.current;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12) endLongPress();
  };
  const suppressLongPressClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!longPressTriggered.current) return;
    event.preventDefault();
    event.stopPropagation();
    longPressTriggered.current = false;
  };
  const copyText = async () => {
    closeMenu();
    try { await navigator.clipboard.writeText(text); } catch { /* Clipboard permission is browser-controlled. */ }
  };
  const saveEdit = async () => {
    if (!editDraft.trim() || !onEdit || savingEdit) return;
    setSavingEdit(true);
    if (await onEdit(editDraft)) setEditing(false);
    setSavingEdit(false);
  };
  const handleDeleteMine = async () => {
    if (!onDeleteForMe || !window.confirm("Masquer ce message uniquement pour toi ? Il restera visible pour les autres participants.")) return;
    await runAction(onDeleteForMe);
  };
  const handleDeleteEveryone = async () => {
    if (!onDeleteForEveryone || !window.confirm("Supprimer ce message pour tous les participants ? Les copies déjà téléchargées peuvent subsister.")) return;
    await runAction(onDeleteForEveryone);
  };

  const menu = canInteract ? <div className={cx("absolute top-0 z-20", mine ? "-left-10" : "-right-10")}>
    <button ref={triggerRef} type="button" onClick={() => { if (menuOpen) closeMenu(); else { const rect = triggerRef.current?.getBoundingClientRect(); if (rect) openMenuAt(rect.left, rect.bottom); } }} onContextMenu={(event) => { event.preventDefault(); openMenuAt(event.clientX, event.clientY); }} className="icon-btn !w-8 !h-8 bg-surface/90 shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" aria-label="Actions du message" aria-haspopup="menu" aria-expanded={menuOpen}><MoreHorizontal size={17} /></button>
    {menuOpen && <div ref={menuRef} role="menu" aria-label="Actions du message" className="fixed z-[90] w-[min(280px,calc(100vw-24px))] max-h-[min(390px,calc(100dvh-24px))] overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-pop)] sheet-in" style={{ left: menuPosition?.left ?? 12, top: menuPosition?.top ?? 12 }}>
      <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">Réagir</p>
      <div className="grid grid-cols-8 gap-0.5 pb-2" role="group" aria-label="Choisir une réaction">
        {MESSAGE_REACTIONS.map((emoji) => <button key={emoji} type="button" role="menuitem" onClick={() => void runAction(async () => { await onReact?.(emoji); return true; })} className="grid h-8 place-items-center rounded-lg text-[20px] transition hover:scale-110 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-cobalt" aria-label={`Réagir ${emoji}`}>{emoji}</button>)}
      </div>
      <div className="border-t border-line pt-1">
        <button type="button" role="menuitem" onClick={() => { closeMenu(); onReply?.(); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left hover:bg-surface-2"><Reply size={16} />Répondre</button>
        {!!text.trim() && <button type="button" role="menuitem" onClick={() => void copyText()} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left hover:bg-surface-2"><Copy size={16} />Copier le texte</button>}
        {canEdit && <button type="button" role="menuitem" onClick={() => { setEditDraft(text); setEditing(true); closeMenu(); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left hover:bg-surface-2"><Pencil size={16} />Modifier</button>}
        <button type="button" role="menuitem" onClick={() => void handleDeleteMine()} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left hover:bg-surface-2"><Trash2 size={16} />Supprimer pour moi</button>
        {mine && <button type="button" role="menuitem" onClick={() => void handleDeleteEveryone()} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left text-coral hover:bg-coral-soft"><Trash2 size={16} />Supprimer pour tous</button>}
      </div>
    </div>}
  </div> : null;
  const quoted = hasReply ? <button type="button" disabled={!reply?.id} onClick={() => reply?.id && onJumpReply?.(reply.id)} className={cx("w-full mb-1.5 rounded-xl border-l-[3px] px-2.5 py-1.5 text-left", mine ? "bg-white/10 border-white/75 text-white" : "bg-cobalt-soft/65 border-cobalt text-ink", !reply?.id && "cursor-default")} aria-label={reply?.id ? "Afficher le message cité" : "Message cité indisponible"}>
    <span className={cx("block text-[11px] font-bold truncate", mine ? "text-white" : "text-cobalt")}>{reply?.author || "Message indisponible"}</span>
    <span className="block text-xs truncate opacity-85">{reply ? reply.deleted_at ? "Message supprimé" : reply.audio_path ? "Message vocal" : reply.content || (reply.image_url ? "Image" : "Message") : "Ce message a été supprimé ou n’est pas accessible."}</span>
  </button> : null;

  const onlyEmoji = !editing && !image && !audioPath && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,8}$/u.test(text.trim()) && !/^[\d#*\s]+$/.test(text.trim());
  const meta = (
    <span className={cx("inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap", mine && !onlyEmoji ? "text-white/75" : "text-muted")}>
      {time}
      {edited && <span className="font-medium">Modifié</span>}
      {mine && delivery === "pending" && <Clock3 size={12} aria-label="En cours d’envoi" title="En cours d’envoi" />}
      {mine && delivery === "sent" && !(readCount && readCount > 0) && <Check size={14} aria-label="Enregistré sur le serveur" title="Enregistré sur le serveur" />}
      {mine && delivery === "sent" && readCount !== undefined && readCount > 0 && <><CheckCheck size={15} className={onlyEmoji ? "text-cobalt" : "text-[#9be7ff]"} aria-label={`Lu par ${readCount}`} title={`Lu par ${readCount}`} /><span>Lu par {readCount}</span></>}
      {mine && delivery === "read" && <CheckCheck size={15} className={onlyEmoji ? "text-cobalt" : "text-[#9be7ff]"} aria-label="Lu par le destinataire" title="Lu par le destinataire" />}
    </span>
  );

  if (deleted) return <div className={cx("relative group max-w-[min(78%,560px)] rounded-[18px] border border-line bg-surface/75 px-3 py-2 text-muted", mine ? "self-end" : "self-start")}><span className="inline-flex items-center gap-2 text-sm italic"><Trash2 size={14} />Message supprimé</span><span className="ml-2">{time}</span></div>;

  const reactionPills = reactions.length > 0 && <div className={cx("flex flex-wrap gap-1.5", mine ? "justify-end" : "justify-start")}>
    {reactions.map((reaction) => <button key={reaction.emoji} type="button" onClick={() => void onReact?.(reaction.emoji)} disabled={!onReact} title={reaction.users.join(", ")} aria-label={`${reaction.emoji}, ${reaction.count} réaction${reaction.count === 1 ? "" : "s"}. ${reaction.users.join(", ")}`} className={cx("inline-flex min-h-7 items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition hover:-translate-y-0.5", reaction.mine ? "border-cobalt/35 bg-cobalt-soft text-cobalt" : "border-line bg-surface text-ink-2")}><span className="text-sm">{reaction.emoji}</span><span className="font-semibold tabular-nums">{reaction.count}</span></button>)}
  </div>;

  if (onlyEmoji) {
    return (
      <div onPointerDown={startLongPress} onPointerMove={moveLongPress} onPointerUp={endLongPress} onPointerCancel={endLongPress} onClickCapture={suppressLongPressClick} onContextMenu={(event) => { if (canInteract) { event.preventDefault(); openMenuAt(event.clientX, event.clientY); } }} className={cx("relative group flex flex-col", mine ? "items-end" : "items-start")}>
        {menu}
        {name && !groupedTop && <span className="text-[12.5px] font-bold mb-0.5 px-1" style={{ color: nameTone }}>{name}</span>}
        <span className="text-[44px] leading-none px-1">{text}</span>
        <span className="px-1 mt-1">{meta}</span>
        {reactionPills}
      </div>
    );
  }

  return (
    <>
    <div
      onPointerDown={startLongPress}
      onPointerMove={moveLongPress}
      onPointerUp={endLongPress}
      onPointerCancel={endLongPress}
      onClickCapture={suppressLongPressClick}
      onContextMenu={(event) => { if (canInteract) { event.preventDefault(); openMenuAt(event.clientX, event.clientY); } }}
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
      {editing ? <div className="min-w-[220px] space-y-2 p-1"><textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={4000} autoFocus className="w-full min-h-20 resize-y rounded-xl border border-cobalt/30 bg-surface px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-cobalt" aria-label="Modifier le message" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="btn btn-soft !min-h-8 !px-3 text-xs">Annuler</button><button type="button" disabled={!editDraft.trim() || savingEdit} onClick={() => void saveEdit()} className="btn btn-primary !min-h-8 !px-3 text-xs">{savingEdit ? "Enregistrement…" : "Enregistrer"}</button></div></div> : <>
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
      </>}
    </div>
    {reactionPills}
    </>
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
