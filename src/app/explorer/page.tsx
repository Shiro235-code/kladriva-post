"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { displayName } from "@/lib/utils";

export default function ExplorerPage() {
  return (
    <Suspense>
      <ExplorerInner />
    </Suspense>
  );
}

function ExplorerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const q = params.get("q") || "";
  const [input, setInput] = useState(q);
  const [people, setPeople] = useState<Profile[]>([]);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    const term = q.replace(/^[@#]/, "").replace(/[%,()]/g, "").trim();
    let query = sb().from("profiles").select("*").limit(term ? 8 : 12);
    query = term ? query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%,headline.ilike.%${term}%`) : query.order("created_at", { ascending: false });
    query.then(({ data }) => setPeople(((data as Profile[]) || []).filter((p) => p.id !== session?.user.id)));
  }, [q, session]);

  return (
    <AppShell>
      <div className="max-w-[620px] mx-auto">
        <h1 className="font-display text-[34px] font-bold leading-tight">Explorer</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(input.trim() ? `/explorer?q=${encodeURIComponent(input.trim())}` : "/explorer");
          }}
          className="relative mt-4"
        >
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Un sujet, un #hashtag, un prénom…" className="field !rounded-full !pl-11 !py-3 !bg-surface" />
        </form>

        {people.length > 0 && (
          <section className="mt-7">
            <h2 className="font-display text-xl font-semibold mb-3">{q ? "Apprenants" : "Nouveaux dans la promo"}</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              {people.map((p) => (
                <Link key={p.id} href={`/u/${p.username}`} className="panel shrink-0 w-[168px] p-4 text-center hover:border-line-strong transition">
                  <Avatar profile={p} size={64} className="mx-auto" />
                  <p className="font-semibold mt-2.5 truncate">{displayName(p)}</p>
                  <p className="text-xs text-muted truncate h-4">{p.headline || `@${p.username}`}</p>
                  <div className="mt-3 flex justify-center">{session ? <FollowButton userId={p.id} compact /> : <span className="btn btn-soft !py-1.5 !px-3 !text-[13px]">Voir</span>}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold mb-3">{q ? `Publications avec « ${q} »` : "Toutes les publications"}</h2>
          <Feed key={q} search={q || undefined} showComposer={false} empty={{ emoji: "🔍", title: "Aucune publication trouvée", text: "Essaie un autre mot ou un hashtag différent." }} />
        </section>
      </div>
    </AppShell>
  );
}
