-- =====================================================================
-- Kladriva Post V2 — réactions, réponses, notifications, abonnements,
-- stories, enregistrements, statistiques et classement.
-- =====================================================================

-- ---------- PUBLICATIONS : type et images multiples ----------
alter table public.posts add column if not exists kind text not null default 'update'
  check (kind in ('update','win','help','resource','project'));
alter table public.posts add column if not exists images text[] not null default '{}';
alter table public.posts drop constraint if exists posts_check;
alter table public.posts add constraint posts_has_content
  check (char_length(content) > 0 or image_url is not null or cardinality(images) > 0);
alter table public.posts add column if not exists updated_at timestamptz;

-- ---------- RÉACTIONS (la table likes devient multi-réactions) ----------
alter table public.likes add column if not exists type text not null default 'like'
  check (type in ('like','love','clap','fire','idea','wow'));
grant update on public.likes to authenticated;
drop policy if exists "likes_update" on public.likes;
create policy "likes_update" on public.likes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- COMMENTAIRES : réponses et j'aime ----------
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_parent_idx on public.comments (parent_id);

create table if not exists public.comment_likes (
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;
create policy "cl_read" on public.comment_likes for select using (true);
create policy "cl_insert" on public.comment_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "cl_delete" on public.comment_likes for delete using (auth.uid() = user_id);
grant select on public.comment_likes to anon, authenticated;
grant insert, delete on public.comment_likes to authenticated;

-- ---------- ABONNEMENTS ----------
create table if not exists public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);
alter table public.follows enable row level security;
create policy "follows_read" on public.follows for select using (true);
create policy "follows_insert" on public.follows for insert to authenticated with check (auth.uid() = follower_id);
create policy "follows_delete" on public.follows for delete using (auth.uid() = follower_id);
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;

-- ---------- ENREGISTREMENTS (privés) ----------
create table if not exists public.saves (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.saves enable row level security;
create policy "saves_own_read" on public.saves for select using (auth.uid() = user_id);
create policy "saves_insert" on public.saves for insert to authenticated with check (auth.uid() = user_id);
create policy "saves_delete" on public.saves for delete using (auth.uid() = user_id);
grant select, insert, delete on public.saves to authenticated;

-- ---------- STORIES (24 h) ----------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 280),
  image_url text,
  bg text not null default 'ember',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (char_length(content) > 0 or image_url is not null)
);
create index if not exists stories_active_idx on public.stories (expires_at desc);
alter table public.stories enable row level security;
create policy "stories_read" on public.stories for select using (expires_at > now());
create policy "stories_insert" on public.stories for insert to authenticated with check (auth.uid() = author_id);
create policy "stories_delete" on public.stories for delete using (auth.uid() = author_id);
grant select on public.stories to anon, authenticated;
grant insert, delete on public.stories to authenticated;

-- ---------- NOTIFICATIONS ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('reaction','comment','reply','mention','follow','group_join','comment_like')),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  data jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notif_read_own" on public.notifications for select using (auth.uid() = user_id);
create policy "notif_update_own" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notif_delete_own" on public.notifications for delete using (auth.uid() = user_id);
grant select, update, delete on public.notifications to authenticated;

create or replace function public.notify(target uuid, actor uuid, kind text, p uuid, c uuid, g uuid, extra jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if target is null or actor is null or target = actor then return; end if;
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id, group_id, data)
  values (target, actor, kind, p, c, g, coalesce(extra, '{}'));
end $$;

-- Mentions @username dans un texte
create or replace function public.notify_mentions(body text, actor uuid, p uuid, c uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u record;
begin
  for u in
    select distinct pr.id from public.profiles pr
    where pr.username in (select lower(m[1]) from regexp_matches(coalesce(body,''), '@([a-zA-Z0-9_]{3,24})', 'g') as m)
  loop
    perform public.notify(u.id, actor, 'mention', p, c, null);
  end loop;
end $$;

create or replace function public.on_reaction() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify((select author_id from public.posts where id = new.post_id), new.user_id, 'reaction', new.post_id, null, null, jsonb_build_object('reaction', new.type));
  return new;
end $$;
drop trigger if exists trg_on_reaction on public.likes;
create trigger trg_on_reaction after insert on public.likes for each row execute function public.on_reaction();

create or replace function public.on_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare parent_author uuid; post_author uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
    perform public.notify(parent_author, new.author_id, 'reply', new.post_id, new.id, null);
  end if;
  if parent_author is distinct from post_author then
    perform public.notify(post_author, new.author_id, 'comment', new.post_id, new.id, null);
  end if;
  perform public.notify_mentions(new.content, new.author_id, new.post_id, new.id);
  return new;
end $$;
drop trigger if exists trg_on_comment on public.comments;
create trigger trg_on_comment after insert on public.comments for each row execute function public.on_comment();

create or replace function public.on_post() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_mentions(new.content, new.author_id, new.id, null);
  return new;
end $$;
drop trigger if exists trg_on_post on public.posts;
create trigger trg_on_post after insert on public.posts for each row execute function public.on_post();

create or replace function public.on_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.following_id, new.follower_id, 'follow', null, null, null);
  return new;
