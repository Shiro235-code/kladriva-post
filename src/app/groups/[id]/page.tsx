"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Feed } from "@/components/Feed";
import { Avatar, Empty, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { displayName, groupColor } from "@/lib/utils";

type G = { id: string; name: string; description: string; color: string; created_by: string };

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { session } = useAuth();
  const router = useRouter();
  const [group, setGroup] = useState<G | null>(null);
  const [members, setMembers] = useState<(Profile & { role: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadMembers = useCallback(async () => {
    const { data } = await sb().from("group_members").select("role, profile:profiles(*)").eq("group_id", id).order("joined_at");
    setMembers(((data || []) as unknown as { role: string; profile: Profile }[]).map((r) => ({ ...r.profile, role: r.role })));
  }, [id]);

  useEffect(() => {
    sb()
      .from("groups")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        setGroup(data as G);
        setLoading(false);
      });
    loadMembers();
  }, [id, loadMembers]);

  const isMember = !!session && members.some((m) => m.id === session.user.id);
  const isOwner = !!session && group?.created_by === session.user.id;

  const toggle = async () => {
    if (!session) return router.push("/auth");
    setBusy(true);
    if (isMember) await sb().from("group_members").delete().eq("group_id", id).eq("user_id", session.user.id);
    else await sb().from("group_members").insert({ group_id: id, user_id: session.user.id });
    await loadMembers();
    setBusy(false);
  };

  if (loading) return <AppShell><div className="flex justify-center py-20"><Spinner /></div></AppShell>;
  if (!group) return <AppShell><Empty title="Groupe introuvable." /></AppShell>;

  const c = groupColor(group.color);

  return (
    <AppShell>
      <div className="max-w-[640px] mx-auto">
        <Link href="/groups" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink mb-4"><ArrowLeft size={16} /> Groupes</Link>
        <div className="card overflow-hidden mb-5">
          <div className="h-32 relative" style={{ background: `linear-gradient(120deg, ${c.bg}, ${c.ring})` }}>
            <span className="absolute -bottom-8 left-6 w-20 h-20 rounded-3xl grid place-items-center text-4xl font-bold border-4 border-white" style={{ background: c.fg, color: "#fff" }}>
              {group.name[0]?.toUpperCase()}
            </span>
          </div>
          <div className="p-6 pt-12">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-[-0.03em]">{group.name}</h1>
                <p className="text-muted mt-1 whitespace-pre-wrap">{group.description || "Pas encore de description."}</p>
              </div>
              {!isOwner && (
                <button onClick={toggle} disabled={busy} className={isMember ? "btn btn-ghost" : "btn btn-accent"}>
                  {isMember ? "Quitter" : "Rejoindre"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 mt-5">
              <div className="flex -space-x-2">
                {members.slice(0, 6).map((m) => (
                  <Link key={m.id} href={`/u/${m.username}`} title={displayName(m)} className="ring-2 ring-white rounded-full">
                    <Avatar profile={m} size={32} />
                  </Link>
                ))}
              </div>
              <span className="text-sm text-muted">{members.length} membre{members.length > 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>

        {session && !isMember && (
          <div className="card p-4 mb-4 text-sm text-muted text-center">Rejoins le groupe pour y publier.</div>
        )}
        <Feed groupId={id} canPost={isMember} emptyText="Aucune publication dans ce groupe pour l'instant." />
      </div>
    </AppShell>
  );
}
