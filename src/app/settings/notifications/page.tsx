"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, ChevronRight, CircleAlert, Smartphone, Trash2, Users, MessageCircle, ShieldCheck, Volume2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useActivity } from "@/components/Providers";
import { sb } from "@/lib/supabase";
import { cx } from "@/lib/utils";

type PushDevice = {
  id: string; endpoint: string; device_label: string | null;
  private_messages: boolean; group_messages: boolean; show_preview: boolean; created_at: string;
};
const OWNER_KEY = "kp-push-device-owner";

function installedApp() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function appleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Appareil Android";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "PC Windows";
  if (/Linux/i.test(ua)) return "Ordinateur Linux";
  return "Cet appareil";
}
function vapidBytes(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`;
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
function dbError(error: { message?: string; code?: string } | null) {
  if (error?.code === "23505") return "Cet abonnement existe déjà pour un autre compte. La protection RLS empêche son transfert : connecte-toi à l’ancien compte et supprime cet appareil avant de le réassocier.";
  if (error?.code === "42501") return "La base a refusé cette opération. Vérifie les droits RLS de ton compte sur push_subscriptions.";
  return error?.message || "L’opération a échoué. Réessaie dans un instant.";
}

export default function NotificationSettingsPage() {
  const { session, loading: authLoading } = useAuth();
  const { messageSound, setMessageSound } = useActivity();
  const router = useRouter();
  const uid = session?.user.id;
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [supported, setSupported] = useState(false);
  const [browserEndpoint, setBrowserEndpoint] = useState<string | null>(null);
  const [previewPrivacyReady, setPreviewPrivacyReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isAppleMobile, setIsAppleMobile] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!authLoading && !session) router.replace(`/auth?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [authLoading, session, router]);
  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    setInstalled(installedApp());
    setIsAppleMobile(appleMobile());
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((sub) => setBrowserEndpoint(sub?.endpoint || null)).catch(() => {});
    }
    if (ok && navigator.permissions?.query) {
      void navigator.permissions.query({ name: "notifications" as PermissionName }).then((status) => {
        status.onchange = () => setPermission(Notification.permission);
      }).catch(() => {});
    }
  }, []);

  const loadDevices = useCallback(async () => {
    if (!uid) { setDevices([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: queryError } = await sb().from("push_subscriptions")
      .select("id,endpoint,device_label,private_messages,group_messages,show_preview,created_at")
      .eq("user_id", uid).order("created_at", { ascending: false });
    if (queryError) {
      setPreviewPrivacyReady(false);
      setError(dbError(queryError));
    }
    else {
      const rows = (data || []) as PushDevice[];
      const hasPreviewEnabled = rows.some((row) => row.show_preview);
      if (hasPreviewEnabled) {
        // Désactive les anciens réglages d'aperçu sous le compte courant (RLS).
        // Le contenu ne doit pas être inclus tant que le dispatcher ne le prend pas explicitement en charge.
        const { error: privacyError } = await sb().from("push_subscriptions").update({ show_preview: false })
          .eq("user_id", uid).eq("show_preview", true);
        if (privacyError) {
          setPreviewPrivacyReady(false);
          setError(`Impossible de désactiver les anciens aperçus sur tous tes appareils : ${dbError(privacyError)}`);
        } else rows.forEach((row) => { row.show_preview = false; });
      }
      if (!hasPreviewEnabled || rows.every((row) => !row.show_preview)) setPreviewPrivacyReady(true);
      setDevices(rows);
    }
    setLoading(false);
  }, [uid]);
  useEffect(() => { void loadDevices(); }, [loadDevices]);

  const updateDevice = async (device: PushDevice, field: "private_messages" | "group_messages", value: boolean) => {
    if (!uid) return;
    const previous = device[field];
    setError("");
    setDevices((rows) => rows.map((row) => row.id === device.id ? { ...row, [field]: value } : row));
    const { error: updateError } = await sb().from("push_subscriptions").update({ [field]: value }).eq("id", device.id).eq("user_id", uid);
    if (updateError) {
      setDevices((rows) => rows.map((row) => row.id === device.id ? { ...row, [field]: previous } : row));
      setError(dbError(updateError));
    }
  };

  const enable = async () => {
    if (!uid) return;
    setError(""); setNotice(""); setBusy(true);
    let newSubscription: PushSubscription | null = null;
    let ownerSaved = false;
    try {
      if (!supported) throw new Error("Ce navigateur ne prend pas en charge PushManager, les notifications système ou les Service Workers.");
      if (!previewPrivacyReady) throw new Error("Les préférences de confidentialité des appareils n’ont pas pu être vérifiées. Réessaie avant d’activer les notifications.");
      if (isAppleMobile && !installed) throw new Error("Sur iPhone et iPad, ajoute d’abord Kladriva Post à l’écran d’accueil, puis ouvre l’application depuis son icône.");
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("La clé publique VAPID NEXT_PUBLIC_VAPID_PUBLIC_KEY n’est pas configurée dans cette version.");
      let permissionResult = Notification.permission;
      if (permissionResult === "default") permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") throw new Error(permissionResult === "denied" ? "Autorisation refusée. Réactive les notifications dans les réglages du navigateur ou du système." : "L’autorisation des notifications n’a pas été accordée.");

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const priorOwner = localStorage.getItem(OWNER_KEY);
      if (subscription && priorOwner && priorOwner !== uid) {
        // Évite de rattacher silencieusement l’abonnement local de l’ancien compte.
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(publicKey) as BufferSource });
        newSubscription = subscription;
      }
      const keys = subscription.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) throw new Error("Le navigateur a renvoyé un abonnement incomplet. Actualise la page et réessaie.");
      const { data: existing, error: lookupError } = await sb().from("push_subscriptions")
        .select("id,private_messages,group_messages").eq("user_id", uid).eq("endpoint", subscription.endpoint).maybeSingle();
      if (lookupError) throw new Error(dbError(lookupError));
      const payload = {
        user_id: uid, endpoint: subscription.endpoint, p256dh: keys.p256dh, auth_key: keys.auth,
        device_label: deviceName(), private_messages: existing?.private_messages ?? true,
        group_messages: existing?.group_messages ?? true, show_preview: false,
      };
      // Ne jamais faire un upsert global par endpoint : un conflit appartenant à
      // un autre user doit échouer à l'INSERT sous RLS, pas tenter un UPDATE.
      const { error: saveError } = existing
        ? await sb().from("push_subscriptions").update({
            p256dh: payload.p256dh, auth_key: payload.auth_key, device_label: payload.device_label,
            private_messages: payload.private_messages, group_messages: payload.group_messages, show_preview: false,
          }).eq("id", existing.id).eq("user_id", uid)
        : await sb().from("push_subscriptions").insert(payload);
      if (saveError) {
        if (newSubscription) await newSubscription.unsubscribe();
        throw new Error(dbError(saveError));
      }
      localStorage.setItem(OWNER_KEY, uid);
      ownerSaved = true;
      setBrowserEndpoint(subscription.endpoint);
      setNotice("Appareil ajouté à tes notifications.");
      await loadDevices();
    } catch (cause) {
      if (newSubscription && !ownerSaved) {
        try { await newSubscription.unsubscribe(); } catch {}
      }
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue pendant l’activation.");
    } finally { setBusy(false); }
  };

  const remove = async (device: PushDevice) => {
    if (!uid) return;
    setError(""); setBusy(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const { error: deleteError } = await sb().from("push_subscriptions").delete().eq("id", device.id).eq("user_id", uid);
      if (deleteError) throw new Error(dbError(deleteError));
      if (subscription?.endpoint === device.endpoint) {
        await subscription.unsubscribe();
        setBrowserEndpoint(null);
        if (localStorage.getItem(OWNER_KEY) === uid) localStorage.removeItem(OWNER_KEY);
      }
      setDevices((rows) => rows.filter((row) => row.id !== device.id));
      setNotice("Appareil supprimé.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer cet appareil.");
    } finally { setBusy(false); }
  };

  const disableThisDevice = async () => {
    const current = devices.find((device) => device.endpoint === browserEndpoint);
    if (current) { await remove(current); return; }
    setBusy(true); setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      setBrowserEndpoint(null);
      localStorage.removeItem(OWNER_KEY);
      setNotice("Notifications système désactivées sur cet appareil.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de désactiver les notifications sur cet appareil.");
    } finally { setBusy(false); }
  };

  if (authLoading || !session) return <AppShell><div className="max-w-[760px] mx-auto py-16 text-center text-muted">Chargement de tes préférences…</div></AppShell>;

  return <AppShell>
    <div className="max-w-[760px] mx-auto pb-8">
      <header className="mb-6"><p className="text-xs font-bold tracking-[0.16em] uppercase text-cobalt mb-2">Ton espace, à ton rythme</p><h1 className="font-display text-3xl sm:text-[38px] font-bold leading-tight">Notifications</h1><p className="text-ink-2 mt-2 max-w-xl">Choisis les appareils et les messages qui méritent de te retrouver, même quand Kladriva Post est fermé.</p></header>

      <section className="relative overflow-hidden rounded-[28px] bg-ink text-white p-5 sm:p-7 mb-5 shadow-[var(--shadow-pop)]">
        <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-cobalt/40 blur-3xl" aria-hidden />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5"><span className="w-14 h-14 rounded-[20px] bg-white/10 grid place-items-center shrink-0"><Bell size={25} /></span><div className="flex-1"><h2 className="font-display text-xl font-bold">Notifications système</h2><p className="text-white/70 text-sm mt-1">Ajoute cet appareil pour recevoir les nouveaux messages privés et de groupe.</p><p className="text-white/50 text-xs mt-2">{permission === "granted" ? "Autorisation accordée dans ce navigateur" : permission === "denied" ? "Autorisation bloquée dans les réglages du navigateur" : "Ton accord sera demandé au moment de l’activation"}</p></div><button onClick={() => browserEndpoint ? void disableThisDevice() : void enable()} disabled={busy || (!browserEndpoint && (!supported || !previewPrivacyReady || permission === "denied" || (isAppleMobile && !installed)))} className="relative btn btn-primary !bg-white !text-ink min-h-12 shrink-0 disabled:opacity-50">{browserEndpoint ? <BellOff size={17} /> : <Bell size={17} />}{busy ? "Mise à jour…" : browserEndpoint ? "Désactiver sur cet appareil" : "Activer sur cet appareil"}</button></div>
      </section>

      {isAppleMobile && !installed && <section className="panel p-5 sm:p-6 mb-5 border-cobalt/30"><div className="flex items-start gap-3"><span className="w-10 h-10 rounded-2xl bg-cobalt-soft text-cobalt grid place-items-center shrink-0"><Smartphone size={19} /></span><div><h2 className="font-semibold">Installer Kladriva Post sur iPhone ou iPad</h2><ol className="mt-2 text-sm text-ink-2 space-y-1.5 list-decimal pl-5"><li>Ouvre cette page dans Safari.</li><li>Appuie sur <b>Partager</b>, puis <b>Sur l’écran d’accueil</b>.</li><li>Lance Kladriva Post depuis sa nouvelle icône et active les notifications ici.</li></ol><p className="text-xs text-muted mt-3">iOS demande que l’application web soit installée avant d’autoriser les notifications.</p></div></div></section>}
      {!supported && <div className="panel p-4 mb-5 flex gap-3 text-sm text-ink-2"><CircleAlert className="text-sun-ink shrink-0" size={19} />Ce navigateur ne prend pas en charge PushManager, le Service Worker ou les notifications système.</div>}
      {permission === "denied" && <div className="panel p-4 mb-5 flex gap-3 text-sm text-ink-2"><BellOff className="text-coral shrink-0" size={19} /><span>Les notifications sont bloquées. Le site ne peut pas rouvrir la demande : modifie l’autorisation dans les réglages du navigateur, puis recharge cette page.</span></div>}
      {error && <div role="alert" className="rounded-2xl border border-coral/30 bg-coral-soft px-4 py-3 text-sm text-ink mb-4">{error}</div>}
      {notice && <div role="status" className="rounded-2xl border border-mint/30 bg-mint-soft px-4 py-3 text-sm text-ink mb-4 flex items-center gap-2"><Check size={17} className="text-mint" />{notice}</div>}

      <section className="panel overflow-hidden mb-5">
        <div className="p-5 sm:p-6 border-b border-line"><div className="flex items-center gap-3"><span className="w-10 h-10 rounded-2xl bg-cobalt-soft text-cobalt grid place-items-center"><ShieldCheck size={20} /></span><div><h2 className="font-display text-lg font-bold">Préférences de messagerie</h2><p className="text-sm text-muted">Choisis les messages reçus pour chaque appareil.</p></div></div></div>
        <Preference icon={MessageCircle} title="Messages privés" description="Recevoir les nouveaux messages de tes conversations." field="private_messages" devices={devices} onChange={updateDevice} />
        <Preference icon={Users} title="Messages de groupe" description="Recevoir les nouveaux messages de tes groupes." field="group_messages" devices={devices} onChange={updateDevice} />
        <div className="border-b border-line p-4 sm:px-6 flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-2 grid place-items-center shrink-0"><Bell size={17} /></span><span className="flex-1 min-w-0"><span className="block text-sm font-semibold">Aperçu du message</span><span className="block text-xs text-muted mt-0.5">Indisponible pour le moment : l’aperçu reste désactivé jusqu’à sa prise en charge par le service d’envoi.</span></span><span className="text-xs font-semibold text-muted bg-surface-2 rounded-full px-2.5 py-1">Désactivé</span></div>
        <div className="p-4 sm:px-6 flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-2 grid place-items-center"><Volume2 size={17} /></span><span className="flex-1 min-w-0"><span className="block text-sm font-semibold">Son dans l’application</span><span className="text-xs text-muted">Son des bannières Realtime quand la page est ouverte.</span></span><Toggle checked={messageSound} onChange={setMessageSound} label="Activer le son dans l’application" /></div>
      </section>

      <section className="panel overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-line flex items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Appareils abonnés</h2><p className="text-sm text-muted">Les appareils enregistrés sur ton compte.</p></div><span className="px-2.5 py-1 rounded-full bg-surface-2 text-xs font-bold">{devices.length}</span></div>
        {loading ? <div className="p-6 text-sm text-muted">Chargement des appareils…</div> : devices.length === 0 ? <div className="p-6 sm:p-8 text-center"><span className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-surface-2 text-muted grid place-items-center"><BellOff size={21} /></span><p className="font-semibold">Aucun appareil abonné</p><p className="text-sm text-muted mt-1">Active les notifications système sur cet appareil pour le voir ici.</p></div> : <ul className="divide-y divide-line">{devices.map((device) => <li key={device.id} className="p-4 sm:px-6 flex items-start gap-3"><span className="w-10 h-10 rounded-2xl bg-surface-2 text-ink-2 grid place-items-center shrink-0"><Smartphone size={19} /></span><div className="flex-1 min-w-0"><p className="font-semibold text-sm">{device.device_label || "Appareil"}<CurrentDevice endpoint={device.endpoint} /></p><p className="text-xs text-muted mt-0.5">Ajouté le {new Date(device.created_at).toLocaleDateString("fr-FR", { dateStyle: "medium" })}</p><p className="text-xs text-muted mt-1">{device.private_messages ? "Privés" : "Sans privés"} · {device.group_messages ? "Groupes" : "Sans groupes"}</p></div><button disabled={busy} onClick={() => void remove(device)} className="icon-btn text-muted hover:text-coral" aria-label={`Supprimer ${device.device_label || "cet appareil"}`} title="Supprimer cet appareil"><Trash2 size={17} /></button></li>)}</ul>}
        <div className="border-t border-line bg-surface-2/60 px-5 py-4 flex items-start gap-2.5 text-xs text-muted"><ShieldCheck size={15} className="shrink-0 mt-0.5" />Supprimer un appareil arrête les prochains envois vers celui-ci. Un appareil hors ligne sera nettoyé par le service d’envoi s’il a expiré.</div>
      </section>
      <button onClick={() => router.push("/notifications")} className="mt-4 mx-auto flex items-center gap-1 text-sm font-semibold text-cobalt hover:underline">Voir les notifications internes<ChevronRight size={16} /></button>
    </div>
  </AppShell>;
}

