"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AlertTriangle, X } from "lucide-react";
import { measureClockSkew, sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type Ctx = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

function pendingPushKey(uid: string) { return `kp-push-delete-pending:${uid}`; }

function rememberPushEndpoint(uid: string, endpoint: string) {
  try {
    const key = pendingPushKey(uid);
    const stored = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    if (!stored.includes(endpoint)) localStorage.setItem(key, JSON.stringify([...stored, endpoint]));
  } catch { /* Le navigateur peut bloquer le stockage local. */ }
}

async function retryPendingPushDeletes(uid: string) {
  try {
    const key = pendingPushKey(uid);
    const endpoints = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(endpoints)) return;
    const remaining: string[] = [];
    for (const endpoint of endpoints) {
      if (typeof endpoint !== "string") continue;
      const { error } = await sb().from("push_subscriptions").delete().eq("user_id", uid).eq("endpoint", endpoint);
      if (error) remaining.push(endpoint);
    }
    if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
    else localStorage.removeItem(key);
  } catch { /* Réessaie à la prochaine ouverture de session. */ }
}

async function disableMessagePreviews(uid: string) {
  // Normalise uniquement les lignes de l'utilisateur connecté, sous ses politiques RLS.
  await sb().from("push_subscriptions").update({ show_preview: false })
    .eq("user_id", uid).eq("show_preview", true);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [skew, setSkew] = useState(0);
  const [skewDismissed, setSkewDismissed] = useState(false);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data } = await sb().from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) setProfile(data as Profile);
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | undefined;
    (async () => {
      // 1. Mesurer l'horloge AVANT de lire la session, pour qu'elle ne paraisse pas expirée à tort
      const s = await measureClockSkew();
      if (!mounted) return;
      setSkew(s);
      // 2. Lire la session enregistrée (aucune reconnexion tant qu'on ne se déconnecte pas)
      const { data } = await sb().auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      loadProfile(data.session?.user.id);
      // 3. Suivre les changements (connexion, déconnexion, renouvellement)
      const { data: sub } = sb().auth.onAuthStateChange((event, next) => {
        if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          setSession(next);
          return;
        }
        setSession(next);
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") loadProfile(next?.user.id);
      });
      unsub = () => sub.subscription.unsubscribe();
    })().catch(() => mounted && setLoading(false));
    return () => {
      mounted = false;
      unsub?.();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session]);
  useEffect(() => {
    const uid = session?.user.id;
    if (uid && typeof window !== "undefined") {
      void retryPendingPushDeletes(uid);
      void disableMessagePreviews(uid);
    }
  }, [session?.user.id]);

  const signOut = useCallback(async () => {
    // Retire l’abonnement de cet appareil avant de fermer la session pour éviter
    // que les prochains messages du compte arrivent sur un navigateur partagé.
    if (session?.user.id && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          const { error } = await sb().from("push_subscriptions").delete().eq("user_id", session.user.id).eq("endpoint", endpoint);
          if (error) rememberPushEndpoint(session.user.id, endpoint);
          else {
            try {
              const key = pendingPushKey(session.user.id);
              const queued = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
              if (Array.isArray(queued)) {
                const remaining = queued.filter((item) => item !== endpoint);
                if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
                else localStorage.removeItem(key);
              }
            } catch {}
          }
          // Coupe immédiatement les notifications de ce navigateur, même si le
          // réseau a échoué. La suppression RLS sera retentée à la prochaine session.
          await subscription.unsubscribe();
        }
      } catch { /* La déconnexion doit rester possible si le push ou le réseau est indisponible. */ }
      try { localStorage.removeItem("kp-push-device-owner"); } catch {}
    }
    await sb().auth.signOut();
    setProfile(null);
    setSession(null);
  }, [session]);

  const minutes = Math.round(Math.abs(skew) / 60);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut }}>
      {children}
      {minutes >= 2 && !skewDismissed && (
        <div className="fixed z-[85] top-3 left-1/2 -translate-x-1/2 w-[min(560px,calc(100%-24px))] bg-surface border border-line rounded-2xl shadow-[var(--shadow-pop)] p-3.5 flex gap-3 items-start toast-in" role="status">
          <span className="w-9 h-9 rounded-xl bg-sun-soft text-[var(--sun-ink)] grid place-items-center shrink-0"><AlertTriangle size={18} /></span>
          <p className="text-sm text-ink-2 flex-1">
            <b className="text-ink">L&apos;horloge de ton appareil {skew > 0 ? "avance" : "retarde"} d&apos;environ {minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`}.</b>{" "}
            Kladriva Post s&apos;adapte pour te garder connecté, mais règle la date et l&apos;heure automatiques de ton appareil pour éviter tout souci.
          </p>
          <button onClick={() => setSkewDismissed(true)} className="icon-btn !w-8 !h-8 shrink-0" aria-label="Fermer"><X size={16} /></button>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
