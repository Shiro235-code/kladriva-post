"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, WifiOff, Sprout, CircleCheck, type LucideIcon } from "lucide-react";
import { sb } from "@/lib/supabase";
import { POST_SELECT, type Post, type PostKind } from "@/lib/types";
import { KINDS, cx } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { PostCard } from "./PostCard";
import { ComposerTrigger } from "./Composer";
import { Empty, PostSkeleton } from "./ui";

const PAGE = 12;

export type FeedMode = "all" | "following" | "saved";

export function Feed({
  groupId,
  authorId,
  mode = "all",
  search,
  kindFilter = true,
  showComposer = true,
  canPost = true,
  mediaOnly = false,
  empty,
}: {
  groupId?: string;
  authorId?: string;
  mode?: FeedMode;
  search?: string;
  kindFilter?: boolean;
  showComposer?: boolean;
  canPost?: boolean;
  mediaOnly?: boolean;
  empty?: { icon?: LucideIcon; title: string; text?: string; action?: React.ReactNode };
}) {
  const { session, loading: authLoading } = useAuth();
  const uid = session?.user.id;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<PostKind | "all">("all");
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (before?: string): Promise<Post[]> => {
      if (mode === "saved") {
        if (!uid) return [];
        let q = sb().from("saves").select(`created_at, post:posts(${POST_SELECT})`).eq("user_id", uid).order("created_at", { ascending: false }).limit(PAGE);
        if (before) q = q.lt("created_at", before);
        const { data, error } = await q;
        if (error) throw error;
        return ((data || []) as unknown as { post: Post | null }[]).map((r) => r.post).filter(Boolean) as Post[];
      }
      let q = sb().from("posts").select(POST_SELECT).order("created_at", { ascending: false }).limit(PAGE);
      if (groupId) q = q.eq("group_id", groupId);
      if (authorId) q = q.eq("author_id", authorId);
      if (kind !== "all") q = q.eq("kind", kind);
      if (mediaOnly) q = q.or("images.neq.{},video_url.not.is.null");
      if (search) q = q.ilike("content", `%${search.replace(/[%_]/g, "")}%`);
      if (mode === "following" && uid) {
        const { data: f } = await sb().from("follows").select("following_id").eq("follower_id", uid);
        const ids = [uid, ...(f || []).map((r) => r.following_id)];
        q = q.in("author_id", ids);
      }
      if (before) q = q.lt("created_at", before);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Post[]) || [];
    },
    [groupId, authorId, kind, mode, uid, search, mediaOnly],
  );

  const reload = useCallback(async () => {
    try {
      const rows = await fetchPage();
      setPosts(rows);
      setMore(rows.length === PAGE);
      setFresh(0);
      setError(null);
    } catch {
      setError("Le fil n'a pas pu se charger. Vérifie ta connexion puis recharge la page.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    reload();
  }, [reload, authLoading]);

  // Nouvelles publications en direct
  useEffect(() => {
    if (mode === "saved") return;
    const ch = sb()
      .channel(`feed-${groupId || authorId || mode}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (p) => {
        const row = p.new as { group_id: string | null; author_id: string };
        if (row.author_id === uid) return;
        if (groupId && row.group_id !== groupId) return;
        if (authorId && row.author_id !== authorId) return;
        setFresh((n) => n + 1);
      })
      .subscribe();
    const onPosted = () => reload();
    window.addEventListener("kp:posted", onPosted);
    return () => {
      sb().removeChannel(ch);
      window.removeEventListener("kp:posted", onPosted);
    };
  }, [reload, groupId, authorId, mode, uid]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !more) return;
    const last = posts[posts.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(last.created_at);
      setPosts((p) => [...p, ...rows.filter((r) => !p.some((x) => x.id === r.id))]);
      setMore(rows.length === PAGE);
    } finally {
      setLoadingMore(false);
    }
  }, [posts, fetchPage, loadingMore, more]);

  // Défilement infini
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div className="flex flex-col gap-4">
      {showComposer && canPost && <ComposerTrigger groupId={groupId} />}

      {kindFilter && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Filtrer par type">
          <Chip on={kind === "all"} onClick={() => setKind("all")}>Tout</Chip>
          {KINDS.filter((k) => k.kind !== "update").map((k) => (
            <Chip key={k.kind} on={kind === k.kind} onClick={() => setKind(k.kind)}>
              <k.icon size={14} strokeWidth={2.3} aria-hidden /> {k.short}
            </Chip>
          ))}
        </div>
      )}

      {fresh > 0 && (
        <button
          onClick={() => {
            reload();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="btn btn-primary self-center sticky top-16 lg:top-4 z-20 shadow-[var(--shadow-pop)] sheet-in"
        >
          <ArrowUp size={16} /> {fresh} nouvelle{fresh > 1 ? "s" : ""} publication{fresh > 1 ? "s" : ""}
        </button>
      )}

      {loading ? (
        <>
          <PostSkeleton />
          <PostSkeleton />
        </>
      ) : error ? (
        <Empty icon={WifiOff} title="Connexion interrompue" text={error}>
          <button onClick={() => { setLoading(true); reload(); }} className="btn btn-primary">Réessayer</button>
        </Empty>
      ) : posts.length === 0 ? (
        <Empty
          icon={empty?.icon || Sprout}
          title={kind !== "all" ? "Rien dans cette catégorie" : empty?.title || "Le fil est encore vide"}
          text={kind !== "all" ? "Choisis un autre filtre ou sois le premier à publier dans celle-ci." : empty?.text || "Partage ta première avancée : c'est comme ça que tout commence."}
        >
          {kind === "all" && empty?.action}
        </Empty>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} onDeleted={(id) => setPosts((all) => all.filter((x) => x.id !== id))} />)
      )}

      <div ref={sentinel} />
      {loadingMore && <PostSkeleton />}
      {!loading && !more && posts.length > 4 && <p className="flex items-center justify-center gap-2 text-sm text-muted py-4"><CircleCheck size={16} className="text-mint" /> Tu es à jour</p>}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cx(
        "shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold border transition",
        on ? "bg-ink text-surface border-ink" : "bg-surface border-line text-ink-2 hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}
