export type Profile = {
  id: string;
  username: string;
  full_name: string;
  headline: string;
  bio: string;
  avatar_url: string | null;
  created_at: string;
};

export type Post = {
  id: string;
  author_id: string;
  group_id: string | null;
  content: string;
  image_url: string | null;
  created_at: string;
  author: Profile;
  group: { id: string; name: string; color: string } | null;
  likes: { user_id: string }[];
  comments: { count: number }[];
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: Profile;
};

export type Group = {
  id: string;
  name: string;
  description: string;
  color: string;
  created_by: string;
  created_at: string;
  group_members: { count: number }[];
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export const POST_SELECT =
  "*, author:profiles!posts_author_id_fkey(*), group:groups(id,name,color), likes(user_id), comments(count)";
