export function isMessageNotification(type) {
  return type === "message" || type === "group_message";
}

export function messageNotificationHref(type, data) {
  if (type === "message" && typeof data?.conversation_id === "string") {
    return `/messages?c=${encodeURIComponent(data.conversation_id)}`;
  }
  if (type === "group_message" && typeof data?.group_id === "string") {
    return `/messages?g=${encodeURIComponent(data.group_id)}`;
  }
  return null;
}

export function isMessageConversationVisible(type, data, pathname, search, visibility) {
  if (visibility !== "visible" || pathname !== "/messages") return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (type === "message") return params.get("c") === data?.conversation_id;
  if (type === "group_message") return params.get("g") === data?.group_id;
  return false;
}
