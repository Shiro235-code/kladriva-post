"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Providers";
import { Empty, Modal, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Group } from "@/lib/types";
import { GROUP_ICONS, GROUP_PALETTE, cx, groupColor, groupGradient, groupIcon, plural } from "@/lib/utils";


export default function GroupsPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

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

  const filtered = useMemo(() => groups.filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()) || g.description.toLowerCase().includes(q.toLowerCase())), [groups, q]);
  const myGroups = filtered.filter((g) => mine.includes(g.id));
  const discover = filtered.filter((g) => !mine.includes(g.id));

  return (
    <AppShell full>
      <div className="w-full">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] font-bold leading-tight">Groupes</h1>
            <p className="text-muted mt-1">Un module, un projet, une équipe : retrouve ceux qui travaillent sur la même chose que toi.</p>
          </div>
          <button onClick={() => (session ? setCreating(true) : router.push("/auth"))} className="btn btn-primary shrink-0">
            <Plus size={17} /> <span className="hidden sm:inline">Créer un groupe</span><span className="sm:hidden">Créer</span>
          </button>
        </div>

        <div className="relative mt-5">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un groupe" className="field !rounded-full !pl-11 !bg-surface" />
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : groups.length === 0 ? (
          <div className="mt-6">
            <Empty icon={Users} title="Aucun groupe pour l'instant" text="Crée le premier pour ton module ou ton équipe projet.">
              {session && <button onClick={() => setCreating(true)} className="btn btn-primary">Créer un groupe</button>}
            </Empty>
          </div>
        ) : (
          <>
            {myGroups.length > 0 && <GroupGrid title="Tes groupes" list={myGroups} mine />}
            {discover.length > 0 && <GroupGrid title={myGroups.length ? "À découvrir" : "Tous les groupes"} list={discover} />}
            {filtered.length === 0 && <p className="text-muted text-center py-10">Aucun groupe ne correspond à « {q} ».</p>}
          </>
        )}
      </div>
      <CreateGroup open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/groups/${id}`)} />
    </AppShell>
  );
}

function GroupGrid({ title, list, mine }: { title: string; list: Group[]; mine?: boolean }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold mb-3">{title}</h2>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {list.map((g) => {
          const c = groupColor(g.color);
          const Icon = groupIcon(g.icon);
          return (
            <Link key={g.id} href={`/groups/${g.id}`} className="panel overflow-hidden group hover:border-line-strong transition">
              <div className="h-[92px] relative overflow-hidden" style={{ background: groupGradient(g.color), color: c.fg }}>
                <Icon size={96} strokeWidth={1.4} className="absolute -right-3 -bottom-5 opacity-25 group-hover:opacity-35 group-hover:-rotate-6 transition duration-300" aria-hidden />
                <span className="absolute left-4 bottom-3 w-10 h-10 rounded-xl bg-white/20 backdrop-blur grid place-items-center" aria-hidden>
                  <Icon size={21} strokeWidth={2.1} />
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-[16px] truncate flex-1">{g.name}</p>
                  {mine && <span className="text-[11px] font-bold text-cobalt bg-cobalt-soft px-2 py-0.5 rounded-md">Membre</span>}
                </div>
                <p className="text-sm text-muted mt-1 line-clamp-2 min-h-[40px]">{g.description || "Pas encore de description."}</p>
                <p className="text-[13px] font-semibold text-ink-2 mt-2">{plural(g.group_members?.[0]?.count ?? 0, "membre")}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CreateGroup({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { session } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("cobalt");
  const [icon, setIcon] = useState("code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    const { data, error } = await sb()
      .from("groups")
      .insert({ name: name.trim(), description: description.trim(), color, icon, created_by: session.user.id })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError("Le groupe n'a pas pu être créé. Vérifie le nom (2 à 60 caractères) et réessaie.");
    toast("Groupe créé");
    onCreated(data.id);
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouveau groupe">
      <form onSubmit={create} className="px-5 pb-5">
        <div className="h-24 rounded-2xl relative overflow-hidden" style={{ background: groupGradient(color), color: groupColor(color).fg }}>
          {(() => {
            const Icon = groupIcon(icon);
            return <Icon size={92} strokeWidth={1.4} className="absolute -right-2 -bottom-4 opacity-30" aria-hidden />;
          })()}
          <span className="absolute left-5 bottom-3 font-display text-xl font-bold truncate max-w-[70%]">{name || "Nom du groupe"}</span>
        </div>
        <div className="flex flex-col gap-3.5 mt-4">
          <input className="field" placeholder="Nom du groupe" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoFocus />
          <textarea className="field resize-none" rows={2} placeholder="De quoi parle ce groupe ?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          <div>
            <p className="text-sm font-semibold mb-2">Icône</p>
            <div className="grid grid-cols-10 gap-1.5">
              {Object.entries(GROUP_ICONS).map(([k, v]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setIcon(k)}
                  title={v.label}
                  className={cx("aspect-square rounded-xl grid place-items-center border transition", icon === k ? "border-cobalt bg-cobalt-soft text-cobalt" : "border-line text-ink-2 hover:bg-surface-2")}
                  aria-label={v.label}
                  aria-pressed={icon === k}
                >
                  <v.icon size={18} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Couleur</p>
            <div className="flex gap-2">
              {GROUP_PALETTE.map((k) => (
                <button type="button" key={k} onClick={() => setColor(k)} className={cx("w-9 h-9 rounded-full ring-2 ring-offset-2 ring-offset-surface transition", color === k ? "ring-ink" : "ring-transparent")} style={{ background: groupGradient(k) }} aria-label={`Couleur ${k}`} aria-pressed={color === k} />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-coral font-medium">{error}</p>}
          <button className="btn btn-primary !py-3 mt-1" disabled={busy || name.trim().length < 2}>{busy ? "Création…" : "Créer le groupe"}</button>
        </div>
      </form>
    </Modal>
  );
}
