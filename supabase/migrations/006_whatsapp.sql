-- =====================================================================
-- Messagerie façon WhatsApp : photo de groupe, admins, ajout/retrait de
-- membres, images dans les discussions, notification d'ajout.
-- =====================================================================

-- Photo de groupe
alter table public.groups add column if not exists avatar_url text;

-- Rôles : propriétaire, admin, membre
alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members add constraint group_members_role_check check (role in ('owner','admin','member'));

create or replace function public.is_group_admin(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid() and role in ('owner','admin'));
$$;
revoke execute on function public.is_group_admin(uuid) from public, anon;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- Les admins peuvent modifier le groupe (nom, description, photo, couleur, icône)
drop policy if exists "groups_update_owner" on public.groups;
create policy "groups_update_admin" on public.groups for update using (public.is_group_admin(id)) with check (public.is_group_admin(id));

-- Images dans les discussions (texte facultatif si une image est jointe)
alter table public.messages add column if not exists image_url text;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check
  check (char_length(content) <= 4000 and (char_length(content) > 0 or image_url is not null));

alter table public.group_messages add column if not exists image_url text;
alter table public.group_messages drop constraint if exists group_messages_content_check;
alter table public.group_messages add constraint group_messages_content_check
  check (char_length(content) <= 4000 and (char_length(content) > 0 or image_url is not null));

-- Notification « X t'a ajouté au groupe »
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('reaction','comment','reply','mention','follow','group_join','comment_like','group_add'));

-- Notification « a rejoint » seulement quand la personne rejoint d'elle-même
create or replace function public.on_group_join() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'member' and new.user_id = auth.uid() then
    perform public.notify((select created_by from public.groups where id = new.group_id), new.user_id, 'group_join', null, null, new.group_id);
  end if;
  return new;
end $$;

-- Ajouter des membres (admins uniquement)
create or replace function public.add_group_members(g uuid, users uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0;
begin
  if not public.is_group_admin(g) then raise exception 'Seuls les admins peuvent ajouter des membres'; end if;
  foreach u in array users loop
    insert into public.group_members (group_id, user_id, role) values (g, u, 'member')
      on conflict (group_id, user_id) do nothing;
    if found then
      n := n + 1;
      perform public.notify(u, auth.uid(), 'group_add', null, null, g);
    end if;
  end loop;
  return n;
end $$;

-- Retirer un membre (admins ; on ne retire pas le propriétaire)
create or replace function public.remove_group_member(g uuid, target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_admin(g) then raise exception 'Seuls les admins peuvent retirer des membres'; end if;
  if exists (select 1 from public.group_members where group_id = g and user_id = target and role = 'owner') then
    raise exception 'Le propriétaire ne peut pas être retiré';
  end if;
  delete from public.group_members where group_id = g and user_id = target;
end $$;

-- Nommer ou retirer un admin
create or replace function public.set_group_role(g uuid, target uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if new_role not in ('admin','member') then raise exception 'Rôle invalide'; end if;
  if not public.is_group_admin(g) then raise exception 'Seuls les admins peuvent changer les rôles'; end if;
  update public.group_members set role = new_role
    where group_id = g and user_id = target and role <> 'owner';
end $$;

-- Créer un groupe avec ses premiers membres en une seule fois
create or replace function public.create_group_with_members(
  g_name text, g_description text, g_color text, g_icon text, g_avatar text, users uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; u uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  insert into public.groups (name, description, color, icon, avatar_url, created_by)
    values (g_name, coalesce(g_description,''), coalesce(g_color,'cobalt'), coalesce(g_icon,'users'), g_avatar, auth.uid())
    returning id into gid;
  foreach u in array coalesce(users, '{}') loop
    if u <> auth.uid() then
      insert into public.group_members (group_id, user_id, role) values (gid, u, 'member') on conflict do nothing;
      perform public.notify(u, auth.uid(), 'group_add', null, null, gid);
    end if;
  end loop;
  return gid;
end $$;

revoke execute on function public.add_group_members(uuid, uuid[]) from public, anon;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;
revoke execute on function public.set_group_role(uuid, uuid, text) from public, anon;
revoke execute on function public.create_group_with_members(text, text, text, text, text, uuid[]) from public, anon;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_group_role(uuid, uuid, text) to authenticated;
grant execute on function public.create_group_with_members(text, text, text, text, text, uuid[]) to authenticated;
