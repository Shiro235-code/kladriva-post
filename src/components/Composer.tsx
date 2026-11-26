"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./ui";
import { displayName } from "@/lib/utils";

const PROMPTS = [
  "Qu'as-tu appris aujourd'hui ?",
  "Une victoire, même petite, à partager ?",
  "Sur quoi bloques-tu en ce moment ?",
  "Montre ton dernier projet…",
];

export function Composer({ groupId, onPosted }: { groupId?: string; onPosted?: () => void }) {
  const { profile, session } = useAuth();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [placeholder] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);

  if (!session) return null;

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Seules les images sont acceptées.");
    if (f.size > 5 * 1024 * 1024) return setError("Image trop lourde (5 Mo max).");
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      let image_url: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await sb().storage.from("media").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        image_url = sb().storage.from("media").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await sb()
        .from("posts")
        .insert({ author_id: session.user.id, content: text.trim(), image_url, group_id: groupId ?? null });
      if (error) throw error;
      setText("");
      setFile(null);
      setPreview(null);
      onPosted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="composer" className="card p-4 sm:p-5 scroll-mt-24">
      <div className="flex gap-3">
        <Avatar profile={profile} size={44} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted mb-1">{displayName(profile)}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder={placeholder}
            rows={text.length > 80 ? 4 : 2}
            maxLength={5000}
            className="w-full resize-none bg-transparent outline-none text-[17px] leading-relaxed placeholder:text-[#a5a39c]"
          />
          {preview && (
            <div className="relative mt-2 rounded-2xl overflow-hidden border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Aperçu" className="w-full max-h-[420px] object-cover" />
              <button
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-ink/80 text-white rounded-full p-1.5"
                aria-label="Retirer l'image"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
            <button onClick={() => inputRef.current?.click()} className="flex items-center gap-2 text-sm text-muted hover:text-ink px-2 py-1.5 rounded-full hover:bg-bg">
              <ImagePlus size={18} /> Image
            </button>
            <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <button onClick={submit} disabled={busy || (!text.trim() && !file)} className="btn btn-primary">
              {busy ? "Publication…" : "Publier"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
