"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { Story } from "@/lib/types";
import { STORY_BGS, cx, displayName, firstName, timeAgo } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { compressImage } from "@/lib/media";
import { useToast } from "./Providers";
import { Avatar, Modal } from "./ui";

const DURATION = 6000;
type Bundle = { authorId: string; stories: Story[] };

function seenKey(id: string) {
  return `kp-story-seen-${id}`;
}

export function StoriesBar() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [seen, setSeen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const { data } = await sb()
      .from("stories")
      .select("*, author:profiles!stories_author_id_fkey(*)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    const map = new Map<string, Story[]>();
    for (const s of (data as Story[]) || []) map.set(s.author_id, [...(map.get(s.author_id) || []), s]);
    let list = Array.from(map.entries()).map(([authorId, stories]) => ({ authorId, stories }));
    // Les miennes d'abord, puis les plus récentes
    list = list.sort((a, b) => {
      if (a.authorId === session?.user.id) return -1;
      if (b.authorId === session?.user.id) return 1;
      return +new Date(b.stories[b.stories.length - 1].created_at) - +new Date(a.stories[a.stories.length - 1].created_at);
    });
    setBundles(list);
    const s: Record<string, boolean> = {};
    try {
      list.forEach((b) => b.stories.forEach((st) => (s[st.id] = localStorage.getItem(seenKey(st.id)) === "1")));
    } catch {}
    setSeen(s);
  }, [session]);

  useEffect(() => {
    load();
    const ch = sb().channel("stories").on("postgres_changes", { event: "*", schema: "public", table: "stories" }, load).subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [load]);

  const markSeen = (id: string) => {
    try {
      localStorage.setItem(seenKey(id), "1");
    } catch {}
    setSeen((s) => ({ ...s, [id]: true }));
  };

  const mine = bundles.find((b) => b.authorId === session?.user.id);
  const others = bundles.filter((b) => b.authorId !== session?.user.id);
  const ordered = mine ? [mine, ...others] : others;

  if (!session && bundles.length === 0) return null;

  return (
    <>
      <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {session && (
          <div className="shrink-0 w-[72px] text-center">
            <button
              onClick={() => (mine ? setViewer(0) : setCreating(true))}
              className={cx("relative mx-auto block rounded-full", mine ? "story-ring" : "")}
              aria-label={mine ? "Voir ma story" : "Créer une story"}
            >
              <span className={cx("block rounded-full", mine && "p-[2.5px] bg-canvas")}>
                <Avatar profile={profile} size={62} />
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setCreating(true);
                }}
                role="button"
                aria-label="Ajouter à ma story"
                className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-cobalt text-white grid place-items-center border-[3px] border-canvas"
              >
                <Plus size={13} strokeWidth={3} />
              </span>
            </button>
            <p className="text-[12px] mt-1.5 truncate font-medium">Ta story</p>
          </div>
        )}
        {others.map((b) => {
          const author = b.stories[0].author;
          const allSeen = b.stories.every((s) => seen[s.id]);
          const idx = ordered.indexOf(b);
          return (
            <div key={b.authorId} className="shrink-0 w-[72px] text-center">
              <button onClick={() => setViewer(idx)} className={cx("mx-auto block", allSeen ? "story-ring-seen" : "story-ring")} aria-label={`Story de ${displayName(author)}`}>
                <span className="block rounded-full p-[2.5px] bg-canvas">
                  <Avatar profile={author} size={60} />
                </span>
              </button>
              <p className={cx("text-[12px] mt-1.5 truncate", allSeen ? "text-muted" : "font-semibold")}>{firstName(author)}</p>
            </div>
          );
        })}
        {session && others.length === 0 && (
          <button onClick={() => setCreating(true)} className="shrink-0 h-[66px] self-start flex items-center gap-3 px-4 rounded-2xl border border-dashed border-line-strong text-left text-sm text-muted hover:text-ink hover:border-cobalt transition">
            <span className="w-9 h-9 rounded-xl bg-cobalt-soft text-cobalt grid place-items-center shrink-0" aria-hidden><Camera size={18} /></span>
            <span>
              <b className="block text-ink">Partage ta journée</b>
              Une story reste visible 24 h.
            </span>
          </button>
        )}
      </div>

      {viewer !== null && ordered[viewer] && (
        <StoryViewer
          bundles={ordered}
          start={viewer}
          onSeen={markSeen}
          onClose={() => setViewer(null)}
          onDeleted={load}
          onProfile={(u) => {
            setViewer(null);
            router.push(`/u/${u}`);
          }}
        />
      )}
      <StoryCreate open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </>
  );
}

