"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Video, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { PostKind } from "@/lib/types";
import { KINDS, cx, displayName } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { compressImage, compressVideo } from "@/lib/media";
import { useToast } from "./Providers";
import { Avatar, Modal } from "./ui";

const MAX_IMAGES = 4;
const MAX_VIDEO_MB = 50; // après compression
const MAX_VIDEO_SOURCE_MB = 300; // avant compression
const PLACEHOLDERS: Record<PostKind, string> = {
  update: "Qu'as-tu appris aujourd'hui ?",
  win: "Raconte ta victoire, même petite.",
  help: "Sur quoi bloques-tu ? Décris ce que tu as déjà essayé.",
  resource: "Partage un lien, un tuto ou une astuce utile à la promo.",
  project: "Présente ton projet : ce qu'il fait, ce que tu as appris.",
};
const DRAFT_PREFIX = "kp-post-draft:";

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
          className="flex-1 min-h-12 text-left bg-surface-2 hover:bg-surface border border-line hover:border-line-strong rounded-full px-4 py-2.5 text-muted transition focus-visible:ring-2 focus-visible:ring-cobalt"
        >
          Qu&apos;as-tu appris aujourd&apos;hui, {displayName(profile).split(" ")[0]} ?
        </button>
      </div>
      <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
        {KINDS.filter((k) => k.kind !== "update").map((k) => (
          <button
            key={k.kind}
            onClick={() => openComposer({ groupId, kind: k.kind })}
            className="min-h-10 shrink-0 flex items-center gap-1.5 text-[13px] font-semibold px-3 rounded-xl hover:-translate-y-px hover:brightness-95 transition focus-visible:ring-2 focus-visible:ring-cobalt"
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
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const objectUrls = useRef(new Set<string>());
  const submitLock = useRef(false);
  const draftOwner = useRef<string | null>(null);
  const uid = session?.user.id;

  const createPreview = (file: File) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    return url;
  };
  const releasePreview = (url: string) => {
    if (objectUrls.current.delete(url)) URL.revokeObjectURL(url);
  };

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  useEffect(() => {
    if (draftOwner.current && draftOwner.current !== uid) {
      for (const pick of picks) releasePreview(pick.url);
      setPicks([]);
    }
    draftOwner.current = null;
    if (!uid) {
      setText("");
      setGroupId("");
      setKind("update");
      for (const pick of picks) releasePreview(pick.url);
      setPicks([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`${DRAFT_PREFIX}${uid}`);
      const draft = raw ? JSON.parse(raw) as { text?: unknown; kind?: unknown; groupId?: unknown } : null;
      setText(typeof draft?.text === "string" ? draft.text : "");
      setKind(typeof draft?.kind === "string" && Object.keys(PLACEHOLDERS).includes(draft.kind) ? draft.kind as PostKind : "update");
      setGroupId(typeof draft?.groupId === "string" ? draft.groupId : "");
    } catch {
      setText("");
      setGroupId("");
      setKind("update");
    }
    draftOwner.current = uid;
  // Drafts are restored only when the authenticated user changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (!uid || draftOwner.current !== uid) return;
    const timer = window.setTimeout(() => {
      try {
        const key = `${DRAFT_PREFIX}${uid}`;
        if (text.trim() || kind !== "update" || groupId) localStorage.setItem(key, JSON.stringify({ text, kind, groupId }));
        else localStorage.removeItem(key);
      } catch { /* La publication reste dans l'éditeur si le stockage local est indisponible. */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [uid, text, kind, groupId]);

  useEffect(() => {
    if (!open) return;
    if (initialKind !== "update") setKind(initialKind);
    if (initialGroupId) setGroupId(initialGroupId);
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
        if (f.size > MAX_VIDEO_SOURCE_MB * 1024 * 1024) {
          setError(`La vidéo dépasse ${MAX_VIDEO_SOURCE_MB} Mo. Raccourcis-la avant de la publier.`);
          continue;
        }
        // Une vidéo remplace les images : une publication = une vidéo, ou jusqu'à 4 images
        for (const pick of picks) releasePreview(pick.url);
        for (const pick of next) releasePreview(pick.url);
        setPicks([{ file: f, url: createPreview(f), video: true }]);
        return;
      }
      if (!f.type.startsWith("image/")) {
        setError("Ce fichier n'est ni une image ni une vidéo.");
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        setError(`« ${f.name} » dépasse 25 Mo.`);
        continue;
      }
      if (picks.filter((pick) => !pick.video).length + next.length >= MAX_IMAGES) {
        setError(`Une publication peut contenir jusqu'à ${MAX_IMAGES} images.`);
        continue;
      }
      next.push({ file: f, url: createPreview(f) });
    }
    if (next.length) setPicks((current) => [...current.filter((pick) => !pick.video), ...next]);
  };

  const removePick = (url: string) => {
    const removed = picks.find((pick) => pick.url === url);
    if (removed) releasePreview(removed.url);
    setPicks((all) => all.filter((pick) => pick.url !== url));
  };

  const reset = () => {
    setText("");
    for (const pick of picks) releasePreview(pick.url);
    setPicks([]);
    setKind("update");
    setGroupId(initialGroupId || "");
    setError(null);
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!session || busy || submitLock.current) return;
    if (!text.trim() && picks.length === 0) return;
    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const urls: string[] = [];
      let video_url: string | null = null;
      for (const p of picks) {
        let file = p.file;
        if (p.video) {
          setStage("Optimisation de la vidéo… 0 %");
          file = await compressVideo(p.file, (r) => setStage(`Optimisation de la vidéo… ${Math.round(r * 100)} %`));
          if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
            throw new Error(`Même optimisée, la vidéo dépasse ${MAX_VIDEO_MB} Mo. Raccourcis-la puis réessaie.`);
          }
          setStage("Envoi de la vidéo…");
        } else {
          setStage("Optimisation des images…");
          file = await compressImage(p.file, { maxSize: 1920, quality: 0.82 });
          setStage("Envoi…");
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || (p.video ? "mp4" : "jpg");
        const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await sb().storage.from("media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
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
      submitLock.current = false;
      setBusy(false);
      setStage(null);
    }
  };

  const canPost = (text.trim().length > 0 || picks.length > 0) && !busy;
  const remaining = 5000 - text.length;

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Nouvelle publication" wide>
      <form
        onSubmit={(event) => void submit(event)}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
        className={cx("relative px-4 sm:px-6 pb-5 transition-colors", dragging && "bg-cobalt-soft/60")}
      >
        {dragging && <div className="pointer-events-none absolute inset-2 z-20 rounded-2xl border-2 border-dashed border-cobalt bg-cobalt-soft/80 grid place-items-center text-cobalt font-semibold">Dépose tes images ou ta vidéo ici</div>}
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Type de publication">
          {KINDS.map((k) => (
            <button
              type="button"
              key={k.kind}
              onClick={() => setKind(k.kind)}
              className={cx(
                "min-h-10 flex items-center gap-1.5 text-[13px] font-semibold px-3 rounded-xl border transition hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-cobalt",
                kind === k.kind ? "border-transparent" : "border-line text-muted hover:text-ink",
              )}
              style={kind === k.kind ? { background: k.bg, color: k.fg, boxShadow: `inset 0 0 0 1.5px ${k.fg}` } : undefined}
              aria-pressed={kind === k.kind}
            >
              <k.icon size={15} strokeWidth={2.3} aria-hidden /> {k.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3 mt-5">
          <Avatar profile={profile} size={42} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{displayName(profile)}</span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="min-h-10 max-w-full text-[13px] bg-surface-2 border border-line rounded-xl px-3 py-1 text-ink-2 outline-none focus:border-cobalt"
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
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
              }}
              onPaste={(e) => {
                const files = e.clipboardData.files;
                if (files.length) addFiles(files);
              }}
              placeholder={PLACEHOLDERS[kind]}
              maxLength={5000}
              rows={4}
              className="w-full mt-2 min-h-32 resize-none bg-transparent outline-none focus-visible:outline-none text-[17px] leading-[1.65] placeholder:text-muted"
            />
          </div>
        </div>

        {picks.length > 0 && (
          <div className={cx("grid gap-2 mt-4", picks.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {picks.map((p, i) => (
              <div key={p.url} className={cx("relative rounded-2xl overflow-hidden border border-line bg-surface-2", p.video || picks.length === 1 ? "aspect-[4/3]" : "aspect-square")}>
                {p.video ? (
                  <video src={p.url} controls playsInline preload="metadata" className="w-full h-full object-contain bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={`Aperçu de l’image ${i + 1} : ${p.file.name}`} className="w-full h-full object-contain" />
                )}
                <button
                  type="button"
                  onClick={() => removePick(p.url)}
                  disabled={busy}
                  className="absolute top-2 right-2 w-10 h-10 grid place-items-center bg-[#0d1120]/80 text-white rounded-full hover:bg-[#0d1120] focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                  aria-label={`Retirer ${p.video ? "la vidéo" : `l’image ${i + 1}`}`}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-coral mt-3 font-semibold">{error}</p>}
        {stage && <p role="status" className="text-sm text-muted mt-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-cobalt animate-pulse" />{stage}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-line">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={hasVideo || picks.length >= MAX_IMAGES}
              className="btn btn-soft min-h-11 !px-3 !py-2 text-[13px]"
              title={`Jusqu'à ${MAX_IMAGES} images`}
            >
              <ImagePlus size={17} /> Images {!hasVideo && picks.length > 0 && `(${picks.length}/${MAX_IMAGES})`}
            </button>
            <button type="button" onClick={() => videoRef.current?.click()} className="btn btn-soft min-h-11 !px-3 !py-2 text-[13px]" title="Une vidéo, optimisée automatiquement">
              <Video size={17} /> Vidéo
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="flex items-center gap-3 ml-auto">
            {remaining < 300 && <span className={cx("text-xs tabular-nums", remaining < 50 ? "text-coral" : "text-muted")}>{remaining}</span>}
            <button type="submit" disabled={!canPost} className="btn btn-primary min-h-11 !px-5">
              {busy ? stage || "Publication…" : "Publier"}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted mt-2">Tes brouillons de texte sont sauvegardés automatiquement sur cet appareil. Ctrl + Entrée pour publier ; images et vidéos sont optimisées avant l&apos;envoi.</p>
      </form>
    </Modal>
  );
}
