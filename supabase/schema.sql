-- =====================================================================
-- Kladriva Post — schéma Supabase (Postgres + RLS + Realtime + Storage)
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- PROFILS ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  full_name text not null default '',
  headline text not null default '',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'gi'));
  if length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 20);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username, full_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- GROUPES ----------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '',
  color text not null default 'violet',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Le créateur devient automatiquement propriétaire et membre
create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
drop trigger if exists on_group_created on public.groups;
create trigger on_group_created after insert on public.groups
  for each row execute function public.handle_new_group();

create or replace function public.is_group_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid());
$$;

-- ---------- PUBLICATIONS ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 5000),
  image_url text,
  created_at timestamptz not null default now(),
  check (char_length(content) > 0 or image_url is not null)
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_group_idx on public.posts (group_id, created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);

create table if not exists public.likes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

-- ---------- MESSAGERIE PRIVÉE ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conv_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

create or replace function public.is_conversation_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = c and user_id = auth.uid());
$$;

-- Trouve ou crée la conversation 1:1 avec un autre membre
create or replace function public.get_or_create_dm(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if other = me then raise exception 'cannot message yourself'; end if;
  select cm1.conversation_id into conv
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  where cm1.user_id = me and cm2.user_id = other
    and (select count(*) from public.conversation_members x where x.conversation_id = cm1.conversation_id) = 2
  limit 1;
  if conv is null then
    insert into public.conversations default values returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other);
  end if;
  return conv;
end $$;

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_members set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end $$;
drop trigger if exists on_message_created on public.messages;
create trigger on_message_created after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Lecture publique (les visiteurs peuvent parcourir), écriture réservée aux membres connectés
create policy "profiles_read" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "groups_read" on public.groups for select using (true);
create policy "groups_insert" on public.groups for insert to authenticated with check (auth.uid() = created_by);
create policy "groups_update_owner" on public.groups for update using (auth.uid() = created_by);
create policy "groups_delete_owner" on public.groups for delete using (auth.uid() = created_by);

create policy "gm_read" on public.group_members for select using (true);
create policy "gm_join" on public.group_members for insert to authenticated with check (auth.uid() = user_id and role = 'member');
create policy "gm_leave" on public.group_members for delete using (auth.uid() = user_id);

create policy "posts_read" on public.posts for select using (true);
create policy "posts_insert" on public.posts for insert to authenticated
  with check (auth.uid() = author_id and (group_id is null or public.is_group_member(group_id)));
create policy "posts_update_own" on public.posts for update using (auth.uid() = author_id);
create policy "posts_delete_own" on public.posts for delete using (auth.uid() = author_id);

create policy "likes_read" on public.likes for select using (true);
create policy "likes_insert" on public.likes for insert to authenticated with check (auth.uid() = user_id);
create policy "likes_delete" on public.likes for delete using (auth.uid() = user_id);

create policy "comments_read" on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert to authenticated with check (auth.uid() = author_id);
create policy "comments_delete_own" on public.comments for delete using (auth.uid() = author_id);

create policy "conv_read" on public.conversations for select using (public.is_conversation_member(id));
create policy "cm_read" on public.conversation_members for select using (public.is_conversation_member(conversation_id));
create policy "cm_update_own" on public.conversation_members for update using (auth.uid() = user_id);
create policy "msg_read" on public.messages for select using (public.is_conversation_member(conversation_id));
create policy "msg_insert" on public.messages for insert to authenticated
  with check (auth.uid() = sender_id and public.is_conversation_member(conversation_id));

grant execute on function public.get_or_create_dm(uuid) to authenticated;

-- ---------- REALTIME ----------
alter publication supabase_realtime add table public.posts, public.comments, public.likes, public.messages;

-- ---------- STOCKAGE (images) ----------
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;
create policy "media_read" on storage.objects for select using (bucket_id = 'media');
create policy "media_upload_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- PRIVILÈGES (requis sur les nouveaux projets Supabase) ----------
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.groups, public.group_members, public.posts, public.likes, public.comments to anon, authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.groups to authenticated;
grant insert, delete on public.group_members to authenticated;
grant insert, update, delete on public.posts to authenticated;
grant insert, delete on public.likes to authenticated;
grant insert, delete on public.comments to authenticated;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant update on public.conversation_members to authenticated;
grant insert on public.messages to authenticated;

-- Les fonctions internes ne sont pas appelables depuis l'API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_group() from public, anon, authenticated;
revoke execute on function public.touch_conversation() from public, anon, authenticated;
revoke execute on function public.get_or_create_dm(uuid) from public, anon;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;
