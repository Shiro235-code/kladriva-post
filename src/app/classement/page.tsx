"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Flag, Medal } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, Empty, Spinner } from "@/components/ui";
import { sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cx, displayName } from "@/lib/utils";

type Row = { user_id: string; score: number; posts: number; comments: number; reactions: number; p: Profile };

export default function LeaderboardPage() {
  const { session } = useAuth();
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    sb()
      .rpc("leaderboard", { days_back: days })
      .then(async ({ data }) => {
        const list = (data as Omit<Row, "p">[]) || [];
        if (!list.length) {
          setRows([]);
          setLoading(false);
          return;
        }
        const { data: ps } = await sb().from("profiles").select("*").in("id", list.map((r) => r.user_id));
        setRows(list.map((r) => ({ ...r, p: (ps as Profile[]).find((x) => x.id === r.user_id)! })).filter((r) => r.p));
        setLoading(false);
      });
  }, [days]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const order = [podium[1], podium[0], podium[2]];
  const heights = ["h-24", "h-32", "h-20"];
  const medals = ["#a3acc2", "#e0a800", "#c07a43"];

  return (
    <AppShell>
      <div className="max-w-[680px] 2xl:max-w-[780px] mx-auto">
        <h1 className="font-display text-[34px] font-bold leading-tight">Classement</h1>
        <p className="text-muted mt-1">5 points par publication, 2 par commentaire, 1 par réaction reçue.</p>

        <div className="inline-flex bg-surface border border-line rounded-full p-1 mt-5">
          {[
            [7, "Cette semaine"],
            [30, "Ce mois-ci"],
          ].map(([d, label]) => (
            <button key={d} onClick={() => setDays(d as number)} className={cx("px-4 py-1.5 rounded-full text-sm font-semibold transition", days === d ? "bg-ink text-surface" : "text-muted hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="mt-6">
            <Empty icon={Flag} title="La course n'a pas commencé" text="Publie ta première avancée de la période pour prendre la tête." />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 items-end gap-3 mt-10">
              {order.map((r, i) =>
                r ? (
                  <Link key={r.user_id} href={`/u/${r.p.username}`} className="text-center group">
                    <div className="relative inline-block">
                      <Avatar profile={r.p} size={i === 1 ? 84 : 66} className={cx("ring-4", i === 1 ? "ring-sun" : "ring-surface")} />
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-surface border border-line grid place-items-center" aria-hidden><Medal size={18} style={{ color: medals[i] }} /></span>
                    </div>
                    <p className="font-semibold mt-2 truncate group-hover:underline">{displayName(r.p)}</p>
                    <p className="text-sm text-muted tabular-nums">{r.score} pts</p>
                    <div
                      className={cx("mt-3 rounded-t-2xl grid place-items-center font-display text-3xl font-bold", heights[i])}
                      style={{ background: i === 1 ? "linear-gradient(180deg, var(--sun), #ffab3d)" : "var(--surface)", color: i === 1 ? "#14182b" : "var(--muted)", border: i === 1 ? "none" : "1px solid var(--line)" }}
                    >
                      {i === 1 ? 1 : i === 0 ? 2 : 3}
                    </div>
                  </Link>
                ) : (
                  <div key={i} />
                ),
              )}
            </div>

            {rest.length > 0 && (
              <ol className="panel mt-0 rounded-t-none divide-y divide-line" start={4}>
                {rest.map((r, i) => (
                  <li key={r.user_id}>
                    <Link href={`/u/${r.p.username}`} className={cx("flex items-center gap-3.5 px-4 py-3 hover:bg-surface-2", r.user_id === session?.user.id && "bg-cobalt-soft/60")}>
                      <span className="w-6 text-center font-display font-bold text-muted">{i + 4}</span>
                      <Avatar profile={r.p} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold truncate">{displayName(r.p)}</span>
                        <span className="block text-xs text-muted">
                          {r.posts} publications, {r.comments} commentaires, {r.reactions} réactions
                        </span>
                      </span>
                      <span className="font-display font-bold tabular-nums">{r.score}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
