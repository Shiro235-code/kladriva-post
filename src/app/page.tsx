"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Heart, MessageCircle, Users, Zap } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/ui";
import { sb } from "@/lib/supabase";

export default function Landing() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<{ members: number; posts: number; groups: number } | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace("/feed");
  }, [loading, session, router]);

  useEffect(() => {
    Promise.all([
      sb().from("profiles").select("id", { count: "exact", head: true }),
      sb().from("posts").select("id", { count: "exact", head: true }),
      sb().from("groups").select("id", { count: "exact", head: true }),
    ]).then(([m, p, g]) => setStats({ members: m.count ?? 0, posts: p.count ?? 0, groups: g.count ?? 0 }));
  }, []);

  return (
    <div className="bg-bg">
      {/* HERO */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div
          className="absolute -top-40 -right-40 w-[720px] h-[720px] rounded-full opacity-60 blur-[120px]"
          style={{ background: "radial-gradient(circle, #ff5b2e 0%, rgba(255,91,46,0) 65%)" }}
        />
        <div
          className="absolute -bottom-60 -left-40 w-[640px] h-[640px] rounded-full opacity-40 blur-[120px]"
          style={{ background: "radial-gradient(circle, #6a4cff 0%, rgba(106,76,255,0) 65%)" }}
        />
        <div className="grain" />

        <div className="relative max-w-[1200px] mx-auto px-6">
          <nav className="flex items-center justify-between h-20">
            <Logo light />
            <div className="flex items-center gap-2">
              <Link href="/feed" className="hidden sm:inline-flex btn text-white/80 hover:text-white">Explorer</Link>
              <Link href="/auth" className="btn bg-white text-ink hover:bg-white/90">Se connecter</Link>
            </div>
          </nav>

          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center pt-10 pb-24 lg:pt-16 lg:pb-32">
            <div className="rise">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/60 border border-white/15 rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Le réseau des apprenants Kladriva
              </p>
              <h1 className="mt-6 text-[52px] leading-[0.98] sm:text-[76px] lg:text-[92px] font-semibold tracking-[-0.04em]">
                Montre ce que
                <br />
                tu <span className="font-display italic font-normal text-accent tracking-[-0.02em]">apprends.</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-white/70 max-w-[520px] leading-relaxed">
                Chaque jour, une avancée. Partage tes progrès, reçois des retours de ta promo et avance plus vite, ensemble.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/auth?mode=signup" className="btn btn-accent !px-7 !py-4 text-base">
                  Rejoindre la promo <ArrowRight size={18} />
                </Link>
                <Link href="/feed" className="btn !px-7 !py-4 text-base border border-white/20 text-white hover:bg-white/10">
                  Voir le fil
                </Link>
              </div>
              {stats && (
                <div className="mt-12 flex gap-10 text-white/60 text-sm">
                  <Stat n={stats.members} label="apprenants" />
                  <Stat n={stats.posts} label="avancées partagées" />
                  <Stat n={stats.groups} label="groupes" />
                </div>
              )}
            </div>

            {/* Cartes flottantes */}
            <div className="relative h-[440px] hidden md:block">
              <MockCard
                className="absolute top-0 left-6 w-[340px]"
                rotate="-4deg"
                delay="0s"
                name="Aïcha N."
                tag="Jour 12 · React"
                text="Mon premier composant qui consomme une vraie API 🎉 Merci pour l'aide d'hier sur les hooks !"
                likes={24}
                comments={8}
                tone="#ff5b2e"
              />
              <MockCard
                className="absolute top-[170px] right-0 w-[320px]"
                rotate="3deg"
                delay="-2.5s"
                name="Junior K."
                tag="Projet · IA"
                text="Démo du chatbot RAG terminée. Il répond enfin avec les sources 👀"
                likes={41}
                comments={12}
                tone="#6a4cff"
              />
              <div
                className="absolute bottom-0 left-16 floaty bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ ["--r" as string]: "-2deg", animationDelay: "-4s" }}
              >
                <span className="w-8 h-8 rounded-full bg-[#17803d] grid place-items-center text-xs font-bold">M</span>
                <span className="text-sm">
                  <b>Marc</b> a rejoint <b>Design UX</b>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FONCTIONNALITÉS */}
      <section className="max-w-[1200px] mx-auto px-6 py-24">
        <h2 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] max-w-[700px]">
          Tout ce qu&apos;il faut pour apprendre <span className="font-display italic font-normal">en public.</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          <Feature
            icon={<Zap size={22} />}
            title="Le fil des avancées"
            text="Publie tes progrès avec texte et images. Les likes et commentaires arrivent en temps réel."
            bg="#ffe9df"
            fg="#d3400f"
            big
          />
          <Feature icon={<Users size={22} />} title="Des groupes" text="Par module, par projet, par équipe. Crée le tien en dix secondes." bg="#ece8ff" fg="#4a32d4" />
          <Feature icon={<MessageCircle size={22} />} title="Messagerie privée" text="Échange en direct avec n'importe quel apprenant ou formateur." bg="#e2f6e8" fg="#17803d" />
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="max-w-[1200px] mx-auto px-6 pb-24">
        <div className="relative overflow-hidden rounded-[32px] bg-accent text-white px-8 py-16 sm:px-16 sm:py-20">
          <div className="grain" />
          <p className="relative font-display italic text-5xl sm:text-7xl leading-[0.95] max-w-[760px]">
            Ta prochaine avancée mérite d&apos;être vue.
          </p>
          <Link href="/auth?mode=signup" className="relative btn bg-ink text-white hover:bg-black !px-7 !py-4 text-base mt-10">
            Créer mon compte gratuitement <ArrowRight size={18} />
          </Link>
        </div>
        <footer className="flex items-center justify-between mt-10 text-sm text-muted">
          <Logo />
          <span>© {new Date().getFullYear()} Kladriva</span>
        </footer>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold text-white tabular-nums">{n}</p>
      <p>{label}</p>
    </div>
  );
}

function Feature({ icon, title, text, bg, fg, big }: { icon: React.ReactNode; title: string; text: string; bg: string; fg: string; big?: boolean }) {
  return (
    <div className="card p-8 flex flex-col justify-between min-h-[240px] hover:-translate-y-1 transition" style={big ? { background: bg, borderColor: "transparent" } : undefined}>
      <span className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: big ? "#fff" : bg, color: fg }}>
        {icon}
      </span>
      <div className="mt-10">
        <p className="text-2xl font-semibold tracking-tight">{title}</p>
        <p className="text-muted mt-2 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function MockCard({
  className,
  rotate,
  delay,
  name,
  tag,
  text,
  likes,
  comments,
  tone,
}: {
  className: string;
  rotate: string;
  delay: string;
  name: string;
  tag: string;
  text: string;
  likes: number;
  comments: number;
  tone: string;
}) {
  return (
    <div className={`${className} floaty bg-white text-ink rounded-3xl p-5 shadow-2xl shadow-black/40`} style={{ ["--r" as string]: rotate, animationDelay: delay }}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full grid place-items-center text-white font-semibold" style={{ background: tone }}>
          {name[0]}
        </span>
        <div>
          <p className="font-semibold text-sm">{name}</p>
          <p className="text-xs text-muted">{tag}</p>
        </div>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed">{text}</p>
      <div className="flex gap-4 mt-4 text-sm text-muted">
        <span className="flex items-center gap-1.5 text-accent"><Heart size={16} fill="currentColor" /> {likes}</span>
        <span className="flex items-center gap-1.5"><MessageCircle size={16} /> {comments}</span>
      </div>
    </div>
  );
}
