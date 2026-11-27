"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X, MessageCircle, Users, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "./AuthProvider";
import { sb } from "@/lib/supabase";
import { isMessageConversationVisible, isMessageNotification, messageNotificationHref } from "@/lib/message-notifications.mjs";

type MessageNotice = { id: string; type: "message" | "group_message"; data: Record<string, unknown> | null };

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

function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Le flux Realtime reste disponible même sans support du Service Worker.
    });
  }, []);
  return null;
}

/* ---------------- Activité : badges non lus ---------------- */
type Activity = { unreadNotifs: number; unreadMessages: number; refresh: () => void; online: Set<string>; messageSound: boolean; setMessageSound: (enabled: boolean) => void };
const ActivityCtx = createContext<Activity>({ unreadNotifs: 0, unreadMessages: 0, refresh: () => {}, online: new Set(), messageSound: false, setMessageSound: () => {} });
export const useActivity = () => useContext(ActivityCtx);

function playMessageTone() {
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    oscillator.onended = () => { void context.close(); };
  } catch { /* Le navigateur peut bloquer l'audio avant une interaction utilisateur. */ }
}

function MessageNoticeBanner({ notice, onDismiss, onOpen }: { notice: MessageNotice; onDismiss: () => void; onOpen: () => void }) {
  const isGroup = notice.type === "group_message";
  return (
    <div role="status" aria-live="polite" className="fixed z-[75] top-[calc(4rem+env(safe-area-inset-top))] right-3 sm:right-5 w-[min(390px,calc(100vw-24px))] panel p-3.5 sm:p-4 shadow-[var(--shadow-pop)] sheet-in">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-cobalt-soft text-cobalt grid place-items-center shrink-0">{isGroup ? <Users size={19} /> : <MessageCircle size={19} />}</span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-semibold leading-tight">{isGroup ? "Nouveau message de groupe" : "Nouveau message"}</p>
          <p className="text-sm text-muted mt-1">{isGroup ? "Ouvre la discussion pour répondre." : "Un message t’attend dans ta messagerie."}</p>
          <button onClick={onOpen} className="mt-2 min-h-10 px-3 rounded-full bg-cobalt text-white text-sm font-semibold hover:brightness-105 focus-visible:ring-2 focus-visible:ring-cobalt">Ouvrir la conversation</button>
        </div>
        <button onClick={onDismiss} className="icon-btn -mr-1 -mt-1" aria-label="Fermer la notification"><X size={18} /></button>
      </div>
    </div>
  );
}

function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [unreadNotifs, setN] = useState(0);
  const [unreadMessages, setM] = useState(0);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [messageSound, setMessageSoundState] = useState(false);
  const [messageNotice, setMessageNotice] = useState<MessageNotice | null>(null);
  const messageNoticeRef = useRef<MessageNotice | null>(null);
  const seenNoticeIds = useRef(new Set<string>());
  const soundRef = useRef(false);
  const router = useRouter();

  const setMessageSound = useCallback((enabled: boolean) => {
    setMessageSoundState(enabled);
    soundRef.current = enabled;
    if (uid) {
      try { localStorage.setItem(`kp-message-sound:${uid}`, enabled ? "on" : "off"); } catch {}
    }
    if (enabled) playMessageTone();
  }, [uid]);

  useEffect(() => {
    setMessageNotice(null);
    messageNoticeRef.current = null;
    seenNoticeIds.current.clear();
    let enabled = false;
    if (uid) {
      try { enabled = localStorage.getItem(`kp-message-sound:${uid}`) === "on"; } catch {}
    }
    setMessageSoundState(enabled);
    soundRef.current = enabled;
  }, [uid]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, (payload) => {
        void refresh();
        if (payload.eventType === "UPDATE") {
          const updated = payload.new as { id?: string; read?: boolean };
          if (updated.read && updated.id === messageNoticeRef.current?.id) {
            messageNoticeRef.current = null;
            setMessageNotice(null);
          }
          return;
        }
        if (payload.eventType !== "INSERT") return;
        const row = payload.new as { id?: string; type?: string; data?: Record<string, unknown> | null };
        if (!row.id || !isMessageNotification(row.type || "") || seenNoticeIds.current.has(row.id)) return;
        const type = row.type as MessageNotice["type"];
        const data = row.data || null;
        const href = messageNotificationHref(type, data);
        if (!href) return;
        if (seenNoticeIds.current.size >= 300) {
          const oldest = seenNoticeIds.current.values().next().value;
          if (oldest) seenNoticeIds.current.delete(oldest);
        }
        seenNoticeIds.current.add(row.id);
        if (isMessageConversationVisible(type, data, window.location.pathname, window.location.search, document.visibilityState)) {
          void sb().from("notifications").update({ read: true }).eq("id", row.id).eq("user_id", uid).then(() => refresh());
          return;
        }
        const notice = { id: row.id, type, data };
        messageNoticeRef.current = notice;
        setMessageNotice(notice);
        if (soundRef.current) playMessageTone();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `user_id=eq.${uid}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "group_members", filter: `user_id=eq.${uid}` }, refresh)
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      sb().removeChannel(ch);
      window.removeEventListener("focus", onFocus);
    };
  }, [uid, refresh]);

  const openNotice = useCallback(() => {
    if (!messageNotice || !uid) return;
    const href = messageNotificationHref(messageNotice.type, messageNotice.data);
    void sb().from("notifications").update({ read: true }).eq("id", messageNotice.id).eq("user_id", uid).then(() => refresh());
    messageNoticeRef.current = null;
    setMessageNotice(null);
    if (href) router.push(href);
  }, [messageNotice, uid, refresh, router]);

  return <ActivityCtx.Provider value={{ unreadNotifs, unreadMessages, refresh, online, messageSound, setMessageSound }}>
    {children}
    {messageNotice && <MessageNoticeBanner notice={messageNotice} onDismiss={() => setMessageNotice(null)} onOpen={openNotice} />}
  </ActivityCtx.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ActivityProvider>{children}</ActivityProvider>
          <ServiceWorkerRegistration />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
