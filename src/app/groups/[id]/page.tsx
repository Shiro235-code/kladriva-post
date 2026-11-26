"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, SearchX, MessagesSquare, UserPlus, LogIn } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Providers";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { Avatar, Empty, Spinner } from "@/components/ui";
import { GroupAvatar } from "@/components/chat";
import { AddMembers } from "@/components/GroupInfo";
import { sb } from "@/lib/supabase";
import type { GroupLite, Member } from "@/lib/types";
import { cx, displayName, plural } from "@/lib/utils";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { session } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [group, setGroup] = useState<GroupLite | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"posts" | "members">("posts");

  const loadMembers = useCallback(async () => {
    const { data } = await sb().from("group_members").select("role, profile:profiles(*)").eq("group_id", id).order("joined_at");
    setMembers(((data || []) as unknown as { role: Member["role"]; profile: Member | null }[]).filter((r) => r.profile).map((r) => ({ ...r.profile!, role: r.role })));
  }, [id]);

  useEffect(() => {
    sb()
      .from("groups")
      .select("id,name,description,color,icon,avatar_url,created_by")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        setGroup(data as GroupLite);
        setLoading(false);
      });
    loadMembers();
  }, [id, loadMembers]);

  const me = members.find((m) => m.id === session?.user.id);
  const isMember = !!me;
  const isAdmin = me?.role === "owner" || me?.role === "admin";

  const join = async () => {
    if (!session) return router.push(`/auth?next=/groups/${id}`);
    setBusy(true);
    const { error } = await sb().from("group_members").insert({ group_id: id, user_id: session.user.id });
    await loadMembers();
    setBusy(false);
    if (error) return toast("Impossible de rejoindre ce groupe.", "error");
    toast("Bienvenue dans le groupe");
  };

  if (loading) return <AppShell><div className="flex justify-center py-24"><Spinner /></div></AppShell>;
  if (!group)
    return (
      <AppShell>
        <div className="max-w-[680px] 2xl:max-w-[780px] mx-auto">
          <Empty icon={SearchX} title="Groupe introuvable" text="Il a peut-être été supprimé par son créateur.">
            <Link href="/groups" className="btn btn-primary">Voir les groupes</Link>
          </Empty>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="max-w-[680px] 2xl:max-w-[780px] mx-auto">
        <Link href="/groups" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4"><ArrowLeft size={16} /> Groupes</Link>

        {/* En-tête compact, façon WhatsApp */}
        <section className="panel px-5 sm:px-6 py-6 text-center">
          <GroupAvatar group={group} size={104} className="mx-auto" />
          <h1 className="font-display text-[28px] font-bold leading-tight mt-3">{group.name}</h1>
          <p className="text-sm text-muted mt-0.5">Groupe de {plural(members.length, "membre")}</p>
          {group.description && <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2 max-w-[52ch] mx-auto">{group.description}</p>}
          <div className="flex justify-center -space-x-2 mt-4">
            {members.slice(0, 8).map((m) => (
              <Link key={m.id} href={`/u/${m.username}`} title={displayName(m)} className="rounded-full ring-[3px] ring-surface">
                <Avatar profile={m} size={32} />
              </Link>
            ))}
          </div>
          <div className="flex justify-center flex-wrap gap-2 mt-5">
            {isMember ? (
              <>
                <Link href={`/messages?g=${id}`} className="btn btn-primary"><MessageCircle size={17} /> Ouvrir la discussion</Link>
                {isAdmin && <button onClick={() => setAdding(true)} className="btn btn-soft"><UserPlus size={17} /> Ajouter des membres</button>}
              </>
            ) : (
              <button onClick={join} disabled={busy} className="btn btn-primary">
                {session ? <UserPlus size={17} /> : <LogIn size={17} />} {session ? "Rejoindre le groupe" : "Se connecter pour rejoindre"}
              </button>
            )}
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
          <Feed groupId={id} canPost={isMember} empty={{ icon: MessagesSquare, title: "Aucune publication dans ce groupe", text: isMember ? "Partage la première avancée du groupe." : "Rejoins le groupe pour y publier." }} />
        ) : (
          <ul className="panel divide-y divide-line overflow-hidden">
            {isAdmin && (
              <li>
                <button onClick={() => setAdding(true)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2 text-left">
                  <span className="w-11 h-11 rounded-full bg-cobalt text-white grid place-items-center"><UserPlus size={20} /></span>
                  <span className="font-semibold">Ajouter des membres</span>
                </button>
              </li>
            )}
            {members.map((m) => (
              <li key={m.id}>
                <Link href={`/u/${m.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <Avatar profile={m} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold truncate">{displayName(m)}</span>
                      {m.role !== "member" && <span className="text-[11px] font-bold text-mint bg-mint-soft px-1.5 py-0.5 rounded">{m.role === "owner" ? "Créateur" : "Admin"}</span>}
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
      <AddMembers open={adding} groupId={id} existing={members.map((m) => m.id)} onClose={() => setAdding(false)} onAdded={loadMembers} />
    </AppShell>
  );
}
