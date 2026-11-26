-- Accusés de lecture en temps réel (« Vu ») dans la messagerie
alter publication supabase_realtime add table public.conversation_members;

-- Les visiteurs doivent pouvoir lire la relation (RLS ne leur renvoie rien)
grant select on public.saves to anon;
