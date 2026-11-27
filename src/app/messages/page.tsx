"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCheck, Check, MessageSquarePlus, Search, Users, MessagesSquare, Image as ImageIcon, ArrowDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useActivity, useToast } from "@/components/Providers";
import { Avatar, Modal, Spinner } from "@/components/ui";
import { GroupChat } from "@/components/GroupChat";
import { NewGroup } from "@/components/NewGroup";
import { PeoplePicker } from "@/components/PeoplePicker";
import { Bubble, CHAT_BG, ChatComposer, DaySeparator, GroupAvatar, ImageViewer, hhmm, uploadChatImage, SwipeReply, type ChatReply } from "@/components/chat";
import { sb } from "@/lib/supabase";
import type { GroupLite, Message, Profile } from "@/lib/types";
import { cx, displayName, firstName } from "@/lib/utils";

type Row = {
  key: string;
  kind: "dm" | "group";
  id: string;
  title: string;
  at: string | null;
  preview: string;
  previewImage: boolean;
  who: string;
  mineLast: boolean;
  seenByOther: boolean;
  unread: number;
  other?: Profile | null;
  otherReadAt?: string | null;
  myReadAt?: string | null;
  group?: GroupLite;
};

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesInner />
    </Suspense>
  );
}

function listTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(iso);
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === y.toDateString()) return "Hier";
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString("fr-FR", { weekday: "long" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function MessagesInner() {
  const { session, loading: authLoading } = useAuth();
  const { online, refresh } = useActivity();
  const params = useSearchParams();
  const router = useRouter();
  const activeDm = params.get("c");
  const activeGroup = params.get("g");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"all" | "unread" | "groups">("all");
  const uid = session?.user.id;

  const load = useCallback(async () => {
    if (!uid) return;
    const [{ data: convData }, { data: gm }] = await Promise.all([
      sb().from("conversations").select("id, last_message_at, conversation_members(user_id, last_read_at, profile:profiles(*))").order("last_message_at", { ascending: false }),
      sb().from("group_members").select("last_read_at, group:groups(id,name,description,color,icon,avatar_url,created_by,last_message_at)").eq("user_id", uid),
    ]);
    const convs = (convData || []) as unknown as { id: string; last_message_at: string; conversation_members: { user_id: string; last_read_at: string; profile: Profile }[] }[];
    const groups = ((gm || []) as unknown as { last_read_at: string; group: (GroupLite & { last_message_at: string | null }) | null }[])
      .filter((r, i, all) => r.group && all.findIndex((x) => x.group?.id === r.group!.id) === i);

    const convIds = convs.map((c) => c.id);
    const groupIds = groups.map((g) => g.group!.id);
    const [{ data: dmMsgs }, { data: gMsgs }] = await Promise.all([
      convIds.length
        ? sb().from("messages").select("conversation_id, content, image_url, sender_id, created_at").in("conversation_id", convIds).order("created_at", { ascending: false }).limit(400)
        : Promise.resolve({ data: [] as { conversation_id: string; content: string; image_url: string | null; sender_id: string; created_at: string }[] }),
      groupIds.length
        ? sb().from("group_messages").select("group_id, content, image_url, sender_id, created_at, sender:profiles!group_messages_sender_id_fkey(full_name,username)").in("group_id", groupIds).order("created_at", { ascending: false }).limit(400)
        : Promise.resolve({ data: [] }),
    ]);

    const out: Row[] = [];
    for (const c of convs) {
      const me = c.conversation_members.find((m) => m.user_id === uid);
      const o = c.conversation_members.find((m) => m.user_id !== uid);
      const msgs = (dmMsgs || []).filter((m) => m.conversation_id === c.id);
      const last = msgs[0];
      if (!last && c.id !== activeDm) continue;
      const unread = me ? msgs.filter((m) => m.sender_id !== uid && new Date(m.created_at) > new Date(me.last_read_at)).length : 0;
      out.push({
        key: `dm-${c.id}`,
        kind: "dm",
        id: c.id,
        title: displayName(o?.profile),
        at: last?.created_at || c.last_message_at,
        preview: last?.content || (last?.image_url ? "Photo" : "Nouvelle conversation"),
        previewImage: !!last?.image_url,
        who: "",
        mineLast: last?.sender_id === uid,
        seenByOther: !!last && !!o && new Date(o.last_read_at) >= new Date(last.created_at),
        unread: c.id === activeDm ? 0 : unread,
        other: o?.profile ?? null,
        otherReadAt: o?.last_read_at ?? null,
        myReadAt: me?.last_read_at ?? null,
      });
    }
    type GM = { group_id: string; content: string; image_url: string | null; sender_id: string; created_at: string; sender: { full_name: string; username: string } | null };
    for (const r of groups) {
      const g = r.group!;
      const msgs = ((gMsgs || []) as unknown as GM[]).filter((m) => m.group_id === g.id);
      const last = msgs[0];
      const unread = msgs.filter((m) => m.sender_id !== uid && new Date(m.created_at) > new Date(r.last_read_at)).length;
      out.push({
        key: `g-${g.id}`,
        kind: "group",
        id: g.id,
        title: g.name,
        at: last?.created_at || g.last_message_at,
        preview: last ? last.content || (last.image_url ? "Photo" : "") : "Groupe créé, dis bonjour",
        previewImage: !!last?.image_url,
        who: last ? (last.sender_id === uid ? "Toi" : firstName(last.sender)) : "",
        mineLast: last?.sender_id === uid,
        seenByOther: false,
        unread: g.id === activeGroup ? 0 : unread,
        group: g,
      });
    }
    out.sort((a, b) => +new Date(b.at || 0) - +new Date(a.at || 0));
    setRows(out);
    setLoading(false);
  }, [uid, activeDm, activeGroup]);

  useEffect(() => {
    if (!authLoading && !session) router.replace(`/auth?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [authLoading, session, router]);

  useEffect(() => {
    load();
    if (!uid) return;
    const ch = sb()
      .channel(`inbox-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => load())
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [load, uid]);

  const f = filter.trim().toLowerCase();
  const shown = rows.filter((r) => (!f || r.title.toLowerCase().includes(f)) && (tab === "all" || (tab === "unread" ? r.unread > 0 : r.kind === "group")));
  const currentDm = rows.find((r) => r.kind === "dm" && r.id === activeDm);
  const currentGroup = rows.find((r) => r.kind === "group" && r.id === activeGroup)?.group;
  const anyActive = !!activeDm || !!activeGroup;
  const unreadTotal = rows.filter((r) => r.unread > 0).length;

  const afterActivity = () => {
    load();
    refresh();
  };

  return (
    <AppShell chat>
      <div className="h-[calc(100dvh-124px)] lg:h-[100dvh] flex bg-surface lg:border-l border-line">
        {/* Liste des discussions */}
        <section className={cx("w-full md:w-[380px] 2xl:w-[420px] md:border-r border-line flex flex-col min-h-0 shrink-0", anyActive && "hidden md:flex")}>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h1 className="font-display text-[26px] font-bold">Discussions</h1>
            <div className="flex gap-1">
              <button onClick={() => setNewGroup(true)} className="icon-btn" title="Nouveau groupe" aria-label="Nouveau groupe"><Users size={20} /></button>
              <button onClick={() => setPicker(true)} className="icon-btn" title="Nouvelle discussion" aria-label="Nouvelle discussion"><MessageSquarePlus size={20} /></button>
            </div>
          </div>
          <div className="px-3 pb-2">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Rechercher une discussion" className="field !rounded-xl !pl-9 !py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-1.5 px-3 pb-2">
            {(
              [
                ["all", "Toutes"],
                ["unread", unreadTotal ? `Non lues ${unreadTotal}` : "Non lues"],
                ["groups", "Groupes"],
              ] as const
            ).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} className={cx("px-3 py-1 rounded-full text-[13px] font-semibold transition", tab === t ? "bg-cobalt-soft text-cobalt" : "bg-surface-2 text-ink-2 hover:bg-line")}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin">
            {loading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : rows.length === 0 ? (
              <div className="text-center px-6 py-12">
                <span className="w-14 h-14 rounded-2xl bg-cobalt-soft text-cobalt grid place-items-center mx-auto"><MessagesSquare size={26} /></span>
                <p className="font-display text-xl font-semibold mt-3">Aucune discussion</p>
                <p className="text-sm text-muted mt-1">Écris à un apprenant ou crée un groupe.</p>
                <div className="flex justify-center gap-2 mt-4">
                  <button onClick={() => setPicker(true)} className="btn btn-primary">Nouvelle discussion</button>
                  <button onClick={() => setNewGroup(true)} className="btn btn-soft">Nouveau groupe</button>
                </div>
              </div>
            ) : shown.length === 0 ? (
              <p className="text-center text-sm text-muted py-10">Aucune discussion ici.</p>
            ) : (
              shown.map((r) => {
                const active = (r.kind === "dm" && r.id === activeDm) || (r.kind === "group" && r.id === activeGroup);
                return (
                  <Link
                    key={r.key}
                    href={r.kind === "dm" ? `/messages?c=${r.id}` : `/messages?g=${r.id}`}
                    className={cx("flex items-center gap-3 pl-3 pr-4 py-2.5 transition", active ? "bg-cobalt-soft/70" : "hover:bg-surface-2")}
                  >
                    {r.kind === "group" ? <GroupAvatar group={r.group!} size={52} /> : <Avatar profile={r.other} size={52} online={!!r.other && online.has(r.other.id)} />}
                    <div className="min-w-0 flex-1 border-b border-line/70 pb-2.5 -mb-2.5 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold text-[15.5px]">{r.title}</p>
                        <span className={cx("text-[12px] shrink-0", r.unread ? "text-cobalt font-bold" : "text-muted")}>{listTime(r.at)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className={cx("text-[13.5px] truncate flex-1 flex items-center gap-1", r.unread ? "text-ink font-medium" : "text-muted")}>
                          {r.kind === "dm" && r.mineLast && (r.seenByOther ? <CheckCheck size={15} className="text-cobalt shrink-0" /> : <Check size={15} className="shrink-0" />)}
                          {r.kind === "group" && r.who && <span className="shrink-0">{r.who} :</span>}
                          {r.previewImage && <ImageIcon size={14} className="shrink-0" />}
                          <span className="truncate">{r.preview}</span>
                        </p>
                        {r.unread > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-cobalt text-white text-[11px] font-bold grid place-items-center shrink-0">{r.unread > 99 ? "99+" : r.unread}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        {/* Discussion ouverte : plein écran sur mobile pour laisser la place d'écrire */}
        <section className={cx("flex-1 min-w-0 min-h-0 flex", anyActive ? "fixed inset-0 z-40 bg-surface md:static md:z-auto" : "hidden md:flex")}>
          {activeGroup && uid && currentGroup ? (
            <GroupChat key={activeGroup} group={currentGroup} backHref="/messages" className="flex-1" onActivity={afterActivity} onLeft={() => { router.push("/messages"); afterActivity(); }} />
          ) : activeDm && uid ? (
            <DmThread key={activeDm} convId={activeDm} row={currentDm} uid={uid} online={!!currentDm?.other && online.has(currentDm.other.id)} onActivity={afterActivity} />
          ) : anyActive && loading ? (
            <div className="flex-1 grid place-items-center"><Spinner /></div>
          ) : anyActive ? (
            <div className="flex-1 grid place-items-center text-center p-10">
              <div>
                <p className="font-display text-xl font-bold">Discussion introuvable</p>
                <p className="text-muted mt-1">Tu n&apos;en fais peut-être plus partie.</p>
                <Link href="/messages" className="btn btn-primary mt-4">Retour aux discussions</Link>
              </div>
            </div>
          ) : (
            <div className="flex-1 grid place-items-center text-center p-10" style={CHAT_BG}>
              <div className="max-w-sm">
                <div className="w-20 h-20 rounded-3xl bg-cobalt-soft text-cobalt grid place-items-center mx-auto"><MessagesSquare size={36} strokeWidth={1.8} /></div>
                <p className="font-display text-2xl font-bold mt-4">Kladriva Post Messages</p>
                <p className="text-muted mt-1.5">Échange en privé avec un apprenant ou discute avec tout ton groupe, en temps réel.</p>
                <div className="flex justify-center gap-2 mt-5">
                  <button onClick={() => setPicker(true)} className="btn btn-primary">Nouvelle discussion</button>
                  <button onClick={() => setNewGroup(true)} className="btn btn-soft">Nouveau groupe</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
      {uid && <StartDm uid={uid} open={picker} onClose={() => setPicker(false)} onNewGroup={() => { setPicker(false); setNewGroup(true); }} />}
      <NewGroup open={newGroup} onClose={() => setNewGroup(false)} onCreated={(id) => { router.push(`/messages?g=${id}`); afterActivity(); }} />
    </AppShell>
  );
}

/* ---------------- Discussion privée ---------------- */
function DmThread({ convId, row, uid, online, onActivity }: { convId: string; row?: Row; uid: string; online: boolean; onActivity: () => void }) {
  const toast = useToast();
  const { profile } = useAuth();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const [typingUnavailable, setTypingUnavailable] = useState(false);
  const [other, setOther] = useState<Profile | null>(row?.other ?? null);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(row?.otherReadAt ?? null);
  const [myReadAt, setMyReadAt] = useState<string | null>(row?.myReadAt ?? null);
  const initialReadAt = useRef({ mine: row?.myReadAt ?? null, other: row?.otherReadAt ?? null });
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [replyTargets, setReplyTargets] = useState<Record<string, Message | null>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingChRef = useRef<ReturnType<ReturnType<typeof sb>["channel"]> | null>(null);
  const typingReady = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const nearBottom = useRef(true);

  useEffect(() => {
    if (row?.otherReadAt) setOtherReadAt(row.otherReadAt);
  }, [row?.otherReadAt]);

  const markRead = useCallback(() => {
    sb().from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", convId).eq("user_id", uid).then(() => onActivity());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, uid]);

  useEffect(() => {
    let alive = true;
    let dbChannel: ReturnType<ReturnType<typeof sb>["channel"]> | null = null;
    let typingChannel: ReturnType<ReturnType<typeof sb>["channel"]> | null = null;
    const initialize = async () => {
      // Confirm membership before opening a conversation-scoped private typing channel.
      const { data: membership } = await sb().from("conversation_members")
        .select("user_id,last_read_at,profile:profiles(*)").eq("conversation_id", convId);
      if (!alive) return;
      const participants = (membership || []) as unknown as { user_id: string; last_read_at: string; profile: Profile }[];
      const self = participants.find((member) => member.user_id === uid);
      if (!self) { setLoading(false); return; }
      const recipient = participants.find((member) => member.user_id !== uid);
      if (recipient?.profile) setOther(recipient.profile);
      setOtherReadAt(recipient?.last_read_at ?? initialReadAt.current.other);
      setMyReadAt((current) => current ?? self.last_read_at ?? initialReadAt.current.mine);

      const { data } = await sb().from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(500);
      if (!alive) return;
      setMsgs(((data as Message[]) || []).reverse());
      setLoading(false);
      markRead();

      dbChannel = sb().channel(`thread-${convId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, (p) => {
          const m = p.new as Message;
          setMsgs((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
          if (m.sender_id !== uid) { setTyping(false); markRead(); }
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, (p) => {
          const id = (p.old as { id?: string }).id;
          if (id) {
            setMsgs((all) => all.filter((message) => message.id !== id));
            setReplyTargets((targets) => ({ ...targets, [id]: null }));
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${convId}` }, (p) => {
          const r = p.new as { user_id: string; last_read_at: string };
          if (r.user_id !== uid) setOtherReadAt(r.last_read_at);
        })
        .subscribe();
      if (recipient) {
        typingChannel = sb().channel(`dm-typing:${convId}`, { config: { private: true, broadcast: { self: false } } })
          .on("broadcast", { event: "typing" }, (p) => {
            if (p.payload?.uid !== recipient.user_id) return;
            setTyping(true);
            if (typingTimer.current) clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setTyping(false), 3500);
          })
          .subscribe((status) => {
            typingReady.current = status === "SUBSCRIBED";
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setTypingUnavailable(true);
            if (status === "SUBSCRIBED") setTypingUnavailable(false);
          });
        typingChRef.current = typingChannel;
      }
    };
    void initialize();
    return () => {
      alive = false;
      typingReady.current = false;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (dbChannel) sb().removeChannel(dbChannel);
      if (typingChannel) sb().removeChannel(typingChannel);
      typingChRef.current = null;
    };
  }, [convId, uid, markRead]);

  useEffect(() => {
    if (nearBottom.current) endRef.current?.scrollIntoView({ behavior: msgs.length > 40 ? "auto" : "smooth", block: "end" });
    else if (msgs.length) setShowRecent(true);
  }, [msgs.length, typing]);

  useEffect(() => {
    const ids = [...new Set<string>(msgs.map((message) => message.reply_to_id).filter((id): id is string => !!id))]
      .filter((id) => !msgs.some((message) => message.id === id) && !Object.prototype.hasOwnProperty.call(replyTargets, id)).slice(0, 100);
    if (!ids.length) return;
    void sb().from("messages").select("*").eq("conversation_id", convId).in("id", ids).then(({ data }) => {
      const found = (data || []) as Message[];
      setReplyTargets((targets) => ({ ...targets, ...Object.fromEntries(ids.map((id) => [id, found.find((message) => message.id === id) || null])) }));
    });
  }, [msgs, convId, replyTargets]);

  const sendTyping = () => {
    if (typingReady.current && Date.now() - lastTypingSent.current > 1500) {
      lastTypingSent.current = Date.now();
      typingChRef.current?.send({ type: "broadcast", event: "typing", payload: { uid } });
    }
  };

  const send = async (content: string, file: File | null, replyToId?: string | null) => {
    const temp: Message = { id: `tmp-${Date.now()}`, conversation_id: convId, sender_id: uid, content, image_url: file ? URL.createObjectURL(file) : null, created_at: new Date().toISOString(), reply_to_id: replyToId || null };
    setMsgs((all) => [...all, temp]);
    try {
      const image_url = file ? await uploadChatImage(uid, file) : null;
      const { data, error } = await sb().from("messages").insert({ conversation_id: convId, sender_id: uid, content, image_url, reply_to_id: replyToId || null }).select().single();
      if (error) throw error;
      setMsgs((all) => (all.some((m) => m.id === data.id) ? all.filter((m) => m.id !== temp.id) : all.map((m) => (m.id === temp.id ? (data as Message) : m))));
      onActivity();
      return true;
    } catch {
      setMsgs((all) => all.filter((m) => m.id !== temp.id));
      toast("Message non envoyé. Vérifie ta connexion.", "error");
      return false;
    }
  };

  const resolveReply = (id?: string | null): ChatReply | null => {
    if (!id) return null;
    const target = msgs.find((message) => message.id === id) || replyTargets[id];
    if (!target) return null;
    return { id: target.id, author: target.sender_id === uid ? displayName(profile) : displayName(other), content: target.content, image_url: target.image_url };
  };
  const startReply = (message: Message) => {
    if (message.id.startsWith("tmp-")) return toast("Attends que le message soit enregistré avant d’y répondre.", "info");
    setReplyTo(message);
  };
  const jumpToMessage = async (id: string) => {
    const jump = () => {
      const element = messageRefs.current[id];
      if (!element) return false;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      setTimeout(() => setHighlightedId((current) => current === id ? null : current), 1600);
      return true;
    };
    if (jump()) return;
    const { data: target } = await sb().from("messages").select("*").eq("conversation_id", convId).eq("id", id).maybeSingle();
    if (!target) return toast("Ce message a été supprimé ou n’est plus accessible.", "info");
    const typed = target as Message;
    const [{ data: before }, { data: after }] = await Promise.all([
      sb().from("messages").select("*").eq("conversation_id", convId).lt("created_at", typed.created_at).order("created_at", { ascending: false }).limit(8),
      sb().from("messages").select("*").eq("conversation_id", convId).gt("created_at", typed.created_at).order("created_at", { ascending: true }).limit(8),
    ]);
    const context = [...((before || []) as Message[]).reverse(), typed, ...((after || []) as Message[])];
    setMsgs((all) => [...new Map([...all, ...context].map((message) => [message.id, message])).values()].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)));
    setTimeout(jump, 80);
  };
  const handleThreadScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 110;
    setShowRecent(!nearBottom.current);
  };
  const firstUnreadId = myReadAt ? msgs.find((message) => message.sender_id !== uid && new Date(message.created_at) > new Date(myReadAt))?.id : null;

  const readAt = otherReadAt ? new Date(otherReadAt) : null;

  return (
    <div className="flex flex-col min-h-0 min-w-0 flex-1">
      <div className="flex items-center gap-2 px-2 sm:px-4 h-[64px] border-b border-line shrink-0 bg-surface">
        <Link href="/messages" className="md:hidden icon-btn" aria-label="Retour aux discussions"><ArrowLeft size={20} /></Link>
        {other && (
          <Link href={`/u/${other.username}`} className="flex items-center gap-3 min-w-0 flex-1 rounded-xl px-1 py-1 hover:bg-surface-2">
            <Avatar profile={other} size={42} online={online} />
            <span className="min-w-0">
              <span className="block font-bold truncate leading-tight">{displayName(other)}</span>
              <span className={cx("block text-[12.5px] truncate", typing || online ? "text-mint font-semibold" : "text-muted")}>
                {typing ? "écrit…" : online ? "en ligne" : `@${other.username}`}
              </span>
            </span>
          </Link>
        )}
      </div>
      <div ref={scrollRef} onScroll={handleThreadScroll} className="relative flex-1 overflow-y-auto scroll-thin px-2 sm:px-[6%] py-4 flex flex-col min-h-0" style={CHAT_BG}>
        {typingUnavailable && <p className="self-center text-[11px] text-muted bg-surface/90 border border-line rounded-full px-3 py-1 mb-2">L’indicateur de saisie nécessite les autorisations Broadcast privées côté Supabase.</p>}
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : msgs.length === 0 ? (
          <div className="m-auto text-center bg-surface/90 border border-line rounded-2xl px-6 py-6 max-w-xs">
            {other && <Avatar profile={other} size={64} className="mx-auto" />}
            <p className="font-display text-xl font-bold mt-3">{displayName(other)}</p>
            <p className="text-muted text-sm mt-1">Dis bonjour à {firstName(other)}.</p>
          </div>
        ) : (
          msgs.map((m, i) => {
            const mine = m.sender_id === uid;
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            const sameDay = (a?: Message, b?: Message) => !!a && !!b && new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString();
            const newDay = !sameDay(prev, m);
            const groupedTop = !newDay && !!prev && prev.sender_id === m.sender_id && +new Date(m.created_at) - +new Date(prev.created_at) < 5 * 60000;
            const groupedBottom = sameDay(m, next) && next!.sender_id === m.sender_id && +new Date(next!.created_at) - +new Date(m.created_at) < 5 * 60000;
            const delivery = m.id.startsWith("tmp-") ? "pending" : readAt && readAt >= new Date(m.created_at) ? "read" : "sent";
            return (
              <div key={m.id} ref={(element) => { messageRefs.current[m.id] = element; }} className={cx("flex flex-col rounded-2xl transition-colors", highlightedId === m.id && "bg-cobalt/10 ring-2 ring-cobalt/30")}>
                {newDay && <DaySeparator iso={m.created_at} />}
                {firstUnreadId === m.id && <div className="self-center my-3 rounded-full bg-cobalt-soft px-3 py-1 text-[11px] font-bold text-cobalt">Nouveaux messages</div>}
                <div className={cx("flex", mine ? "justify-end" : "justify-start", groupedTop ? "mt-[3px]" : "mt-2.5")}>
                  <SwipeReply onReply={() => startReply(m)}><Bubble mine={mine} text={m.content} image={m.image_url} time={hhmm(m.created_at)} delivery={mine ? delivery : undefined} groupedTop={groupedTop} groupedBottom={groupedBottom} onImage={setViewer} onReply={() => startReply(m)} hasReply={!!m.reply_to_id} reply={resolveReply(m.reply_to_id)} onJumpReply={jumpToMessage} /></SwipeReply>
                </div>
              </div>
            );
          })
        )}
        {typing && (
          <div className="flex mt-2.5">
            <div className="bg-surface border border-line rounded-[18px] px-4 py-3 flex gap-1" aria-label="En train d'écrire">
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
        {showRecent && <button type="button" onClick={() => { nearBottom.current = true; setShowRecent(false); endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }} className="sticky bottom-3 self-end z-10 btn btn-soft !rounded-full !px-3 !py-2 shadow-[var(--shadow-pop)]"><ArrowDown size={16} /> Messages récents</button>}
      </div>
      <ChatComposer placeholder="Écrire un message" onSend={send} onTyping={sendTyping} reply={replyTo ? { id: replyTo.id, author: replyTo.sender_id === uid ? displayName(profile) : displayName(other), content: replyTo.content, image_url: replyTo.image_url } : null} onCancelReply={() => setReplyTo(null)} />
      <ImageViewer src={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

/* ---------------- Nouvelle discussion ---------------- */
function StartDm({ uid, open, onClose, onNewGroup }: { uid: string; open: boolean; onClose: () => void; onNewGroup: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const exclude = useMemo(() => [uid], [uid]);
  const start = async (p: Profile) => {
    const { data, error } = await sb().rpc("get_or_create_dm", { other: p.id });
    if (error || !data) return toast("Impossible d'ouvrir la discussion.", "error");
    onClose();
    router.push(`/messages?c=${data}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle discussion">
      <div className="px-5 pb-5">
        <button onClick={onNewGroup} className="w-full flex items-center gap-3 px-1 py-2 mb-3 rounded-2xl hover:bg-surface-2 text-left">
          <span className="w-11 h-11 rounded-full bg-cobalt text-white grid place-items-center"><Users size={20} /></span>
          <span className="font-semibold">Nouveau groupe</span>
        </button>
        <PeoplePicker exclude={exclude} onPick={start} />
      </div>
    </Modal>
  );
}
