"use client";

import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { POST_SELECT, type Post } from "@/lib/types";
import { PostCard } from "./PostCard";
import { Composer } from "./Composer";
import { Empty, Spinner } from "./ui";

const PAGE = 15;

export function Feed({
  groupId,
  authorId,
  showComposer = true,
  canPost = true,
  emptyText,
}: {
  groupId?: string;
  authorId?: string;
  showComposer?: boolean;
  canPost?: boolean;
  emptyText?: string;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (before?: string) => {
      let q = sb().from("posts").select(POST_SELECT).order("created_at", { ascending: false }).limit(PAGE);
      if (groupId) q = q.eq("group_id", groupId);
      if (authorId) q = q.eq("author_id", authorId);
      if (before) q = q.lt("created_at", before);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Post[]) || [];
    },
    [groupId, authorId],
  );

  const reload = useCallback(async () => {
    try {
      const rows = await fetchPage();
      setPosts(rows);
      setMore(rows.length === PAGE);
      setFresh(0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger le fil.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    setLoading(true);
    reload();
    const ch = sb()
      .channel(`posts-${groupId || authorId || "all"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (p) => {
        const row = p.new as { group_id: string | null; author_id: string };
        if (groupId && row.group_id !== groupId) return;
        if (authorId && row.author_id !== authorId) return;
        setFresh((n) => n + 1);
      })
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [reload, groupId, authorId]);

  const loadMore = async () => {
    const last = posts[posts.length - 1];
    if (!last) return;
    const rows = await fetchPage(last.created_at);
    setPosts((p) => [...p, ...rows.filter((r) => !p.some((x) => x.id === r.id))]);
    setMore(rows.length === PAGE);
  };

  return (
    <div className="flex flex-col gap-4">
      {showComposer && canPost && <Composer groupId={groupId} onPosted={reload} />}

      {fresh > 0 && (
        <button onClick={reload} className="btn btn-accent self-center sticky top-20 z-10 shadow-lg">
          ↑ {fresh} nouvelle{fresh > 1 ? "s" : ""} publication{fresh > 1 ? "s" : ""}
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : error ? (
        <Empty title="Oups." text={error} />
      ) : posts.length === 0 ? (
        <Empty title="Rien ici… encore." text={emptyText || "Lance le mouvement : partage ta première avancée."} />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} onDeleted={(id) => setPosts((all) => all.filter((x) => x.id !== id))} />)
      )}

      {more && !loading && (
        <button onClick={loadMore} className="btn btn-ghost self-center">Voir plus</button>
      )}
    </div>
  );
}
