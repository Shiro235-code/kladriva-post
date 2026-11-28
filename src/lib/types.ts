export type Profile = {
  id: string;
  username: string;
  full_name: string;
  headline: string;
  bio: string;
  avatar_url: string | null;
  created_at: string;
};

export type ReactionType = "like" | "love" | "clap" | "fire" | "idea" | "wow";
export type PostKind = "update" | "win" | "help" | "resource" | "project";

export type Post = {
  id: string;
  author_id: string;
  group_id: string | null;
  content: string;
  image_url: string | null;
  images: string[];
  video_url: string | null;
  kind: PostKind;
  created_at: string;
  author: Profile;
  group: { id: string; name: string; color: string; icon: string } | null;
  likes: { user_id: string; type: ReactionType }[];
  comments: { count: number }[];
  saves: { user_id: string }[];
  post_mentions?: { user_id: string; profile: Profile | null }[];
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author: Profile;
  comment_likes: { user_id: string }[];
  comment_mentions?: { user_id: string; profile: Profile | null }[];
};

export type Group = {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  group_members: { count: number }[];
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  reply_to_id?: string | null;
  audio_path?: string | null;
  audio_duration_ms?: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

export type GroupMessage = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  reply_to_id?: string | null;
  audio_path?: string | null;
  audio_duration_ms?: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

export type GroupLite = { id: string; name: string; description?: string; color: string; icon: string; avatar_url?: string | null; created_by?: string };
export type Member = Profile & { role: "owner" | "admin" | "member" };

export type Story = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  bg: string;
  created_at: string;
  expires_at: string;
  author: Profile;
};

export type Notification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: "reaction" | "comment" | "reply" | "mention" | "follow" | "group_join" | "comment_like" | "group_add" | "message" | "group_message";
  post_id: string | null;
  comment_id: string | null;
  group_id: string | null;
  data: { reaction?: ReactionType; message_id?: string; conversation_id?: string; group_id?: string; post_id?: string; comment_id?: string; mention?: boolean };
  read: boolean;
  created_at: string;
  actor: Profile | null;
  post: { id: string; content: string } | null;
  group: { id: string; name: string } | null;
};

export type Stats = {
  posts: number;
  reactions: number;
  comments: number;
  followers: number;
  following: number;
  groups: number;
  helped: number;
  projects: number;
  streak: number;
};

export const POST_SELECT =
  "*, author:profiles!posts_author_id_fkey(*), group:groups(id,name,color,icon), likes(user_id,type), comments(count), saves(user_id), post_mentions(user_id,profile:profiles(id,username,full_name,avatar_url))";

export const COMMENT_SELECT = "*, author:profiles!comments_author_id_fkey(*), comment_likes(user_id), comment_mentions(user_id,profile:profiles(id,username,full_name,avatar_url))";
