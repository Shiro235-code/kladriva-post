-- Mentions persistantes par alias et par UUID. À appliquer après 006_whatsapp.sql.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.post_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  username text not null check (username = lower(username)),
  is_active boolean not null default true,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, username)
);

create table if not exists public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  username text not null check (username = lower(username)),
  is_active boolean not null default true,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (comment_id, username)
);

create table if not exists public.dm_message_mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  username text not null check (username = lower(username)),
  is_active boolean not null default true,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, username)
);

create table if not exists public.group_message_mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  username text not null check (username = lower(username)),
  is_active boolean not null default true,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, username)
);

create index if not exists post_mentions_user_idx on public.post_mentions(user_id, post_id);
create index if not exists comment_mentions_user_idx on public.comment_mentions(user_id, comment_id);
create index if not exists dm_message_mentions_user_idx on public.dm_message_mentions(user_id, message_id);
create index if not exists group_message_mentions_user_idx on public.group_message_mentions(user_id, message_id);
create index if not exists profiles_username_trgm_idx on public.profiles using gin(username extensions.gin_trgm_ops);
create index if not exists profiles_full_name_trgm_idx on public.profiles using gin(full_name extensions.gin_trgm_ops);
create index if not exists notifications_mention_rate_idx
  on public.notifications(actor_id, user_id, created_at desc) where type = 'mention';

alter table public.post_mentions enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.dm_message_mentions enable row level security;
alter table public.group_message_mentions enable row level security;

revoke all on table public.post_mentions, public.comment_mentions,
  public.dm_message_mentions, public.group_message_mentions
  from public, anon, authenticated;
revoke insert, update, delete, truncate on table public.post_mentions,
  public.comment_mentions, public.dm_message_mentions, public.group_message_mentions
  from public, anon, authenticated;
grant select on public.post_mentions, public.comment_mentions to anon, authenticated;
grant select on public.dm_message_mentions, public.group_message_mentions to authenticated;

drop policy if exists post_mentions_read on public.post_mentions;
create policy post_mentions_read on public.post_mentions for select using (
  is_active and exists (
    select 1 from public.posts p
    where p.id = post_mentions.post_id
      and (p.group_id is null or public.is_group_member(p.group_id))
  )
);

drop policy if exists comment_mentions_read on public.comment_mentions;
create policy comment_mentions_read on public.comment_mentions for select using (
  is_active and exists (
    select 1 from public.comments c
    join public.posts p on p.id = c.post_id
    where c.id = comment_mentions.comment_id
      and (p.group_id is null or public.is_group_member(p.group_id))
  )
);

drop policy if exists dm_mentions_read on public.dm_message_mentions;
create policy dm_mentions_read on public.dm_message_mentions for select using (
  is_active and exists (
    select 1 from public.messages m
    where m.id = dm_message_mentions.message_id
      and m.deleted_at is null
      and public.is_conversation_member(m.conversation_id)
  )
);

drop policy if exists group_mentions_read on public.group_message_mentions;
create policy group_mentions_read on public.group_message_mentions for select using (
  is_active and exists (
    select 1 from public.group_messages m
    where m.id = group_message_mentions.message_id
      and m.deleted_at is null
      and public.is_group_member(m.group_id)
  )
);

-- Membership helpers are used by RLS and must not depend on caller search_path.
create or replace function public.is_group_member(g uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = g and gm.user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_member(c uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = c and cm.user_id = auth.uid()
  );
$$;

-- Les publications et commentaires de groupe ne sont visibles qu'aux membres.
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (
  group_id is null or public.is_group_member(group_id)
);
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select using (
  exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and (p.group_id is null or public.is_group_member(p.group_id))
  )
);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check (
  auth.uid() = author_id and exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and (p.group_id is null or public.is_group_member(p.group_id))
  )
);
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.group_messages add column if not exists deleted_at timestamptz;
drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated
  using (auth.uid() = sender_id and public.is_conversation_member(conversation_id))
  with check (auth.uid() = sender_id and public.is_conversation_member(conversation_id));
