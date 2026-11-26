"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { GROUP_ICONS, GROUP_PALETTE, cx, groupGradient, plural } from "@/lib/utils";
import { compressImage } from "@/lib/media";
import { useAuth } from "./AuthProvider";
import { useToast } from "./Providers";
import { Modal, Spinner } from "./ui";
import { GroupAvatar } from "./chat";
import { PeoplePicker } from "./PeoplePicker";

/** Création d'un groupe en deux étapes, comme WhatsApp : 1. les membres, 2. la photo et le nom. */
export function NewGroup({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { session } = useAuth();
  const toast = useToast();
  const uid = session?.user.id;
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("cobalt");
  const [icon, setIcon] = useState("users");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelected([]);
    setName("");
    setDescription("");
    setPhoto(null);
    setColor("cobalt");
    setIcon("users");
  }, [open]);

  const create = async () => {
    if (!uid || name.trim().length < 2) return;
    setBusy(true);
    try {
      let avatar: string | null = null;
      if (photo) {
        const small = await compressImage(photo.file, { maxSize: 640, quality: 0.85, square: true });
        const path = `${uid}/group-${crypto.randomUUID()}.${small.name.split(".").pop() || "jpg"}`;
        const { error } = await sb().storage.from("media").upload(path, small, { contentType: small.type, cacheControl: "31536000" });
        if (!error) avatar = sb().storage.from("media").getPublicUrl(path).data.publicUrl;
      }
      const { data, error } = await sb().rpc("create_group_with_members", {
        g_name: name.trim(),
        g_description: description.trim(),
        g_color: color,
        g_icon: icon,
        g_avatar: avatar,
        users: selected.map((p) => p.id),
      });
      if (error || !data) throw error;
      toast("Groupe créé");
      onCreated(data as string);
      onClose();
    } catch {
      toast("Le groupe n'a pas pu être créé. Vérifie le nom (2 à 60 caractères) et réessaie.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={step === 1 ? "Nouveau groupe : les membres" : "Nouveau groupe : le profil"}>
      <div className="px-5 pb-5">
        {step === 1 ? (
          <>
            <p className="text-sm text-muted mb-3">Choisis les personnes à ajouter. Tu pourras en ajouter d&apos;autres plus tard.</p>
            <PeoplePicker
              multiple
              exclude={uid ? [uid] : []}
              selected={selected}
              onToggle={(p) => setSelected((s) => (s.some((x) => x.id === p.id) ? s.filter((x) => x.id !== p.id) : [...s, p]))}
            />
            <button onClick={() => setStep(2)} className="btn btn-primary w-full mt-4 !py-3">
              {selected.length ? `Suivant avec ${plural(selected.length, "membre")}` : "Suivant sans membres pour l'instant"} <ArrowRight size={17} />
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center">
              <button type="button" onClick={() => fileRef.current?.click()} className="relative group rounded-full" aria-label="Choisir la photo du groupe">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" className="w-28 h-28 rounded-full object-cover" />
                ) : (
                  <GroupAvatar group={{ color, icon }} size={112} />
                )}
                <span className="absolute inset-0 rounded-full bg-[#0d1120]/50 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition">
                  <Camera size={24} />
                </span>
                <span className="absolute bottom-0.5 right-0.5 w-9 h-9 rounded-full bg-cobalt text-white grid place-items-center border-[3px] border-surface"><Camera size={15} /></span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f?.type.startsWith("image/")) setPhoto({ file: f, url: URL.createObjectURL(f) });
                }}
              />
              <p className="text-xs text-muted mt-2">{photo ? "Touche la photo pour la changer" : "Ajoute une photo de groupe (facultatif)"}</p>
            </div>

            <div className="flex flex-col gap-3 mt-5">
              <input className="field" placeholder="Nom du groupe" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
              <textarea className="field resize-none" rows={2} placeholder="Description (facultatif)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
              {!photo && (
                <>
                  <div>
                    <p className="text-sm font-semibold mb-2">Icône, sans photo</p>
                    <div className="grid grid-cols-10 gap-1.5">
                      {Object.entries(GROUP_ICONS).map(([k, v]) => (
                        <button key={k} type="button" onClick={() => setIcon(k)} title={v.label} aria-label={v.label} aria-pressed={icon === k}
                          className={cx("aspect-square rounded-xl grid place-items-center border transition", icon === k ? "border-cobalt bg-cobalt-soft text-cobalt" : "border-line text-ink-2 hover:bg-surface-2")}>
                          <v.icon size={17} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {GROUP_PALETTE.map((k) => (
                      <button key={k} type="button" onClick={() => setColor(k)} aria-label={`Couleur ${k}`} aria-pressed={color === k}
                        className={cx("w-8 h-8 rounded-full ring-2 ring-offset-2 ring-offset-surface transition", color === k ? "ring-ink" : "ring-transparent")} style={{ background: groupGradient(k) }} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setStep(1)} className="btn btn-soft"><ArrowLeft size={16} /> Retour</button>
              <button onClick={create} disabled={busy || name.trim().length < 2} className="btn btn-primary flex-1 !py-3">
                {busy ? <Spinner className="!border-white/30 !border-t-white" /> : "Créer le groupe"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
