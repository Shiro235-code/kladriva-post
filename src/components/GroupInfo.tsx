"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronRight, LogOut, MessageCircle, MoreVertical, Pencil, ShieldCheck, ShieldOff, UserMinus, UserPlus, User, X, Newspaper } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { GroupLite, Member, Profile } from "@/lib/types";
import { cx, displayName, plural } from "@/lib/utils";
import { compressImage } from "@/lib/media";
import { useAuth } from "./AuthProvider";
import { useActivity, useToast } from "./Providers";
import { Avatar, Modal, Spinner } from "./ui";
import { GroupAvatar } from "./chat";
import { PeoplePicker } from "./PeoplePicker";

/** Panneau « Infos du groupe », comme dans WhatsApp. */
export function GroupInfo({
  group,
  members,
  onClose,
  onChanged,
  onLeft,
}: {
  group: GroupLite;
  members: Member[];
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const { session } = useAuth();
  const { online } = useActivity();
  const toast = useToast();
  const router = useRouter();
  const uid = session?.user.id;
  const me = members.find((m) => m.id === uid);
  const isAdmin = me?.role === "owner" || me?.role === "admin";
  const [editName, setEditName] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [name, setName] = useState(group.name);
  const [desc, setDesc] = useState(group.description || "");
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(group.name);
    setDesc(group.description || "");
  }, [group.name, group.description]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !adding && !confirmLeave && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose, adding, confirmLeave]);

  const save = async (patch: Partial<GroupLite>) => {
    const { error } = await sb().from("groups").update(patch).eq("id", group.id);
    if (error) {
      toast("Modification impossible. Seuls les admins peuvent modifier le groupe.", "error");
      return false;
    }
    onChanged();
    return true;
  };

  const changePhoto = async (f?: File) => {
    if (!f || !uid) return;
    setUploading(true);
    try {
      const small = await compressImage(f, { maxSize: 640, quality: 0.85, square: true });
      const path = `${uid}/group-${group.id}-${Date.now()}.${small.name.split(".").pop() || "jpg"}`;
      const { error } = await sb().storage.from("media").upload(path, small, { contentType: small.type, cacheControl: "31536000" });
      if (error) throw error;
      const url = sb().storage.from("media").getPublicUrl(path).data.publicUrl;
      if (await save({ avatar_url: url })) toast("Photo du groupe mise à jour");
    } catch {
      toast("La photo n'a pas pu être envoyée.", "error");
    } finally {
      setUploading(false);
    }
  };

  const rpc = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setMenu(null);
    const { error } = await sb().rpc(fn, args);
    if (error) return toast(error.message || "Action impossible.", "error");
    toast(ok);
    onChanged();
  };

  const dm = async (other: string) => {
    const { data, error } = await sb().rpc("get_or_create_dm", { other });
    if (error || !data) return toast("Impossible d'ouvrir la conversation.", "error");
    router.push(`/messages?c=${data}`);
  };

  const leave = async () => {
    if (!uid) return;
    const { error } = await sb().from("group_members").delete().eq("group_id", group.id).eq("user_id", uid);
    setConfirmLeave(false);
    if (error) return toast("Impossible de quitter le groupe.", "error");
    toast("Tu as quitté le groupe");
    onLeft();
  };

  const sorted = [...members].sort((a, b) => {
    if (a.id === uid) return -1;
    if (b.id === uid) return 1;
    const rank = { owner: 0, admin: 1, member: 2 };
    return rank[a.role] - rank[b.role] || displayName(a).localeCompare(displayName(b));
  });

  return (
    <aside className="fixed inset-0 z-50 md:static md:z-auto md:w-[360px] 2xl:w-[400px] shrink-0 md:border-l border-line bg-canvas flex flex-col min-h-0 sheet-in md:animate-none" aria-label="Infos du groupe">
      <div className="h-[64px] flex items-center gap-2 px-3 bg-surface border-b border-line shrink-0">
        <button onClick={onClose} className="icon-btn" aria-label="Fermer les infos"><X size={20} /></button>
        <p className="font-bold">Infos du groupe</p>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin">
        <section className="bg-surface px-6 pt-7 pb-5 text-center">
          <div className="relative inline-block">
            <GroupAvatar group={group} size={132} />
            {isAdmin && (
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 rounded-full bg-[#0d1120]/55 text-white opacity-0 hover:opacity-100 focus:opacity-100 transition grid place-items-center"
                aria-label="Changer la photo du groupe"
              >
                {uploading ? <Spinner className="!border-white/30 !border-t-white" /> : (
                  <span className="flex flex-col items-center gap-1 text-xs font-semibold"><Camera size={22} />Changer la photo</span>
                )}
              </button>
            )}
            {isAdmin && (
              <button onClick={() => fileRef.current?.click()} className="md:hidden absolute bottom-1 right-1 w-9 h-9 rounded-full bg-cobalt text-white grid place-items-center border-[3px] border-surface" aria-label="Changer la photo">
                <Camera size={15} />
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { changePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </div>

          {editName ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (name.trim().length < 2) return;
                if (await save({ name: name.trim() })) setEditName(false);
              }}
              className="flex items-center gap-2 mt-4"
            >
              <input className="field text-center font-semibold" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
              <button className="icon-btn !bg-cobalt !text-white shrink-0" aria-label="Enregistrer le nom"><Check size={18} /></button>
            </form>
          ) : (
            <h2 className="font-display text-[24px] font-bold mt-4 leading-tight flex items-center justify-center gap-1.5">
              {group.name}
              {isAdmin && <button onClick={() => setEditName(true)} className="icon-btn !w-8 !h-8" aria-label="Modifier le nom"><Pencil size={15} /></button>}
            </h2>
          )}
          <p className="text-muted text-sm mt-1">Groupe de {plural(members.length, "membre")}</p>
        </section>

        <section className="bg-surface mt-2 px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted">Description</p>
            {isAdmin && !editDesc && <button onClick={() => setEditDesc(true)} className="icon-btn !w-8 !h-8" aria-label="Modifier la description"><Pencil size={15} /></button>}
          </div>
          {editDesc ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await save({ description: desc.trim() })) setEditDesc(false);
              }}
              className="mt-2"
            >
              <textarea className="field resize-none" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} autoFocus />
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => { setEditDesc(false); setDesc(group.description || ""); }} className="btn btn-soft !py-1.5 text-sm">Annuler</button>
                <button className="btn btn-primary !py-1.5 text-sm">Enregistrer</button>
              </div>
            </form>
          ) : (
            <p className="mt-1 text-[15px] whitespace-pre-wrap">{group.description || <span className="text-muted">{isAdmin ? "Ajoute une description pour présenter le groupe." : "Pas de description."}</span>}</p>
          )}
          <Link href={`/groups/${group.id}`} className="flex items-center gap-3 mt-4 py-2 text-[15px] font-semibold hover:text-cobalt">
            <Newspaper size={19} className="text-muted" /> Publications du groupe <ChevronRight size={16} className="ml-auto text-muted" />
          </Link>
        </section>

        <section className="bg-surface mt-2 py-3">
          <p className="px-6 text-sm font-semibold text-muted mb-1">{plural(members.length, "membre")}</p>
          {isAdmin && (
            <button onClick={() => setAdding(true)} className="w-full flex items-center gap-3.5 px-6 py-2.5 hover:bg-surface-2 text-left">
              <span className="w-11 h-11 rounded-full bg-cobalt text-white grid place-items-center"><UserPlus size={20} /></span>
              <span className="font-semibold">Ajouter des membres</span>
            </button>
          )}
          <ul>
            {sorted.map((m) => (
              <li key={m.id} className="relative">
                <button onClick={() => setMenu(menu === m.id ? null : m.id)} className="w-full flex items-center gap-3.5 px-6 py-2.5 hover:bg-surface-2 text-left">
                  <Avatar profile={m} size={44} online={online.has(m.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{m.id === uid ? "Toi" : displayName(m)}</span>
                    <span className="block text-[13px] text-muted truncate">{m.headline || `@${m.username}`}</span>
                  </span>
                  {m.role !== "member" && (
                    <span className="text-[11px] font-bold text-mint bg-mint-soft px-2 py-0.5 rounded-md shrink-0">{m.role === "owner" ? "Créateur" : "Admin"}</span>
                  )}
                  {m.id !== uid && <MoreVertical size={16} className="text-muted shrink-0" />}
                </button>
                {menu === m.id && m.id !== uid && (
                  <div className="mx-6 mb-2 bg-surface-2 border border-line rounded-2xl p-1.5 picker-in" role="menu">
                    <MenuItem icon={<MessageCircle size={16} />} onClick={() => dm(m.id)}>Envoyer un message à {displayName(m).split(" ")[0]}</MenuItem>
                    <MenuItem icon={<User size={16} />} onClick={() => router.push(`/u/${m.username}`)}>Voir le profil</MenuItem>
                    {isAdmin && m.role === "member" && (
                      <MenuItem icon={<ShieldCheck size={16} />} onClick={() => rpc("set_group_role", { g: group.id, target: m.id, new_role: "admin" }, `${displayName(m)} est maintenant admin`)}>Nommer admin du groupe</MenuItem>
                    )}
                    {isAdmin && m.role === "admin" && (
                      <MenuItem icon={<ShieldOff size={16} />} onClick={() => rpc("set_group_role", { g: group.id, target: m.id, new_role: "member" }, `${displayName(m)} n'est plus admin`)}>Retirer le rôle d&apos;admin</MenuItem>
                    )}
                    {isAdmin && m.role !== "owner" && (
                      <MenuItem danger icon={<UserMinus size={16} />} onClick={() => rpc("remove_group_member", { g: group.id, target: m.id }, `${displayName(m)} a été retiré du groupe`)}>Retirer du groupe</MenuItem>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-surface mt-2 mb-6 py-2">
          {me?.role === "owner" ? (
            <p className="px-6 py-3 text-sm text-muted">Tu as créé ce groupe. Nomme un autre admin si tu veux partager la gestion.</p>
          ) : (
            <button onClick={() => setConfirmLeave(true)} className="w-full flex items-center gap-3.5 px-6 py-3 text-coral font-semibold hover:bg-coral-soft/60 text-left">
              <LogOut size={20} /> Quitter le groupe
            </button>
          )}
        </section>
      </div>

      <AddMembers open={adding} groupId={group.id} existing={members.map((m) => m.id)} onClose={() => setAdding(false)} onAdded={onChanged} />

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title={`Quitter « ${group.name} » ?`}>
        <div className="px-5 pb-5">
          <p className="text-ink-2">Tu ne recevras plus les messages de ce groupe. Un admin pourra te rajouter plus tard.</p>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setConfirmLeave(false)} className="btn btn-soft">Annuler</button>
            <button onClick={leave} className="btn bg-coral text-white">Quitter</button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}

function MenuItem({ children, icon, onClick, danger }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} role="menuitem" className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left hover:bg-surface", danger && "text-coral")}>
      {icon}
      {children}
    </button>
  );
}

export function AddMembers({ open, groupId, existing, onClose, onAdded }: { open: boolean; groupId: string; existing: string[]; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const add = async () => {
    if (!selected.length) return;
    setBusy(true);
    const { error } = await sb().rpc("add_group_members", { g: groupId, users: selected.map((p) => p.id) });
    setBusy(false);
    if (error) return toast(error.message || "Ajout impossible.", "error");
    toast(selected.length > 1 ? `${selected.length} membres ajoutés` : `${displayName(selected[0])} a été ajouté`);
    onAdded();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajouter des membres">
      <div className="px-5 pb-5">
        <PeoplePicker
          multiple
          exclude={existing}
          selected={selected}
          onToggle={(p) => setSelected((s) => (s.some((x) => x.id === p.id) ? s.filter((x) => x.id !== p.id) : [...s, p]))}
        />
        <button onClick={add} disabled={!selected.length || busy} className="btn btn-primary w-full mt-4 !py-3">
          {busy ? "Ajout…" : selected.length ? `Ajouter ${plural(selected.length, "personne")}` : "Choisis des personnes"}
        </button>
      </div>
    </Modal>
  );
}
