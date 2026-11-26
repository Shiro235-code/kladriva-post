"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthProvider";
import { sb } from "@/lib/supabase";

/* ---------------- Thème ---------------- */
type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) || "light");
  }, []);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("kp-theme", next);
      } catch {}
      return next;
    });
  }, []);
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; text: string; tone: "ok" | "error" | "info" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = ++seq.current;
    setItems((it) => [...it.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((it) => it.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[80] bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto flex items-center gap-2.5 bg-ink text-surface pl-3.5 pr-4 py-2.5 rounded-2xl shadow-[var(--shadow-pop)] text-sm font-medium">
            {t.tone === "ok" ? <CheckCircle2 size={17} className="text-mint" /> : t.tone === "error" ? <AlertCircle size={17} className="text-coral" /> : <Info size={17} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Activité : badges non lus ---------------- */
type Activity = { unreadNotifs: number; unreadMessages: number; refresh: () => void; online: Set<string> };
const ActivityCtx = createContext<Activity>({ unreadNotifs: 0, unreadMessages: 0, refresh: () => {}, online: new Set() });
export const useActivity = () => useContext(ActivityCtx);

function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [unreadNotifs, setN] = useState(0);
  const [unreadMessages, setM] = useState(0);
  const [online, setOnline] = useState<Set<string>>(new Set());

  // Présence : qui est en ligne en ce moment
  useEffect(() => {
    if (!uid) return;
    const ch = sb().channel("presence:online", { config: { presence: { key: uid } } });
    ch.on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await ch.track({ at: Date.now() });
      });
    return () => {
      sb().removeChannel(ch);
    };
  }, [uid]);

  const refresh = useCallback(async () => {
    if (!uid) {
      setN(0);
      setM(0);
      return;
    }
    const [{ count }, { data }, { data: gdata }] = await Promise.all([
      sb().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("read", false),
      sb().from("conversation_members").select("last_read_at, conversation:conversations(last_message_at)").eq("user_id", uid),
      sb().from("group_members").select("last_read_at, group:groups(last_message_at)").eq("user_id", uid),
    ]);
    setN(count ?? 0);
    const rows = (data || []) as unknown as { last_read_at: string; conversation: { last_message_at: string } | null }[];
    const grows = (gdata || []) as unknown as { last_read_at: string; group: { last_message_at: string | null } | null }[];
    setM(
      rows.filter((r) => r.conversation && new Date(r.conversation.last_message_at) > new Date(r.last_read_at)).length +
        grows.filter((r) => r.group?.last_message_at && new Date(r.group.last_message_at) > new Date(r.last_read_at)).length,
    );
  }, [uid]);

  useEffect(() => {
    refresh();
    if (!uid) return;
    const ch = sb()
      .channel(`activity-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, refresh)
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      sb().removeChannel(ch);
      window.removeEventListener("focus", onFocus);
    };
  }, [uid, refresh]);

  return <ActivityCtx.Provider value={{ unreadNotifs, unreadMessages, refresh, online }}>{children}</ActivityCtx.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ActivityProvider>{children}</ActivityProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
