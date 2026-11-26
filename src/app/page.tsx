"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/Providers";
import { Avatar, KindBadge, Logo } from "@/components/ui";
import { sb } from "@/lib/supabase";
import { POST_SELECT, type Post } from "@/lib/types";
import { displayName, postImages, timeAgo } from "@/lib/utils";
import { Moon, Sun, PenLine, MessagesSquare, TrendingUp, Sprout, Play } from "lucide-react";

export default function Landing() {
  const { session, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [counts, setCounts] = useState<{ members: number; posts: number } | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace("/feed");
  }, [loading, session, router]);

  useEffect(() => {
    sb()
      .from("posts")
      .select(POST_SELECT)
      .is("group_id", null)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setPosts((data as unknown as Post[]) || []));
    Promise.all([
      sb().from("profiles").select("id", { count: "exact", head: true }),
      sb().from("posts").select("id", { count: "exact", head: true }),
    ]).then(([m, p]) => setCounts({ members: m.count ?? 0, posts: p.count ?? 0 }));
  }, []);

  return (
    <div className="min-h-screen bg-canvas overflow-x-hidden">
      <header className="max-w-[1480px] mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-1.5">
          <button onClick={toggle} className="icon-btn" aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}>
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <Link href="/feed" className="btn hidden sm:inline-flex text-ink-2 hover:text-ink">Voir le fil</Link>
          <Link href="/auth" className="btn btn-soft">Se connecter</Link>
        </div>
      </header>

      {/* Héros : le titre monte en escalier, le fil réel défile à côté */}
      <section className="max-w-[1480px] mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 pt-8 lg:pt-14 pb-20">
        <div>
          <h1 className="font-display font-extrabold text-ink leading-[0.92] text-[52px] sm:text-[78px] lg:text-[96px] 2xl:text-[120px]">
            <span className="block">Chaque jour,</span>
            <span className="block pl-[0.6em]">une marche</span>
            <span className="block pl-[1.2em] text-cobalt">de plus.</span>
          </h1>
          <p className="mt-8 text-lg sm:text-xl text-ink-2 max-w-[30ch] leading-relaxed">
            Le réseau des apprenants Kladriva. Montre ce que tu apprends, aide ceux qui bloquent, et regarde ta promo grimper avec toi.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/auth?mode=signup" className="btn btn-primary !px-7 !py-4 text-[16px]">Créer mon compte</Link>
            <Link href="/feed" className="btn btn-soft !px-7 !py-4 text-[16px]">Parcourir sans compte</Link>
          </div>
          {counts && counts.members > 0 && (
            <p className="mt-8 text-sm text-muted">
              <b className="text-ink tabular-nums">{counts.members}</b> apprenant{counts.members > 1 ? "s" : ""} inscrit{counts.members > 1 ? "s" : ""},{" "}
              <b className="text-ink tabular-nums">{counts.posts}</b> avancée{counts.posts > 1 ? "s" : ""} partagée{counts.posts > 1 ? "s" : ""}.
            </p>
          )}
        </div>

        <LiveWall posts={posts} />
      </section>

      {/* Le parcours : trois marches */}
      <section className="bg-surface border-y border-line">
        <div className="max-w-[1480px] mx-auto px-5 sm:px-8 py-20">
          <h2 className="font-display text-[34px] sm:text-[44px] font-bold leading-tight max-w-[18ch]">Comment ça marche</h2>
          <ol className="mt-12 grid md:grid-cols-3 gap-5 md:items-end">
            {[
              { icon: PenLine, title: "Tu publies", text: "Une avancée, une victoire, un blocage. Avec du texte, des images, une vidéo ou une story de 24 h.", h: "md:min-h-[230px]" },
              { icon: MessagesSquare, title: "La promo répond", text: "Réactions, commentaires, réponses et messages privés, en temps réel.", h: "md:min-h-[290px]" },
              { icon: TrendingUp, title: "Tu progresses", text: "Ta série de jours, tes badges et le classement de la semaine rendent ton effort visible.", h: "md:min-h-[350px]" },
            ].map((s, i) => (
              <li key={s.title} className={`rounded-3xl p-7 flex flex-col justify-between ${s.h}`} style={{ background: i === 2 ? "var(--cobalt)" : "var(--surface-2)", color: i === 2 ? "#fff" : undefined }}>
                <span className="font-display text-[15px] font-bold opacity-60">Étape {i + 1}</span>
                <div className="mt-10">
                  <span className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: i === 2 ? "rgba(255,255,255,0.16)" : "var(--surface)", color: i === 2 ? "#fff" : "var(--cobalt)" }} aria-hidden>
                    <s.icon size={24} strokeWidth={2} />
                  </span>
                  <p className="font-display text-[28px] font-bold mt-3 leading-tight">{s.title}</p>
                  <p className={i === 2 ? "text-white/85 mt-2 leading-relaxed" : "text-ink-2 mt-2 leading-relaxed"}>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="max-w-[1480px] mx-auto px-5 sm:px-8 py-20 grid md:grid-cols-[1fr_auto] gap-8 items-center">
        <p className="font-display text-[36px] sm:text-[52px] font-bold leading-[1.02] max-w-[16ch]">Ta prochaine avancée mérite d&apos;être vue.</p>
        <Link href="/auth?mode=signup" className="btn btn-primary !px-8 !py-4 text-[17px] justify-self-start">Rejoindre la promo</Link>
      </section>

      <footer className="max-w-[1480px] mx-auto px-5 sm:px-8 py-10 border-t border-line flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
        <Logo size={26} />
        <span>Kladriva Post, le réseau des apprenants Kladriva.</span>
      </footer>
    </div>
  );
}

