import assert from "node:assert/strict";
import { test } from "node:test";
import { isMessageConversationVisible, isMessageNotification, messageNotificationHref } from "./message-notifications.mjs";

test("recognizes only the two message notification types", () => {
  assert.equal(isMessageNotification("message"), true);
  assert.equal(isMessageNotification("group_message"), true);
  assert.equal(isMessageNotification("comment"), false);
});

test("routes private and group notices to their matching inbox thread", () => {
  assert.equal(messageNotificationHref("message", { conversation_id: "dm-1" }), "/messages?c=dm-1");
  assert.equal(messageNotificationHref("group_message", { group_id: "team 1" }), "/messages?g=team%201");
  assert.equal(messageNotificationHref("message", {}), null);
});

test("suppresses a banner only when its matching thread is visible", () => {
  assert.equal(isMessageConversationVisible("message", { conversation_id: "dm-1" }, "/messages", "?c=dm-1", "visible"), true);
  assert.equal(isMessageConversationVisible("message", { conversation_id: "dm-1" }, "/messages", "?c=dm-2", "visible"), false);
  assert.equal(isMessageConversationVisible("group_message", { group_id: "g-1" }, "/messages", "?g=g-1", "hidden"), false);
});
