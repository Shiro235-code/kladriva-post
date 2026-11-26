-- Vidéos dans les publications et icônes de groupe
alter table public.posts add column if not exists video_url text;
alter table public.posts drop constraint if exists posts_has_content;
alter table public.posts add constraint posts_has_content
  check (char_length(content) > 0 or image_url is not null or cardinality(images) > 0 or video_url is not null);

alter table public.groups add column if not exists icon text not null default 'users';

-- Stockage : 50 Mo max, images et vidéos uniquement
update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','video/mp4','video/webm','video/quicktime']
  where id = 'media';
