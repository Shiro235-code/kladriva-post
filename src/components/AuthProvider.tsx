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
  const signOut = useCallback(async () => {
    await sb().auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

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
