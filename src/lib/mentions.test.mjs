import assert from "node:assert/strict";
import { test } from "node:test";
import { findMentionAtCaret, insertMention, extractMentionUsernames } from "./mentions.mjs";

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
