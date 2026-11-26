"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MessageCircle, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Feed } from "@/components/Feed";
import { Avatar, Empty, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { displayName } from "@/lib/utils";

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { session, refreshProfile } = useAuth();
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState({ posts: 0, groups: 0 });

  const load = async () => {
    const { data } = await sb().from("profiles").select("*").eq("username", decodeURIComponent(username)).maybeSingle();
    setP(data as Profile);
    setLoading(false);
    if (data) {
      const [a, b] = await Promise.all([
        sb().from("posts").select("id", { count: "exact", head: true }).eq("author_id", data.id),
        sb().from("group_members").select("group_id", { count: "exact", head: true }).eq("user_id", data.id),
      ]);
      setStats({ posts: a.count ?? 0, groups: b.count ?? 0 });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const message = async () => {
    if (!session) return router.push("/auth");
    if (!p) return;
    const { data } = await sb().rpc("get_or_create_dm", { other: p.id });
    if (data) router.push(`/messages?c=${data}`);
  };

  if (loading) return <AppShell><div className="flex justify-center py-20"><Spinner /></div></AppShell>;
  if (!p) return <AppShell><Empty title="Profil introuvable." /></AppShell>;

  const me = session?.user.id === p.id;

  return (
    <AppShell>
      <div className="max-w-[640px] mx-auto">
        <div className="card overflow-hidden mb-5">
          <div className="h-36 relative bg-ink overflow-hidden">
            <div className="absolute -right-20 -top-24 w-80 h-80 rounded-full blur-[70px] opacity-70" style={{ background: "#ff5b2e" }} />
            <div className="absolute left-10 -bottom-32 w-72 h-72 rounded-full blur-[70px] opacity-50" style={{ background: "#6a4cff" }} />
            <div className="grain" />
          </div>
          <div className="px-6 pb-6">
            <div className="flex items-end justify-between -mt-12">
              <div className="ring-4 ring-white rounded-full">
                <Avatar profile={p} size={96} />
              </div>
              {me ? (
                <button onClick={() => setEditing(true)} className="btn btn-ghost">Modifier le profil</button>
              ) : (
                <button onClick={message} className="btn btn-primary"><MessageCircle size={16} /> Message</button>
              )}
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] mt-4">{displayName(p)}</h1>
            <p className="text-muted">@{p.username}</p>
            {p.headline && <p className="mt-3 font-medium">{p.headline}</p>}
            {p.bio && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
            <div className="flex gap-6 mt-4 text-sm">
              <span><b className="tabular-nums">{stats.posts}</b> <span className="text-muted">publications</span></span>
              <span><b className="tabular-nums">{stats.groups}</b> <span className="text-muted">groupes</span></span>
              <span className="text-muted">Membre depuis {new Date(p.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</span>
            </div>
          </div>
        </div>
        <Feed authorId={p.id} showComposer={me} emptyText={me ? "Partage ta première avancée !" : "Aucune publication pour l'instant."} />
      </div>
      {editing && (
        <EditProfile
          profile={p}
          onClose={() => setEditing(false)}
          onSaved={async (np) => {
            setEditing(false);
            await refreshProfile();
            if (np.username !== p.username) router.replace(`/u/${np.username}`);
            else load();
          }}
        />
      )}
    </AppShell>
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
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (f?: File) => {
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 3 * 1024 * 1024) return setError("Image trop lourde (3 Mo max).");
    const path = `${profile.id}/avatar-${Date.now()}.${f.name.split(".").pop() || "jpg"}`;
    const { error } = await sb().storage.from("media").upload(path, f, { contentType: f.type });
    if (error) return setError(error.message);
    setForm((s) => ({ ...s, avatar_url: sb().storage.from("media").getPublicUrl(path).data.publicUrl }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const username = form.username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const { data, error } = await sb()
      .from("profiles")
      .update({ ...form, username, full_name: form.full_name.trim(), headline: form.headline.trim(), bio: form.bio.trim() })
      .eq("id", profile.id)
      .select()
      .single();
    setBusy(false);
    if (error) return setError(error.code === "23505" ? "Ce nom d'utilisateur est déjà pris." : error.message);
    onSaved(data as Profile);
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card w-full max-w-[480px] p-6 rise max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-2xl font-semibold tracking-tight">Mon profil</p>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-bg"><X size={18} /></button>
        </div>
        <div className="flex items-center gap-4 mt-5">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative group rounded-full">
            <Avatar profile={{ ...profile, ...form }} size={72} />
            <span className="absolute inset-0 rounded-full bg-ink/50 grid place-items-center text-white opacity-0 group-hover:opacity-100 transition"><Camera size={20} /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <p className="text-sm text-muted">Clique sur l&apos;avatar pour changer ta photo.</p>
        </div>
        <div className="flex flex-col gap-3 mt-5">
          <label className="text-sm font-medium">Nom complet
            <input className="input mt-1" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={60} />
          </label>
          <label className="text-sm font-medium">Nom d&apos;utilisateur
            <input className="input mt-1" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} minLength={3} maxLength={24} required />
          </label>
          <label className="text-sm font-medium">Titre
            <input className="input mt-1" placeholder="Ex. Apprenant·e Dev Web · Promo 2026" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={80} />
          </label>
          <label className="text-sm font-medium">Bio
            <textarea className="input mt-1 resize-none" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={300} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn btn-primary !py-3 mt-1" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </div>
  );
}
