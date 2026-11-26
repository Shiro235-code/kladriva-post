"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock3, ImagePlus, SendHorizontal, Smile, X } from "lucide-react";
import { cx, groupColor, groupGradient, groupIcon } from "@/lib/utils";
import { compressImage } from "@/lib/media";
import { sb } from "@/lib/supabase";

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
}: {
  placeholder: string;
  onSend: (text: string, image: File | null) => Promise<boolean>;
  onTyping?: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(168, el.scrollHeight) + "px";
  }, [text]);

  const canSend = (text.trim().length > 0 || !!image) && !busy && !disabled;

  const submit = async () => {
    if (!canSend) return;
    const t = text.trim();
    const img = image?.file ?? null;
    setBusy(true);
    setText("");
    setImage(null);
    const ok = await onSend(t, img);
    if (!ok) {
      setText(t);
      if (img) setImage({ file: img, url: URL.createObjectURL(img) });
    }
    setBusy(false);
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
        <div className="relative flex items-center">
          <button type="button" onClick={() => setEmoji((v) => !v)} className="icon-btn !w-11 !h-11" aria-label="Emojis" aria-expanded={emoji}>
            <Smile size={23} />
          </button>
          {emoji && <EmojiPicker onPick={insertEmoji} onClose={() => setEmoji(false)} />}
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} className="icon-btn !w-11 !h-11" aria-label="Joindre une image">
          <ImagePlus size={22} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !f.type.startsWith("image/")) return;
            setImage({ file: f, url: URL.createObjectURL(f) });
            areaRef.current?.focus();
          }}
        />
        <div className="flex-1 min-w-0 bg-surface-2 border border-line rounded-[24px] px-4 py-2.5 focus-within:border-cobalt focus-within:bg-surface transition">
          <textarea
            ref={areaRef}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              onTyping?.();
            }}
            onPaste={(e) => {
              const f = e.clipboardData.files?.[0];
              if (f?.type.startsWith("image/")) {
                e.preventDefault();
                setImage({ file: f, url: URL.createObjectURL(f) });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            maxLength={4000}
            className="w-full bg-transparent outline-none focus-visible:outline-none resize-none text-[15.5px] leading-[1.4] block max-h-[168px] scroll-thin"
            aria-label="Message"
          />
        </div>
        <button
          type="submit"
          disabled={!canSend}
          className={cx(
            "w-12 h-12 shrink-0 rounded-full grid place-items-center transition",
            canSend ? "bg-cobalt text-white hover:brightness-110 active:scale-95" : "bg-surface-2 text-muted border border-line",
          )}
          aria-label="Envoyer le message"
          title="Envoyer (Entrée)"
        >
          {busy ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <SendHorizontal size={21} strokeWidth={2.2} className="translate-x-[1px]" />}
        </button>
      </form>
    </div>
  );
}

/* ---------------- Bulle de message ---------------- */
export type Delivery = "pending" | "sent" | "read";

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
}) {
  const onlyEmoji = !image && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,8}$/u.test(text.trim()) && !/^[\d#*\s]+$/.test(text.trim());
  const meta = (
    <span className={cx("inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap", mine && !onlyEmoji ? "text-white/75" : "text-muted")}>
      {time}
      {mine && delivery === "pending" && <Clock3 size={12} />}
      {mine && delivery === "sent" && <Check size={14} />}
      {mine && delivery === "read" && <CheckCheck size={15} className={onlyEmoji ? "text-cobalt" : "text-[#9be7ff]"} />}
    </span>
  );

  if (onlyEmoji) {
    return (
      <div className={cx("flex flex-col", mine ? "items-end" : "items-start")}>
        {name && !groupedTop && <span className="text-[12.5px] font-bold mb-0.5 px-1" style={{ color: nameTone }}>{name}</span>}
        <span className="text-[44px] leading-none px-1">{text}</span>
        <span className="px-1 mt-1">{meta}</span>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "max-w-[min(78%,560px)] shadow-[0_1px_0.5px_rgba(11,20,26,0.08)]",
        mine ? "bg-cobalt text-white" : "bg-surface text-ink border border-line",
        "rounded-[18px]",
        mine ? groupedTop && "rounded-tr-[6px]" : groupedTop && "rounded-tl-[6px]",
        mine ? groupedBottom && "rounded-br-[6px]" : groupedBottom && "rounded-bl-[6px]",
        image ? "p-1" : "px-3 pt-1.5 pb-1.5",
        delivery === "pending" && "opacity-70",
      )}
    >
      {name && !groupedTop && (
        <p className={cx("text-[12.5px] font-bold", image ? "px-2 pt-1 pb-1" : "")} style={{ color: nameTone }}>
          {name}
        </p>
      )}
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
