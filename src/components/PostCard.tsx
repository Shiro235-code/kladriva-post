"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, MessageCircle, Trash2, Send } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { Comment, Post } from "@/lib/types";
import { cx, displayName, groupColor, timeAgo } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./ui";
import { useRouter } from "next/navigation";

export function PostCard({ post, onDeleted }: { post: Post; onDeleted?: (id: string) => void }) {
  const { session, profile } = useAuth();
  const router = useRouter();
  const uid = session?.user.id;
  const [likes, setLikes] = useState(post.likes.map((l) => l.user_id));
  const [commentCount, setCommentCount] = useState(post.comments?.[0]?.count ?? 0);
  const [open, setOpen] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const liked = !!uid && likes.includes(uid);

  const toggleLike = async () => {
    if (!uid) return router.push("/auth");
    if (liked) {
      setLikes((l) => l.filter((x) => x !== uid));
      await sb().from("likes").delete().eq("post_id", post.id).eq("user_id", uid);
    } else {
      setLikes((l) => [...l, uid]);
      setPopKey((k) => k + 1);
      await sb().from("likes").insert({ post_id: post.id, user_id: uid });
    }
  };

  const remove = async () => {
    if (!confirmDelete()) return;
    const { error } = await sb().from("posts").delete().eq("id", post.id);
    if (!error) onDeleted?.(post.id);
  };

  const g = post.group ? groupColor(post.group.color) : null;

  return (
    <article className="card p-4 sm:p-5 rise">
      <header className="flex items-start gap-3">
        <Link href={`/u/${post.author?.username}`}><Avatar profile={post.author} size={44} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x-2 flex-wrap">
            <Link href={`/u/${post.author?.username}`} className="font-semibold hover:underline">{displayName(post.author)}</Link>
            <span className="text-muted text-sm">· {timeAgo(post.created_at)}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {post.author?.headline && <span className="text-sm text-muted truncate">{post.author.headline}</span>}
            {post.group && g && (
              <Link href={`/groups/${post.group.id}`} className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: g.bg, color: g.fg }}>
                {post.group.name}
              </Link>
            )}
          </div>
        </div>
        {uid === post.author_id && (
          <button onClick={remove} className="p-2 rounded-full text-muted hover:text-red-600 hover:bg-red-50" title="Supprimer">
            <Trash2 size={16} />
          </button>
        )}
      </header>

      {post.content && <p className="mt-3 text-[16px] leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>}
      {post.image_url?.startsWith("https://") && (
        <div className="mt-3 rounded-2xl overflow-hidden border border-line bg-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image_url} alt="" className="w-full max-h-[560px] object-cover" loading="lazy" />
        </div>
      )}

      <footer className="flex items-center gap-1 mt-3 -ml-2">
        <button onClick={toggleLike} className={cx("flex items-center gap-2 px-3 py-2 rounded-full text-sm transition", liked ? "text-accent bg-accent-soft" : "text-muted hover:bg-bg hover:text-ink")}>
          <Heart key={popKey} size={18} className={cx(liked && "pop")} fill={liked ? "currentColor" : "none"} />
          <span className="font-semibold tabular-nums">{likes.length || ""}</span>
          <span className="sr-only">J&apos;aime</span>
        </button>
        <button onClick={() => setOpen((o) => !o)} className={cx("flex items-center gap-2 px-3 py-2 rounded-full text-sm transition", open ? "text-ink bg-bg" : "text-muted hover:bg-bg hover:text-ink")}>
          <MessageCircle size={18} />
          <span className="font-semibold tabular-nums">{commentCount || ""}</span>
          <span>{commentCount ? "" : "Commenter"}</span>
        </button>
      </footer>

      {open && <Comments postId={post.id} onCount={setCommentCount} me={profile} />}
    </article>
  );
}

function confirmDelete() {
  // Confirmation native simple
  return typeof window !== "undefined" ? window.confirm("Supprimer cette publication ?") : false;
}

function Comments({ postId, onCount, me }: { postId: string; onCount: (n: number) => void; me: ReturnType<typeof useAuth>["profile"] }) {
  const { session } = useAuth();
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await sb()
        .from("comments")
        .select("*, author:profiles(*)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (!alive) return;
      setItems((data as Comment[]) || []);
      onCount(data?.length ?? 0);
      setLoading(false);
    };
    load();
    const ch = sb()
      .channel(`comments-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, load)
      .subscribe();
    return () => {
      alive = false;
      sb().removeChannel(ch);
    };
  }, [postId, onCount]);

  const send = async () => {
    const content = text.trim();
    if (!content || !session) return;
    setText("");
    const { data } = await sb()
      .from("comments")
      .insert({ post_id: postId, author_id: session.user.id, content })
      .select("*, author:profiles(*)")
      .single();
    if (data) {
      setItems((it) => (it.some((c) => c.id === data.id) ? it : [...it, data as Comment]));
      onCount(items.length + 1);
    }
  };

  const del = async (id: string) => {
    setItems((it) => it.filter((c) => c.id !== id));
    await sb().from("comments").delete().eq("id", id);
  };

  return (
    <div className="mt-3 pt-3 border-t border-line">
      {loading ? (
        <p className="text-sm text-muted py-2">Chargement…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((c) => (
            <div key={c.id} className="flex gap-2.5 group">
              <Link href={`/u/${c.author?.username}`}><Avatar profile={c.author} size={32} /></Link>
              <div className="min-w-0 flex-1">
                <div className="bg-bg rounded-2xl px-3.5 py-2.5 inline-block max-w-full">
                  <Link href={`/u/${c.author?.username}`} className="text-sm font-semibold hover:underline">{displayName(c.author)}</Link>
                  <p className="text-[15px] whitespace-pre-wrap break-words">{c.content}</p>
                </div>
                <div className="flex gap-3 text-xs text-muted mt-1 ml-2">
                  <span>{timeAgo(c.created_at)}</span>
                  {session?.user.id === c.author_id && (
                    <button onClick={() => del(c.id)} className="hover:text-red-600 opacity-0 group-hover:opacity-100">Supprimer</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-muted">Sois le premier à commenter.</p>}
        </div>
      )}
      {session ? (
        <div className="flex items-center gap-2 mt-3">
          <Avatar profile={me} size={32} />
          <div className="flex-1 flex items-center bg-bg rounded-full pl-4 pr-1 py-1 border border-transparent focus-within:border-line focus-within:bg-white">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Écrire un commentaire…"
              maxLength={2000}
              className="flex-1 bg-transparent outline-none text-[15px] py-1.5"
            />
            <button onClick={send} disabled={!text.trim()} className="p-2 rounded-full bg-ink text-white disabled:opacity-30" aria-label="Envoyer">
              <Send size={14} />
            </button>
          </div>
        </div>
      ) : (
        <Link href="/auth" className="text-sm font-semibold mt-3 inline-block hover:underline">Connecte-toi pour commenter →</Link>
      )}
    </div>
  );
}
