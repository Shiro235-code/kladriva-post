export function findMentionAtCaret(text, caret) {
  const before = text.slice(0, caret);
  const match = /(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_]*)$/.exec(before);
  if (!match) return null;
  const atIndex = caret - match[2].length - 1;
  if (atIndex > 0 && /[a-zA-Z0-9_.]/.test(text[atIndex - 1])) return null;
  return { atIndex, query: match[2].toLowerCase(), endIndex: caret };
}

export function insertMention(text, caret, username) {
  const active = findMentionAtCaret(text, caret);
  if (!active) return text;
  return text.slice(0, active.atIndex) + `@${username} ` + text.slice(active.endIndex);
}

export function extractMentionUsernames(text) {
  const matches = [...(text || "").matchAll(/(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_]{3,24})/g)];
  const seen = new Set();
  const out = [];
  for (const match of matches) {
    const username = match[2].toLowerCase();
    if (!seen.has(username)) {
      seen.add(username);
      out.push(username);
      if (out.length >= 10) break;
    }
  }
  return out;
}
