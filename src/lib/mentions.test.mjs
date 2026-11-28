import assert from "node:assert/strict";
import { test } from "node:test";
import { findMentionAtCaret, insertMention, extractMentionUsernames } from "./mentions.mjs";
import { mentionedProfile } from "./mention-render.mjs";
import { readFile } from "node:fs/promises";

test("finds a mention token in the middle of text", () => {
  assert.deepEqual(findMentionAtCaret("Bonjour @mar demain", 12), { atIndex: 8, query: "mar", endIndex: 12 });
});

test("does not suggest inside an email address", () => {
  assert.equal(findMentionAtCaret("test@example.com", 8), null);
});

test("inserts a mention without deleting text after the cursor", () => {
  assert.equal(insertMention("Merci @mar tout le monde", 10, "marie"), "Merci @marie  tout le monde");
});

test("deduplicates and caps distinct mention usernames", () => {
  assert.deepEqual(extractMentionUsernames("Hi @Marie and @marie " + Array.from({ length: 12 }, (_, i) => `@u${i}`).join(" ")), ["marie", "u10", "u11"]);
});

test("keeps the original UUID when its username changes or is reclaimed", () => {
  const mentions = [{
    username: "marie",
    user_id: "original-user-id",
    is_active: true,
    profile: { id: "original-user-id", username: "marie_2026", full_name: "Marie", avatar_url: null },
  }];
  const resolved = mentionedProfile(mentions, "@marie");
  assert.equal(resolved.id, "original-user-id");
  assert.equal(resolved.username, "marie_2026");
});

test("does not create profile links for deleted or inactive mention targets", () => {
  assert.equal(mentionedProfile([{
    username: "marie",
    user_id: null,
    is_active: true,
    profile: null,
  }], "@marie"), null);
  assert.equal(mentionedProfile([{
    username: "marie",
    user_id: "original-user-id",
    is_active: false,
    profile: { id: "original-user-id", username: "marie", full_name: "Marie", avatar_url: null },
  }], "@marie"), null);
});

test("mention migration enforces scoped reads, private writes, author checks, and notification dedupe", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/007_user_mentions.sql", import.meta.url), "utf8");
  for (const table of ["post_mentions", "comment_mentions", "dm_message_mentions", "group_message_mentions"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke insert, update, delete, truncate on table public\.post_mentions,[\s\S]*?from public, anon, authenticated/);
  assert.match(sql, /on delete set null/);
  assert.match(sql, /p\.group_id is null or public\.is_group_member\(p\.group_id\)/);
  assert.match(sql, /public\.is_conversation_member\(m\.conversation_id\)/);
  assert.match(sql, /public\.is_group_member\(m\.group_id\)/);
  assert.match(sql, /new\.author_id is distinct from auth\.uid\(\)/);
  assert.match(sql, /new\.sender_id is distinct from auth\.uid\(\)/);
  assert.match(sql, /notified_at is not null/);
  assert.match(sql, /notification_count < 5/);
  assert.match(sql, /on conflict \(post_id, username\) do update set is_active = true/);
  assert.doesNotMatch(sql, /on conflict \(post_id, username\) do update set user_id/);
  assert.match(sql, /revoke execute on function public\.resolve_mention_profiles/);
  assert.match(sql, /grant execute on function public\.search_mentions[\s\S]*?to authenticated/);
  assert.match(sql, /after delete or update of deleted_at on public\.messages/);
  assert.match(sql, /after delete or update of deleted_at on public\.group_messages/);
});
