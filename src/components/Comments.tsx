"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Send, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import { COMMENT_SELECT, type Comment } from "@/lib/types";
import { cx, displayName, plural, timeAgo } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { useToast } from "./Providers";
import { Avatar, RichText } from "./ui";

export function Comments({ postId, postAuthorId, onCount }: { postId: string; postAuthorId: string; onCount: (n: number) => void }) {
  const { session, profile } = useAuth();
  const toast = useToast();
  const uid = session?.user.id;
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ rootId: string; name: string; username: string } | null>(null);
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await sb().from("comments").select(COMMENT_SELECT).eq("post_id", postId).order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data as unknown as Comment[]) || [];
      setItems(rows);
      onCount(rows.length);
    } catch { toast("Les commentaires n'ont pas pu être chargés.", "error"); }
    finally { setLoading(false); }
  }, [postId, onCount, toast]);

  useEffect(() => {
    load();
    const ch = sb()
      .channel(`comments-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, load)
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [postId, load]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(140, el.scrollHeight) + "px";
  }, [text]);

  const roots = items.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => items.filter((c) => c.parent_id === id);

  const startReply = (c: Comment) => {
    if (!uid) return;
    const rootId = c.parent_id || c.id;
    setReplyTo({ rootId, name: displayName(c.author), username: c.author.username });
    setOpenThreads((o) => ({ ...o, [rootId]: true }));
    setText(c.author_id !== uid ? `@${c.author.username} ` : "");
    setTimeout(() => inputRef.current?.focus(), 20);
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !uid || busy) return;
    setBusy(true);
    try {
      const { data, error } = await sb()
        .from("comments")
        .insert({ post_id: postId, author_id: uid, content, parent_id: replyTo?.rootId ?? null })
        .select(COMMENT_SELECT)
        .single();
      if (error) throw error;
      setText("");
      setReplyTo(null);
      if (data) {
        setItems((it) => {
          const next = it.some((c) => c.id === (data as unknown as Comment).id) ? it : [...it, data as unknown as Comment];
          onCount(next.length);
          return next;
        });
      }
    } catch { toast("Ton commentaire n'a pas été envoyé. Ton texte est conservé ; réessaie.", "error"); }
    finally { setBusy(false); }
  };

  const del = async (id: string) => {
    const prev = items;
    const next = items.filter((c) => c.id !== id && c.parent_id !== id);
    setItems(next);
    onCount(next.length);
    try {
      const { error } = await sb().from("comments").delete().eq("id", id);
      if (error) throw error;
    } catch {
      setItems(prev);
      onCount(prev.length);
      toast("Suppression impossible.", "error");
    }
  };

  const like = async (c: Comment) => {
    if (!uid) return;
    const liked = c.comment_likes.some((l) => l.user_id === uid);
    const previous = c.comment_likes;
    setItems((it) =>
      it.map((x) =>
        x.id === c.id ? { ...x, comment_likes: liked ? x.comment_likes.filter((l) => l.user_id !== uid) : [...x.comment_likes, { user_id: uid }] } : x,
      ),
    );
    try {
      const result = liked
        ? await sb().from("comment_likes").delete().eq("comment_id", c.id).eq("user_id", uid)
        : await sb().from("comment_likes").insert({ comment_id: c.id, user_id: uid });
      if (result.error) throw result.error;
    } catch {
      setItems((all) => all.map((item) => item.id === c.id ? { ...item, comment_likes: previous } : item));
      toast("Ta réaction au commentaire n'a pas été enregistrée.", "error");
    }
  };

  const Row = ({ c, small }: { c: Comment; small?: boolean }) => {
    const liked = !!uid && c.comment_likes.some((l) => l.user_id === uid);
    return (
      <div className="flex gap-2.5 group">
        <Link href={`/u/${c.author?.username}`} className="shrink-0"><Avatar profile={c.author} size={small ? 28 : 34} /></Link>
        <div className="min-w-0 flex-1">
          <div className="bg-surface-2 rounded-2xl rounded-tl-md px-3.5 py-2 inline-block max-w-full">
            <div className="flex items-center gap-1.5">
              <Link href={`/u/${c.author?.username}`} className="text-[13.5px] font-bold hover:underline">{displayName(c.author)}</Link>
              {c.author_id === postAuthorId && <span className="text-[10.5px] font-bold text-cobalt bg-cobalt-soft rounded px-1.5 py-px">Auteur</span>}
            </div>
            <RichText text={c.content} className="text-[14.5px] leading-snug" />
          </div>
          <div className="flex items-center gap-3.5 text-[12.5px] text-muted mt-1 ml-2 font-semibold">
            <span className="font-normal">{timeAgo(c.created_at)}</span>
            {uid && (
              <button onClick={() => like(c)} className={cx("min-h-9 px-1 rounded-md hover:underline", liked && "text-coral")}>
                J&apos;aime{c.comment_likes.length > 0 && ` · ${c.comment_likes.length}`}
              </button>
            )}
            {!uid && c.comment_likes.length > 0 && <span className="inline-flex items-center gap-1"><Heart size={12} className="text-coral" fill="currentColor" /> {c.comment_likes.length}</span>}
            {uid && <button onClick={() => startReply(c)} className="min-h-9 px-1 rounded-md hover:underline">Répondre</button>}
            {uid === c.author_id && (
              <button onClick={() => del(c.id)} className="hover:text-coral sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition">Supprimer</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pt-3">
      {loading ? (
        <div className="space-y-3 py-1">
          <div className="flex gap-2.5"><div className="skeleton w-8 h-8 !rounded-full" /><div className="skeleton h-12 w-2/3 !rounded-2xl" /></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {roots.map((c) => {
            const reps = repliesOf(c.id);
            const show = openThreads[c.id] || reps.length <= 1;
            return (
              <div key={c.id}>
                <Row c={c} />
                {reps.length > 0 && (
                  <div className="ml-[44px] mt-2 flex flex-col gap-2.5">
                    {show ? (
                      reps.map((r) => <Row key={r.id} c={r} small />)
                    ) : (
                      <button onClick={() => setOpenThreads((o) => ({ ...o, [c.id]: true }))} className="text-[13px] font-semibold text-ink-2 hover:underline text-left flex items-center gap-2">
                        <span className="w-6 h-px bg-line-strong" />
                        Voir les {plural(reps.length, "réponse")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {roots.length === 0 && <p className="text-sm text-muted">Aucun commentaire pour l&apos;instant. Lance la discussion.</p>}
        </div>
      )}

      {session ? (
        <div className="mt-3.5">
          {replyTo && (
            <div className="flex items-center gap-2 text-[12.5px] text-muted mb-1.5 ml-11">
              Réponse à <b className="text-ink-2">{replyTo.name}</b>
              <button onClick={() => { setReplyTo(null); setText(""); }} className="hover:text-ink" aria-label="Annuler la réponse"><X size={14} /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Avatar profile={profile} size={34} />
            <div className="flex-1 flex items-end bg-surface-2 rounded-[20px] pl-4 pr-1.5 py-1.5 border border-transparent focus-within:border-cobalt focus-within:bg-surface transition">
              <textarea
                ref={inputRef}
                value={text}
                aria-label={replyTo ? `Répondre à ${replyTo.name}` : "Écrire un commentaire"}
                rows={1}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={replyTo ? "Écris ta réponse…" : "Écris un commentaire…"}
                maxLength={2000}
                className="flex-1 bg-transparent outline-none focus-visible:outline-none text-[14.5px] py-1.5 resize-none leading-snug"
              />
              <button onClick={send} disabled={!text.trim() || busy} className="w-11 h-11 shrink-0 rounded-full bg-cobalt text-white grid place-items-center disabled:opacity-30 transition focus-visible:ring-2 focus-visible:ring-cobalt" aria-label="Envoyer le commentaire">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <Link href="/auth" className="text-sm font-semibold text-cobalt mt-3 inline-block hover:underline">Connecte-toi pour commenter</Link>
      )}
    </div>
  );
}
