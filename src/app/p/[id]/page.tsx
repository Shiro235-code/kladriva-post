"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, FileX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { Empty, PostSkeleton } from "@/components/ui";
import { sb } from "@/lib/supabase";
import { POST_SELECT, type Post } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb()
      .from("posts")
      .select(POST_SELECT)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        setPost(data as unknown as Post);
        setLoading(false);
      });
  }, [id]);

  return (
    <AppShell>
      <div className="max-w-[680px] 2xl:max-w-[780px] mx-auto">
        <button onClick={() => (history.length > 1 ? router.back() : router.push("/feed"))} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4">
          <ArrowLeft size={16} /> Retour
        </button>
        {loading ? (
          <PostSkeleton />
        ) : post ? (
          <PostCard post={post} startOpen onDeleted={() => router.push("/feed")} />
        ) : (
          <Empty icon={FileX} title="Publication introuvable" text="Elle a peut-être été supprimée par son auteur.">
            <Link href="/feed" className="btn btn-primary">Retour au fil</Link>
          </Empty>
        )}
      </div>
    </AppShell>
  );
}