drop policy if exists group_messages_update_own on public.group_messages;
create policy group_messages_update_own on public.group_messages for update to authenticated
  using (auth.uid() = sender_id and public.is_group_member(group_id))
  with check (auth.uid() = sender_id and public.is_group_member(group_id));
grant update (content, deleted_at) on public.messages, public.group_messages to authenticated;

-- Suggestions uniquement pour les membres authentifiés et autorisés.
create or replace function public.search_mentions(
  p_query text,
  p_limit integer default 8,
  p_group_id uuid default null,
  p_conversation_id uuid default null
)
returns table(id uuid, username text, full_name text, avatar_url text)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select pr.id, pr.username, pr.full_name, pr.avatar_url
  from public.profiles pr
  where auth.uid() is not null
    and (
      coalesce(p_query, '') = ''
      or pr.username ilike '%' || p_query || '%'
      or pr.full_name ilike '%' || p_query || '%'
    )
    and pr.id <> auth.uid()
    and (
      p_group_id is null
      or (
        public.is_group_member(p_group_id)
        and exists (
          select 1 from public.group_members gm
          where gm.group_id = p_group_id and gm.user_id = pr.id
        )
      )
    )
    and (
      p_conversation_id is null
      or (
        public.is_conversation_member(p_conversation_id)
        and exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = p_conversation_id and cm.user_id = pr.id
        )
      )
    )
  order by
    case when pr.username ilike coalesce(p_query, '') || '%' then 0 else 1 end,
    pr.username
  limit least(greatest(coalesce(p_limit, 8), 1), 8);
$$;

-- Résout au plus 50 handles en ordre d'apparition. Les fonctions de sync
-- consultent d'abord l'alias déjà enregistré avant d'utiliser cet UUID courant.
create or replace function public.resolve_mention_profiles(body text)
returns table(username text, user_id uuid)
language sql stable security definer
set search_path = pg_catalog, public as $$
  with raw_handles as (
    select lower(matches.captures[2]) as username, matches.ordinality as position
    from regexp_matches(
      coalesce(body, ''),
      '(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_]{3,24})',
      'g'
    ) with ordinality as matches(captures, ordinality)
  ),
  handles as (
    select distinct on (raw_handles.username)
      raw_handles.username, raw_handles.position
    from raw_handles
    order by raw_handles.username, raw_handles.position
  )
  select handles.username, profiles.id
  from handles
  left join public.profiles on lower(public.profiles.username) = handles.username
  order by handles.position
  limit 50;
$$;