end $$;
drop trigger if exists trg_on_follow on public.follows;
create trigger trg_on_follow after insert on public.follows for each row execute function public.on_follow();

create or replace function public.on_group_join() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'member' then
    perform public.notify((select created_by from public.groups where id = new.group_id), new.user_id, 'group_join', null, null, new.group_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_on_group_join on public.group_members;
create trigger trg_on_group_join after insert on public.group_members for each row execute function public.on_group_join();

create or replace function public.on_comment_like() returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select author_id, post_id into c from public.comments where id = new.comment_id;
  perform public.notify(c.author_id, new.user_id, 'comment_like', c.post_id, new.comment_id, null);
  return new;
end $$;
drop trigger if exists trg_on_comment_like on public.comment_likes;
create trigger trg_on_comment_like after insert on public.comment_likes for each row execute function public.on_comment_like();

-- ---------- STATISTIQUES, SÉRIE ET CLASSEMENT ----------
create or replace function public.profile_stats(uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with days as (
    select distinct (created_at at time zone 'Africa/Douala')::date d from public.posts where author_id = uid
  ), islands as (
    select d, d + (row_number() over (order by d desc))::int as grp from days
  ), top as (
    select grp from islands order by d desc limit 1
  )
  select jsonb_build_object(
    'posts', (select count(*) from public.posts where author_id = uid),
    'reactions', (select count(*) from public.likes l join public.posts p on p.id = l.post_id where p.author_id = uid),
    'comments', (select count(*) from public.comments where author_id = uid),
    'followers', (select count(*) from public.follows where following_id = uid),
    'following', (select count(*) from public.follows where follower_id = uid),
    'groups', (select count(*) from public.group_members where user_id = uid),
    'helped', (select count(*) from public.comments c join public.posts p on p.id = c.post_id where c.author_id = uid and p.kind = 'help' and p.author_id <> uid),
    'projects', (select count(*) from public.posts where author_id = uid and kind = 'project'),
    'streak', case
      when (select max(d) from days) >= ((now() at time zone 'Africa/Douala')::date - 1)
      then (select count(*) from islands where grp = (select grp from top)) else 0 end
  );
$$;

create or replace function public.leaderboard(days_back int default 7)
returns table (user_id uuid, score bigint, posts bigint, comments bigint, reactions bigint)
language sql stable security definer set search_path = public as $$
  with p as (select author_id u, count(*) n from public.posts where created_at > now() - make_interval(days => days_back) group by 1),
       c as (select author_id u, count(*) n from public.comments where created_at > now() - make_interval(days => days_back) group by 1),
       r as (select po.author_id u, count(*) n from public.likes l join public.posts po on po.id = l.post_id
             where l.created_at > now() - make_interval(days => days_back) and l.user_id <> po.author_id group by 1)
  select pr.id,
         coalesce(p.n,0)*5 + coalesce(c.n,0)*2 + coalesce(r.n,0) as score,
         coalesce(p.n,0), coalesce(c.n,0), coalesce(r.n,0)
  from public.profiles pr
  left join p on p.u = pr.id left join c on c.u = pr.id left join r on r.u = pr.id
  where coalesce(p.n,0) + coalesce(c.n,0) + coalesce(r.n,0) > 0
  order by score desc
  limit 20;
$$;

grant execute on function public.profile_stats(uuid) to anon, authenticated;
grant execute on function public.leaderboard(int) to anon, authenticated;
revoke execute on function public.notify(uuid, uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_mentions(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.on_reaction() from public, anon, authenticated;
revoke execute on function public.on_comment() from public, anon, authenticated;
revoke execute on function public.on_post() from public, anon, authenticated;
revoke execute on function public.on_follow() from public, anon, authenticated;
revoke execute on function public.on_group_join() from public, anon, authenticated;
revoke execute on function public.on_comment_like() from public, anon, authenticated;

-- ---------- GROUPES : couverture ----------
alter table public.groups add column if not exists emoji text not null default '';

-- ---------- TEMPS RÉEL ----------
alter publication supabase_realtime add table public.notifications, public.stories, public.comment_likes, public.follows;
