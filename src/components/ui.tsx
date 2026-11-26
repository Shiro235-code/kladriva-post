"use client";

import { displayName } from "@/lib/utils";

const TONES = ["#ff5b2e", "#4a32d4", "#17803d", "#1f5fd1", "#c22a6f", "#b7791f"];

export function Avatar({
  profile,
  size = 40,
}: {
  profile?: { full_name?: string; username?: string; avatar_url?: string | null } | null;
  size?: number;
}) {
  const name = displayName(profile);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const tone = TONES[(profile?.username || name).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
  if (profile?.avatar_url && profile.avatar_url.startsWith("https://")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar_url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0 bg-line"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-label={name}
      className="rounded-full shrink-0 grid place-items-center font-semibold text-white select-none"
      style={{ width: size, height: size, background: tone, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </div>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-[17px]">
      <span
        className="grid place-items-center rounded-[10px] w-8 h-8"
        style={{ background: light ? "#fff" : "#0f0f12" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 2v12M3 8l7-6M3 8l7 6" stroke={light ? "#0f0f12" : "#fff"} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="13" cy="8" r="1.8" fill="#ff5b2e" />
        </svg>
      </span>
      <span className={light ? "text-white" : "text-ink"}>
        Kladriva <span className="font-display italic font-normal text-[19px]">Post</span>
      </span>
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block w-5 h-5 rounded-full border-2 border-line border-t-ink animate-spin ${className}`}
      aria-label="Chargement"
    />
  );
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <p className="font-display text-3xl">{title}</p>
      {text && <p className="text-muted mt-2 max-w-sm mx-auto">{text}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
