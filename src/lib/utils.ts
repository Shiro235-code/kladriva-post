export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: d > 300 ? "numeric" : undefined });
}

export function displayName(p?: { full_name?: string; username?: string } | null): string {
  if (!p) return "Membre";
  return p.full_name?.trim() || p.username || "Membre";
}

export const GROUP_COLORS: Record<string, { bg: string; fg: string; ring: string }> = {
  violet: { bg: "#ece8ff", fg: "#4a32d4", ring: "#c9bfff" },
  orange: { bg: "#ffe9df", fg: "#d3400f", ring: "#ffc6ad" },
  green: { bg: "#e2f6e8", fg: "#17803d", ring: "#b5e6c4" },
  blue: { bg: "#e2efff", fg: "#1f5fd1", ring: "#b9d3ff" },
  pink: { bg: "#ffe6f1", fg: "#c22a6f", ring: "#ffbfda" },
  ink: { bg: "#e9e8e4", fg: "#0f0f12", ring: "#cfcdc5" },
};

export function groupColor(c?: string) {
  return GROUP_COLORS[c || "violet"] || GROUP_COLORS.violet;
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
