"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cx, displayName, groupColor, groupGradient, groupIcon, kindOf, tokenize } from "@/lib/utils";
import type { PostKind } from "@/lib/types";

const TONES = ["#2f4bff", "#ff5470", "#0fa978", "#7b5cff", "#ff8a3d", "#1f6f8b", "#c2410c"];

type Who = { full_name?: string; username?: string; avatar_url?: string | null } | null | undefined;

export function Avatar({ profile, size = 40, online, className }: { profile?: Who; size?: number; online?: boolean; className?: string }) {
  const name = displayName(profile);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const seed = (profile?.username || name).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const tone = TONES[seed % TONES.length];
  const img = profile?.avatar_url?.startsWith("https://") ? profile.avatar_url : null;
  return (
    <span className={cx("relative inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size }}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={name} width={size} height={size} className="rounded-full object-cover w-full h-full bg-line" />
      ) : (
        <span
          aria-label={name}
          className="rounded-full w-full h-full grid place-items-center font-semibold text-white select-none font-display"
          style={{ background: tone, fontSize: size * 0.4, letterSpacing: "-0.02em" }}
        >
          {initials || "?"}
        </span>
      )}
      {online && (
        <span
          className="absolute rounded-full bg-mint border-surface"
          style={{ width: size * 0.28, height: size * 0.28, right: 0, bottom: 0, borderWidth: Math.max(2, size * 0.06) }}
          aria-label="En ligne"
        />
      )}
    </span>
  );
}

/** Marque : un escalier qui monte — chaque marche est une avancée. */
export function LogoMark({ size = 32, invert = false }: { size?: number; invert?: boolean }) {
  return (
    <span className="grid place-items-center rounded-[30%] shrink-0" style={{ width: size, height: size, background: invert ? "#fff" : "var(--cobalt)" }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M2 17h5v-5h5V7h6" stroke={invert ? "#2f4bff" : "#fff"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18" cy="3.2" r="2.2" fill="#ffc531" />
      </svg>
    </span>
  );
}

export function Logo({ light = false, size = 32 }: { light?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} invert={light} />
      <span className={cx("font-display font-bold text-[19px] leading-none", light ? "text-white" : "text-ink")}>kladriva post</span>
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={cx("inline-block w-5 h-5 rounded-full border-2 border-line border-t-cobalt animate-spin", className)} aria-label="Chargement" />;
}

export function Empty({ icon: Icon, title, text, children }: { icon?: LucideIcon; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="panel px-6 py-12 text-center">
      {Icon && (
        <span className="w-14 h-14 rounded-2xl bg-cobalt-soft text-cobalt grid place-items-center mx-auto mb-4">
          <Icon size={26} strokeWidth={1.9} />
        </span>
      )}
      <p className="font-display text-2xl font-semibold">{title}</p>
      {text && <p className="text-muted mt-1.5 max-w-sm mx-auto">{text}</p>}
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  );
}

export function PostSkeleton() {
  return (
    <div className="panel p-5">
      <div className="flex gap-3 items-center">
        <div className="skeleton w-11 h-11 !rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-40" />
          <div className="skeleton h-3 w-24" />
        </div>
      </div>
      <div className="skeleton h-3.5 w-full mt-5" />
      <div className="skeleton h-3.5 w-4/5 mt-2.5" />
      <div className="skeleton h-48 w-full mt-4 !rounded-2xl" />
    </div>
  );
}

export function KindBadge({ kind, className }: { kind: PostKind; className?: string }) {
  if (kind === "update") return null;
  const k = kindOf(kind);
  const Icon = k.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded-lg leading-none", className)} style={{ background: k.bg, color: k.fg }}>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {k.short}
    </span>
  );
}

/** Pastille de groupe : dégradé de la couleur du groupe + son icône. */
export function GroupMark({ color, icon, size = 40, className }: { color?: string; icon?: string; size?: number; className?: string }) {
  const Icon = groupIcon(icon);
  return (
    <span className={cx("grid place-items-center shrink-0", className)} style={{ width: size, height: size, borderRadius: size * 0.3, background: groupGradient(color), color: groupColor(color).fg }}>
      <Icon size={size * 0.5} strokeWidth={2} aria-hidden />
    </span>
  );
}

/** Texte enrichi : @mentions, #hashtags et liens. */
export function RichText({
  text,
  className,
  mentions,
}: {
  text: string;
  className?: string;
  mentions?: { user_id: string; profile: { id: string; username: string; full_name: string; avatar_url: string | null } | null }[];
}) {
  const byUsername = new Map(
    (mentions || [])
      .map((mention) => mention.profile)
      .filter((profile): profile is NonNullable<typeof profile> => !!profile)
      .map((profile) => [profile.username.toLowerCase(), profile] as const),
  );
  return (
    <p className={cx("whitespace-pre-wrap break-words", className)}>
      {tokenize(text).map((tk, i) =>
        tk.t === "mention" ? (
          (() => {
            const profile = byUsername.get(tk.v.slice(1).toLowerCase());
            return profile ? (
              <Link key={i} href={`/u/${profile.username}`} className="text-cobalt font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
                {tk.v}
              </Link>
            ) : (
              <span key={i} className="text-cobalt font-semibold">{tk.v}</span>
            );
          })()
        ) : tk.t === "tag" ? (
          <Link key={i} href={`/explorer?q=${encodeURIComponent(tk.v)}`} className="text-cobalt hover:underline" onClick={(e) => e.stopPropagation()}>
            {tk.v}
          </Link>
        ) : tk.t === "url" ? (
          <a key={i} href={tk.v} target="_blank" rel="noopener noreferrer nofollow" className="text-cobalt underline underline-offset-2 break-all" onClick={(e) => e.stopPropagation()}>
            {tk.v.replace(/^https?:\/\//, "").slice(0, 48)}
            {tk.v.replace(/^https?:\/\//, "").length > 48 ? "…" : ""}
          </a>
        ) : (
          <span key={i}>{tk.v}</span>
        ),
      )}
    </p>
  );
}

/** Fenêtre modale accessible (Échap pour fermer, clic à l'extérieur). */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-[#0d1120]/55 backdrop-blur-[3px] flex items-end sm:items-center justify-center sm:p-4 fade-in" onMouseDown={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          "sheet-in bg-surface w-full sm:rounded-3xl rounded-t-3xl shadow-[var(--shadow-pop)] max-h-[92vh] overflow-y-auto scroll-thin outline-none",
          wide ? "sm:max-w-[640px]" : "sm:max-w-[460px]",
        )}
      >
        {title && (
          <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-5 pt-5 pb-3">
            <p className="font-display text-xl font-semibold">{title}</p>
            <button onClick={onClose} className="icon-btn -mr-2" aria-label="Fermer">
              <X size={19} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