function CurrentDevice({ endpoint }: { endpoint: string }) {
  const [current, setCurrent] = useState(false);
  useEffect(() => { void navigator.serviceWorker?.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setCurrent(sub?.endpoint === endpoint)).catch(() => {}); }, [endpoint]);
  return current ? <span className="ml-2 text-[11px] text-mint font-bold">Cet appareil</span> : null;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx("relative h-7 w-12 rounded-full transition-colors", checked ? "bg-cobalt" : "bg-line-strong")}><span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-6" : "translate-x-1")} /></button>;
}

function Preference({ icon: Icon, title, description, field, devices, onChange }: { icon: typeof Bell; title: string; description: string; field: "private_messages" | "group_messages"; devices: PushDevice[]; onChange: (device: PushDevice, field: "private_messages" | "group_messages", value: boolean) => void }) {
  return <div className="border-b border-line p-4 sm:px-6 flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-2 grid place-items-center shrink-0"><Icon size={17} /></span><span className="flex-1 min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted mt-0.5">{description}</span></span>{devices.length ? <span className="flex flex-wrap justify-end gap-1.5">{devices.map((device) => <Toggle key={device.id} checked={device[field]} onChange={(value) => onChange(device, field, value)} label={`${title} — ${device.device_label || "appareil"}`} />)}</span> : <span className="text-xs text-muted">Aucun appareil</span>}</div>;
}
