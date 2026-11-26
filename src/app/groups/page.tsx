"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Empty, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Group } from "@/lib/types";
import { GROUP_COLORS, cx, groupColor } from "@/lib/utils";

export default function GroupsPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    sb()
      .from("groups")
      .select("*, group_members(count)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setGroups((data as Group[]) || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!session) return;
    sb().from("group_members").select("group_id").eq("user_id", session.user.id).then(({ data }) => setMine((data || []).map((r) => r.group_id)));
  }, [session]);

  return (
    <AppShell>
      <div className="max-w-[760px] mx-auto">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em]">
              Groupes <span className="font-display italic font-normal">& équipes</span>
            </h1>
            <p className="text-muted mt-1">Retrouve les apprenants qui travaillent sur les mêmes sujets que toi.</p>
          </div>
          <button onClick={() => (session ? setCreating(true) : router.push("/auth"))} className="btn btn-primary shrink-0">
            <Plus size={16} /> Créer
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : groups.length === 0 ? (
          <Empty title="Aucun groupe." text="Crée le premier : un module, un projet, une équipe…" />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {groups.map((g) => {
              const c = groupColor(g.color);
              const member = mine.includes(g.id);
              return (
                <Link key={g.id} href={`/groups/${g.id}`} className="card overflow-hidden hover:-translate-y-0.5 transition rise">
                  <div className="h-20 relative" style={{ background: c.bg }}>
                    <span className="absolute -bottom-6 left-5 w-14 h-14 rounded-2xl grid place-items-center text-2xl font-bold border-4 border-white" style={{ background: c.ring, color: c.fg }}>
                      {g.name[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="p-5 pt-9">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-lg truncate">{g.name}</p>
                      {member && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-ink text-white">Membre</span>}
                    </div>
                    <p className="text-sm text-muted mt-1 line-clamp-2 min-h-[40px]">{g.description || "Pas encore de description."}</p>
                    <p className="text-xs text-muted mt-3 font-medium">{g.group_members?.[0]?.count ?? 0} membres</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {creating && <CreateGroup onClose={() => setCreating(false)} onCreated={(id) => router.push(`/groups/${id}`)} />}
    </AppShell>
  );
}

function CreateGroup({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("orange");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    const { data, error } = await sb()
      .from("groups")
      .insert({ name: name.trim(), description: description.trim(), color, created_by: session.user.id })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    onCreated(data.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="card w-full max-w-[460px] p-6 rise">
        <div className="flex items-center justify-between">
          <p className="text-2xl font-semibold tracking-tight">Nouveau groupe</p>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-bg"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3 mt-5">
          <input className="input" placeholder="Nom du groupe" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoFocus />
          <textarea className="input resize-none" rows={3} placeholder="De quoi parle ce groupe ?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          <div>
            <p className="text-sm text-muted mb-2">Couleur</p>
            <div className="flex gap-2">
              {Object.entries(GROUP_COLORS).map(([k, c]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setColor(k)}
                  className={cx("w-9 h-9 rounded-full border-2 transition", color === k ? "border-ink scale-110" : "border-transparent")}
                  style={{ background: c.fg }}
                  aria-label={k}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn btn-primary !py-3 mt-2" disabled={busy || name.trim().length < 2}>
            {busy ? "Création…" : "Créer le groupe"}
          </button>
        </div>
      </form>
    </div>
  );
}
