"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Hash, Users, FileText, CornerDownLeft } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cx, displayName, groupGradient } from "@/lib/utils";
import { Avatar } from "./ui";

type Item = { key: string; label: string; sub?: string; href: string; icon: React.ReactNode };

const SHORTCUTS: Item[] = [
  { key: "s-feed", label: "Fil d'actualité", href: "/feed", icon: <FileText size={16} /> },
  { key: "s-groups", label: "Groupes", href: "/groups", icon: <Users size={16} /> },
  { key: "s-msg", label: "Messages", href: "/messages", icon: <FileText size={16} /> },
  { key: "s-rank", label: "Classement de la semaine", href: "/classement", icon: <Hash size={16} /> },
  { key: "s-saved", label: "Publications enregistrées", href: "/enregistres", icon: <FileText size={16} /> },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; color: string; emoji: string }[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim().replace(/[%,()]/g, "");
    const t = setTimeout(async () => {
      let pq = sb().from("profiles").select("*").limit(5);
      let gq = sb().from("groups").select("id,name,color,emoji").limit(4);
      if (term) {
        pq = pq.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
        gq = gq.ilike("name", `%${term}%`);
      } else {
        pq = pq.order("created_at", { ascending: false });
        gq = gq.order("created_at", { ascending: false });
      }
      const [p, g] = await Promise.all([pq, gq]);
      setPeople((p.data as Profile[]) || []);
      setGroups(g.data || []);
      setActive(0);
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  const items: Item[] = useMemo(() => {
    const term = q.trim();
    const list: Item[] = [];
    if (term) list.push({ key: "search", label: `Rechercher « ${term} » dans les publications`, href: `/explorer?q=${encodeURIComponent(term)}`, icon: <Search size={16} /> });
    people.forEach((p) =>
      list.push({ key: `p-${p.id}`, label: displayName(p), sub: `@${p.username}`, href: `/u/${p.username}`, icon: <Avatar profile={p} size={26} /> }),
    );
    groups.forEach((g) =>
      list.push({
        key: `g-${g.id}`,
        label: g.name,
        sub: "Groupe",
        href: `/groups/${g.id}`,
        icon: (
          <span className="w-[26px] h-[26px] rounded-lg grid place-items-center text-[13px]" style={{ background: groupGradient(g.color) }}>
            {g.emoji || <span className="text-white font-bold">{g.name[0]}</span>}
          </span>
        ),
      }),
    );
    if (!term) SHORTCUTS.forEach((s) => list.push(s));
    return list;
  }, [people, groups, q]);

  const go = (it?: Item) => {
    if (!it) return;
    onClose();
    router.push(it.href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-[#0d1120]/55 backdrop-blur-[3px] flex items-start justify-center p-4 pt-[12vh] fade-in" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="sheet-in w-full max-w-[560px] bg-surface rounded-3xl shadow-[var(--shadow-pop)] overflow-hidden" role="dialog" aria-label="Recherche">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-line">
          <Search size={20} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === "Enter") go(items[active]);
            }}
            placeholder="Chercher un apprenant, un groupe, un sujet…"
            className="flex-1 bg-transparent outline-none focus-visible:outline-none text-[16px]"
          />
          <kbd className="hidden sm:block text-[11px] text-muted border border-line rounded-md px-1.5 py-0.5">Échap</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto scroll-thin p-2">
          {items.map((it, i) => (
            <li key={it.key}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it)}
                className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left", i === active && "bg-surface-2")}
              >
                <span className="w-[26px] grid place-items-center text-muted">{it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">{it.label}</span>
                  {it.sub && <span className="block text-xs text-muted truncate">{it.sub}</span>}
                </span>
                {i === active && <CornerDownLeft size={15} className="text-muted" />}
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="px-4 py-6 text-center text-muted text-sm">Aucun résultat pour cette recherche.</li>}
        </ul>
      </div>
    </div>
  );
}
