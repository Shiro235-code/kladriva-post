"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Bookmark, Share2, MoreHorizontal, Trash2, Link2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import type { Post, ReactionType } from "@/lib/types";
import { REACTIONS, cx, displayName, fullDate, groupGradient, plural, postImages, reactionOf, timeAgo } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { useToast } from "./Providers";
import { Avatar, KindBadge, Modal, RichText } from "./ui";
import { Comments } from "./Comments";

const CLAMP = 420;

export function PostCard({ post, onDeleted, startOpen = false }: { post: Post; onDeleted?: (id: string) => void; startOpen?: boolean }) {
  const { session } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const uid = session?.user.id;
  const [reactions, setReactions] = useState(post.likes || []);
  const [saved, setSaved] = useState(!!uid && (post.saves || []).some((s) => s.user_id === uid));
  const [commentCount, setCommentCount] = useState(post.comments?.[0]?.count ?? 0);
  const [open, setOpen] = useState(startOpen);
  const [expanded, setExpanded] = useState(false);
  const [picker, setPicker] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mine = reactions.find((r) => r.user_id === uid);
  const images = postImages(post);
  const long = post.content.length > CLAMP;
  const shown = long && !expanded ? post.content.slice(0, CLAMP).replace(/\s+\S*$/, "") + "…" : post.content;

  const counts = REACTIONS.map((r) => ({ ...r, n: reactions.filter((x) => x.type === r.type).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);

  const react = async (type: ReactionType) => {
    if (!uid) return router.push("/auth");
    setPicker(false);
    const prev = reactions;
    if (mine && mine.type === type) {
      setReactions((r) => r.filter((x) => x.user_id !== uid));
      const { error } = await sb().from("likes").delete().eq("post_id", post.id).eq("user_id", uid);
      if (error) setReactions(prev);
      return;
    }
    setPopKey((k) => k + 1);
    setReactions((r) => [...r.filter((x) => x.user_id !== uid), { user_id: uid, type }]);
    const { error } = mine
      ? await sb().from("likes").update({ type }).eq("post_id", post.id).eq("user_id", uid)
      : await sb().from("likes").insert({ post_id: post.id, user_id: uid, type });
    if (error) {
      setReactions(prev);
      toast("Ta réaction n'a pas été enregistrée. Réessaie.", "error");
    }
  };

  const loveFromImage = () => {
    setBurst((b) => b + 1);
    if (!mine || mine.type !== "love") react("love");
  };

  const toggleSave = async () => {
    if (!uid) return router.push("/auth");
    const next = !saved;
    setSaved(next);
    const { error } = next
      ? await sb().from("saves").insert({ post_id: post.id, user_id: uid })
      : await sb().from("saves").delete().eq("post_id", post.id).eq("user_id", uid);
    if (error) {
      setSaved(!next);
      toast("Enregistrement impossible. Réessaie.", "error");
    } else toast(next ? "Enregistré dans tes favoris" : "Retiré de tes favoris");
  };

  const link = () => `${window.location.origin}/p/${post.id}`;
  const share = async () => {
    const url = link();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Publication de ${displayName(post.author)}`, text: post.content.slice(0, 120), url });
        return;
      } catch {
        /* partage annulé */
      }
    }
    await navigator.clipboard.writeText(url);
    toast("Lien copié");
  };

  const remove = async () => {
    const { error } = await sb().from("posts").delete().eq("id", post.id);
    setConfirmDel(false);
    if (error) return toast("Suppression impossible. Réessaie.", "error");
    toast("Publication supprimée");
    onDeleted?.(post.id);
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  return (
    <article className="panel">
      <div className="p-4 sm:p-5 pb-0 sm:pb-0">
        <header className="flex items-start gap-3">
          <Link href={`/u/${post.author?.username}`} className="shrink-0"><Avatar profile={post.author} size={44} /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-x-1.5 flex-wrap leading-tight">
              <Link href={`/u/${post.author?.username}`} className="font-bold hover:underline">{displayName(post.author)}</Link>
              {post.group && (
                <>
                  <span className="text-muted" aria-hidden>▸</span>
                  <Link href={`/groups/${post.group.id}`} className="font-semibold hover:underline inline-flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-[5px] inline-grid place-items-center text-[10px]" style={{ background: groupGradient(post.group.color) }}>
                      {post.group.emoji || ""}
                    </span>
                    {post.group.name}
                  </Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[13px] text-muted min-w-0">
              {post.author?.headline && <span className="truncate max-w-[220px]">{post.author.headline}</span>}
              <Link href={`/p/${post.id}`} title={fullDate(post.created_at)} className="shrink-0 hover:underline">{timeAgo(post.created_at)}</Link>
            </div>
          </div>
          <KindBadge kind={post.kind} className="mt-0.5 shrink-0" />
          <div className="relative -mr-2 -mt-1">
            <button onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }} className="icon-btn" aria-label="Options de la publication" aria-expanded={menu}>
              <MoreHorizontal size={19} />
            </button>
            {menu && (
              <div className="absolute right-0 top-10 z-20 w-56 bg-surface border border-line rounded-2xl shadow-[var(--shadow-pop)] p-1.5 picker-in" role="menu">
                <MenuItem icon={<Link2 size={16} />} onClick={async () => { await navigator.clipboard.writeText(link()); toast("Lien copié"); }}>Copier le lien</MenuItem>
                <MenuItem icon={<Bookmark size={16} />} onClick={toggleSave}>{saved ? "Retirer des favoris" : "Enregistrer"}</MenuItem>
                {uid === post.author_id && (
                  <MenuItem icon={<Trash2 size={16} />} danger onClick={() => setConfirmDel(true)}>Supprimer</MenuItem>
                )}
              </div>
            )}
          </div>
        </header>

        {post.content && (
          <div className="mt-3">
            <RichText text={shown} className="text-[15.5px] leading-[1.6] text-ink" />
            {long && (
              <button onClick={() => setExpanded((e) => !e)} className="text-sm font-semibold text-muted hover:text-ink mt-1">
                {expanded ? "Voir moins" : "Voir plus"}
              </button>
            )}
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="relative mt-3 sm:mx-5 sm:rounded-2xl overflow-hidden" onDoubleClick={loveFromImage}>
          <ImageGrid images={images} onOpen={setLightbox} />
          {burst > 0 && (
            <span key={burst} className="burst absolute left-1/2 top-1/2 text-[88px] pointer-events-none drop-shadow-lg" aria-hidden>❤️</span>
          )}
        </div>
      )}

      <div className="px-4 sm:px-5">
        {(counts.length > 0 || commentCount > 0) && (
          <div className="flex items-center justify-between text-[13px] text-muted pt-3">
            <span className="flex items-center gap-1.5">
              {counts.length > 0 && (
                <>
                  <span className="flex -space-x-1">
                    {counts.slice(0, 3).map((c) => (
                      <span key={c.type} className="w-[22px] h-[22px] grid place-items-center rounded-full bg-surface border border-line text-[12px]">{c.emoji}</span>
                    ))}
                  </span>
                  <span className="tabular-nums">{reactions.length}</span>
                </>
              )}
            </span>
            {commentCount > 0 && (
              <button onClick={() => setOpen(true)} className="hover:underline">{plural(commentCount, "commentaire")}</button>
            )}
          </div>
        )}

        <footer className="grid grid-cols-4 gap-1 py-1.5 mt-2 border-t border-line">
          {/* Réagir : clic = j'aime, survol ou appui long = choisir */}
          <div
            className="relative"
            onMouseEnter={() => { hoverTimer.current = setTimeout(() => setPicker(true), 380); }}
            onMouseLeave={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setPicker(false); }}
          >
            {picker && (
              <div className="absolute bottom-full left-0 mb-1.5 z-20 flex gap-0.5 bg-surface border border-line rounded-full p-1.5 shadow-[var(--shadow-pop)] picker-in" role="menu" aria-label="Choisir une réaction">
                {REACTIONS.map((r) => (
                  <button
                    key={r.type}
                    onClick={() => react(r.type)}
                    className={cx("w-10 h-10 grid place-items-center text-[26px] rounded-full transition hover:scale-125 hover:-translate-y-1", mine?.type === r.type && "bg-surface-2")}
                    title={r.label}
                    aria-label={r.label}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            )}
            <ActionButton
              onClick={() => react(mine ? mine.type : "like")}
              onTouchStart={() => { holdTimer.current = setTimeout(() => setPicker(true), 420); }}
              onTouchEnd={() => { if (holdTimer.current) clearTimeout(holdTimer.current); }}
              style={mine ? { color: reactionOf(mine.type).color } : undefined}
              active={!!mine}
            >
              <span key={popKey} className={cx("text-[18px] leading-none", popKey > 0 && "pop")} aria-hidden>
                {mine ? reactionOf(mine.type).emoji : "👍"}
              </span>
              <span className="hidden sm:inline">{mine ? reactionOf(mine.type).label : "J'aime"}</span>
            </ActionButton>
          </div>
          <ActionButton onClick={() => setOpen((o) => !o)} active={open}>
            <MessageCircle size={19} />
            <span className="hidden sm:inline">Commenter</span>
          </ActionButton>
          <ActionButton onClick={share}>
            <Share2 size={18} />
            <span className="hidden sm:inline">Partager</span>
          </ActionButton>
          <ActionButton onClick={toggleSave} active={saved} style={saved ? { color: "var(--cobalt)" } : undefined}>
            <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
            <span className="hidden sm:inline">{saved ? "Enregistré" : "Enregistrer"}</span>
          </ActionButton>
        </footer>
      </div>

      {open && (
        <div className="px-4 sm:px-5 pb-4 border-t border-line">
          <Comments postId={post.id} postAuthorId={post.author_id} onCount={setCommentCount} />
        </div>
      )}

      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Supprimer la publication ?">
        <div className="px-5 pb-5">
          <p className="text-ink-2">Elle disparaîtra du fil avec ses réactions et ses commentaires. Cette action est définitive.</p>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setConfirmDel(false)} className="btn btn-soft">Annuler</button>
            <button onClick={remove} className="btn bg-coral text-white">Supprimer</button>
          </div>
        </div>
      </Modal>

      {lightbox !== null && <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} />}
    </article>
  );
}

function ActionButton({
  children,
  active,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      className={cx(
        "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition select-none",
        active ? "text-ink" : "text-muted hover:text-ink",
        "hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

function MenuItem({ children, icon, onClick, danger }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} role="menuitem" className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left hover:bg-surface-2", danger && "text-coral")}>
      {icon}
      {children}
    </button>
  );
}

function ImageGrid({ images, onOpen }: { images: string[]; onOpen: (i: number) => void }) {
  const n = images.length;
  const cell = (src: string, i: number, cls: string) => (
    <button key={src} onClick={() => onOpen(i)} className={cx("relative overflow-hidden bg-surface-2 block", cls)} aria-label={`Agrandir l'image ${i + 1}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="w-full h-full object-cover hover:scale-[1.02] transition duration-300" />
    </button>
  );
  if (n === 1)
    return (
      <button onClick={() => onOpen(0)} className="block w-full bg-surface-2" aria-label="Agrandir l'image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[0]} alt="" loading="lazy" className="w-full max-h-[580px] object-cover" />
      </button>
    );
  if (n === 2) return <div className="grid grid-cols-2 gap-0.5 h-[300px]">{images.map((s, i) => cell(s, i, "h-full"))}</div>;
  if (n === 3)
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-0.5 h-[360px]">
        {cell(images[0], 0, "row-span-2 h-full")}
        {cell(images[1], 1, "h-full")}
        {cell(images[2], 2, "h-full")}
      </div>
    );
  return <div className="grid grid-cols-2 grid-rows-2 gap-0.5 h-[380px]">{images.slice(0, 4).map((s, i) => cell(s, i, "h-full"))}</div>;
}

function Lightbox({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(images.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [images.length, onClose]);
  return (
    <div className="fixed inset-0 z-[90] bg-black/92 flex items-center justify-center fade-in" onClick={onClose} role="dialog" aria-label="Image agrandie">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[i]} alt="" className="max-w-[94vw] max-h-[88vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" aria-label="Fermer"><X size={22} /></button>
      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setI((x) => Math.max(0, x - 1)); }} disabled={i === 0} className="absolute left-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center disabled:opacity-30" aria-label="Image précédente"><ChevronLeft size={24} /></button>
          <button onClick={(e) => { e.stopPropagation(); setI((x) => Math.min(images.length - 1, x + 1)); }} disabled={i === images.length - 1} className="absolute right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center disabled:opacity-30" aria-label="Image suivante"><ChevronRight size={24} /></button>
          <p className="absolute bottom-5 text-white/80 text-sm tabular-nums">{i + 1} / {images.length}</p>
        </>
      )}
    </div>
  );
}
