"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/ui";

export default function AuthPage() {
  return (
    <Suspense>
      <AuthInner />
    </Suspense>
  );
}

function AuthInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/feed");
  }, [session, router]);

  // Propose un nom d'utilisateur à partir du nom complet
  useEffect(() => {
    if (mode !== "signup" || username) return;
    const base = fullName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);
    if (base.length >= 3) setUsername(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const u = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (u.length < 3) throw new Error("Le nom d'utilisateur doit faire au moins 3 caractères : lettres, chiffres ou _.");
        const { data: taken } = await sb().from("profiles").select("id").eq("username", u).maybeSingle();
        if (taken) throw new Error("Ce nom d'utilisateur est déjà pris. Essaie une variante.");
        const { data, error } = await sb().auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim(), username: u }, emailRedirectTo: `${window.location.origin}/feed` },
        });
        if (error) throw error;
        if (!data.session) setInfo("Compte créé. Ouvre le lien reçu par e-mail pour confirmer ton adresse, puis connecte-toi.");
      } else {
        const { error } = await sb().auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg.includes("Invalid login credentials")
          ? "E-mail ou mot de passe incorrect."
          : msg.includes("already registered")
            ? "Un compte existe déjà avec cet e-mail. Connecte-toi."
            : msg.includes("Email not confirmed")
              ? "Confirme d'abord ton adresse avec le lien reçu par e-mail."
              : msg.includes("Password should be")
                ? "Le mot de passe doit faire au moins 6 caractères."
                : msg || "Connexion impossible. Réessaie dans un instant.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1.05fr] bg-canvas">
      <div className="relative hidden lg:flex flex-col justify-between bg-cobalt text-white p-12 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-[0.14]" aria-hidden>
          <defs>
            <pattern id="auth-steps" width="72" height="72" patternUnits="userSpaceOnUse">
              <path d="M0 62h18V44h18V26h18V8h18" stroke="#fff" strokeWidth="2.5" fill="none" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#auth-steps)" />
        </svg>
        <Link href="/" className="relative"><Logo light /></Link>
        <div className="relative">
          <p className="font-display text-[64px] font-extrabold leading-[0.95]">On apprend mieux quand on montre son travail.</p>
          <p className="text-white/75 mt-6 text-lg">Rejoins la promo Kladriva et partage ta progression, un jour après l&apos;autre.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] sheet-in">
          <Link href="/" className="lg:hidden inline-block mb-10"><Logo /></Link>
          <h1 className="font-display text-[38px] font-bold leading-tight">{mode === "signup" ? "Crée ton compte" : "Content de te revoir"}</h1>
          <p className="text-muted mt-2">{mode === "signup" ? "Une minute, et tu publies ta première avancée." : "Connecte-toi pour retrouver ta promo."}</p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
            {mode === "signup" && (
              <>
                <input className="field !py-3" placeholder="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={60} autoComplete="name" />
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">@</span>
                  <input
                    className="field !py-3 !pl-8"
                    placeholder="nom_utilisateur"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    required
                    minLength={3}
                    maxLength={24}
                    autoComplete="username"
                  />
                </div>
              </>
            )}
            <input className="field !py-3" type="email" placeholder="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            <div className="relative">
              <input
                className="field !py-3 !pr-12"
                type={show ? "text" : "password"}
                placeholder="Mot de passe (6 caractères minimum)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn" aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <p className="text-sm text-coral font-medium" role="alert">{error}</p>}
            {info && <p className="text-sm text-mint bg-mint-soft rounded-xl p-3 font-medium">{info}</p>}
            <button className="btn btn-primary !py-3.5 mt-2 text-[15px]" disabled={busy}>
              {busy ? "Un instant…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
            </button>
          </form>

          <p className="text-sm text-muted mt-6 text-center">
            {mode === "signup" ? "Déjà membre ?" : "Pas encore de compte ?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError(null);
                setInfo(null);
              }}
              className="font-bold text-cobalt hover:underline"
            >
              {mode === "signup" ? "Se connecter" : "Créer un compte"}
            </button>
          </p>
          <p className="text-center mt-4">
            <Link href="/feed" className="text-sm text-muted hover:text-ink">Parcourir le fil sans compte</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
