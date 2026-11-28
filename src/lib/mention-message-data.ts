import { sb } from "@/lib/supabase";
import type { GroupMessage, Message } from "@/lib/types";

const DM_SELECT = "*, dm_message_mentions(user_id,username,is_active,profile:profiles(id,username,full_name,avatar_url))";
const GROUP_SELECT = "*, group_message_mentions(user_id,username,is_active,profile:profiles(id,username,full_name,avatar_url))";

export async function fetchDmMessageWithMentions(id: string): Promise<Message | null> {
  const { data, error } = await sb().from("messages").select(DM_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as Message | null;
}

export async function fetchGroupMessageWithMentions(id: string): Promise<GroupMessage | null> {
  const { data, error } = await sb().from("group_messages").select(GROUP_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as GroupMessage | null;
}
