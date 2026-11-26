"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Reply, AtSign, UserPlus, Users, Heart, Bell } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useActivity } from "@/components/Providers";
import { Avatar, Empty, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import { cx, displayName, reactionOf, timeAgo } from "@/lib/utils";

const SELECT = "*, actor:profiles!notifications_actor_id_fkey(*), post:posts(id,content), group:groups(id,name)";

function describe(n: Notification): { icon: React.ReactNode; text: React.ReactNode; href: string } {
  const who = <b className="font-semibold">{displayName(n.actor)}</b>;
  const post = n.post ? `/p/${n.post.id}` : "/feed";
  switch (n.type) {
    case "reaction": {
      const r = reactionOf(n.data?.reaction || "like");
      return { icon: <span className="text-[13px] leading-none">{r.emoji}</span>, text: <>{who} a réagi à ta publication</>, href: post };
    }
    case "comment":
      return { icon: <MessageCircle size={13} className="text-cobalt" />, text: <>{who} a commenté ta publication</>, href: post };
    case "reply":
      return { icon: <Reply size={13} className="text-cobalt" />, text: <>{who} a répondu à ton commentaire</>, href: post };
    case "mention":
      return { icon: <AtSign size={13} className="text-cobalt" />, text: <>{who} t&apos;a mentionné</>, href: post };
    case "follow":
      return { icon: <UserPlus size={13} className="text-mint" />, text: <>{who} s&apos;est abonné à toi</>, href: n.actor ? `/u/${n.actor.username}` : "/feed" };
    case "group_join":
      return { icon: <Users size={13} className="text-mint" />, text: <>{who} a rejoint <b className="font-semibold">{n.group?.name || "ton groupe"}</b></>, href: n.group ? `/groups/${n.group.id}` : "/groups" };
    case "comment_like":
      return { icon: <Heart size={12} className="text-coral" fill="currentColor" />, text: <>{who} a aimé ton commentaire</>, href: post };
  }
}

export default function NotificationsPage() {
  const { session, loading: authLoading } = useAuth();
  const { refresh } = useActivity();
  const router = useRouter();
  const uid = session?.user.id;
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!authLoading && !session) router.replace("/auth");
  }, [authLoading, session, router]);

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await sb().from("notifications").select(SELECT).eq("user_id", uid).order("created_at", { ascending: false }).limit(80);
    setItems((data as unknown as Notification[]) || []);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    load();
    if (!uid) return;
    const ch = sb()
      .channel(`notif-page-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, load)
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [load, uid]);

  const markAll = async () => {
    if (!uid) return;
    setItems((it) => it.map((n) => ({ ...n, read: true })));
    await sb().from("notifications").update({ read: true }).eq("user_id", uid).eq("read", false);
    refresh();
  };

  const open = async (n: Notification, href: string) => {
    if (!n.read) {
      await sb().from("notifications").update({ read: true }).eq("id", n.id);
      refresh();
    }
    router.push(href);
  };

  const shown = filter === "unread" ? items.filter((n) => !n.read) : items;
  const today = shown.filter((n) => Date.now() - +new Date(n.created_at) < 86400000);
  const earlier = shown.filter((n) => Date.now() - +new Date(n.created_at) >= 86400000);
  const unread = items.filter((n) => !n.read).length;

  const Group = ({ title, list }: { title: string; list: Notification[] }) =>
    list.length ? (
      <section className="mb-6">
        <h2 className="font-display text-lg font-semibold mb-2 px-1">{title}</h2>
        <ul className="panel overflow-hidden divide-y divide-line">
          {list.map((n) => {
            const d = describe(n);
            return (
              <li key={n.id}>
                <button onClick={() => open(n, d.href)} className={cx("w-full flex items-start gap-3.5 px-4 py-3.5 text-left hover:bg-surface-2 transition", !n.read && "bg-cobalt-soft/50")}>
                  <span className="relative shrink-0">
                    <Avatar profile={n.actor} size={46} />
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-surface border border-line grid place-items-center">{d.icon}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug">{d.text}</span>
                    {n.post?.content && <span className="block text-sm text-muted truncate mt-0.5">« {n.post.content.slice(0, 90)} »</span>}
                    <span className={cx("block text-xs mt-1", n.read ? "text-muted" : "text-cobalt font-semibold")}>{timeAgo(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-cobalt mt-2 shrink-0" aria-label="Non lue" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  return (
    <AppShell>
      <div className="max-w-[680px] 2xl:max-w-[780px] mx-auto">
        <div className="flex items-end justify-between gap-4 mb-5">
          <h1 className="font-display text-[34px] font-bold leading-tight">Notifications</h1>
          {unread > 0 && <button onClick={markAll} className="btn btn-soft !py-2 text-[13px]">Tout marquer comme lu</button>}
        </div>
        <div className="flex gap-1.5 mb-5">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cx("px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold border", filter === f ? "bg-ink text-surface border-ink" : "bg-surface border-line text-ink-2")}
            >
              {f === "all" ? "Toutes" : `Non lues${unread ? ` (${unread})` : ""}`}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : shown.length === 0 ? (
          <Empty icon={Bell} title={filter === "unread" ? "Tout est lu" : "Pas encore de notification"} text="Publie, commente et suis d'autres apprenants : leurs réactions apparaîtront ici." />
        ) : (
          <>
            <Group title="Aujourd'hui" list={today} />
            <Group title="Plus tôt" list={earlier} />
          </>
        )}
      </div>
    </AppShell>
  );
}
