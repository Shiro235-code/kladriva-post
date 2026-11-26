import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/* ------------------------------------------------------------------
   Tolérance au décalage d'horloge
   ------------------------------------------------------------------
   Supabase compare l'heure d'expiration de la session (heure du serveur)
   à l'heure de l'ordinateur. Si l'horloge de l'ordinateur avance (fréquent
   sur Linux ou dans une machine virtuelle), la session paraît toujours
   expirée : le navigateur la renouvelle sans arrêt, Supabase finit par
   refuser (429) et l'utilisateur est déconnecté.
   On mesure l'écart avec l'heure du serveur et on recale l'expiration
   de la session dans le stockage local. */

const SKEW_KEY = "kp-clock-skew";
let skewSeconds = 0; // heure locale - heure serveur, en secondes

function readCachedSkew() {
  try {
    const v = Number(localStorage.getItem(SKEW_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** Mesure l'écart entre l'horloge locale et celle du serveur (en-tête Date). */
export async function measureClockSkew(): Promise<number> {
  try {
    const t0 = Date.now();
    const res = await fetch(`/?_t=${t0}`, { method: "HEAD", cache: "no-store" });
    const t1 = Date.now();
    const header = res.headers.get("date");
    if (!header) return skewSeconds;
    const server = new Date(header).getTime() + 500; // l'en-tête est arrondi à la seconde
    const local = (t0 + t1) / 2;
    const skew = Math.round((local - server) / 1000);
    skewSeconds = Math.abs(skew) > 60 ? skew : 0;
    try {
      localStorage.setItem(SKEW_KEY, String(skewSeconds));
    } catch {}
  } catch {
    /* hors ligne : on garde la dernière valeur connue */
  }
  return skewSeconds;
}

export const clockSkew = () => skewSeconds;

/** Stockage de session qui recale `expires_at` sur l'horloge locale. */
const skewAwareStorage = {
  getItem(key: string): string | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return null;
    }
    if (!raw) return raw;
    try {
      const s = JSON.parse(raw);
      if (s && typeof s === "object" && typeof s.expires_at === "number") {
        const applied = typeof s._kp_skew === "number" ? s._kp_skew : 0;
        if (applied === skewSeconds) return raw;
        // Recale sur l'écart actuel (y compris si l'horloge a été corrigée entre-temps)
        s.expires_at = s.expires_at - applied + skewSeconds;
        s._kp_skew = skewSeconds;
        return JSON.stringify(s);
      }
    } catch {
      /* valeur non JSON : on la rend telle quelle */
    }
    return raw;
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

/* ------------------------------------------------------------------
   Client unique (même après un rechargement à chaud en développement) :
   plusieurs clients renouvelleraient la session chacun de leur côté.
   ------------------------------------------------------------------ */
const g = globalThis as unknown as { __kpSupabase?: SupabaseClient };

export function sb(): SupabaseClient {
  if (!g.__kpSupabase) {
    const browser = typeof window !== "undefined";
    if (browser) skewSeconds = readCachedSkew();
    g.__kpSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-key",
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: browser ? skewAwareStorage : undefined,
        },
      },
    );
  }
  return g.__kpSupabase;
}
