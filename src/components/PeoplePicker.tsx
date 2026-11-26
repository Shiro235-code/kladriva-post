"use client";

import { useEffect, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cx, displayName, firstName } from "@/lib/utils";
import { useActivity } from "./Providers";
import { Avatar } from "./ui";

/** Liste de personnes avec recherche, en sélection simple ou multiple. */
export function PeoplePicker({
  exclude = [],
  multiple = false,
  selected = [],
  onToggle,
  onPick,
  autoFocus = true,
}: {
  exclude?: string[];
  multiple?: boolean;
  selected?: Profile[];
  onToggle?: (p: Profile) => void;
  onPick?: (p: Profile) => void;
  autoFocus?: boolean;
}) {
  const { online } = useActivity();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const excludeKey = exclude.join(",");

  useEffect(() => {
    const t = setTimeout(async () => {
      let query = sb().from("profiles").select("*").order("full_name", { ascending: true }).limit(40);
      const term = q.trim().replace(/[%,()]/g, "");
      if (term) query = query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
      const { data } = await query;
      const ex = new Set(excludeKey ? excludeKey.split(",") : []);
      setPeople(((data as Profile[]) || []).filter((p) => !ex.has(p.id)));
      setLoading(false);
    }, 160);
    return () => clearTimeout(t);
  }, [q, excludeKey]);

  const isSel = (id: string) => selected.some((s) => s.id === id);

  return (
    <div>
      {multiple && selected.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
          {selected.map((p) => (
            <button key={p.id} type="button" onClick={() => onToggle?.(p)} className="shrink-0 w-[60px] text-center group" aria-label={`Retirer ${displayName(p)}`}>
              <span className="relative inline-block">
                <Avatar profile={p} size={48} />
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-ink text-surface grid place-items-center border-2 border-surface"><X size={10} strokeWidth={3} /></span>
              </span>
              <span className="block text-[11.5px] truncate mt-1">{firstName(p)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="field !pl-10 !rounded-full" placeholder="Chercher un nom ou un @pseudo" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} />
      </div>
      <div className="mt-2 max-h-[46vh] overflow-y-auto scroll-thin -mx-2">
        {people.map((p) => {
          const sel = isSel(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => (multiple ? onToggle?.(p) : onPick?.(p))}
              className={cx("w-full flex items-center gap-3 px-2.5 py-2 rounded-2xl text-left transition", sel ? "bg-cobalt-soft" : "hover:bg-surface-2")}
              aria-pressed={multiple ? sel : undefined}
            >
              <Avatar profile={p} size={44} online={online.has(p.id)} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold truncate">{displayName(p)}</span>
                <span className="block text-sm text-muted truncate">{p.headline || `@${p.username}`}</span>
              </span>
              {multiple && (
                <span className={cx("w-6 h-6 rounded-full grid place-items-center border-2 shrink-0", sel ? "bg-cobalt border-cobalt text-white" : "border-line-strong")}>
                  {sel && <Check size={14} strokeWidth={3} />}
                </span>
              )}
            </button>
          );
        })}
        {!loading && people.length === 0 && <p className="text-sm text-muted p-3">Personne trouvé.</p>}
      </div>
    </div>
  );
}
