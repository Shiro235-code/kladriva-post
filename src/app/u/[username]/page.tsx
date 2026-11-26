"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MessageCircle, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Providers";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { Avatar, Empty, Modal, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Profile, Stats } from "@/lib/types";
import { badgesFor, cx, displayName } from "@/lib/utils";

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { session, refreshProfile } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"posts" | "media">("posts");

  const load = useCallback(async () => {
    const { data } = await sb().from("profiles").select("*").eq("username", decodeURIComponent(username).toLowerCase()).maybeSingle();
    setP(data as Profile);
    setLoading(false);
    if (!data) return;
    const since = new Date(Date.now() - 7 * 18 * 86400000).toISOString();
    const [{ data: st }, { data: ps }] = await Promise.all([
      sb().rpc("profile_stats", { uid: data.id }),
      sb().from("posts").select("created_at").eq("author_id", data.id).gte("created_at", since),
    ]);
    setStats(st as Stats);
    const map: Record<string, number> = {};
    (ps || []).forEach((r) => {
      const k = new Date(r.created_at).toLocaleDateString("fr-CA");
      map[k] = (map[k] || 0) + 1;
    });
    setDays(map);
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const message = async () => {
    if (!session) return router.push("/auth");
    if (!p) return;
    const { data, error } = await sb().rpc("get_or_create_dm", { other: p.id });
    if (error || !data) return toast("Impossible d'ouvrir la conversation.", "error");
    router.push(`/messages?c=${data}`);
  };

  if (loading) return <AppShell><div className="flex justify-center py-24"><Spinner /></div></AppShell>;
  if (!p)
    return (
      <AppShell>
        <div className="max-w-[620px] mx-auto">
          <Empty emoji="🧭" title="Profil introuvable" text="Ce nom d'utilisateur n'existe pas ou a changé.">
            <Link href="/explorer" className="btn btn-primary">Chercher un apprenant</Link>
          </Empty>
        </div>
      </AppShell>
    );

  const me = session?.user.id === p.id;
  const badges = badgesFor(stats);
  const earned = badges.filter((b) => b.earned).length;

  return (
    <AppShell>
      <div className="max-w-[620px] mx-auto">
        <section className="panel overflow-hidden">
          <div className="h-36 sm:h-44 relative" style={{ background: "linear-gradient(120deg, #2f4bff 0%, #5b4dff 50%, #7b5cff 100%)" }}>
            <svg className="absolute inset-0 w-full h-full opacity-25" aria-hidden>
              <defs>
                <pattern id="steps" width="56" height="56" patternUnits="userSpaceOnUse">
                  <path d="M0 48h14v-14h14V20h14V6h14" stroke="#fff" strokeWidth="2" fill="none" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#steps)" />
            </svg>
          </div>
          <div className="px-5 sm:px-6 pb-6">
            <div className="flex items-end justify-between -mt-14 sm:-mt-16">
              <span className="rounded-full ring-[5px] ring-surface">
                <Avatar profile={p} size={112} />
              </span>
              <div className="flex gap-2 pb-1">
                {me ? (
                  <button onClick={() => setEditing(true)} className="btn btn-soft">Modifier le profil</button>
                ) : (
                  <>
                    <button onClick={message} className="btn btn-soft" aria-label="Envoyer un message"><MessageCircle size={17} /><span className="hidden sm:inline">Message</span></button>
                    <FollowButton userId={p.id} onChange={() => load()} />
                  </>
                )}
              </div>
            </div>
            <h1 className="font-display text-[30px] font-bold leading-tight mt-3">{displayName(p)}</h1>
            <p className="text-muted">@{p.username}</p>
            {p.headline && <p className="mt-2.5 font-semibold text-ink-2">{p.headline}</p>}
            {p.bio && <p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
            <p className="flex items-center gap-1.5 text-sm text-muted mt-3">
              <CalendarDays size={15} /> Membre depuis {new Date(p.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </p>

            {stats && (
              <dl className="grid grid-cols-4 gap-2 mt-5">
                <Stat n={stats.posts} label="publications" />
                <Stat n={stats.followers} label="abonnés" />
                <Stat n={stats.following} label="abonnements" />
                <Stat n={stats.reactions} label="réactions" />
              </dl>
            )}
          </div>
        </section>

        {stats && (
          <section className="grid sm:grid-cols-[180px_1fr] gap-3 mt-3">
            <div className="rounded-[18px] p-5 text-[#14182b]" style={{ background: "linear-gradient(150deg, #ffd85c, #ffc531 55%, #ffab3d)" }}>
              <p className="text-3xl" aria-hidden>{stats.streak > 0 ? "🔥" : "🌱"}</p>
              <p className="font-display text-[40px] font-bold leading-none mt-1 tabular-nums">{stats.streak}</p>
              <p className="font-semibold text-sm mt-1">{stats.streak > 1 ? "jours de suite" : "jour de série"}</p>
            </div>
            <div className="panel p-4">
              <p className="font-semibold text-sm mb-2.5">Activité des 18 dernières semaines</p>
              <Heatmap days={days} />
            </div>
          </section>
        )}

        <section className="panel p-5 mt-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">Badges</h2>
            <span className="text-sm text-muted">{earned} sur {badges.length}</span>
          </div>
          <ul className="grid grid-cols-4 gap-2 mt-3">
            {badges.map((b) => (
              <li key={b.id} title={`${b.name} : ${b.hint}`} className={cx("rounded-2xl p-2.5 text-center border", b.earned ? "border-transparent bg-sun-soft" : "border-dashed border-line-strong")}>
                <span className={cx("text-[28px] block", !b.earned && "grayscale opacity-35")} aria-hidden>{b.emoji}</span>
                <span className={cx("block text-[12px] font-semibold mt-1 leading-tight", !b.earned && "text-muted")}>{b.name}</span>
                {!b.earned && <span className="block text-[10.5px] text-muted leading-tight mt-0.5">{b.hint}</span>}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex gap-6 border-b border-line mt-7 mb-4" role="tablist">
          {(
            [
              ["posts", "Publications"],
              ["media", "Photos"],
            ] as const
          ).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("relative pb-3 text-[15px] font-semibold", tab === t ? "text-ink" : "text-muted hover:text-ink-2")}>
              {label}
              {tab === t && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-full bg-cobalt" />}
            </button>
          ))}
        </div>

        <Feed
          key={`${p.id}-${tab}`}
          authorId={p.id}
          mediaOnly={tab === "media"}
          showComposer={me && tab === "posts"}
          kindFilter={tab === "posts"}
          empty={{ emoji: me ? "✍️" : "🌱", title: me ? "Partage ta première avancée" : "Aucune publication pour l'instant", text: me ? "Même un petit pas compte. Raconte ce que tu as appris aujourd'hui." : undefined }}
        />
      </div>
      {editing && (
        <EditProfile
          profile={p}
          onClose={() => setEditing(false)}
          onSaved={async (np) => {
            setEditing(false);
            toast("Profil mis à jour");
            await refreshProfile();
            if (np.username !== p.username) router.replace(`/u/${np.username}`);
            else load();
          }}
        />
      )}
    </AppShell>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-surface-2 rounded-2xl px-2 py-2.5 text-center">
      <dd className="font-display text-xl font-bold tabular-nums">{n}</dd>
      <dt className="text-[11.5px] text-muted">{label}</dt>
    </div>
  );
}

function Heatmap({ days }: { days: Record<string, number> }) {
  const weeks = 18;
  const today = new Date();
  // Colonnes = semaines, du lundi au dimanche
  const first = new Date(today);
  first.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const cols: { key: string; n: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(first);
      day.setDate(first.getDate() + w * 7 + d);
      const key = day.toLocaleDateString("fr-CA");
      col.push({ key, n: days[key] || 0, future: day > today });
    }
    cols.push(col);
  }
  const shade = (n: number) => (n === 0 ? "var(--surface-2)" : n === 1 ? "#b9c4ff" : n === 2 ? "#7b8cff" : "#2f4bff");
  return (
    <div className="flex gap-[3px] overflow-x-auto no-scrollbar">
      {cols.map((col, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {col.map((c) => (
            <span
              key={c.key}
              title={c.future ? "" : `${new Date(c.key).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : ${c.n} publication${c.n > 1 ? "s" : ""}`}
              className="w-[13px] h-[13px] rounded-[3.5px]"
              style={{ background: c.future ? "transparent" : shade(c.n), border: c.n === 0 && !c.future ? "1px solid var(--line)" : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function EditProfile({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: (p: Profile) => void }) {
  const [form, setForm] = useState({
    full_name: profile.full_name,
    username: profile.username,
    headline: profile.headline,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (f?: File) => {
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 4 * 1024 * 1024) return setError("Photo trop lourde (4 Mo max).");
    setUploading(true);
    const path = `${profile.id}/avatar-${Date.now()}.${f.name.split(".").pop() || "jpg"}`;
    const { error } = await sb().storage.from("media").upload(path, f, { contentType: f.type });
    setUploading(false);
    if (error) return setError("La photo n'a pas pu être envoyée.");
    setForm((s) => ({ ...s, avatar_url: sb().storage.from("media").getPublicUrl(path).data.publicUrl }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const username = form.username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (username.length < 3) {
      setBusy(false);
      return setError("Le nom d'utilisateur doit faire au moins 3 caractères.");
    }
    const { data, error } = await sb()
      .from("profiles")
      .update({ ...form, username, full_name: form.full_name.trim(), headline: form.headline.trim(), bio: form.bio.trim() })
      .eq("id", profile.id)
      .select()
      .single();
    setBusy(false);
    if (error) return setError(error.code === "23505" ? "Ce nom d'utilisateur est déjà pris." : "Enregistrement impossible. Réessaie.");
    onSaved(data as Profile);
  };

  return (
    <Modal open onClose={onClose} title="Modifier le profil">
      <form onSubmit={save} className="px-5 pb-5">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative group rounded-full" aria-label="Changer la photo">
            <Avatar profile={{ ...profile, ...form }} size={76} />
            <span className="absolute inset-0 rounded-full bg-[#0d1120]/55 grid place-items-center text-white opacity-0 group-hover:opacity-100 transition">
              {uploading ? <Spinner className="!border-white/30 !border-t-white" /> : <Camera size={20} />}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <p className="text-sm text-muted">Touche ta photo pour la changer.</p>
        </div>
        <div className="flex flex-col gap-3.5 mt-5">
          <Label text="Nom complet"><input className="field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={60} /></Label>
          <Label text="Nom d'utilisateur">
            <input className="field" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} minLength={3} maxLength={24} required />
          </Label>
          <Label text="Titre"><input className="field" placeholder="Ex. Apprenant développement web, promo 2026" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={80} /></Label>
          <Label text="Bio"><textarea className="field resize-none" rows={3} placeholder="Ce que tu apprends, ce qui te motive…" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={300} /></Label>
          {error && <p className="text-sm text-coral font-medium">{error}</p>}
          <button className="btn btn-primary !py-3 mt-1" disabled={busy || uploading}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="text-sm font-semibold flex flex-col gap-1.5">
      {text}
      {children}
    </label>
  );
}
