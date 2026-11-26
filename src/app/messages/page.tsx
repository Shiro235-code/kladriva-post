"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, PenSquare, Send, Search, CheckCheck, MessagesSquare } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useActivity, useToast } from "@/components/Providers";
import { Avatar, Modal, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Message, Profile } from "@/lib/types";
import { cx, displayName, firstName, timeAgo } from "@/lib/utils";

type Conv = { id: string; last_message_at: string; other: Profile | null; otherReadAt: string | null; preview: string; mineLast: boolean; unread: boolean };

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const { session, loading: authLoading } = useAuth();
  const { online, refresh } = useActivity();
  const params = useSearchParams();
  const router = useRouter();
  const active = params.get("c");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState("");
  const uid = session?.user.id;

  const loadConvs = useCallback(async () => {
    if (!uid) return;
    const { data } = await sb()
      .from("conversations")
      .select("id, last_message_at, conversation_members(user_id, last_read_at, profile:profiles(*))")
      .order("last_message_at", { ascending: false });
    const rows = (data || []) as unknown as {
      id: string;
      last_message_at: string;
      conversation_members: { user_id: string; last_read_at: string; profile: Profile }[];
    }[];
    const ids = rows.map((r) => r.id);
    const previews: Record<string, { text: string; mine: boolean }> = {};
    if (ids.length) {
      const { data: msgs } = await sb()
        .from("messages")
        .select("conversation_id, content, sender_id")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);
      for (const m of msgs || []) if (!previews[m.conversation_id]) previews[m.conversation_id] = { text: m.content, mine: m.sender_id === uid };
    }
    setConvs(
      rows
        .filter((r) => previews[r.id] || r.id === active)
        .map((r) => {
          const me = r.conversation_members.find((m) => m.user_id === uid);
          const o = r.conversation_members.find((m) => m.user_id !== uid);
          return {
            id: r.id,
            last_message_at: r.last_message_at,
            other: o?.profile ?? null,
            otherReadAt: o?.last_read_at ?? null,
            preview: previews[r.id]?.text || "Nouvelle conversation",
            mineLast: previews[r.id]?.mine ?? false,
            unread: !!me && new Date(r.last_message_at) > new Date(me.last_read_at) && r.id !== active && !previews[r.id]?.mine,
          };
        }),
    );
    setLoading(false);
  }, [uid, active]);

  useEffect(() => {
    if (!authLoading && !session) router.replace("/auth");
  }, [authLoading, session, router]);

  useEffect(() => {
    loadConvs();
    if (!uid) return;
    const ch = sb()
      .channel(`inbox-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => loadConvs())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members" }, () => loadConvs())
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [loadConvs, uid]);

  const current = convs.find((c) => c.id === active);
  const shown = convs.filter((c) => !filter || displayName(c.other).toLowerCase().includes(filter.toLowerCase()));

  return (
    <AppShell wide>
      <div className="panel overflow-hidden h-[calc(100dvh-156px)] lg:h-[calc(100dvh-44px)] flex">
        <div className={cx("w-full md:w-[340px] 2xl:w-[400px] md:border-r border-line flex flex-col", active && "hidden md:flex")}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h1 className="font-display text-2xl font-bold">Messages</h1>
            <button onClick={() => setPicker(true)} className="w-10 h-10 rounded-full bg-cobalt text-white grid place-items-center" title="Nouveau message" aria-label="Nouveau message">
              <PenSquare size={17} />
            </button>
          </div>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Chercher une conversation" className="field !rounded-full !pl-9 !py-2 text-sm" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin px-2 pb-2">
            {loading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : convs.length === 0 ? (
              <div className="text-center px-6 py-12">
                <span className="w-14 h-14 rounded-2xl bg-cobalt-soft text-cobalt grid place-items-center mx-auto"><MessagesSquare size={26} /></span>
                <p className="font-display text-xl font-semibold mt-2">Aucune conversation</p>
                <p className="text-sm text-muted mt-1">Écris à un apprenant pour échanger en privé.</p>
                <button onClick={() => setPicker(true)} className="btn btn-primary mt-4">Nouveau message</button>
              </div>
            ) : (
              shown.map((c) => (
                <Link key={c.id} href={`/messages?c=${c.id}`} className={cx("flex items-center gap-3 p-3 rounded-2xl transition", c.id === active ? "bg-cobalt-soft" : "hover:bg-surface-2")}>
                  <Avatar profile={c.other} size={50} online={!!c.other && online.has(c.other.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cx("truncate", c.unread ? "font-bold" : "font-semibold")}>{displayName(c.other)}</p>
                      <span className={cx("text-xs shrink-0", c.unread ? "text-cobalt font-bold" : "text-muted")}>{timeAgo(c.last_message_at)}</span>
                    </div>
                    <p className={cx("text-sm truncate", c.unread ? "text-ink font-semibold" : "text-muted")}>
                      {c.mineLast && "Toi : "}
                      {c.preview}
                    </p>
                  </div>
                  {c.unread && <span className="w-2.5 h-2.5 rounded-full bg-cobalt shrink-0" />}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className={cx("flex-1 flex-col min-w-0", active ? "flex" : "hidden md:flex")}>
          {active && uid ? (
            <Thread key={active} convId={active} conv={current} uid={uid} online={!!current?.other && online.has(current.other.id)} onActivity={() => { loadConvs(); refresh(); }} />
          ) : (
            <div className="flex-1 grid place-items-center text-center p-10">
              <div>
                <div className="w-20 h-20 rounded-3xl bg-cobalt-soft text-cobalt grid place-items-center mx-auto"><MessagesSquare size={36} strokeWidth={1.8} /></div>
                <p className="font-display text-2xl font-bold mt-4">Tes messages privés</p>
                <p className="text-muted mt-1 max-w-xs mx-auto">Choisis une conversation, ou écris à quelqu&apos;un de ta promo.</p>
                <button onClick={() => setPicker(true)} className="btn btn-primary mt-5">Nouveau message</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {uid && <PeoplePicker uid={uid} open={picker} onClose={() => setPicker(false)} />}
    </AppShell>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

const onlyEmoji = (s: string) => /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,8}$/u.test(s.trim()) && !/^[\d#*\s]+$/.test(s.trim());

function Thread({ convId, conv, uid, online, onActivity }: { convId: string; conv?: Conv; uid: string; online: boolean; onActivity: () => void }) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(conv?.otherReadAt ?? null);
  const endRef = useRef<HTMLDivElement>(null);
  const chRef = useRef<ReturnType<ReturnType<typeof sb>["channel"]> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const other = conv?.other ?? null;

  useEffect(() => setOtherReadAt(conv?.otherReadAt ?? null), [conv?.otherReadAt]);

  const markRead = useCallback(() => {
    sb().from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", convId).eq("user_id", uid).then(() => onActivity());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, uid]);

  useEffect(() => {
    let alive = true;
    sb()
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data }) => {
        if (!alive) return;
        setMsgs((data as Message[]) || []);
        setLoading(false);
      });
    markRead();
    const ch = sb()
      .channel(`thread-${convId}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, (p) => {
        const m = p.new as Message;
        setMsgs((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
        if (m.sender_id !== uid) {
          setTyping(false);
          markRead();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${convId}` }, (p) => {
        const r = p.new as { user_id: string; last_read_at: string };
        if (r.user_id !== uid) setOtherReadAt(r.last_read_at);
      })
      .on("broadcast", { event: "typing" }, (p) => {
        if (p.payload?.uid === uid) return;
        setTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 3000);
      })
      .subscribe();
    chRef.current = ch;
    return () => {
      alive = false;
      sb().removeChannel(ch);
    };
  }, [convId, uid, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: msgs.length > 30 ? "auto" : "smooth" });
  }, [msgs.length, typing]);

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
    if (!content) return;
    setText("");
    const temp: Message = { id: `tmp-${Date.now()}`, conversation_id: convId, sender_id: uid, content, created_at: new Date().toISOString() };
    setMsgs((all) => [...all, temp]);
    const { data, error } = await sb().from("messages").insert({ conversation_id: convId, sender_id: uid, content }).select().single();
    if (error) {
      setMsgs((all) => all.filter((m) => m.id !== temp.id));
      setText(content);
      return toast("Message non envoyé. Vérifie ta connexion.", "error");
    }
    setMsgs((all) => (all.some((m) => m.id === data.id) ? all.filter((m) => m.id !== temp.id) : all.map((m) => (m.id === temp.id ? (data as Message) : m))));
    onActivity();
  };

  const lastMine = [...msgs].reverse().find((m) => m.sender_id === uid);
  const seen = !!lastMine && !!otherReadAt && new Date(otherReadAt) >= new Date(lastMine.created_at);

  return (
    <>
      <div className="flex items-center gap-3 px-4 h-[68px] border-b border-line shrink-0">
        <Link href="/messages" className="md:hidden icon-btn -ml-2" aria-label="Retour aux conversations"><ArrowLeft size={19} /></Link>
        {other && (
          <Link href={`/u/${other.username}`} className="flex items-center gap-3 min-w-0">
            <Avatar profile={other} size={42} online={online} />
            <div className="min-w-0">
              <p className="font-bold truncate">{displayName(other)}</p>
              <p className={cx("text-xs truncate", online ? "text-mint font-semibold" : "text-muted")}>{typing ? "écrit…" : online ? "En ligne" : `@${other.username}`}</p>
            </div>
          </Link>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-3 sm:px-5 py-5 flex flex-col bg-surface-2/60">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : msgs.length === 0 ? (
          <div className="m-auto text-center">
            {other && <Avatar profile={other} size={72} className="mx-auto" />}
            <p className="font-display text-xl font-bold mt-3">{displayName(other)}</p>
            <p className="text-muted text-sm mt-1">Dis bonjour à {firstName(other)}.</p>
          </div>
        ) : (
          msgs.map((m, i) => {
            const mine = m.sender_id === uid;
            const prev = msgs[i - 1];
            const nextM = msgs[i + 1];
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const groupedTop = !!prev && prev.sender_id === m.sender_id && !newDay && +new Date(m.created_at) - +new Date(prev.created_at) < 5 * 60000;
            const groupedBottom = !!nextM && nextM.sender_id === m.sender_id && +new Date(nextM.created_at) - +new Date(m.created_at) < 5 * 60000;
            const big = onlyEmoji(m.content);
            return (
              <div key={m.id} className="flex flex-col">
                {newDay && <p className="text-center text-[12px] font-semibold text-muted my-4 first-letter:uppercase">{dayLabel(m.created_at)}</p>}
                <div className={cx("flex items-end gap-2", mine ? "justify-end" : "justify-start", groupedTop ? "mt-0.5" : "mt-2.5")}>
                  {!mine && <span className="w-7 shrink-0">{!groupedBottom && <Avatar profile={other} size={28} />}</span>}
                  {big ? (
                    <span className="text-[42px] leading-none px-1" title={new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}>{m.content}</span>
                  ) : (
                    <div
                      title={new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      className={cx(
                        "max-w-[75%] px-4 py-2.5 text-[15px] leading-snug whitespace-pre-wrap break-words",
                        mine ? "bg-cobalt text-[var(--cobalt-ink)]" : "bg-surface border border-line text-ink",
                        "rounded-[22px]",
                        mine ? groupedTop && "rounded-tr-md" : groupedTop && "rounded-tl-md",
                        mine ? groupedBottom && "rounded-br-md" : groupedBottom && "rounded-bl-md",
                        m.id.startsWith("tmp-") && "opacity-60",
                      )}
                    >
                      {m.content}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {seen && lastMine && msgs[msgs.length - 1]?.id === lastMine.id && (
          <p className="self-end text-[11.5px] text-muted mt-1 flex items-center gap-1"><CheckCheck size={14} className="text-cobalt" /> Vu</p>
        )}
        {typing && (
          <div className="flex items-end gap-2 mt-2.5">
            <Avatar profile={other} size={28} />
            <div className="bg-surface border border-line rounded-[22px] px-4 py-3 flex gap-1" aria-label="En train d'écrire">
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
        className="p-3 border-t border-line flex items-end gap-2 shrink-0"
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
          placeholder={`Écrire à ${firstName(other)}…`}
          maxLength={4000}
          className="field !rounded-[22px] resize-none !py-2.5 leading-snug"
          autoFocus
        />
        <button className="w-11 h-11 shrink-0 rounded-full bg-cobalt text-white grid place-items-center disabled:opacity-40 transition" disabled={!text.trim()} aria-label="Envoyer">
          <Send size={17} />
        </button>
      </form>
    </>
  );
}

function PeoplePicker({ uid, open, onClose }: { uid: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { online } = useActivity();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      let query = sb().from("profiles").select("*").neq("id", uid).order("created_at", { ascending: false }).limit(25);
      const term = q.trim().replace(/[%,()]/g, "");
      if (term) query = query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
      const { data } = await query;
      setPeople((data as Profile[]) || []);
    }, 180);
    return () => clearTimeout(t);
  }, [q, uid, open]);

  const start = async (other: string) => {
    const { data, error } = await sb().rpc("get_or_create_dm", { other });
    if (error || !data) return toast("Impossible d'ouvrir la conversation.", "error");
    onClose();
    router.push(`/messages?c=${data}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouveau message">
      <div className="px-5 pb-5">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field !pl-10" placeholder="Chercher un apprenant" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <div className="mt-3 max-h-[380px] overflow-y-auto scroll-thin -mx-2">
          {people.map((p) => (
            <button key={p.id} onClick={() => start(p.id)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface-2 text-left">
              <Avatar profile={p} size={44} online={online.has(p.id)} />
              <span className="min-w-0">
                <span className="block font-semibold truncate">{displayName(p)}</span>
                <span className="block text-sm text-muted truncate">{p.headline || `@${p.username}`}</span>
              </span>
            </button>
          ))}
          {people.length === 0 && <p className="text-sm text-muted p-3">Aucun apprenant trouvé.</p>}
        </div>
      </div>
    </Modal>
  );
}
