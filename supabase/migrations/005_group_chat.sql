-- Discussion de groupe en temps réel (façon WhatsApp)
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at);

alter table public.group_messages enable row level security;
create policy "gmsg_read_members" on public.group_messages for select using (public.is_group_member(group_id));
create policy "gmsg_insert_members" on public.group_messages for insert to authenticated
  with check (auth.uid() = sender_id and public.is_group_member(group_id));
create policy "gmsg_delete_own" on public.group_messages for delete using (auth.uid() = sender_id);
grant select, insert, delete on public.group_messages to authenticated;

alter table public.groups add column if not exists last_message_at timestamptz;
alter table public.group_members add column if not exists last_read_at timestamptz not null default now();
drop policy if exists "gm_update_own" on public.group_members;
create policy "gm_update_own" on public.group_members for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant update (last_read_at) on public.group_members to authenticated;

create or replace function public.touch_group_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.groups set last_message_at = new.created_at where id = new.group_id;
  update public.group_members set last_read_at = new.created_at where group_id = new.group_id and user_id = new.sender_id;
  return new;
end $$;
revoke execute on function public.touch_group_chat() from public, anon, authenticated;
drop trigger if exists on_group_message on public.group_messages;
create trigger on_group_message after insert on public.group_messages
  for each row execute function public.touch_group_chat();

alter publication supabase_realtime add table public.group_messages, public.group_members;
