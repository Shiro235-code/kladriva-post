"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Feed, type FeedMode } from "@/components/Feed";
import { StoriesBar } from "@/components/Stories";
import { useAuth } from "@/components/AuthProvider";
import { openComposer } from "@/components/Composer";
import { cx, firstName } from "@/lib/utils";
import { UserPlus, Sprout } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Encore debout";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function FeedPage() {
  const { profile, session } = useAuth();
  const [mode, setMode] = useState<FeedMode>("all");

  return (
    <AppShell>
      <div className="max-w-[680px] 2xl:max-w-[780px] mx-auto">
        <div className="mb-5">
          <h1 className="font-display text-[30px] sm:text-[36px] font-bold leading-[1.05]">
            {session ? `${greeting()}, ${firstName(profile)}` : "Ce que la promo apprend"}
          </h1>
          {!session && (
            <p className="text-muted mt-2">
              Tu parcours en visiteur.{" "}
              <Link href="/auth?mode=signup" className="font-semibold text-cobalt hover:underline">Crée ton compte</Link> pour publier, réagir et commenter.
            </p>
          )}
        </div>

        <div className="mb-5">
          <StoriesBar />
        </div>

        {session && (
          <div className="flex gap-6 border-b border-line mb-4" role="tablist" aria-label="Fil">
            {(
              [
                ["all", "Pour toi"],
                ["following", "Abonnements"],
              ] as [FeedMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cx(
                  "relative pb-3 text-[15px] font-semibold transition",
                  mode === m ? "text-ink" : "text-muted hover:text-ink-2",
                )}
              >
                {label}
                {mode === m && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-full bg-cobalt" />}
              </button>
            ))}
          </div>
        )}

        <Feed
          key={mode}
          mode={mode}
          empty={
            mode === "following"
              ? { icon: UserPlus, title: "Tu ne suis encore personne", text: "Suis d'autres apprenants pour voir leurs avancées ici.", action: <Link href="/explorer" className="btn btn-primary">Trouver des apprenants</Link> }
              : { icon: Sprout, title: "Le fil est encore vide", text: "Partage ta première avancée : c'est comme ça que tout commence.", action: session ? <button onClick={() => openComposer()} className="btn btn-primary">Publier une avancée</button> : undefined }
          }
        />
      </div>
    </AppShell>
  );
}
