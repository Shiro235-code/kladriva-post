"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Video, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { PostKind } from "@/lib/types";
import { KINDS, cx, displayName } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { useToast } from "./Providers";
import { Avatar, Modal } from "./ui";

const MAX_IMAGES = 4;
const MAX_VIDEO_MB = 50;
const PLACEHOLDERS: Record<PostKind, string> = {
  update: "Qu'as-tu appris aujourd'hui ?",
  win: "Raconte ta victoire, même petite.",
  help: "Sur quoi bloques-tu ? Décris ce que tu as déjà essayé.",
  resource: "Partage un lien, un tuto ou une astuce utile à la promo.",
  project: "Présente ton projet : ce qu'il fait, ce que tu as appris.",
};

/** Ouvre la fenêtre de publication depuis n'importe où. */
export function openComposer(opts?: { groupId?: string; kind?: PostKind }) {
  window.dispatchEvent(new CustomEvent("kp:compose", { detail: opts || {} }));
}

/** Déclencheur affiché en haut du fil. */
export function ComposerTrigger({ groupId }: { groupId?: string }) {
  const { profile, session } = useAuth();
  if (!session) return null;
  return (
    <div className="panel p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <Avatar profile={profile} size={42} />
        <button
          onClick={() => openComposer({ groupId })}
          className="flex-1 text-left bg-surface-2 hover:bg-line/70 border border-line rounded-full px-4 py-2.5 text-muted transition"
        >
          Qu&apos;as-tu appris aujourd&apos;hui, {displayName(profile).split(" ")[0]} ?
        </button>
      </div>
      <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
        {KINDS.filter((k) => k.kind !== "update").map((k) => (
          <button
            key={k.kind}
            onClick={() => openComposer({ groupId, kind: k.kind })}
            className="shrink-0 flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-xl hover:brightness-95 transition"
            style={{ background: k.bg, color: k.fg }}
          >
            <k.icon size={15} strokeWidth={2.3} aria-hidden /> {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Pick = { file: File; url: string; video?: boolean };

export function ComposerModal({
  open,
  onClose,
  initialGroupId,
  initialKind = "update",
}: {
  open: boolean;
  onClose: () => void;
  initialGroupId?: string;
  initialKind?: PostKind;
}) {
  const { profile, session } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<PostKind>(initialKind);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [groupId, setGroupId] = useState<string>(initialGroupId || "");
  const [myGroups, setMyGroups] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setGroupId(initialGroupId || "");
    setError(null);
    setTimeout(() => areaRef.current?.focus(), 50);
    if (session) {
      sb()
        .from("group_members")
        .select("group:groups(id,name)")
        .eq("user_id", session.user.id)
        .then(({ data }) => setMyGroups(((data || []) as unknown as { group: { id: string; name: string } }[]).map((r) => r.group).filter(Boolean)));
    }
  }, [open, initialGroupId, initialKind, session]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(320, el.scrollHeight) + "px";
  }, [text, open]);

  const hasVideo = picks.some((p) => p.video);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const next: Pick[] = [];
    for (const f of Array.from(files)) {
      if (f.type.startsWith("video/")) {
        if (!["video/mp4", "video/webm", "video/quicktime"].includes(f.type)) {
          setError("Formats vidéo acceptés : MP4, WebM ou MOV.");
          continue;
        }
        if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
          setError(`La vidéo dépasse ${MAX_VIDEO_MB} Mo. Raccourcis-la ou compresse-la avant de la publier.`);
          continue;
        }
        // Une vidéo remplace les images : une publication = une vidéo, ou jusqu'à 4 images
        setPicks([{ file: f, url: URL.createObjectURL(f), video: true }]);
        return;
      }
      if (!f.type.startsWith("image/")) {
        setError("Ce fichier n'est ni une image ni une vidéo.");
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        setError(`« ${f.name} » dépasse 8 Mo.`);
        continue;
      }
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    if (next.length) setPicks((p) => [...p.filter((x) => !x.video), ...next].slice(0, MAX_IMAGES));
  };

  const reset = () => {
    setText("");
    setPicks([]);
    setKind("update");
    setError(null);
  };

  const submit = async () => {
    if (!session || busy) return;
    if (!text.trim() && picks.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const urls: string[] = [];
      let video_url: string | null = null;
      for (const p of picks) {
        const ext = p.file.name.split(".").pop()?.toLowerCase() || (p.video ? "mp4" : "jpg");
        const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await sb().storage.from("media").upload(path, p.file, { contentType: p.file.type, cacheControl: "31536000" });
        if (up.error) {
          const tooBig = /size|large|payload/i.test(up.error.message);
          throw new Error(tooBig ? `Fichier trop lourd : ${MAX_VIDEO_MB} Mo maximum.` : `L'envoi ${p.video ? "de la vidéo" : "d'une image"} a échoué. Vérifie ta connexion et réessaie.`);
        }
        const url = sb().storage.from("media").getPublicUrl(path).data.publicUrl;
        if (p.video) video_url = url;
        else urls.push(url);
      }
      const { error } = await sb()
        .from("posts")
        .insert({ author_id: session.user.id, content: text.trim(), images: urls, video_url, kind, group_id: groupId || null });
      if (error) {
        if (error.message.includes("row-level security")) throw new Error("Rejoins ce groupe avant d'y publier.");
        throw new Error("La publication n'a pas pu être envoyée. Réessaie dans un instant.");
      }
      reset();
      onClose();
      toast("Publié");
      window.dispatchEvent(new CustomEvent("kp:posted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication impossible.");
    } finally {
      setBusy(false);
    }
  };

  const canPost = (text.trim().length > 0 || picks.length > 0) && !busy;
  const remaining = 5000 - text.length;

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle publication" wide>
      <div className="px-5 pb-5">
        <div className="flex gap-1.5 flex-wrap">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => setKind(k.kind)}
              className={cx(
                "flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-xl border transition",
                kind === k.kind ? "border-transparent" : "border-line text-muted hover:text-ink",
              )}
              style={kind === k.kind ? { background: k.bg, color: k.fg, boxShadow: `inset 0 0 0 1.5px ${k.fg}` } : undefined}
              aria-pressed={kind === k.kind}
            >
              <k.icon size={15} strokeWidth={2.3} aria-hidden /> {k.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3 mt-4">
          <Avatar profile={profile} size={42} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{displayName(profile)}</span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="text-[13px] bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink-2 outline-none focus:border-cobalt"
                aria-label="Où publier"
              >
                <option value="">Fil public</option>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>
    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              ref={areaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              onPaste={(e) => {
                const files = e.clipboardData.files;
                if (files.length) addFiles(files);
              }}
              placeholder={PLACEHOLDERS[kind]}
              maxLength={5000}
              rows={4}
              className="w-full mt-2 resize-none bg-transparent outline-none focus-visible:outline-none text-[17px] leading-relaxed placeholder:text-muted"
            />
          </div>
        </div>

        {picks.length > 0 && (
          <div className={cx("grid gap-2 mt-3", picks.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {picks.map((p, i) => (
              <div key={p.url} className="relative rounded-2xl overflow-hidden border border-line bg-surface-2">
                {p.video ? (
                  <video src={p.url} controls playsInline className="w-full max-h-[380px] bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={`Image ${i + 1}`} className={cx("w-full object-cover", picks.length === 1 ? "max-h-[360px]" : "h-40")} />
                )}
                <button
                  onClick={() => setPicks((all) => all.filter((x) => x.url !== p.url))}
                  className="absolute top-2 right-2 bg-[#0d1120]/75 text-white rounded-full p-1.5 hover:bg-[#0d1120]"
                  aria-label="Retirer l'image"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-coral mt-3 font-medium">{error}</p>}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-line">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={hasVideo || picks.length >= MAX_IMAGES}
              className="btn btn-soft !px-3 !py-2 text-[13px]"
              title={`Jusqu'à ${MAX_IMAGES} images`}
            >
              <ImagePlus size={17} /> Images {!hasVideo && picks.length > 0 && `(${picks.length}/${MAX_IMAGES})`}
            </button>
            <button onClick={() => videoRef.current?.click()} className="btn btn-soft !px-3 !py-2 text-[13px]" title={`Une vidéo, ${MAX_VIDEO_MB} Mo maximum`}>
              <Video size={17} /> Vidéo
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="flex items-center gap-3">
            {remaining < 300 && <span className={cx("text-xs tabular-nums", remaining < 50 ? "text-coral" : "text-muted")}>{remaining}</span>}
            <button onClick={submit} disabled={!canPost} className="btn btn-primary !px-5">
              {busy ? (hasVideo ? "Envoi de la vidéo…" : "Publication…") : "Publier"}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted mt-2 hidden sm:block">Ctrl + Entrée pour publier. Tu peux coller une capture d&apos;écran directement. Vidéo : MP4, WebM ou MOV, 50 Mo maximum.</p>
      </div>
    </Modal>
  );
}
