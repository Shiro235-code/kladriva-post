"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Users } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { GroupMessage, Profile } from "@/lib/types";
import { cx, displayName, firstName, nameColor, plural } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { useActivity, useToast } from "./Providers";
import { Avatar, GroupMark, Spinner } from "./ui";

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
const onlyEmoji = (s: string) => /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,8}$/u.test(s.trim()) && !/^[\d#*\s]+$/.test(s.trim());
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

type G = { id: string; name: string; color: string; icon: string };

/**
 * Discussion de groupe en temps réel, façon WhatsApp :
 * nom coloré de l'expéditeur, bulles groupées, séparateurs de jours, « X écrit… », membres en ligne.
 */
export function GroupChat({ group, backHref, onActivity, className }: { group: G; backHref?: string; onActivity?: () => void; className?: string }) {
  const { session, profile } = useAuth();
  const { online, refresh } = useActivity();
  const toast = useToast();
  const uid = session?.user.id;
  const [msgs, setMsgs] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const chRef = useRef<ReturnType<ReturnType<typeof sb>["channel"]> | null>(null);
  const lastTypingSent = useRef(0);

  const markRead = useCallback(() => {
    if (!uid) return;
    sb()
      .from("group_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("group_id", group.id)
      .eq("user_id", uid)
      .then(() => {
        refresh();
        onActivity?.();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, uid]);

  const loadMembers = useCallback(async () => {
    const { data } = await sb().from("group_members").select("profile:profiles(*)").eq("group_id", group.id);
    const map: Record<string, Profile> = {};
    ((data || []) as unknown as { profile: Profile | null }[]).forEach((r) => r.profile && (map[r.profile.id] = r.profile));
    setMembers(map);
    return map;
  }, [group.id]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      await loadMembers();
      const { data } = await sb().from("group_messages").select("*").eq("group_id", group.id).order("created_at", { ascending: true }).limit(500);
      if (!alive) return;
      setMsgs((data as GroupMessage[]) || []);
      setLoading(false);
      markRead();
    })();

    const ch = sb()
      .channel(`group-chat-${group.id}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, async (p) => {
        const m = p.new as GroupMessage;
        setMsgs((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
        setTyping((t) => {
          const n = { ...t };
          delete n[m.sender_id];
          return n;
        });
        setMembers((mm) => {
          if (!mm[m.sender_id]) loadMembers();
          return mm;
        });
        if (m.sender_id !== uid) markRead();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "group_messages" }, (p) => {
        const id = (p.old as { id: string }).id;
        setMsgs((all) => all.filter((x) => x.id !== id));
      })
      .on("broadcast", { event: "typing" }, (p) => {
        const who = p.payload?.uid as string;
        if (!who || who === uid) return;
        setTyping((t) => ({ ...t, [who]: Date.now() }));
      })
      .subscribe();
    chRef.current = ch;

    const sweep = setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        const n: Record<string, number> = {};
        Object.entries(t).forEach(([k, v]) => now - v < 3500 && (n[k] = v));
        return Object.keys(n).length === Object.keys(t).length ? t : n;
      });
    }, 1000);

    return () => {
      alive = false;
      clearInterval(sweep);
      sb().removeChannel(ch);
    };
  }, [group.id, uid, loadMembers, markRead]);

  const typingCount = Object.keys(typing).length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: msgs.length > 40 ? "auto" : "smooth", block: "end" });
  }, [msgs.length, typingCount]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(140, el.scrollHeight) + "px";
  }, [text]);

  const onType = (v: string) => {
    setText(v);
    if (Date.now() - lastTypingSent.current > 1500) {
      lastTypingSent.current = Date.now();
      chRef.current?.send({ type: "broadcast", event: "typing", payload: { uid } });
    }
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !uid) return;
    setText("");
    const temp: GroupMessage = { id: `tmp-${Date.now()}`, group_id: group.id, sender_id: uid, content, created_at: new Date().toISOString() };
    setMsgs((all) => [...all, temp]);
    const { data, error } = await sb().from("group_messages").insert({ group_id: group.id, sender_id: uid, content }).select().single();
    if (error) {
      setMsgs((all) => all.filter((m) => m.id !== temp.id));
      setText(content);
      return toast(error.message.includes("row-level") ? "Rejoins le groupe pour écrire dans la discussion." : "Message non envoyé. Vérifie ta connexion.", "error");
    }
    setMsgs((all) => (all.some((m) => m.id === data.id) ? all.filter((m) => m.id !== temp.id) : all.map((m) => (m.id === temp.id ? (data as GroupMessage) : m))));
    onActivity?.();
  };

  const memberList = Object.values(members);
  const onlineCount = memberList.filter((m) => online.has(m.id)).length;
  const typers = Object.keys(typing).map((id) => members[id]).filter(Boolean);

  return (
    <div className={cx("flex flex-col min-h-0", className)}>
      <div className="flex items-center gap-3 px-4 h-[68px] border-b border-line shrink-0 bg-surface">
        {backHref && <Link href={backHref} className="md:hidden icon-btn -ml-2" aria-label="Retour"><ArrowLeft size={19} /></Link>}
        <Link href={`/groups/${group.id}`} className="flex items-center gap-3 min-w-0 flex-1">
          <GroupMark color={group.color} icon={group.icon} size={42} />
          <div className="min-w-0">
            <p className="font-bold truncate">{group.name}</p>
            <p className="text-xs text-muted truncate">
              {typers.length > 0 ? (
                <span className="text-mint font-semibold">{typers.length === 1 ? `${firstName(typers[0])} écrit…` : `${typers.length} personnes écrivent…`}</span>
              ) : (
                <>
                  {plural(memberList.length, "membre")}
                  {onlineCount > 0 && <span className="text-mint font-semibold">, {onlineCount} en ligne</span>}
                </>
              )}
            </p>
          </div>
        </Link>
        <div className="hidden sm:flex -space-x-2">
          {memberList.slice(0, 4).map((m) => (
            <span key={m.id} className="rounded-full ring-2 ring-surface"><Avatar profile={m} size={28} online={online.has(m.id)} /></span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-3 sm:px-5 py-5 flex flex-col bg-surface-2/60 min-h-0">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : msgs.length === 0 ? (
          <div className="m-auto text-center max-w-xs">
            <GroupMark color={group.color} icon={group.icon} size={64} className="mx-auto" />
            <p className="font-display text-xl font-bold mt-4">Lance la discussion</p>
            <p className="text-muted text-sm mt-1">Les messages ici sont visibles par les {plural(memberList.length, "membre")} du groupe.</p>
          </div>
        ) : (
          msgs.map((m, i) => {
            const mine = m.sender_id === uid;
            const author = mine ? profile : members[m.sender_id];
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const groupedTop = !!prev && !newDay && prev.sender_id === m.sender_id && +new Date(m.created_at) - +new Date(prev.created_at) < 5 * 60000;
            const groupedBottom = !!next && next.sender_id === m.sender_id && new Date(next.created_at).toDateString() === new Date(m.created_at).toDateString() && +new Date(next.created_at) - +new Date(m.created_at) < 5 * 60000;
            const big = onlyEmoji(m.content);
            return (
              <div key={m.id} className="flex flex-col">
                {newDay && (
                  <p className="self-center text-[12px] font-semibold text-muted bg-surface border border-line rounded-full px-3 py-1 my-4 first-letter:uppercase">{dayLabel(m.created_at)}</p>
                )}
                <div className={cx("flex items-end gap-2", mine ? "justify-end" : "justify-start", groupedTop ? "mt-0.5" : "mt-2.5")}>
                  {!mine && (
                    <span className="w-8 shrink-0">
                      {!groupedBottom && (
                        <Link href={`/u/${author?.username || ""}`}><Avatar profile={author} size={32} /></Link>
                      )}
                    </span>
                  )}
                  <div
                    className={cx(
                      "max-w-[78%] sm:max-w-[68%]",
                      big ? "px-1" : "px-3.5 pt-2 pb-1.5",
                      !big && (mine ? "bg-cobalt text-[var(--cobalt-ink)]" : "bg-surface border border-line text-ink"),
                      !big && "rounded-[20px]",
                      !big && (mine ? groupedTop && "rounded-tr-md" : groupedTop && "rounded-tl-md"),
                      !big && (mine ? groupedBottom && "rounded-br-md" : groupedBottom && "rounded-bl-md"),
                      m.id.startsWith("tmp-") && "opacity-60",
                    )}
                  >
                    {!mine && !groupedTop && !big && (
                      <p className="text-[12.5px] font-bold mb-0.5" style={{ color: nameColor(author?.username) }}>{displayName(author)}</p>
                    )}
                    {big ? (
                      <span className="text-[42px] leading-none" title={hhmm(m.created_at)}>{m.content}</span>
                    ) : (
                      <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                        {m.content}
                        <span className={cx("float-right ml-2.5 mt-1.5 text-[10.5px] leading-none", mine ? "opacity-75" : "text-muted")}>{hhmm(m.created_at)}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {typers.length > 0 && (
          <div className="flex items-end gap-2 mt-2.5">
            <Avatar profile={typers[0]} size={32} />
            <div className="bg-surface border border-line rounded-[20px] px-4 py-3 flex gap-1" aria-label="En train d'écrire">
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="p-3 border-t border-line flex items-end gap-2 shrink-0 bg-surface"
      >
        <textarea
          ref={areaRef}
          value={text}
          rows={1}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Écrire dans ${group.name}…`}
          maxLength={4000}
          className="field !rounded-[22px] resize-none !py-2.5 leading-snug"
        />
        <button className="w-11 h-11 shrink-0 rounded-full bg-cobalt text-white grid place-items-center disabled:opacity-40 transition" disabled={!text.trim()} aria-label="Envoyer">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

/** Affiché aux visiteurs et aux non-membres à la place de la discussion. */
export function GroupChatLocked({ onJoin, signedIn }: { onJoin: () => void; signedIn: boolean }) {
  return (
    <div className="panel px-6 py-14 text-center">
      <span className="w-14 h-14 rounded-2xl bg-cobalt-soft text-cobalt grid place-items-center mx-auto mb-4"><Users size={26} /></span>
      <p className="font-display text-2xl font-semibold">Discussion réservée aux membres</p>
      <p className="text-muted mt-1.5 max-w-sm mx-auto">{signedIn ? "Rejoins le groupe pour lire les messages et écrire avec les autres membres." : "Connecte-toi puis rejoins le groupe pour participer à la discussion."}</p>
      <button onClick={onJoin} className="btn btn-primary mt-5">{signedIn ? "Rejoindre le groupe" : "Se connecter"}</button>
    </div>
  );
}
