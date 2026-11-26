"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Feed } from "@/components/Feed";
import { useAuth } from "@/components/AuthProvider";
import { Bookmark } from "lucide-react";

export default function SavedPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !session) router.replace(`/auth?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [loading, session, router]);

  return (
    <AppShell>
      <div className="max-w-[680px] 2xl:max-w-[780px] mx-auto">
        <h1 className="font-display text-[34px] font-bold leading-tight">Enregistrés</h1>
        <p className="text-muted mt-1 mb-6">Les publications que tu veux garder sous la main. Toi seul les vois.</p>
        {session && (
          <Feed
            mode="saved"
            kindFilter={false}
            showComposer={false}
            empty={{ icon: Bookmark, title: "Rien d'enregistré pour l'instant", text: "Touche « Enregistrer » sous une publication pour la retrouver ici.", action: <Link href="/feed" className="btn btn-primary">Parcourir le fil</Link> }}
          />
        )}
      </div>
    </AppShell>
  );
}