/** Fil réel qui défile doucement : la promo, en direct. */
function LiveWall({ posts }: { posts: Post[] | null }) {
  if (posts === null) return <div className="h-[520px] rounded-[28px] skeleton" />;
  if (posts.length === 0)
    return (
      <div className="h-[520px] rounded-[28px] bg-surface border border-line grid place-items-center p-10 text-center">
        <div>
          <span className="w-16 h-16 rounded-2xl bg-cobalt-soft text-cobalt grid place-items-center mx-auto"><Sprout size={30} /></span>
          <p className="font-display text-2xl font-bold mt-4">Le fil attend sa première avancée.</p>
          <p className="text-muted mt-2">Elle pourrait bien être la tienne.</p>
        </div>
      </div>
    );
  const loop = posts.length >= 4 ? [...posts, ...posts] : posts;
  return (
    <div className="relative h-[520px] rounded-[28px] overflow-hidden bg-surface-2 border border-line" aria-label="Dernières publications de la promo">
      <div className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 bg-surface border border-line rounded-full px-3 py-1.5 text-[13px] font-semibold shadow-sm">
        <span className="w-2 h-2 rounded-full bg-mint animate-pulse" /> En direct de la promo
      </div>
      <div className="px-4 pt-16" style={posts.length >= 4 ? { animation: `ticker ${posts.length * 6}s linear infinite` } : undefined}>
        {loop.map((p, i) => {
          const img = postImages(p)[0];
          return (
            <Link key={`${p.id}-${i}`} href={`/p/${p.id}`} className="block bg-surface border border-line rounded-2xl p-4 mb-3 hover:border-line-strong transition">
              <div className="flex items-center gap-2.5">
                <Avatar profile={p.author} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">{displayName(p.author)}</p>
                  <p className="text-xs text-muted">{timeAgo(p.created_at)}</p>
                </div>
                <KindBadge kind={p.kind} />
              </div>
              {p.content && <p className="text-[14px] mt-2.5 line-clamp-3 leading-snug text-ink-2">{p.content}</p>}
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="mt-2.5 rounded-xl h-32 w-full object-cover" loading="lazy" />
              )}
              {!img && p.video_url && (
                <div className="mt-2.5 rounded-xl h-32 w-full bg-[#0d1120] text-white grid place-items-center">
                  <span className="w-11 h-11 rounded-full bg-white/15 grid place-items-center"><Play size={20} fill="currentColor" /></span>
                </div>
              )}
              <p className="text-xs text-muted mt-2.5">
                {p.likes.length > 0 && `${p.likes.length} réaction${p.likes.length > 1 ? "s" : ""}`}
                {p.likes.length > 0 && (p.comments?.[0]?.count ?? 0) > 0 && ", "}
                {(p.comments?.[0]?.count ?? 0) > 0 && `${p.comments[0].count} commentaire${p.comments[0].count > 1 ? "s" : ""}`}
              </p>
            </Link>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--surface-2)] to-transparent" />
    </div>
  );
}
