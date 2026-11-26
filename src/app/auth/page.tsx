"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/feed");
  }, [session, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const u = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (u.length < 3) throw new Error("Le nom d'utilisateur doit faire au moins 3 caractères (lettres, chiffres, _).");
        const { data: taken } = await sb().from("profiles").select("id").eq("username", u).maybeSingle();
        if (taken) throw new Error("Ce nom d'utilisateur est déjà pris.");
        const { data, error } = await sb().auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim(), username: u }, emailRedirectTo: `${window.location.origin}/feed` },
        });
        if (error) throw error;
        if (!data.session) setInfo("Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.");
      } else {
        const { error } = await sb().auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Une erreur est survenue.";
      setError(
        msg.includes("Invalid login credentials")
          ? "E-mail ou mot de passe incorrect."
          : msg.includes("already registered")
            ? "Un compte existe déjà avec cet e-mail."
            : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between bg-ink text-white p-12 overflow-hidden">
        <div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-70 blur-[110px]"
          style={{ background: "radial-gradient(circle, #ff5b2e 0%, rgba(255,91,46,0) 65%)" }}
        />
        <div className="grain" />
        <Link href="/" className="relative"><Logo light /></Link>
        <div className="relative">
          <p className="font-display italic text-6xl leading-[1]">« On apprend mieux quand on montre son travail. »</p>
          <p className="text-white/60 mt-6">Rejoins la promo Kladriva et partage ta progression.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px] rise">
          <Link href="/" className="lg:hidden inline-block mb-10"><Logo /></Link>
          <h1 className="text-4xl font-semibold tracking-[-0.03em]">
            {mode === "signup" ? "Crée ton compte" : "Bon retour 👋"}
          </h1>
          <p className="text-muted mt-2">
            {mode === "signup" ? "Une minute, et tu publies ta première avancée." : "Connecte-toi pour retrouver ta promo."}
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
            {mode === "signup" && (
              <>
                <input className="input" placeholder="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={60} />
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">@</span>
                  <input
                    className="input !pl-8"
                    placeholder="nom_utilisateur"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    required
                    minLength={3}
                    maxLength={24}
                  />
                </div>
              </>
            )}
            <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            <input
              className="input"
              type="password"
              placeholder="Mot de passe (6 caractères min.)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-green-700 bg-green-50 rounded-xl p-3">{info}</p>}
            <button className="btn btn-primary !py-3.5 mt-2" disabled={busy}>
              {busy ? "Un instant…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
            </button>
          </form>

          <p className="text-sm text-muted mt-6 text-center">
            {mode === "signup" ? "Déjà membre ?" : "Pas encore de compte ?"}{" "}
            <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }} className="font-semibold text-ink hover:underline">
              {mode === "signup" ? "Se connecter" : "Rejoindre la promo"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
