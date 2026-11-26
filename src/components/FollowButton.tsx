"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { sb } from "@/lib/supabase";
import { cx } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { useToast } from "./Providers";

export function FollowButton({ userId, compact, onChange }: { userId: string; compact?: boolean; onChange?: (following: boolean) => void }) {
  const { session } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const me = session?.user.id;
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me || me === userId) return;
    sb()
      .from("follows")
      .select("follower_id")
      .eq("follower_id", me)
      .eq("following_id", userId)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data));
  }, [me, userId]);

  if (me === userId) return null;

  const toggle = async () => {
    if (!me) return router.push("/auth");
    setBusy(true);
    const next = !following;
    setFollowing(next);
    const { error } = next
      ? await sb().from("follows").insert({ follower_id: me, following_id: userId })
      : await sb().from("follows").delete().eq("follower_id", me).eq("following_id", userId);
    setBusy(false);
    if (error) {
      setFollowing(!next);
      toast("Action impossible pour le moment. Réessaie.", "error");
      return;
    }
    onChange?.(next);
  };

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      disabled={busy || (me != null && following === null)}
      className={cx("btn", following ? "btn-soft" : "btn-primary", compact && "!py-1.5 !px-3 !text-[13px]")}
    >
      {following ? <Check size={compact ? 14 : 16} /> : <Plus size={compact ? 14 : 16} />}
      {following ? "Abonné" : "Suivre"}
    </button>
  );
}
