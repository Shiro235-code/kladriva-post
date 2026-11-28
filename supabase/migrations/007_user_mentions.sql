-- Mention d'utilisateurs par UUID, avec relations explicites et déduplication.
create extension if not exists pg_trgm;

create table if not exists public.post_mentions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.dm_message_mentions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.group_message_mentions (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists post_mentions_user_idx on public.post_mentions(user_id);
create index if not exists comment_mentions_user_idx on public.comment_mentions(user_id);
create index if not exists dm_message_mentions_user_idx on public.dm_message_mentions(user_id);
create index if not exists group_message_mentions_user_idx on public.group_message_mentions(user_id);
create index if not exists profiles_username_trgm_idx on public.profiles using gin(username gin_trgm_ops);
create index if not exists profiles_full_name_trgm_idx on public.profiles using gin(full_name gin_trgm_ops);

alter table public.post_mentions enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.dm_message_mentions enable row level security;
alter table public.group_message_mentions enable row level security;

create policy "post_mentions_read" on public.post_mentions for select using (true);
create policy "comment_mentions_read" on public.comment_mentions for select using (
  exists (
    select 1 from public.comments c
    join public.posts p on p.id = c.post_id
    where c.id = comment_mentions.comment_id
  )
);
create policy "dm_mentions_read" on public.dm_message_mentions for select using (
  exists (
    select 1 from public.messages m
    where m.id = dm_message_mentions.message_id
      and public.is_conversation_member(m.conversation_id)
  )
);
create policy "group_mentions_read" on public.group_message_mentions for select using (
  exists (
    select 1 from public.group_messages m
    where m.id = group_message_mentions.message_id
      and public.is_group_member(m.group_id)
  )
);

grant select on public.post_mentions to authenticated, anon;
grant select on public.comment_mentions to authenticated, anon;
grant select on public.dm_message_mentions to authenticated;
grant select on public.group_message_mentions to authenticated;

-- Recherche contextuelle bornée à huit résultats. Un groupe ou une conversation
-- limite les suggestions aux participants autorisés.
create or replace function public.search_mentions(
  p_query text,
  p_limit integer default 8,
  p_group_id uuid default null,
  p_conversation_id uuid default null
)
returns table(id uuid, username text, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select pr.id, pr.username, pr.full_name, pr.avatar_url
  from public.profiles pr
  where (
    p_query is null
    or p_query = ''
    or pr.username ilike '%' || p_query || '%'
    or pr.full_name ilike '%' || p_query || '%'
  )
    and pr.id <> auth.uid()
    and (
      p_group_id is null
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = p_group_id and gm.user_id = pr.id
      )
    )
    and (
      p_conversation_id is null
      or exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = p_conversation_id and cm.user_id = pr.id
      )
    )
    and (
      p_group_id is null
      or public.is_group_member(p_group_id)
    )
    and (
      p_conversation_id is null
      or public.is_conversation_member(p_conversation_id)
    )
  order by
    case when pr.username ilike p_query || '%' then 0 else 1 end,
    pr.username
  limit least(greatest(coalesce(p_limit, 8), 1), 8);
$$;

revoke execute on function public.search_mentions(text, integer, uuid, uuid) from public, anon;
grant execute on function public.search_mentions(text, integer, uuid, uuid) to authenticated;

