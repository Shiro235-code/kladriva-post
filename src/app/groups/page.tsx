"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Search, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Providers";
import { Empty, Spinner } from "@/components/ui";
import { GroupAvatar } from "@/components/chat";
import { NewGroup } from "@/components/NewGroup";
import { sb } from "@/lib/supabase";
import type { Group } from "@/lib/types";
import { plural } from "@/lib/utils";

export default function GroupsPage() {
  const { session } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
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

  const filtered = useMemo(
    () => groups.filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()) || g.description.toLowerCase().includes(q.toLowerCase())),
    [groups, q],
  );
  const myGroups = filtered.filter((g) => mine.includes(g.id));
  const discover = filtered.filter((g) => !mine.includes(g.id));

  const join = async (g: Group) => {
    if (!session) return router.push("/auth?next=/groups");
    setJoining(g.id);
    const { error } = await sb().from("group_members").insert({ group_id: g.id, user_id: session.user.id });
    setJoining(null);
    if (error) return toast("Impossible de rejoindre ce groupe.", "error");
    setMine((m) => [...m, g.id]);
    toast(`Tu as rejoint ${g.name}`);
  };

  const Row = ({ g, member }: { g: Group; member: boolean }) => (
    <li className="flex items-center gap-3.5 px-4 py-3 hover:bg-surface-2 transition">
      <Link href={`/groups/${g.id}`} className="flex items-center gap-3.5 min-w-0 flex-1">
        <GroupAvatar group={g} size={54} />
        <span className="min-w-0">
          <span className="block font-semibold text-[15.5px] truncate">{g.name}</span>
          <span className="block text-[13.5px] text-muted truncate">{g.description || "Pas encore de description."}</span>
          <span className="block text-[12.5px] text-ink-2 mt-0.5">{plural(g.group_members?.[0]?.count ?? 0, "membre")}</span>
        </span>
      </Link>
      {member ? (
        <Link href={`/messages?g=${g.id}`} className="btn btn-soft !py-2 !px-3.5 text-[13px] shrink-0" aria-label={`Ouvrir la discussion de ${g.name}`}>
          <MessageCircle size={16} /> <span className="hidden sm:inline">Discussion</span>
        </Link>
      ) : (
        <button onClick={() => join(g)} disabled={joining === g.id} className="btn btn-primary !py-2 !px-3.5 text-[13px] shrink-0">
          {joining === g.id ? "…" : "Rejoindre"}
        </button>
      )}
    </li>
  );

  return (
    <AppShell full>
      <div className="w-full max-w-[980px] mx-auto">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] font-bold leading-tight">Groupes</h1>
            <p className="text-muted mt-1">Un module, un projet, une équipe : discute et publie avec ceux qui travaillent sur la même chose que toi.</p>
          </div>
          <button onClick={() => (session ? setCreating(true) : router.push("/auth?next=/groups"))} className="btn btn-primary shrink-0">
            <Plus size={17} /> <span className="hidden sm:inline">Nouveau groupe</span>
            <span className="sm:hidden">Créer</span>
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
              {session && <button onClick={() => setCreating(true)} className="btn btn-primary">Nouveau groupe</button>}
            </Empty>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-5 mt-6 items-start">
            {myGroups.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-semibold mb-2 px-1">Tes groupes</h2>
                <ul className="panel overflow-hidden divide-y divide-line">{myGroups.map((g) => <Row key={g.id} g={g} member />)}</ul>
              </section>
            )}
            {discover.length > 0 && (
              <section className={myGroups.length ? "" : "lg:col-span-2"}>
                <h2 className="font-display text-lg font-semibold mb-2 px-1">{myGroups.length ? "À découvrir" : "Tous les groupes"}</h2>
                <ul className="panel overflow-hidden divide-y divide-line">{discover.map((g) => <Row key={g.id} g={g} member={false} />)}</ul>
              </section>
            )}
            {filtered.length === 0 && <p className="text-muted text-center py-10 lg:col-span-2">Aucun groupe ne correspond à « {q} ».</p>}
          </div>
        )}
      </div>
      <NewGroup open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/messages?g=${id}`)} />
    </AppShell>
  );
}
