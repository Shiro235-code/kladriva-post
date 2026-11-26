"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { GroupLite, GroupMessage, Member } from "@/lib/types";
import { cx, displayName, firstName, nameColor, plural } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { useActivity, useToast } from "./Providers";
import { Avatar, Spinner } from "./ui";
import { Bubble, CHAT_BG, ChatComposer, DaySeparator, GroupAvatar, ImageViewer, hhmm, uploadChatImage } from "./chat";
import { GroupInfo } from "./GroupInfo";

/**
 * Discussion de groupe façon WhatsApp : nom coloré de l'expéditeur, bulles groupées,
 * images, emojis, « X écrit… », membres en ligne, et panneau « Infos du groupe ».
 */
export function GroupChat({
  group: initial,
  backHref,
  onActivity,
  onLeft,
  className,
}: {
  group: GroupLite;
  backHref?: string;
  onActivity?: () => void;
  onLeft?: () => void;
  className?: string;
}) {
  const { session, profile } = useAuth();
  const { online, refresh } = useActivity();
  const toast = useToast();
  const uid = session?.user.id;
  const [group, setGroup] = useState<GroupLite>(initial);
  const [msgs, setMsgs] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [info, setInfo] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chRef = useRef<ReturnType<ReturnType<typeof sb>["channel"]> | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => setGroup(initial), [initial]);

  const byId = (id: string) => members.find((m) => m.id === id);
  const me = members.find((m) => m.id === uid);
  const isMember = !!me;

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
    const { data } = await sb().from("group_members").select("role, profile:profiles(*)").eq("group_id", group.id).order("joined_at");
    const list = ((data || []) as unknown as { role: Member["role"]; profile: Member | null }[]).filter((r) => r.profile).map((r) => ({ ...r.profile!, role: r.role }));
    setMembers(list);
    return list;
  }, [group.id]);

  const loadGroup = useCallback(async () => {
    const { data } = await sb().from("groups").select("id,name,description,color,icon,avatar_url,created_by").eq("id", group.id).maybeSingle();
    if (data) setGroup(data as GroupLite);
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, (p) => {
        const m = p.new as GroupMessage;
        setMsgs((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
        setTyping((t) => {
          if (!t[m.sender_id]) return t;
          const n = { ...t };
          delete n[m.sender_id];
          return n;
        });
        if (m.sender_id !== uid) markRead();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "group_messages" }, (p) => {
        const id = (p.old as { id: string }).id;
        setMsgs((all) => all.filter((x) => x.id !== id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${group.id}` }, () => loadMembers())
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

  const sendTyping = () => {
    if (Date.now() - lastTypingSent.current > 1500) {
      lastTypingSent.current = Date.now();
      chRef.current?.send({ type: "broadcast", event: "typing", payload: { uid } });
    }
  };

  const send = async (content: string, file: File | null): Promise<boolean> => {
    if (!uid) return false;
    const temp: GroupMessage = {
      id: `tmp-${Date.now()}`,
      group_id: group.id,
      sender_id: uid,
      content,
      image_url: file ? URL.createObjectURL(file) : null,
      created_at: new Date().toISOString(),
    };
    setMsgs((all) => [...all, temp]);
    try {
      const image_url = file ? await uploadChatImage(uid, file) : null;
      const { data, error } = await sb().from("group_messages").insert({ group_id: group.id, sender_id: uid, content, image_url }).select().single();
      if (error) throw new Error(error.message.includes("row-level") ? "Tu ne fais plus partie de ce groupe." : "Message non envoyé. Vérifie ta connexion.");
      setMsgs((all) => (all.some((m) => m.id === data.id) ? all.filter((m) => m.id !== temp.id) : all.map((m) => (m.id === temp.id ? (data as GroupMessage) : m))));
      onActivity?.();
      return true;
    } catch (e) {
      setMsgs((all) => all.filter((m) => m.id !== temp.id));
      toast(e instanceof Error ? e.message : "Message non envoyé.", "error");
      return false;
    }
  };

  const onlineCount = members.filter((m) => online.has(m.id) && m.id !== uid).length;
  const typers = Object.keys(typing).map(byId).filter(Boolean) as Member[];
  const subtitle =
    typers.length > 0 ? (
      <span className="text-mint font-semibold">{typers.length === 1 ? `${firstName(typers[0])} écrit…` : `${typers.length} personnes écrivent…`}</span>
    ) : (
      <span className="truncate">
        {members.length > 0
          ? members
              .slice(0, 6)
              .map((m) => (m.id === uid ? "Toi" : firstName(m)))
              .join(", ") + (members.length > 6 ? "…" : "")
          : plural(members.length, "membre")}
        {onlineCount > 0 && <span className="text-mint font-semibold">{`, ${onlineCount} en ligne`}</span>}
      </span>
    );

  return (
    <div className={cx("flex min-h-0 min-w-0", className)}>
      <div className="flex flex-col min-h-0 min-w-0 flex-1">
        {/* En-tête : clic = infos du groupe, comme WhatsApp */}
        <div className="flex items-center gap-2 px-2 sm:px-4 h-[64px] border-b border-line shrink-0 bg-surface">
          {backHref && (
            <Link href={backHref} className="md:hidden icon-btn" aria-label="Retour aux discussions">
              <ArrowLeft size={20} />
            </Link>
          )}
          <button onClick={() => setInfo((v) => !v)} className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl px-1 py-1 hover:bg-surface-2 transition" aria-label="Infos du groupe">
            <GroupAvatar group={group} size={42} />
            <span className="min-w-0">
              <span className="block font-bold truncate leading-tight">{group.name}</span>
              <span className="block text-[12.5px] text-muted truncate">{subtitle}</span>
            </span>
          </button>
          <button onClick={() => setInfo((v) => !v)} className={cx("icon-btn", info && "!bg-cobalt-soft !text-cobalt")} aria-label="Membres et infos" aria-pressed={info}>
            <Users size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin px-2 sm:px-[6%] py-4 flex flex-col min-h-0" style={CHAT_BG}>
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : msgs.length === 0 ? (
            <div className="m-auto text-center max-w-xs bg-surface/90 border border-line rounded-2xl px-6 py-6">
              <GroupAvatar group={group} size={64} className="mx-auto" />
              <p className="font-display text-xl font-bold mt-3">{group.name}</p>
              <p className="text-muted text-sm mt-1">Les messages sont visibles par les {plural(members.length, "membre")} du groupe. Dis bonjour !</p>
            </div>
          ) : (
            msgs.map((m, i) => {
              const mine = m.sender_id === uid;
              const author = mine ? profile : byId(m.sender_id);
              const prev = msgs[i - 1];
              const next = msgs[i + 1];
              const sameDay = (a?: GroupMessage, b?: GroupMessage) => !!a && !!b && new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString();
              const newDay = !sameDay(prev, m);
              const groupedTop = !newDay && !!prev && prev.sender_id === m.sender_id && +new Date(m.created_at) - +new Date(prev.created_at) < 5 * 60000;
              const groupedBottom = sameDay(m, next) && next!.sender_id === m.sender_id && +new Date(next!.created_at) - +new Date(m.created_at) < 5 * 60000;
              return (
                <div key={m.id} className="flex flex-col">
                  {newDay && <DaySeparator iso={m.created_at} />}
                  <div className={cx("flex items-end gap-1.5", mine ? "justify-end" : "justify-start", groupedTop ? "mt-[3px]" : "mt-2.5")}>
                    {!mine && (
                      <span className="w-8 shrink-0 self-end">
                        {!groupedBottom && (
                          <Link href={`/u/${author?.username || ""}`} aria-label={displayName(author)}>
                            <Avatar profile={author} size={30} />
                          </Link>
                        )}
                      </span>
                    )}
                    <Bubble
                      mine={mine}
                      text={m.content}
                      image={m.image_url}
                      time={hhmm(m.created_at)}
                      delivery={mine ? (m.id.startsWith("tmp-") ? "pending" : "sent") : undefined}
                      name={!mine ? displayName(author) : undefined}
                      nameTone={nameColor(author?.username)}
                      groupedTop={groupedTop}
                      groupedBottom={groupedBottom}
                      onImage={setViewer}
                    />
                  </div>
                </div>
              );
            })
          )}
          {typers.length > 0 && (
            <div className="flex items-end gap-1.5 mt-2.5">
              <span className="w-8 shrink-0"><Avatar profile={typers[0]} size={30} /></span>
              <div className="bg-surface border border-line rounded-[18px] px-4 py-3 flex gap-1" aria-label="En train d'écrire">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {isMember || loading ? (
          <ChatComposer placeholder="Écrire un message" onSend={send} onTyping={sendTyping} disabled={loading} />
        ) : (
          <div className="border-t border-line bg-surface px-4 py-4 text-center text-sm text-muted">Tu ne fais plus partie de ce groupe.</div>
        )}
      </div>

      {info && (
        <GroupInfo
          group={group}
          members={members}
          onClose={() => setInfo(false)}
          onChanged={() => {
            loadGroup();
            loadMembers();
            onActivity?.();
          }}
          onLeft={() => {
            setInfo(false);
            onLeft?.();
          }}
        />
      )}
      <ImageViewer src={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}