-- Conserve l'ancien système compatible mais délègue les mentions nouvelles aux
-- relations UUID ci-dessous. Le regex évite les mentions dans une adresse email.
create or replace function public.notify_mentions(body text, actor uuid, p uuid, c uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Conservé pour compatibilité avec les anciens triggers.
  return;
end $$;

create or replace function public.resolve_mention_profiles(body text)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  m record;
  ids uuid[] := '{}';
  uid uuid;
begin
  for m in
    select lower(match[2]) as username
    from regexp_matches(coalesce(body,''), '(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_]{3,24})', 'g') match
    group by lower(match[2])
  loop
    select pr.id into uid from public.profiles pr where pr.username = m.username limit 1;
    if uid is not null and not uid = any(ids) then
      ids := array_append(ids, uid);
      if coalesce(array_length(ids, 1), 0) >= 10 then exit; end if;
    end if;
  end loop;
  return ids;
end $$;

create or replace function public.sync_post_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; ids uuid[]; new_id uuid;
begin
  ids := public.resolve_mention_profiles(new.content);
  delete from public.post_mentions m
    where m.post_id = new.id
      and (coalesce(array_length(ids,1),0)=0 or not m.user_id = any(ids));
  foreach uid in array ids loop
    new_id := null;
    insert into public.post_mentions(post_id, user_id) values (new.id, uid)
      on conflict do nothing returning post_id into new_id;
    if new_id is not null then
      perform public.notify(uid, new.author_id, 'mention', new.id, null, new.group_id,
        jsonb_build_object('post_id', new.id, 'mention', true));
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_sync_post_mentions on public.posts;
create trigger trg_sync_post_mentions after insert or update of content on public.posts
  for each row execute function public.sync_post_mentions();

create or replace function public.sync_comment_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; ids uuid[]; new_id uuid;
begin
  ids := public.resolve_mention_profiles(new.content);
  delete from public.comment_mentions m
    where m.comment_id = new.id
      and (coalesce(array_length(ids,1),0)=0 or not m.user_id = any(ids));
  foreach uid in array ids loop
    new_id := null;
    insert into public.comment_mentions(comment_id, user_id) values (new.id, uid)
      on conflict do nothing returning comment_id into new_id;
    if new_id is not null then
      perform public.notify(uid, new.author_id, 'mention', new.post_id, new.id, null,
        jsonb_build_object('post_id', new.post_id, 'comment_id', new.id, 'mention', true));
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_sync_comment_mentions on public.comments;
create trigger trg_sync_comment_mentions after insert or update of content on public.comments
  for each row execute function public.sync_comment_mentions();

create or replace function public.sync_dm_message_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; ids uuid[]; new_id uuid;
begin
  ids := public.resolve_mention_profiles(new.content);
  delete from public.dm_message_mentions m
    where m.message_id = new.id
      and (coalesce(array_length(ids,1),0)=0 or not m.user_id = any(ids));
  foreach uid in array ids loop
    if exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = new.conversation_id and cm.user_id = uid
    ) then
      new_id := null;
      insert into public.dm_message_mentions(message_id, user_id) values (new.id, uid)
        on conflict do nothing returning message_id into new_id;
      if new_id is not null then
        perform public.notify(uid, new.sender_id, 'mention', null, null, null,
          jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'mention', true));
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_sync_dm_message_mentions on public.messages;
create trigger trg_sync_dm_message_mentions after insert or update of content on public.messages
  for each row execute function public.sync_dm_message_mentions();

create or replace function public.sync_group_message_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; ids uuid[]; new_id uuid;
begin
  ids := public.resolve_mention_profiles(new.content);
  delete from public.group_message_mentions m
    where m.message_id = new.id
      and (coalesce(array_length(ids,1),0)=0 or not m.user_id = any(ids));
  foreach uid in array ids loop
    if exists (
      select 1 from public.group_members gm
      where gm.group_id = new.group_id and gm.user_id = uid
    ) then
      new_id := null;
      insert into public.group_message_mentions(message_id, user_id) values (new.id, uid)
        on conflict do nothing returning message_id into new_id;
      if new_id is not null then
        perform public.notify(uid, new.sender_id, 'mention', null, null, new.group_id,
          jsonb_build_object('group_id', new.group_id, 'message_id', new.id, 'mention', true));
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_sync_group_message_mentions on public.group_messages;
create trigger trg_sync_group_message_mentions after insert or update of content on public.group_messages
  for each row execute function public.sync_group_message_mentions();

alter publication supabase_realtime add table public.post_mentions, public.comment_mentions, public.dm_message_mentions, public.group_message_mentions;
