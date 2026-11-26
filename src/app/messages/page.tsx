"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, PenSquare, Send, Search, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Message, Profile } from "@/lib/types";
import { cx, displayName, timeAgo } from "@/lib/utils";

type Conv = { id: string; last_message_at: string; other: Profile | null; preview: string; unread: boolean };

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const { session, loading: authLoading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const active = params.get("c");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
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
    const previews: Record<string, string> = {};
    if (ids.length) {
      const { data: msgs } = await sb()
        .from("messages")
        .select("conversation_id, content, sender_id")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);
      for (const m of msgs || []) if (!previews[m.conversation_id]) previews[m.conversation_id] = (m.sender_id === uid ? "Toi : " : "") + m.content;
    }
    setConvs(
      rows.map((r) => {
        const me = r.conversation_members.find((m) => m.user_id === uid);
        const other = r.conversation_members.find((m) => m.user_id !== uid)?.profile ?? null;
        return {
          id: r.id,
          last_message_at: r.last_message_at,
          other,
          preview: previews[r.id] || "Nouvelle conversation",
          unread: !!me && new Date(r.last_message_at) > new Date(me.last_read_at) && r.id !== active,
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
      .channel("inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => loadConvs())
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [loadConvs, uid]);

  const current = convs.find((c) => c.id === active);

  return (
    <AppShell wide>
      <div className="card overflow-hidden h-[calc(100vh-170px)] lg:h-[calc(100vh-48px)] flex">
        {/* Liste */}
        <div className={cx("w-full md:w-[340px] md:border-r border-line flex flex-col", active && "hidden md:flex")}>
          <div className="flex items-center justify-between p-5 pb-3">
            <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
            <button onClick={() => setPicker(true)} className="p-2.5 rounded-full bg-ink text-white" title="Nouveau message">
              <PenSquare size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin px-2 pb-2">
            {loading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : convs.length === 0 ? (
              <div className="text-center p-8">
                <p className="font-display text-2xl">Boîte vide.</p>
                <p className="text-sm text-muted mt-1">Écris à un autre apprenant.</p>
                <button onClick={() => setPicker(true)} className="btn btn-primary mt-4">Nouveau message</button>
              </div>
            ) : (
              convs.map((c) => (
                <Link
                  key={c.id}
                  href={`/messages?c=${c.id}`}
                  className={cx("flex items-center gap-3 p-3 rounded-2xl transition", c.id === active ? "bg-bg" : "hover:bg-bg/70")}
                >
                  <Avatar profile={c.other} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cx("truncate", c.unread ? "font-bold" : "font-semibold")}>{displayName(c.other)}</p>
                      <span className="text-xs text-muted shrink-0">{timeAgo(c.last_message_at)}</span>
                    </div>
                    <p className={cx("text-sm truncate", c.unread ? "text-ink font-semibold" : "text-muted")}>{c.preview}</p>
                  </div>
                  {c.unread && <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />}
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Fil de discussion */}
        <div className={cx("flex-1 flex-col min-w-0", active ? "flex" : "hidden md:flex")}>
          {active && uid ? (
            <Thread key={active} convId={active} other={current?.other ?? null} uid={uid} onSent={loadConvs} />
          ) : (
            <div className="flex-1 grid place-items-center text-center p-10">
              <div>
                <p className="font-display italic text-5xl">Tes conversations</p>
                <p className="text-muted mt-2">Choisis une discussion ou démarre-en une nouvelle.</p>
                <button onClick={() => setPicker(true)} className="btn btn-accent mt-5">Nouveau message</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {picker && uid && <PeoplePicker uid={uid} onClose={() => setPicker(false)} />}
    </AppShell>
  );
}

function Thread({ convId, other, uid, onSent }: { convId: string; other: Profile | null; uid: string; onSent: () => void }) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

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
    sb().from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", convId).eq("user_id", uid).then(() => {});
    const ch = sb()
      .channel(`thread-${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, (p) => {
        const m = p.new as Message;
        setMsgs((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
        sb().from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", convId).eq("user_id", uid).then(() => {});
      })
      .subscribe();
    return () => {
      alive = false;
      sb().removeChannel(ch);
    };
  }, [convId, uid]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    const { data } = await sb().from("messages").insert({ conversation_id: convId, sender_id: uid, content }).select().single();
    if (data) setMsgs((all) => (all.some((x) => x.id === data.id) ? all : [...all, data as Message]));
    onSent();
  };

  return (
    <>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-line shrink-0">
        <Link href="/messages" className="md:hidden p-2 -ml-2 rounded-full hover:bg-bg"><ArrowLeft size={18} /></Link>
        {other && (
          <Link href={`/u/${other.username}`} className="flex items-center gap-3 min-w-0">
            <Avatar profile={other} size={38} />
            <div className="min-w-0">
              <p className="font-semibold truncate">{displayName(other)}</p>
              <p className="text-xs text-muted truncate">@{other.username}</p>
            </div>
          </Link>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-4 py-5 flex flex-col gap-1.5 bg-[#fbfaf7]">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : msgs.length === 0 ? (
          <p className="text-center text-muted text-sm my-auto">Dis bonjour 👋</p>
        ) : (
          msgs.map((m, i) => {
            const mine = m.sender_id === uid;
            const prev = msgs[i - 1];
            const gap = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 15 * 60 * 1000;
            return (
              <div key={m.id} className="flex flex-col">
                {gap && <p className="text-center text-[11px] text-muted my-3">{timeAgo(m.created_at)}</p>}
                <div
                  className={cx(
                    "max-w-[78%] px-4 py-2.5 text-[15px] leading-snug whitespace-pre-wrap break-words rise",
                    mine ? "self-end bg-ink text-white rounded-[22px] rounded-br-md" : "self-start bg-white border border-line rounded-[22px] rounded-bl-md",
                  )}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="p-3 border-t border-line flex items-center gap-2 shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écrire un message…"
          maxLength={4000}
          className="input !rounded-full"
          autoFocus
        />
        <button className="w-11 h-11 shrink-0 rounded-full bg-accent text-white grid place-items-center disabled:opacity-40" disabled={!text.trim()} aria-label="Envoyer">
          <Send size={17} />
        </button>
      </form>
    </>
  );
}

function PeoplePicker({ uid, onClose }: { uid: string; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      let query = sb().from("profiles").select("*").neq("id", uid).order("created_at", { ascending: false }).limit(20);
      const term = q.trim().replace(/[%,()]/g, "");
      if (term) query = query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
      const { data } = await query;
      setPeople((data as Profile[]) || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, uid]);

  const open = async (other: string) => {
    const { data, error } = await sb().rpc("get_or_create_dm", { other });
    if (!error && data) {
      onClose();
      router.push(`/messages?c=${data}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-[440px] p-5 rise">
        <div className="flex items-center justify-between">
          <p className="text-xl font-semibold">Nouveau message</p>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-bg"><X size={18} /></button>
        </div>
        <div className="relative mt-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !pl-10" placeholder="Rechercher un apprenant…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <div className="mt-3 max-h-[360px] overflow-y-auto scroll-thin -mx-2">
          {people.map((p) => (
            <button key={p.id} onClick={() => open(p.id)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-bg text-left">
              <Avatar profile={p} size={40} />
              <span className="min-w-0">
                <span className="block font-semibold truncate">{displayName(p)}</span>
                <span className="block text-sm text-muted truncate">@{p.username}</span>
              </span>
            </button>
          ))}
          {people.length === 0 && <p className="text-sm text-muted p-3">Personne trouvé.</p>}
        </div>
      </div>
    </div>
  );
}