-- Keep the legacy trigger call but disable its username-only notifications.
create or replace function public.notify_mentions(body text, actor uuid, p uuid, c uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  return;
end;
$$;

create or replace function public.notify(
  target uuid, actor uuid, kind text, p uuid, c uuid, g uuid, extra jsonb default '{}'
)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if target is null or actor is null or target = actor then
    return;
  end if;
  insert into public.notifications(user_id, actor_id, type, post_id, comment_id, group_id, data)
  values (target, actor, kind, p, c, g, coalesce(extra, '{}'::jsonb));
end;
$$;

create or replace function public.sync_post_mentions()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  mention record;
  target_id uuid;
  alias_exists boolean;
  already_notified boolean;
  target_ids uuid[] := '{}';
  notification_count integer;
begin
  if auth.uid() is null or new.author_id is distinct from auth.uid()
     or (tg_op = 'UPDATE' and old.author_id is distinct from auth.uid()) then
    raise exception 'Mention write is not authorized';
  end if;
  if new.group_id is not null and not public.is_group_member(new.group_id) then
    raise exception 'Only group members can mention users in group posts';
  end if;

  update public.post_mentions set is_active = false where post_id = new.id;
  for mention in select * from public.resolve_mention_profiles(new.content) loop
    select pm.user_id into target_id
      from public.post_mentions pm
      where pm.post_id = new.id and pm.username = mention.username;
    alias_exists := found;
    if alias_exists and target_id is null then
      continue;
    end if;
    if not alias_exists then
      target_id := mention.user_id;
    end if;
    if target_id is null then continue; end if;
    if new.group_id is not null and not exists (
      select 1 from public.group_members gm
      where gm.group_id = new.group_id and gm.user_id = target_id
    ) then
      continue;
    end if;
    if target_id = any(target_ids) then
      insert into public.post_mentions(post_id, user_id, username, is_active)
      values (new.id, target_id, mention.username, true)
      on conflict (post_id, username) do update set is_active = true;
      continue;
    end if;
    if coalesce(array_length(target_ids, 1), 0) >= 10 then continue; end if;
    target_ids := array_append(target_ids, target_id);
    insert into public.post_mentions(post_id, user_id, username, is_active)
    values (new.id, target_id, mention.username, true)
    on conflict (post_id, username) do update set is_active = true;
    select exists (
      select 1 from public.post_mentions pm
      where pm.post_id = new.id and pm.user_id = target_id and pm.notified_at is not null
    ) into already_notified;
    if not already_notified then
      select count(*) into notification_count from public.notifications n
      where n.type = 'mention' and n.actor_id = new.author_id and n.user_id = target_id
        and n.created_at > pg_catalog.now() - interval '10 minutes';
      if notification_count < 5 then
        perform public.notify(target_id, new.author_id, 'mention', new.id, null, new.group_id,
          jsonb_build_object('post_id', new.id, 'mention', true));
      end if;
      update public.post_mentions set notified_at = pg_catalog.now()
        where post_id = new.id and user_id = target_id;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.sync_comment_mentions()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  mention record;
  target_id uuid;
  post_group_id uuid;
  alias_exists boolean;
  already_notified boolean;
  target_ids uuid[] := '{}';
  notification_count integer;
begin
  if auth.uid() is null or new.author_id is distinct from auth.uid()
     or (tg_op = 'UPDATE' and old.author_id is distinct from auth.uid()) then
    raise exception 'Mention write is not authorized';
  end if;
  select p.group_id into post_group_id from public.posts p where p.id = new.post_id;
  if not found or (post_group_id is not null and not public.is_group_member(post_group_id)) then
    raise exception 'Comment is not authorized in this post';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.comments c where c.id = new.parent_id and c.post_id = new.post_id
  ) then
    raise exception 'Reply parent does not belong to this post';
  end if;

  update public.comment_mentions set is_active = false where comment_id = new.id;
  for mention in select * from public.resolve_mention_profiles(new.content) loop
    select cm.user_id into target_id
      from public.comment_mentions cm
      where cm.comment_id = new.id and cm.username = mention.username;
    alias_exists := found;
    if alias_exists and target_id is null then continue; end if;
    if not alias_exists then target_id := mention.user_id; end if;
    if target_id is null then continue; end if;
    if post_group_id is not null and not exists (
      select 1 from public.group_members gm
      where gm.group_id = post_group_id and gm.user_id = target_id
    ) then continue; end if;
    if target_id = any(target_ids) then
      insert into public.comment_mentions(comment_id, user_id, username, is_active)
      values (new.id, target_id, mention.username, true)
      on conflict (comment_id, username) do update set is_active = true;
      continue;
    end if;
    if coalesce(array_length(target_ids, 1), 0) >= 10 then continue; end if;
    target_ids := array_append(target_ids, target_id);
    insert into public.comment_mentions(comment_id, user_id, username, is_active)
    values (new.id, target_id, mention.username, true)
    on conflict (comment_id, username) do update set is_active = true;
    select exists (
      select 1 from public.comment_mentions cm
      where cm.comment_id = new.id and cm.user_id = target_id and cm.notified_at is not null
    ) into already_notified;
    if not already_notified then
      select count(*) into notification_count from public.notifications n
      where n.type = 'mention' and n.actor_id = new.author_id and n.user_id = target_id
        and n.created_at > pg_catalog.now() - interval '10 minutes';
      if notification_count < 5 then
        perform public.notify(target_id, new.author_id, 'mention', new.post_id, new.id, null,
          jsonb_build_object('post_id', new.post_id, 'comment_id', new.id, 'mention', true));
      end if;
      update public.comment_mentions set notified_at = pg_catalog.now()
        where comment_id = new.id and user_id = target_id;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.sync_dm_message_mentions()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  mention record;
  target_id uuid;
  alias_exists boolean;
  already_notified boolean;
  target_ids uuid[] := '{}';
  notification_count integer;
