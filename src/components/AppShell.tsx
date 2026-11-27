"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Compass, Users, MessageCircle, Bell, Trophy, Bookmark, User, LogOut, Search, Plus, Moon, Sun, PenLine, Flame, Sprout, Medal } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useActivity, useTheme } from "./Providers";
import { Avatar, Logo, LogoMark } from "./ui";
import { CommandPalette } from "./CommandPalette";
import { ComposerModal } from "./Composer";
import { FollowButton } from "./FollowButton";
import { sb } from "@/lib/supabase";
import type { PostKind, Profile, Stats } from "@/lib/types";
import { cx, displayName } from "@/lib/utils";

export function AppShell({ children, wide = false, full = false, chat = false }: { children: React.ReactNode; wide?: boolean; full?: boolean; chat?: boolean }) {
  const { profile, session, signOut, loading: authLoading } = useAuth();
  const signedOut = !authLoading && !session;
  const { unreadNotifs, unreadMessages } = useActivity();
  const { theme, toggle } = useTheme();
  const path = usePathname();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [compose, setCompose] = useState<{ open: boolean; groupId?: string; kind?: PostKind }>({ open: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    const onCompose = (e: Event) => {
      if (!session) return router.push("/auth");
      const d = (e as CustomEvent).detail || {};
      setCompose({ open: true, groupId: d.groupId, kind: d.kind });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("kp:compose", onCompose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kp:compose", onCompose);
    };
  }, [session, router]);

  const me = profile ? `/u/${profile.username}` : signedOut ? "/auth" : "/moi";
  const nav = [
    { href: "/feed", label: "Accueil", icon: Home },
    { href: "/explorer", label: "Explorer", icon: Compass },
    { href: "/groups", label: "Groupes", icon: Users },
    { href: "/messages", label: "Messages", icon: MessageCircle, badge: unreadMessages, auth: true },
    { href: "/notifications", label: "Notifications", icon: Bell, badge: unreadNotifs, auth: true },
    { href: "/classement", label: "Classement", icon: Trophy },
    { href: "/enregistres", label: "Enregistrés", icon: Bookmark, auth: true },
    { href: me, label: "Profil", icon: User },
  ].filter((n) => !n.auth || session || authLoading);

  const isActive = (href: string) => {
    if (href === "/feed") return path === "/feed";
    if (href.startsWith("/u/")) return path === href;
    return path.startsWith(href);
  };

  const openCompose = () => (session ? setCompose({ open: true }) : router.push("/auth"));

  return (
    <div className="min-h-screen">
      {/* En-tête mobile */}
      <header className="lg:hidden sticky top-0 z-30 bg-canvas/90 backdrop-blur-md border-b border-line px-4 pt-[env(safe-area-inset-top)] h-[calc(3.5rem+env(safe-area-inset-top))] flex items-center justify-between">
        <Link href="/feed" aria-label="Accueil"><Logo size={28} /></Link>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setPalette(true)} className="icon-btn" aria-label="Rechercher"><Search size={20} /></button>
          {!signedOut ? (
            <Link href="/notifications" className="icon-btn relative" aria-label="Notifications">
              <Bell size={20} />
              <Dot n={unreadNotifs} />
            </Link>
          ) : (
            <Link href="/auth" className="btn btn-primary !py-1.5 !px-3.5 text-sm ml-1">Rejoindre</Link>
          )}
        </div>
      </header>

      {chat && <ChatRail nav={nav} isActive={isActive} openCompose={openCompose} />}
      <div className={cx("flex w-full", chat ? "lg:pl-[76px]" : "gap-6 xl:gap-8 2xl:gap-10 px-3 sm:px-4 lg:px-6 2xl:px-10")}>
        {/* Barre latérale */}
        <aside className={cx("hidden flex-col w-[236px] xl:w-[256px] 2xl:w-[280px] shrink-0 sticky top-0 h-screen py-5", !chat && "lg:flex")}>
          <Link href="/feed" className="px-3 mb-7 mt-1" aria-label="Accueil"><Logo /></Link>
          <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
            {nav.map(({ href, label, icon: Icon, badge }) => {
              const on = isActive(href);
              return (
                <Link
                  key={label}
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "group flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-[15.5px] transition",
                    on ? "font-bold text-ink bg-surface shadow-[0_1px_0_var(--line)] border border-line" : "text-ink-2 hover:bg-surface/70 border border-transparent",
                  )}
                >
                  <span className="relative">
                    <Icon size={21} strokeWidth={on ? 2.5 : 1.9} className={on ? "text-cobalt" : ""} />
                    <Dot n={badge || 0} />
                  </span>
                  {label}
                </Link>
              );
            })}
          </nav>
          <button onClick={openCompose} className="btn btn-primary mt-5 w-full !py-3 text-[15px]">
            <PenLine size={17} /> Publier
          </button>

          {signedOut && (
            <div className="mt-5 px-1">
              <p className="font-display text-lg font-semibold leading-tight">Tu apprends avec Kladriva ?</p>
              <p className="text-sm text-muted mt-1">Crée ton compte pour publier, réagir et échanger avec ta promo.</p>
              <Link href="/auth?mode=signup" className="btn btn-ink w-full mt-3">Créer mon compte</Link>
            </div>
          )}

          <div className="mt-auto flex flex-col gap-1">
            <button onClick={toggle} className="flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-ink-2 hover:bg-surface/70 text-[15px]">
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
              {theme === "dark" ? "Mode clair" : "Mode sombre"}
            </button>
            {session && (
              <div className="flex items-center gap-3 p-2 rounded-2xl hover:bg-surface/70">
                <Link href={me} className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar profile={profile} size={38} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{displayName(profile)}</span>
                    <span className="block text-xs text-muted truncate">@{profile?.username}</span>
                  </span>
                </Link>
                <button
                  title="Se déconnecter"
                  aria-label="Se déconnecter"
                  onClick={async () => {
                    await signOut();
                    router.push("/");
                  }}
                  className="icon-btn"
                >
                  <LogOut size={17} />
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className={cx("flex-1 min-w-0 flex", !chat && "gap-6 xl:gap-8 2xl:gap-10")}>
          <main className={cx("flex-1 min-w-0", chat ? "p-0" : "pt-4 lg:pt-5 pb-28 lg:pb-12")}>
            {/* Barre de recherche (bureau) */}
            <div className={cx("hidden lg:flex mb-5", !full && "max-w-[680px] 2xl:max-w-[780px] mx-auto", (wide || chat) && "!hidden")}>
              <button
                onClick={() => setPalette(true)}
                className="flex items-center gap-2.5 bg-surface border border-line rounded-full pl-4 pr-2 h-11 w-full text-muted hover:border-line-strong transition"
              >
                <Search size={17} />
                <span className="flex-1 text-left text-sm">Rechercher</span>
                <kbd className="text-[11px] border border-line rounded-md px-1.5 py-0.5 bg-surface-2">Ctrl K</kbd>
              </button>
            </div>
            {children}
          </main>
          {!wide && !chat && <RightRail />}
        </div>
      </div>

      {/* Navigation mobile */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur-md border-t border-line h-[calc(68px+env(safe-area-inset-bottom))] grid grid-cols-5 items-center pb-[env(safe-area-inset-bottom)]" aria-label="Navigation">
        <MobileTab href="/feed" label="Accueil" icon={Home} on={isActive("/feed")} />
        <MobileTab href="/groups" label="Groupes" icon={Users} on={isActive("/groups")} />
        <button onClick={openCompose} className="justify-self-center w-12 h-12 rounded-2xl bg-cobalt text-white grid place-items-center shadow-[var(--shadow-pop)]" aria-label="Publier">
          <Plus size={24} strokeWidth={2.5} />
        </button>
        <MobileTab href="/messages" label="Messages" icon={MessageCircle} on={isActive("/messages")} badge={unreadMessages} />
        <MobileTab href={me} label="Profil" icon={User} on={isActive(me)} />
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ComposerModal open={compose.open} onClose={() => setCompose({ open: false })} initialGroupId={compose.groupId} initialKind={compose.kind} />
    </div>
  );
}

/** Barre d'icônes étroite, utilisée dans la messagerie pour laisser toute la place aux discussions. */
function ChatRail({
  nav,
  isActive,
  openCompose,
}: {
  nav: { href: string; label: string; icon: typeof Home; badge?: number }[];
  isActive: (href: string) => boolean;
  openCompose: () => void;
}) {
  const { theme, toggle } = useTheme();
  return (
    <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[76px] z-30 flex-col items-center py-4 gap-1 bg-canvas">
      <Link href="/feed" aria-label="Accueil" className="mb-4"><LogoMark size={38} /></Link>
      {nav.map(({ href, label, icon: Icon, badge }) => {
        const on = isActive(href);
        return (
          <Link
            key={label}
            href={href}
            title={label}
            aria-label={label}
            aria-current={on ? "page" : undefined}
            className={cx("relative w-12 h-12 rounded-2xl grid place-items-center transition", on ? "bg-surface text-cobalt border border-line" : "text-ink-2 hover:bg-surface/70")}
          >
            <Icon size={22} strokeWidth={on ? 2.4 : 1.9} />
            <span className="absolute top-1.5 right-1.5"><Dot n={badge || 0} /></span>
          </Link>
        );
      })}
      <button onClick={openCompose} title="Publier" aria-label="Publier" className="mt-2 w-12 h-12 rounded-2xl bg-cobalt text-white grid place-items-center">
        <PenLine size={20} />
      </button>
      <button onClick={toggle} title={theme === "dark" ? "Mode clair" : "Mode sombre"} aria-label="Changer de thème" className="mt-auto w-12 h-12 rounded-2xl grid place-items-center text-ink-2 hover:bg-surface/70">
        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </aside>
  );
}

function Dot({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-coral text-white text-[10px] font-bold grid place-items-center border-2 border-canvas">
      {n > 9 ? "9+" : n}
    </span>
  );
}

function MobileTab({ href, label, icon: Icon, on, badge = 0 }: { href: string; label: string; icon: typeof Home; on: boolean; badge?: number }) {
  return (
    <Link href={href} className={cx("flex flex-col items-center justify-center gap-0.5 text-[11px]", on ? "text-cobalt font-bold" : "text-muted")} aria-current={on ? "page" : undefined}>
      <span className="relative">
        <Icon size={22} strokeWidth={on ? 2.5 : 1.9} />
        <Dot n={badge} />
      </span>
      {label}
    </Link>
  );
}

/* ---------------- Colonne de droite ---------------- */
function RightRail() {
  const { session, profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [top, setTop] = useState<{ p: Profile; score: number }[]>([]);
  const [suggest, setSuggest] = useState<Profile[]>([]);

  useEffect(() => {
    sb()
      .rpc("leaderboard", { days_back: 7 })
      .then(async ({ data }) => {
        const rows = ((data as { user_id: string; score: number }[]) || []).slice(0, 3);
        if (!rows.length) return setTop([]);
        const { data: ps } = await sb().from("profiles").select("*").in("id", rows.map((r) => r.user_id));
        setTop(rows.map((r) => ({ p: (ps as Profile[]).find((x) => x.id === r.user_id)!, score: r.score })).filter((x) => x.p));
      });
  }, []);

  useEffect(() => {
    const uid = session?.user.id;
    if (uid) sb().rpc("profile_stats", { uid }).then(({ data }) => setStats(data as Stats));
    (async () => {
      let exclude: string[] = [];
      if (uid) {
        const { data } = await sb().from("follows").select("following_id").eq("follower_id", uid);
        exclude = [uid, ...(data || []).map((r) => r.following_id)];
      }
      let q = sb().from("profiles").select("*").order("created_at", { ascending: false }).limit(4);
      if (exclude.length) q = q.not("id", "in", `(${exclude.join(",")})`);
      const { data } = await q;
      setSuggest((data as Profile[]) || []);
    })();
  }, [session]);

  return (
    <aside className="hidden xl:flex flex-col gap-6 w-[300px] 2xl:w-[360px] shrink-0 py-5 sticky top-0 h-screen overflow-y-auto no-scrollbar">
      {session && stats && <Momentum stats={stats} name={displayName(profile).split(" ")[0]} />}

      <section>
        <div className="flex items-baseline justify-between px-1 mb-2">
          <h2 className="font-display text-lg font-semibold">Les plus actifs cette semaine</h2>
        </div>
        {top.length === 0 ? (
          <p className="text-sm text-muted px-1">Personne n&apos;a encore publié cette semaine. Ouvre le bal.</p>
        ) : (
          <ol className="flex flex-col">
            {top.map(({ p, score }, i) => (
              <li key={p.id}>
                <Link href={`/u/${p.username}`} className="flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-surface/70">
                  <span className="w-5 text-center font-display font-bold text-muted">{i + 1}</span>
                  <Avatar profile={p} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{displayName(p)}</span>
                    <span className="block text-xs text-muted">{score} points</span>
                  </span>
                  {i === 0 && <Medal size={18} className="text-[#d4a106]" aria-hidden />}
                </Link>
              </li>
            ))}
          </ol>
        )}
        <Link href="/classement" className="text-sm font-semibold text-cobalt px-1 mt-1 inline-block hover:underline">Voir le classement</Link>
      </section>

      {suggest.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold px-1 mb-2">Apprenants à suivre</h2>
          <ul className="flex flex-col">
            {suggest.map((m) => (
              <li key={m.id}>
                <Link href={`/u/${m.username}`} className="flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-surface/70">
                  <Avatar profile={m} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{displayName(m)}</span>
                    <span className="block text-xs text-muted truncate">{m.headline || `@${m.username}`}</span>
                  </span>
                  {session && <FollowButton userId={m.id} compact />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted px-1 mt-auto">Kladriva Post, le réseau des apprenants Kladriva.</p>
    </aside>
  );
}

/** Carte « élan » : la série de jours consécutifs avec publication. */
function Momentum({ stats, name }: { stats: Stats; name: string }) {
  const s = stats.streak;
  const goal = s < 3 ? 3 : s < 7 ? 7 : s < 14 ? 14 : 30;
  const pct = Math.min(100, Math.round((s / goal) * 100));
  return (
    <section className="rounded-3xl p-5 text-[#14182b] relative overflow-hidden" style={{ background: "linear-gradient(150deg, #ffd85c, #ffc531 55%, #ffab3d)" }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-[44px] font-bold leading-none tabular-nums">{s}</p>
          <p className="font-semibold mt-1">{s > 1 ? "jours de suite" : "jour de série"}</p>
        </div>
        <span className="w-12 h-12 rounded-2xl bg-[#14182b] text-sun grid place-items-center" aria-hidden>{s > 0 ? <Flame size={24} fill="currentColor" /> : <Sprout size={24} />}</span>
      </div>
      <div className="h-2 bg-[#14182b]/15 rounded-full mt-4 overflow-hidden">
        <div className="h-full bg-[#14182b] rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm mt-2.5 font-medium">
        {s === 0 ? `Publie aujourd'hui pour lancer ta série, ${name}.` : `Encore ${goal - s} jour${goal - s > 1 ? "s" : ""} pour atteindre ${goal}.`}
      </p>
    </section>
  );
}