function StoryViewer({
  bundles,
  start,
  onClose,
  onSeen,
  onDeleted,
  onProfile,
}: {
  bundles: Bundle[];
  start: number;
  onClose: () => void;
  onSeen: (id: string) => void;
  onDeleted: () => void;
  onProfile: (username: string) => void;
}) {
  const { session } = useAuth();
  const toast = useToast();
  const [b, setB] = useState(start);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const last = useRef<number>(0);

  const bundle = bundles[b];
  const story = bundle?.stories[i];

  const next = useCallback(() => {
    setElapsed(0);
    if (!bundle) return onClose();
    if (i < bundle.stories.length - 1) setI(i + 1);
    else if (b < bundles.length - 1) {
      setB(b + 1);
      setI(0);
    } else onClose();
  }, [b, i, bundle, bundles.length, onClose]);

  const prev = () => {
    setElapsed(0);
    if (i > 0) setI(i - 1);
    else if (b > 0) {
      setB(b - 1);
      setI(bundles[b - 1].stories.length - 1);
    }
  };

  useEffect(() => {
    if (story) onSeen(story.id);
  }, [story, onSeen]);

  useEffect(() => {
    let raf = 0;
    last.current = performance.now();
    const tick = (t: number) => {
      const dt = t - last.current;
      last.current = t;
      if (!paused) {
        setElapsed((e) => {
          const ne = e + dt;
          if (ne >= DURATION) {
            setTimeout(next, 0);
            return 0;
          }
          return ne;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", onKey);
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = o;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  if (!story) return null;

  const remove = async () => {
    const { error } = await sb().from("stories").delete().eq("id", story.id);
    if (error) return toast("Suppression impossible.", "error");
    toast("Story supprimée");
    onDeleted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] bg-[#06080f] flex items-center justify-center fade-in" role="dialog" aria-label="Stories">
      <div
        className="relative w-full h-full sm:w-[420px] sm:h-[min(92vh,760px)] sm:rounded-3xl overflow-hidden"
        style={{ background: story.image_url ? "#000" : STORY_BGS[story.bg] || STORY_BGS.ember }}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {story.image_url?.startsWith("https://") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.image_url} alt="" className="absolute inset-0 w-full h-full object-contain" />
        )}
        {/* Progression */}
        <div className="absolute top-3 inset-x-3 flex gap-1 z-10">
          {bundle.stories.map((s, k) => (
            <div key={s.id} className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: k < i ? "100%" : k === i ? `${(elapsed / DURATION) * 100}%` : "0%" }} />
            </div>
          ))}
        </div>
        <div className="absolute top-7 inset-x-3 flex items-center gap-2.5 z-10 text-white">
          <button onClick={() => onProfile(story.author.username)} className="flex items-center gap-2.5">
            <Avatar profile={story.author} size={36} />
            <span className="font-semibold text-sm drop-shadow">{displayName(story.author)}</span>
          </button>
          <span className="text-white/70 text-xs">{timeAgo(story.created_at)}</span>
          <span className="flex-1" />
          {session?.user.id === story.author_id && (
            <button onClick={(e) => { e.stopPropagation(); remove(); }} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/15" aria-label="Supprimer la story"><Trash2 size={18} /></button>
          )}
          <button onClick={onClose} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/15" aria-label="Fermer"><X size={22} /></button>
        </div>

        {story.content && (
          <div className={cx("absolute inset-x-6 z-10 text-white text-center", story.image_url ? "bottom-16" : "top-1/2 -translate-y-1/2")}>
            <p
              className={cx("font-display font-bold leading-[1.1] whitespace-pre-wrap break-words drop-shadow-md", story.image_url ? "text-xl bg-black/40 rounded-2xl px-4 py-3 inline-block" : story.content.length > 120 ? "text-2xl" : "text-[34px]")}
            >
              {story.content}
            </p>
          </div>
        )}

        {/* Zones de navigation */}
        <button className="absolute left-0 top-20 bottom-0 w-1/3 z-[5]" onClick={prev} aria-label="Précédent" />
        <button className="absolute right-0 top-20 bottom-0 w-2/3 z-[5]" onClick={next} aria-label="Suivant" />
      </div>
      <button onClick={prev} className="hidden sm:grid absolute left-[calc(50%-270px)] w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white place-items-center" aria-label="Précédent"><ChevronLeft size={24} /></button>
      <button onClick={next} className="hidden sm:grid absolute right-[calc(50%-270px)] w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white place-items-center" aria-label="Suivant"><ChevronRight size={24} /></button>
    </div>
  );
}

function StoryCreate({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { session } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [bg, setBg] = useState("ember");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const publish = async () => {
    if (!session || busy || (!text.trim() && !file)) return;
    setBusy(true);
    let image_url: string | null = null;
    if (file) {
      const small = await compressImage(file, { maxSize: 1600, quality: 0.8 });
      const path = `${session.user.id}/story-${crypto.randomUUID()}.${small.name.split(".").pop() || "jpg"}`;
      const up = await sb().storage.from("media").upload(path, small, { contentType: small.type, cacheControl: "31536000" });
      if (up.error) {
        setBusy(false);
        return toast("L'image n'a pas pu être envoyée.", "error");
      }
      image_url = sb().storage.from("media").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await sb().from("stories").insert({ author_id: session.user.id, content: text.trim(), bg, image_url });
    setBusy(false);
    if (error) return toast("Ta story n'a pas pu être publiée.", "error");
    setText("");
    setFile(null);
    setPreview(null);
    toast("Story publiée pour 24 h");
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle story">
      <div className="px-5 pb-5">
        <div
          className="relative rounded-3xl overflow-hidden aspect-[9/12] grid place-items-center p-6 text-white"
          style={{ background: preview ? "#000" : STORY_BGS[bg] }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="" className="absolute inset-0 w-full h-full object-contain" />}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={280}
            placeholder="Ce que j'ai fait aujourd'hui…"
            className={cx(
              "relative z-10 w-full bg-transparent text-center outline-none resize-none font-display font-bold placeholder:text-white/60",
              preview ? "text-lg bg-black/40 rounded-2xl p-3 self-end" : "text-[28px] leading-tight",
            )}
            rows={preview ? 2 : 4}
          />
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-2">
            {Object.entries(STORY_BGS).map(([k, v]) => (
              <button
                key={k}
                onClick={() => { setBg(k); setFile(null); setPreview(null); }}
                className={cx("w-8 h-8 rounded-full border-2 transition", bg === k && !preview ? "border-ink scale-110" : "border-transparent")}
                style={{ background: v }}
                aria-label={`Fond ${k}`}
              />
            ))}
          </div>
          <button onClick={() => fileRef.current?.click()} className="btn btn-soft !px-3 !py-2 text-[13px]"><ImagePlus size={16} /> Photo</button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 25 * 1024 * 1024) return toast("Image trop lourde (25 Mo max).", "error");
              setFile(f);
              setPreview(URL.createObjectURL(f));
            }}
          />
        </div>
        <button onClick={publish} disabled={busy || (!text.trim() && !file)} className="btn btn-primary w-full mt-4 !py-3">
          {busy ? "Publication…" : "Publier la story"}
        </button>
        <p className="text-xs text-muted text-center mt-2">Visible par tous pendant 24 heures.</p>
      </div>
    </Modal>
  );
}
