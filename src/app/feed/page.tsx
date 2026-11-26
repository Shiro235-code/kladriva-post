"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Feed } from "@/components/Feed";
import { useAuth } from "@/components/AuthProvider";
import { displayName } from "@/lib/utils";

export default function FeedPage() {
  const { profile, session } = useAuth();
  const first = displayName(profile).split(" ")[0];
  return (
    <AppShell>
      <div className="max-w-[640px] mx-auto">
        <div className="mb-5">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em]">
            {session ? (
              <>Salut {first}, <span className="font-display italic font-normal">quoi de neuf ?</span></>
            ) : (
              <>Le fil <span className="font-display italic font-normal">des avancées</span></>
            )}
          </h1>
          {!session && (
            <p className="text-muted mt-2">
              Tu parcours en visiteur. <Link href="/auth?mode=signup" className="font-semibold text-ink underline">Rejoins la promo</Link> pour publier et commenter.
            </p>
          )}
        </div>
        <Feed />
      </div>
    </AppShell>
  );
}
