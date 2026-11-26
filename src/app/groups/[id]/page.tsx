"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Providers";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { Avatar, Empty, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cx, displayName, groupColor, groupGradient, plural } from "@/lib/utils";

type G = { id: string; name: string; description: string; color: string; emoji: string; created_by: string; created_at: string };

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { session } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [group, setGroup] = useState<G | null>(null);
  const [members, setMembers] = useState<(Profile & { role: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"posts" | "members">("posts");

  const loadMembers = useCallback(async () => {
    const { data } = await sb().from("group_members").select("role, profile:profiles(*)").eq("group_id", id).order("joined_at");
    setMembers(((data || []) as unknown as { role: string; profile: Profile }[]).filter((r) => r.profile).map((r) => ({ ...r.profile, role: r.role })));
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
    const { error } = isMember
      ? await sb().from("group_members").delete().eq("group_id", id).eq("user_id", session.user.id)
      : await sb().from("group_members").insert({ group_id: id, user_id: session.user.id });
    await loadMembers();
    setBusy(false);
    if (error) return toast("Action impossible pour le moment.", "error");
    toast(isMember ? "Tu as quitté le groupe" : "Bienvenue dans le groupe");
  };

  if (loading) return <AppShell><div className="flex justify-center py-24"><Spinner /></div></AppShell>;
  if (!group)
    return (
      <AppShell>
        <div className="max-w-[620px] mx-auto">
          <Empty emoji="🧭" title="Groupe introuvable" text="Il a peut-être été supprimé par son créateur.">
            <Link href="/groups" className="btn btn-primary">Voir les groupes</Link>
          </Empty>
        </div>
      </AppShell>
    );

  const c = groupColor(group.color);

  return (
    <AppShell>
      <div className="max-w-[620px] mx-auto">
        <Link href="/groups" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4"><ArrowLeft size={16} /> Groupes</Link>
        <section className="panel overflow-hidden">
          <div className="h-36 relative" style={{ background: groupGradient(group.color) }}>
            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[92px] leading-none" aria-hidden>{group.emoji}</span>
            {!group.emoji && <span className="absolute left-6 bottom-4 font-display text-6xl font-bold" style={{ color: c.fg }}>{group.name[0]?.toUpperCase()}</span>}
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-display text-[28px] font-bold leading-tight">{group.name}</h1>
                <p className="text-sm text-muted mt-0.5">{plural(members.length, "membre")}</p>
              </div>
              {isOwner ? (
                <span className="text-[12px] font-bold text-cobalt bg-cobalt-soft px-2.5 py-1 rounded-lg shrink-0 mt-1">Tu l&apos;as créé</span>
              ) : (
                <button onClick={toggle} disabled={busy} className={cx("btn shrink-0", isMember ? "btn-soft" : "btn-primary")}>
                  {isMember ? "Quitter" : "Rejoindre"}
                </button>
              )}
            </div>
            {group.description && <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2">{group.description}</p>}
            <div className="flex items-center gap-3 mt-4">
              <div className="flex -space-x-2.5">
                {members.slice(0, 7).map((m) => (
                  <Link key={m.id} href={`/u/${m.username}`} title={displayName(m)} className="rounded-full ring-[3px] ring-surface">
                    <Avatar profile={m} size={32} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="flex gap-6 border-b border-line mt-6 mb-4" role="tablist">
          {(
            [
              ["posts", "Publications"],
              ["members", `Membres (${members.length})`],
            ] as const
          ).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("relative pb-3 text-[15px] font-semibold", tab === t ? "text-ink" : "text-muted hover:text-ink-2")}>
              {label}
              {tab === t && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-full bg-cobalt" />}
            </button>
          ))}
        </div>

        {tab === "posts" ? (
          <>
            {session && !isMember && (
              <div className="panel p-4 mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-ink-2">Rejoins le groupe pour y publier et suivre ses échanges.</p>
                <button onClick={toggle} disabled={busy} className="btn btn-primary !py-2 shrink-0">Rejoindre</button>
              </div>
            )}
            <Feed groupId={id} canPost={isMember} empty={{ emoji: group.emoji || "💬", title: "Aucune publication dans ce groupe", text: isMember ? "Lance la première discussion du groupe." : "Rejoins le groupe et lance la première discussion." }} />
          </>
        ) : (
          <ul className="panel divide-y divide-line">
            {members.map((m) => (
              <li key={m.id}>
                <Link href={`/u/${m.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <Avatar profile={m} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold truncate">{displayName(m)}</span>
                      {m.role === "owner" && <span className="text-[11px] font-bold text-cobalt bg-cobalt-soft px-1.5 py-0.5 rounded">Créateur</span>}
                    </span>
                    <span className="block text-sm text-muted truncate">{m.headline || `@${m.username}`}</span>
                  </span>
                  {session && <FollowButton userId={m.id} compact />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
