export function mentionedProfile(mentions, token) {
  const username = token.startsWith("@") ? token.slice(1).toLowerCase() : "";
  const match = (mentions || []).find((mention) =>
    mention.is_active !== false
      && mention.username?.toLowerCase() === username
      && mention.user_id
      && mention.profile?.id === mention.user_id
  );
  return match?.profile || null;
}
