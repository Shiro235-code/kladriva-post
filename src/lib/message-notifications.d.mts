export function isMessageNotification(type: string): boolean;
export function messageNotificationHref(type: string, data?: Record<string, unknown> | null): string | null;
export function isMessageConversationVisible(
  type: string,
  data: Record<string, unknown> | null | undefined,
  pathname: string,
  search: string,
  visibility: DocumentVisibilityState,
): boolean;
