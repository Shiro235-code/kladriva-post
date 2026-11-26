"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Users, MessageCircle, User, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Avatar, Logo } from "./ui";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cx, displayName, groupColor } from "@/lib/utils";

export function AppShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const { profile, session, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();

  const nav = [
    { href: "/feed", label: "Fil", icon: Home },
    { href: "/groups", label: "Groupes", icon: Users },
    { href: "/messages", label: "Messages", icon: MessageCircle },
    { href: profile ? `/u/${profile.username}` : "/auth", label: "Profil", icon: User },
  ];
  const active = (href: string) => path === href || (href !== "/feed" && path.startsWith(href.split("/").slice(0, 2).join("/")));

  return (
    <div className="min-h-screen">
      {/* Barre mobile */}
      <header className="lg:hidden sticky top-0 z-30 bg-bg/85 backdrop-blur border-b border-line px-4 h-14 flex items-center justify-between">
        <Link href="/feed"><Logo /></Link>
        {session ? (
          <Link href={profile ? `/u/${profile.username}` : "/feed"}><Avatar profile={profile} size={32} /></Link>
        ) : (
          <Link href="/auth" className="btn btn-primary !py-2 !px-4 text-sm">Rejoindre</Link>
        )}
      </header>

      <div className={cx("mx-auto flex gap-8 px-4 lg:px-6", wide ? "max-w-[1240px]" : "max-w-[1240px]")}>
        {/* Barre latérale */}
        <aside className="hidden lg:flex flex-col w-[240px] shrink-0 sticky top-0 h-screen py-6">
          <Link href="/feed" className="px-3 mb-8"><Logo /></Link>
          <nav className="flex flex-col gap-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className={cx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[15px] transition",
                  active(href) ? "bg-ink text-white font-semibold" : "hover:bg-[#ebe9e1] text-ink",
                )}
              >
                <Icon size={20} strokeWidth={active(href) ? 2.4 : 1.8} />
                {label}
              </Link>
            ))}
          </nav>
          {session ? (
            <button onClick={() => router.push("/feed#composer")} className="btn btn-accent mt-6 w-full !py-3">
              <Sparkles size={16} /> Partager une avancée
            </button>
          ) : (
            <div className="card p-4 mt-6">
              <p className="font-semibold">Tu apprends avec Kladriva ?</p>
              <p className="text-sm text-muted mt-1">Crée ton compte pour publier, commenter et échanger.</p>
              <Link href="/auth" className="btn btn-primary w-full mt-3">Rejoindre</Link>
            </div>
          )}
          <div className="mt-auto">
            {session && (
              <div className="flex items-center gap-3 p-2 rounded-2xl hover:bg-[#ebe9e1]">
                <Avatar profile={profile} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{displayName(profile)}</p>
                  <p className="text-xs text-muted truncate">@{profile?.username}</p>
                </div>
                <button
                  title="Se déconnecter"
                  onClick={async () => { await signOut(); router.push("/"); }}
                  className="p-2 rounded-full hover:bg-white text-muted"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 py-6 pb-28 lg:pb-10">{children}</main>

        {!wide && <RightRail />}
      </div>

      {/* Navigation mobile */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-line grid grid-cols-4 h-16">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={label} href={href} className={cx("flex flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "text-ink font-semibold" : "text-muted")}>
            <Icon size={21} strokeWidth={active(href) ? 2.4 : 1.8} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function RightRail() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; color: string; group_members: { count: number }[] }[]>([]);

  useEffect(() => {
    sb().from("profiles").select("*").order("created_at", { ascending: false }).limit(5).then(({ data }) => setMembers((data as Profile[]) || []));
    sb().from("groups").select("id,name,color,group_members(count)").order("created_at", { ascending: false }).limit(5).then(({ data }) => setGroups((data as typeof groups) || []));
  }, []);

  return (
    <aside className="hidden xl:block w-[300px] shrink-0 py-6 sticky top-0 h-screen overflow-y-auto scroll-thin">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-muted font-semibold">Groupes</p>
        <div className="mt-3 flex flex-col gap-1">
          {groups.length === 0 && <p className="text-sm text-muted">Aucun groupe pour l&apos;instant.</p>}
          {groups.map((g) => {
            const c = groupColor(g.color);
            return (
              <Link key={g.id} href={`/groups/${g.id}`} className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-bg">
                <span className="w-9 h-9 rounded-xl grid place-items-center font-bold" style={{ background: c.bg, color: c.fg }}>
                  {g.name[0]?.toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{g.name}</span>
                  <span className="block text-xs text-muted">{g.group_members?.[0]?.count ?? 0} membres</span>
                </span>
              </Link>
            );
          })}
        </div>
        <Link href="/groups" className="text-sm font-semibold mt-3 inline-block hover:underline">Voir tous les groupes →</Link>
      </div>

      <div className="card p-5 mt-4">
        <p className="text-xs uppercase tracking-[0.14em] text-muted font-semibold">Nouveaux apprenants</p>
        <div className="mt-3 flex flex-col gap-1">
          {members.map((m) => (
            <Link key={m.id} href={`/u/${m.username}`} className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-bg">
              <Avatar profile={m} size={36} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{displayName(m)}</span>
                <span className="block text-xs text-muted truncate">{m.headline || `@${m.username}`}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted mt-4 px-1">© {new Date().getFullYear()} Kladriva · Fait pour apprendre ensemble.</p>
    </aside>
  );
}