begin
  if auth.uid() is null or new.sender_id is distinct from auth.uid()
     or (tg_op = 'UPDATE' and old.sender_id is distinct from auth.uid())
     or not public.is_conversation_member(new.conversation_id) then
    raise exception 'Mention write is not authorized';
  end if;
  if new.deleted_at is not null then
    update public.dm_message_mentions set is_active = false where message_id = new.id;
    delete from public.notifications n
      where n.type = 'mention' and n.data ->> 'message_id' = new.id::text;
    return new;
  end if;

  update public.dm_message_mentions set is_active = false where message_id = new.id;
  for mention in select * from public.resolve_mention_profiles(new.content) loop
    select mm.user_id into target_id
      from public.dm_message_mentions mm
      where mm.message_id = new.id and mm.username = mention.username;
    alias_exists := found;
    if alias_exists and target_id is null then continue; end if;
    if not alias_exists then target_id := mention.user_id; end if;
    if target_id is null then continue; end if;
    if not exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = new.conversation_id and cm.user_id = target_id
    ) then continue; end if;
    if target_id = any(target_ids) then
      insert into public.dm_message_mentions(message_id, user_id, username, is_active)
      values (new.id, target_id, mention.username, true)
      on conflict (message_id, username) do update set is_active = true;
      continue;
    end if;
    if coalesce(array_length(target_ids, 1), 0) >= 10 then continue; end if;
    target_ids := array_append(target_ids, target_id);
    insert into public.dm_message_mentions(message_id, user_id, username, is_active)
    values (new.id, target_id, mention.username, true)
    on conflict (message_id, username) do update set is_active = true;
    select exists (
      select 1 from public.dm_message_mentions mm
      where mm.message_id = new.id and mm.user_id = target_id and mm.notified_at is not null
    ) into already_notified;
    if not already_notified then
      select count(*) into notification_count from public.notifications n
      where n.type = 'mention' and n.actor_id = new.sender_id and n.user_id = target_id
        and n.created_at > pg_catalog.now() - interval '10 minutes';
      if notification_count < 5 then
        perform public.notify(target_id, new.sender_id, 'mention', null, null, null,
          jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'mention', true));
      end if;
      update public.dm_message_mentions set notified_at = pg_catalog.now()
        where message_id = new.id and user_id = target_id;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.sync_group_message_mentions()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  mention record;
  target_id uuid;
  alias_exists boolean;
  already_notified boolean;
  target_ids uuid[] := '{}';
  notification_count integer;
begin
  if auth.uid() is null or new.sender_id is distinct from auth.uid()
     or (tg_op = 'UPDATE' and old.sender_id is distinct from auth.uid())
     or not public.is_group_member(new.group_id) then
    raise exception 'Mention write is not authorized';
  end if;
  if new.deleted_at is not null then
    update public.group_message_mentions set is_active = false where message_id = new.id;
    delete from public.notifications n
      where n.type = 'mention' and n.data ->> 'message_id' = new.id::text;
    return new;
  end if;

  update public.group_message_mentions set is_active = false where message_id = new.id;
  for mention in select * from public.resolve_mention_profiles(new.content) loop
    select gm.user_id into target_id
      from public.group_message_mentions gm
      where gm.message_id = new.id and gm.username = mention.username;
    alias_exists := found;
    if alias_exists and target_id is null then continue; end if;
    if not alias_exists then target_id := mention.user_id; end if;
    if target_id is null then continue; end if;
    if not exists (
      select 1 from public.group_members gm
      where gm.group_id = new.group_id and gm.user_id = target_id
    ) then continue; end if;
    if target_id = any(target_ids) then
      insert into public.group_message_mentions(message_id, user_id, username, is_active)
      values (new.id, target_id, mention.username, true)
      on conflict (message_id, username) do update set is_active = true;
      continue;
    end if;
    if coalesce(array_length(target_ids, 1), 0) >= 10 then continue; end if;
    target_ids := array_append(target_ids, target_id);
    insert into public.group_message_mentions(message_id, user_id, username, is_active)
    values (new.id, target_id, mention.username, true)
    on conflict (message_id, username) do update set is_active = true;
    select exists (
      select 1 from public.group_message_mentions gm
      where gm.message_id = new.id and gm.user_id = target_id and gm.notified_at is not null
    ) into already_notified;
    if not already_notified then
      select count(*) into notification_count from public.notifications n
      where n.type = 'mention' and n.actor_id = new.sender_id and n.user_id = target_id
        and n.created_at > pg_catalog.now() - interval '10 minutes';
      if notification_count < 5 then
        perform public.notify(target_id, new.sender_id, 'mention', null, null, new.group_id,
          jsonb_build_object('group_id', new.group_id, 'message_id', new.id, 'mention', true));
      end if;
      update public.group_message_mentions set notified_at = pg_catalog.now()
        where message_id = new.id and user_id = target_id;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.clear_deleted_message_mentions()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications n
      where n.type = 'mention' and n.data ->> 'message_id' = old.id::text;
    return old;
  end if;
  if auth.uid() is null or new.sender_id is distinct from auth.uid()
     or not public.is_conversation_member(new.conversation_id) then
    raise exception 'Message deletion is not authorized';
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'A deleted message cannot be restored';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    update public.dm_message_mentions set is_active = false where message_id = new.id;
    delete from public.notifications n
      where n.type = 'mention' and n.data ->> 'message_id' = new.id::text;
  end if;
  return new;
