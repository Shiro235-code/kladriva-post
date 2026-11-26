import type { PostKind, ReactionType, Stats } from "./types";

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  if (d < 7) return `${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: d > 300 ? "numeric" : undefined });
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

export function displayName(p?: { full_name?: string; username?: string } | null): string {
  if (!p) return "Membre";
  return p.full_name?.trim() || p.username || "Membre";
}

export function firstName(p?: { full_name?: string; username?: string } | null): string {
  return displayName(p).split(" ")[0];
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function plural(n: number, one: string, many?: string) {
  return `${n} ${n > 1 ? many || one + "s" : one}`;
}

/* ---------- Réactions ---------- */
export const REACTIONS: { type: ReactionType; emoji: string; label: string; color: string }[] = [
  { type: "like", emoji: "👍", label: "J'aime", color: "var(--cobalt)" },
  { type: "love", emoji: "❤️", label: "J'adore", color: "var(--coral)" },
  { type: "clap", emoji: "👏", label: "Bravo", color: "#d97706" },
  { type: "fire", emoji: "🔥", label: "Ça claque", color: "#ea580c" },
  { type: "idea", emoji: "💡", label: "Inspirant", color: "#ca8a04" },
  { type: "wow", emoji: "🤯", label: "Waouh", color: "#7c3aed" },
];
export const reactionOf = (t: ReactionType) => REACTIONS.find((r) => r.type === t) || REACTIONS[0];

/* ---------- Types de publication ---------- */
export const KINDS: { kind: PostKind; emoji: string; label: string; short: string; fg: string; bg: string }[] = [
  { kind: "update", emoji: "✍️", label: "Avancée", short: "Avancée", fg: "var(--ink-2)", bg: "var(--surface-2)" },
  { kind: "win", emoji: "🏆", label: "Victoire", short: "Victoire", fg: "#8a5a00", bg: "var(--sun-soft)" },
  { kind: "help", emoji: "🆘", label: "Je bloque", short: "Besoin d'aide", fg: "var(--coral)", bg: "var(--coral-soft)" },
  { kind: "resource", emoji: "📚", label: "Ressource", short: "Ressource", fg: "var(--mint)", bg: "var(--mint-soft)" },
  { kind: "project", emoji: "🚀", label: "Projet terminé", short: "Projet", fg: "var(--cobalt)", bg: "var(--cobalt-soft)" },
];
export const kindOf = (k: PostKind) => KINDS.find((x) => x.kind === k) || KINDS[0];

/* ---------- Groupes ---------- */
export const GROUP_COLORS: Record<string, { from: string; to: string; fg: string }> = {
  cobalt: { from: "#2f4bff", to: "#7b5cff", fg: "#ffffff" },
  sun: { from: "#ffc531", to: "#ff8a3d", fg: "#14182b" },
  mint: { from: "#0fa978", to: "#5be0b3", fg: "#ffffff" },
  coral: { from: "#ff5470", to: "#ff9a62", fg: "#ffffff" },
  violet: { from: "#7b5cff", to: "#c26bff", fg: "#ffffff" },
  ink: { from: "#14182b", to: "#3b4261", fg: "#ffffff" },
  // anciennes valeurs V1
  orange: { from: "#ff8a3d", to: "#ffc531", fg: "#14182b" },
  green: { from: "#0fa978", to: "#5be0b3", fg: "#ffffff" },
  blue: { from: "#2f4bff", to: "#4fb2ff", fg: "#ffffff" },
  pink: { from: "#ff5470", to: "#c26bff", fg: "#ffffff" },
};
export const GROUP_PALETTE = ["cobalt", "sun", "mint", "coral", "violet", "ink"];
export function groupColor(c?: string) {
  return GROUP_COLORS[c || "cobalt"] || GROUP_COLORS.cobalt;
}
export const groupGradient = (c?: string) => {
  const g = groupColor(c);
  return `linear-gradient(135deg, ${g.from}, ${g.to})`;
};

/* ---------- Stories ---------- */
export const STORY_BGS: Record<string, string> = {
  ember: "linear-gradient(160deg, #ff8a3d, #ff5470)",
  cobalt: "linear-gradient(160deg, #2f4bff, #7b5cff)",
  mint: "linear-gradient(160deg, #0fa978, #1f6f8b)",
  night: "linear-gradient(160deg, #14182b, #3b4261)",
  sun: "linear-gradient(160deg, #ffc531, #ff8a3d)",
};

/* ---------- Badges ---------- */
export type Badge = { id: string; emoji: string; name: string; hint: string; earned: boolean };
export function badgesFor(s: Stats | null): Badge[] {
  const v = s || { posts: 0, reactions: 0, comments: 0, followers: 0, following: 0, groups: 0, helped: 0, projects: 0, streak: 0 };
  return [
    { id: "first", emoji: "🌱", name: "Premier pas", hint: "Publier une première avancée", earned: v.posts >= 1 },
    { id: "regular", emoji: "📅", name: "Régulier", hint: "3 jours de suite", earned: v.streak >= 3 },
    { id: "fire", emoji: "🔥", name: "En feu", hint: "7 jours de suite", earned: v.streak >= 7 },
    { id: "builder", emoji: "🚀", name: "Bâtisseur", hint: "Terminer un projet", earned: v.projects >= 1 },
    { id: "helper", emoji: "🤝", name: "Entraide", hint: "Aider 3 apprenants bloqués", earned: v.helped >= 3 },
    { id: "talker", emoji: "💬", name: "Pilier", hint: "20 commentaires", earned: v.comments >= 20 },
    { id: "popular", emoji: "⭐", name: "Inspirant", hint: "25 réactions reçues", earned: v.reactions >= 25 },
    { id: "network", emoji: "🌍", name: "Réseau", hint: "10 abonnés", earned: v.followers >= 10 },
  ];
}

/* ---------- Texte : mentions, hashtags, liens ---------- */
export type Token = { t: "text" | "mention" | "tag" | "url"; v: string };
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /(@[a-zA-Z0-9_]{3,24})|(#[\p{L}0-9_]{2,40})|(https?:\/\/[^\s]+)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1]) out.push({ t: "mention", v: m[1] });
    else if (m[2]) out.push({ t: "tag", v: m[2] });
    else out.push({ t: "url", v: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

export function postImages(p: { images?: string[] | null; image_url?: string | null }): string[] {
  const list = [...(p.images || [])];
  if (p.image_url && !list.includes(p.image_url)) list.unshift(p.image_url);
  return list.filter((u) => u.startsWith("https://"));
}
