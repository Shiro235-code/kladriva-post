"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { sb } from "@/lib/supabase";
import { Avatar } from "./ui";

export type MentionProfile = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  className?: string;
  wrapperClassName?: string;
  ariaLabel: string;
  groupId?: string | null;
  conversationId?: string | null;
};

function activeMention(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = /(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_]*)$/.exec(before);
  if (!match) return null;
  const atIndex = caret - match[2].length - 1;
  if (atIndex > 0 && /[a-zA-Z0-9_.]/.test(text[atIndex - 1])) return null;
  return { atIndex, query: match[2].toLowerCase(), endIndex: caret };
}

export function MentionTextarea({
  value,
  onChange,
  onKeyDown,
  onPaste,
  textareaRef,
  placeholder,
  maxLength,
  rows = 1,
  className,
  wrapperClassName,
  ariaLabel,
  groupId,
  conversationId,
}: Props) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef || internalRef;
  const [suggestions, setSuggestions] = useState<MentionProfile[]>([]);
  const [active, setActive] = useState<{ atIndex: number; query: string; endIndex: number } | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    if (!active) {
      setSuggestions([]);
      setError(false);
      setLoading(false);
      return;
    }
    const ticket = ++request.current;
    setLoading(true);
    setError(false);
    setSelected(0);
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: searchError } = await sb().rpc("search_mentions", {
          p_query: active.query,
          p_limit: 8,
          p_group_id: groupId || null,
          p_conversation_id: conversationId || null,
        });
        if (ticket !== request.current) return;
        if (searchError) throw searchError;
        setSuggestions((data as MentionProfile[]) || []);
      } catch {
        if (ticket === request.current) {
          setSuggestions([]);
          setError(true);
        }
      } finally {
        if (ticket === request.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [active, groupId, conversationId]);

  const updateActive = () => {
    const el = ref.current;
    if (!el) return;
    setActive(activeMention(el.value, el.selectionStart));
  };

  const choose = (profile: MentionProfile) => {
    const el = ref.current;
    if (!el || !active) return;
    const before = value.slice(0, active.atIndex);
    const after = value.slice(active.endIndex);
    const insertion = `@${profile.username} `;
    const next = before + insertion + after;
    onChange(next);
    setActive(null);
    setSuggestions([]);
    requestAnimationFrame(() => {
      el.focus();
      const caret = before.length + insertion.length;
      el.selectionStart = el.selectionEnd = caret;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (active && suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setSelected((current) => event.key === "ArrowDown"
        ? (current + 1) % suggestions.length
        : (current - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (active && event.key === "Enter" && !event.shiftKey && suggestions.length) {
      event.preventDefault();
      choose(suggestions[selected]);
      return;
    }
    if (active && event.key === "Escape") {
      event.preventDefault();
      setActive(null);
      setSuggestions([]);
      return;
    }
    onKeyDown?.(event);
  };

  return (
    <div className={wrapperClassName || "relative flex-1 min-w-0"}>
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          requestAnimationFrame(updateActive);
        }}
        onClick={updateActive}
        onKeyUp={updateActive}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        className={className}
      />
      {active && (
        <div
          id="mention-suggestions"
          role="listbox"
          className="absolute z-[75] left-0 bottom-full mb-2 w-[min(330px,calc(100vw-48px))] max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)] picker-in"
        >
          {loading ? (
            <p className="px-3 py-3 text-sm text-muted">Recherche des apprenants…</p>
          ) : error ? (
            <p role="alert" className="px-3 py-3 text-sm text-coral">Recherche indisponible. Réessaie.</p>
          ) : suggestions.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">Aucun apprenant trouvé.</p>
          ) : suggestions.map((profile, index) => (
            <button
              key={profile.id}
              type="button"
              role="option"
              aria-selected={index === selected}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setSelected(index)}
              onClick={() => choose(profile)}
              className={`w-full min-h-14 flex items-center gap-3 rounded-xl px-2.5 text-left transition ${index === selected ? "bg-cobalt-soft" : "hover:bg-surface-2"}`}
            >
              <Avatar profile={profile} size={38} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-ink">{profile.full_name?.trim() || profile.username}</span>
                <span className="block truncate text-xs text-muted">@{profile.username}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