end;
$$;

create or replace function public.clear_deleted_group_message_mentions()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications n
      where n.type = 'mention' and n.data ->> 'message_id' = old.id::text;
    return old;
  end if;
  if auth.uid() is null or new.sender_id is distinct from auth.uid()
     or not public.is_group_member(new.group_id) then
    raise exception 'Message deletion is not authorized';
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'A deleted message cannot be restored';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    update public.group_message_mentions set is_active = false where message_id = new.id;
    delete from public.notifications n
      where n.type = 'mention' and n.data ->> 'message_id' = new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_post_mentions on public.posts;
create trigger trg_sync_post_mentions after insert or update of content on public.posts
  for each row execute function public.sync_post_mentions();
drop trigger if exists trg_sync_comment_mentions on public.comments;
create trigger trg_sync_comment_mentions after insert or update of content on public.comments
  for each row execute function public.sync_comment_mentions();
drop trigger if exists trg_sync_dm_message_mentions on public.messages;
create trigger trg_sync_dm_message_mentions after insert or update of content on public.messages
  for each row execute function public.sync_dm_message_mentions();
drop trigger if exists trg_clear_dm_mentions on public.messages;
create trigger trg_clear_dm_mentions after delete or update of deleted_at on public.messages
  for each row execute function public.clear_deleted_message_mentions();
drop trigger if exists trg_sync_group_message_mentions on public.group_messages;
create trigger trg_sync_group_message_mentions after insert or update of content on public.group_messages
  for each row execute function public.sync_group_message_mentions();
drop trigger if exists trg_clear_group_mentions on public.group_messages;
create trigger trg_clear_group_mentions after delete or update of deleted_at on public.group_messages
  for each row execute function public.clear_deleted_group_message_mentions();

revoke execute on function public.search_mentions(text, integer, uuid, uuid) from public, anon;
grant execute on function public.search_mentions(text, integer, uuid, uuid) to authenticated;
revoke execute on function public.resolve_mention_profiles(text),
  public.notify_mentions(text, uuid, uuid, uuid),
  public.sync_post_mentions(),
  public.sync_comment_mentions(),
  public.sync_dm_message_mentions(),
  public.sync_group_message_mentions(),
  public.clear_deleted_message_mentions(),
  public.clear_deleted_group_message_mentions(),
  public.notify(uuid, uuid, text, uuid, uuid, uuid, jsonb),
  public.is_group_member(uuid),
  public.is_conversation_member(uuid)
  from public, anon, authenticated;
grant execute on function public.is_group_member(uuid), public.is_conversation_member(uuid)
  to anon, authenticated;

alter publication supabase_realtime add table public.post_mentions,
  public.comment_mentions, public.dm_message_mentions, public.group_message_mentions;
