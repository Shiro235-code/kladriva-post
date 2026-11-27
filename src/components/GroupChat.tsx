"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Users } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { GroupLite, GroupMessage, Member } from "@/lib/types";
import { cx, displayName, firstName, nameColor, plural } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { useActivity, useToast } from "./Providers";
import { Avatar, Spinner } from "./ui";
import { Bubble, CHAT_BG, ChatComposer, DaySeparator, GroupAvatar, ImageViewer, hhmm, uploadChatImage, SwipeReply, type ChatReply } from "./chat";
import { GroupInfo } from "./GroupInfo";
import { cleanupUnpublishedVoice, queueUnpublishedVoice, uploadVoice, voiceObjectPath, type VoicePayload } from "./VoiceMessage";

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
  const [typingUnavailable, setTypingUnavailable] = useState(false);
  const [memberReadAt, setMemberReadAt] = useState<Record<string, string>>({});
  const [myReadAt, setMyReadAt] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [replyTargets, setReplyTargets] = useState<Record<string, GroupMessage | null>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [info, setInfo] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingChRef = useRef<ReturnType<ReturnType<typeof sb>["channel"]> | null>(null);
  const typingReady = useRef(false);
  const lastTypingSent = useRef(0);
  const nearBottom = useRef(true);

  useEffect(() => setGroup(initial), [initial]);
  useEffect(() => { if (uid) void cleanupUnpublishedVoice(uid); }, [uid]);

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
    const { data } = await sb().from("group_members").select("role,last_read_at,profile:profiles(*)").eq("group_id", group.id).order("joined_at");
    const rows = (data || []) as unknown as { role: Member["role"]; last_read_at: string | null; profile: Member | null }[];
    const list = rows.filter((r) => r.profile).map((r) => ({ ...r.profile!, role: r.role }));
    setMemberReadAt(Object.fromEntries(rows.filter((r) => r.profile && r.last_read_at).map((r) => [r.profile!.id, r.last_read_at!] )));
    const mine = rows.find((r) => r.profile?.id === uid);
    if (mine?.last_read_at) setMyReadAt((current) => current ?? mine.last_read_at);
    setMembers(list);
    return list;
  }, [group.id, uid]);

  const loadGroup = useCallback(async () => {
    const { data } = await sb().from("groups").select("id,name,description,color,icon,avatar_url,created_by").eq("id", group.id).maybeSingle();
    if (data) setGroup(data as GroupLite);
  }, [group.id]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    let dbChannel: ReturnType<ReturnType<typeof sb>["channel"]> | null = null;
    (async () => {
      const loadedMembers = await loadMembers();
      if (!alive) return;
      if (!loadedMembers.some((member) => member.id === uid)) { setLoading(false); return; }
      const { data } = await sb().from("group_messages").select("*").eq("group_id", group.id).order("created_at", { ascending: false }).limit(500);
      if (!alive) return;
      setMsgs(((data as GroupMessage[]) || []).reverse());
      setLoading(false);
      markRead();
      dbChannel = sb()
        .channel(`group-chat-${group.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, (p) => {
          const m = p.new as GroupMessage;
          setMsgs((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
          if (m.sender_id !== uid) {
            setTyping((current) => { const next = { ...current }; delete next[m.sender_id]; return next; });
            markRead();
          }
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, (p) => {
          const id = (p.old as { id: string }).id;
          setMsgs((all) => all.filter((x) => x.id !== id));
          setReplyTargets((targets) => ({ ...targets, [id]: null }));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${group.id}` }, () => {
          void loadMembers().then((list) => {
            if (!list.some((member) => member.id === uid)) {
              typingReady.current = false;
              if (typingChRef.current) sb().removeChannel(typingChRef.current);
              if (dbChannel) sb().removeChannel(dbChannel);
            }
          });
        })
        .subscribe();
      const typingChannel = sb().channel(`group-typing:${group.id}`, { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: "typing" }, (p) => {
          const who = p.payload?.uid as string;
          if (!who || who === uid || !loadedMembers.some((member) => member.id === who)) return;
          setTyping((t) => ({ ...t, [who]: Date.now() }));
        })
        .subscribe((status) => {
          typingReady.current = status === "SUBSCRIBED";
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setTypingUnavailable(true);
          if (status === "SUBSCRIBED") setTypingUnavailable(false);
        });
      // The user must be a current group member before a private channel is opened.
      typingChRef.current = typingChannel;
    })();

    const sweep = setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        const n: Record<string, number> = {};
        (Object.entries(t) as [string, number][]).forEach(([k, v]) => now - v < 3500 && (n[k] = v));
        return Object.keys(n).length === Object.keys(t).length ? t : n;
      });
    }, 1000);

    return () => {
      alive = false;
      clearInterval(sweep);
      typingReady.current = false;
      if (typingChRef.current) sb().removeChannel(typingChRef.current);
      typingChRef.current = null;
      if (dbChannel) sb().removeChannel(dbChannel);
    };
  }, [group.id, uid, loadMembers, markRead]);

  const typingCount = Object.keys(typing).length;
  useEffect(() => {
    if (nearBottom.current) endRef.current?.scrollIntoView({ behavior: msgs.length > 40 ? "auto" : "smooth", block: "end" });
    else if (msgs.length) setShowRecent(true);
  }, [msgs.length, typingCount]);

  useEffect(() => {
    const ids = [...new Set<string>(msgs.map((message) => message.reply_to_id).filter((id): id is string => !!id))]
      .filter((id) => !msgs.some((message) => message.id === id) && !Object.prototype.hasOwnProperty.call(replyTargets, id)).slice(0, 100);
    if (!ids.length) return;
    void sb().from("group_messages").select("*").eq("group_id", group.id).in("id", ids).then(({ data }) => {
      const found = (data || []) as GroupMessage[];
      setReplyTargets((targets) => ({ ...targets, ...Object.fromEntries(ids.map((id) => [id, found.find((message) => message.id === id) || null])) }));
    });
  }, [msgs, group.id, replyTargets]);

  const sendTyping = () => {
    if (typingReady.current && Date.now() - lastTypingSent.current > 1500) {
      lastTypingSent.current = Date.now();
      typingChRef.current?.send({ type: "broadcast", event: "typing", payload: { uid } });
    }
  };

  const send = async (content: string, file: File | null, replyToId?: string | null, voice?: VoicePayload | null): Promise<boolean> => {
    if (!uid) return false;
    const messageId = voice?.messageId || null;
    const audioPath = voice && messageId ? voiceObjectPath("group", group.id, uid, messageId, voice.extension) : null;
    const temp: GroupMessage = {
      id: messageId || `tmp-${Date.now()}`,
      group_id: group.id,
      sender_id: uid,
      content: voice ? "Message vocal…" : content,
      image_url: voice ? null : file ? URL.createObjectURL(file) : null,
      created_at: new Date().toISOString(),
      reply_to_id: replyToId || null,
      audio_path: null,
      audio_duration_ms: voice?.durationMs ?? null,
    };
    setMsgs((all) => [...all, temp]);
    let audioUploadAttempted = false;
    const confirmMessage = (message: GroupMessage) => setMsgs((all) => [...new Map([...all.filter((item) => item.id !== temp.id && item.id !== message.id), message].map((item) => [item.id, item])).values()].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)));
    try {
      if (voice && messageId && audioPath) {
        const { data: alreadySent, error: lookupError } = await sb().from("group_messages").select("*").eq("id", messageId).eq("group_id", group.id).eq("sender_id", uid).maybeSingle();
        if (lookupError) throw lookupError;
        if (alreadySent) { confirmMessage(alreadySent as GroupMessage); onActivity?.(); return true; }
        audioUploadAttempted = true;
        await uploadVoice(audioPath, voice);
      }
      if (voice && (!messageId || !audioPath)) throw new Error("Impossible de préparer l’identifiant du message vocal. Réessaie.");
      const image_url = voice ? null : file ? await uploadChatImage(uid, file) : null;
      const insert = voice && messageId
        ? { id: messageId, group_id: group.id, sender_id: uid, content: "", image_url: null, audio_path: audioPath, audio_duration_ms: voice.durationMs, reply_to_id: replyToId || null }
        : { group_id: group.id, sender_id: uid, content, image_url, reply_to_id: replyToId || null };
      const { data, error } = await sb().from("group_messages").insert(insert).select().single();
      if (error) throw new Error(error.message.includes("row-level") ? "Tu ne fais plus partie de ce groupe." : "Message non envoyé. Vérifie ta connexion.");
      confirmMessage(data as GroupMessage);
      onActivity?.();
      return true;
    } catch (e) {
      if (voice && messageId && audioUploadAttempted) {
        const { data: committed } = await sb().from("group_messages").select("*").eq("id", messageId).eq("group_id", group.id).eq("sender_id", uid).maybeSingle();
        if (committed) { confirmMessage(committed as GroupMessage); onActivity?.(); return true; }
        if (audioPath) await queueUnpublishedVoice(uid, { kind: "group", scopeId: group.id, messageId, path: audioPath });
      }
      setMsgs((all) => all.filter((m) => m.id !== temp.id));
      toast(e instanceof Error ? e.message : "Message non envoyé.", "error");
      return false;
    }
  };

  const resolveReply = (id?: string | null): ChatReply | null => {
    if (!id) return null;
    const target = msgs.find((message) => message.id === id) || replyTargets[id];
    if (!target) return null;
    const author = target.sender_id === uid ? displayName(profile) : displayName(byId(target.sender_id));
    return { id: target.id, author, content: target.content, image_url: target.image_url, audio_path: target.audio_path, audio_duration_ms: target.audio_duration_ms };
  };
  const startReply = (message: GroupMessage) => {
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
    const { data: target } = await sb().from("group_messages").select("*").eq("group_id", group.id).eq("id", id).maybeSingle();
    if (!target) return toast("Ce message a été supprimé ou n’est plus accessible.", "info");
    const typed = target as GroupMessage;
    const [{ data: before }, { data: after }] = await Promise.all([
      sb().from("group_messages").select("*").eq("group_id", group.id).lt("created_at", typed.created_at).order("created_at", { ascending: false }).limit(8),
      sb().from("group_messages").select("*").eq("group_id", group.id).gt("created_at", typed.created_at).order("created_at", { ascending: true }).limit(8),
    ]);
    const context = [...((before || []) as GroupMessage[]).reverse(), typed, ...((after || []) as GroupMessage[])];
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

  const onlineCount = members.filter((m) => online.has(m.id) && m.id !== uid).length;
  const typers = Object.keys(typing).map(byId).filter(Boolean) as Member[];
  const subtitle =
    typers.length > 0 ? (
      <span className="text-mint font-semibold">{typers.length === 1 ? `${firstName(typers[0])} écrit…` : `${typers.slice(0, 3).map(firstName).join(", ")}${typers.length > 3 ? ` +${typers.length - 3}` : ""} écrivent…`}</span>
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

        <div ref={scrollRef} onScroll={handleThreadScroll} className="relative flex-1 overflow-y-auto scroll-thin px-2 sm:px-[6%] py-4 flex flex-col min-h-0" style={CHAT_BG}>
          {typingUnavailable && <p className="self-center text-[11px] text-muted bg-surface/90 border border-line rounded-full px-3 py-1 mb-2">L’indicateur de saisie nécessite les autorisations Broadcast privées côté Supabase.</p>}
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
              const readCount = mine && !m.id.startsWith("tmp-") ? members.filter((member) => member.id !== uid && memberReadAt[member.id] && new Date(memberReadAt[member.id]) >= new Date(m.created_at)).length : undefined;
              return (
                <div key={m.id} ref={(element) => { messageRefs.current[m.id] = element; }} className={cx("flex flex-col rounded-2xl transition-colors", highlightedId === m.id && "bg-cobalt/10 ring-2 ring-cobalt/30")}>
                  {newDay && <DaySeparator iso={m.created_at} />}
                  {firstUnreadId === m.id && <div className="self-center my-3 rounded-full bg-cobalt-soft px-3 py-1 text-[11px] font-bold text-cobalt">Nouveaux messages</div>}
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
                    <SwipeReply onReply={() => startReply(m)}><Bubble
                      mine={mine}
                      text={m.content}
                      image={m.image_url}
                      audioPath={m.audio_path}
                      audioDurationMs={m.audio_duration_ms}
                      time={hhmm(m.created_at)}
                      delivery={mine ? (m.id.startsWith("tmp-") ? "pending" : "sent") : undefined}
                      readCount={readCount}
                      name={!mine ? displayName(author) : undefined}
                      nameTone={nameColor(author?.username)}
                      groupedTop={groupedTop}
                      groupedBottom={groupedBottom}
                      onImage={setViewer}
                      onReply={() => startReply(m)}
                      hasReply={!!m.reply_to_id}
                      reply={resolveReply(m.reply_to_id)}
                      onJumpReply={jumpToMessage}
                    /></SwipeReply>
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
          {showRecent && <button type="button" onClick={() => { nearBottom.current = true; setShowRecent(false); endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }} className="sticky bottom-3 self-end z-10 btn btn-soft !rounded-full !px-3 !py-2 shadow-[var(--shadow-pop)]"><ArrowDown size={16} /> Messages récents</button>}
        </div>

        {isMember || loading ? (
          <ChatComposer placeholder="Écrire un message" onSend={send} onTyping={sendTyping} disabled={loading} reply={replyTo ? { id: replyTo.id, author: replyTo.sender_id === uid ? displayName(profile) : displayName(byId(replyTo.sender_id)), content: replyTo.content, image_url: replyTo.image_url, audio_path: replyTo.audio_path, audio_duration_ms: replyTo.audio_duration_ms } : null} onCancelReply={() => setReplyTo(null)} />
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
