-- 009 · Video + YouTube rows in project_media
--
-- CONTEXT
-- Motion Design and Video Editing have no projects yet. When they get some, a
-- piece of work is either a file we host or a film that lives on YouTube, and
-- the project page renders BOTH the same way: a still we host, and one button
-- under it ("Press to see full video"). No YouTube iframe, ever — see
-- js/video.js for why.
--
-- Additive and idempotent, like every migration in this folder. Safe to run
-- twice; cannot affect the other site sharing this database, which does not
-- read project_media.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Until it runs, the admin panel refuses video uploads and YouTube links with
-- a message naming this file. Everything else keeps working.

-- The still shown before the video is asked for. NULL means "fall back to the
-- project's own banner (projects.cover_url)", which is what an untouched reel
-- project already has, so a video added without a poster still renders.
alter table public.project_media
  add column if not exists poster_url text;

-- NOTE ON DIMENSIONS: video rows do NOT get poster_w/poster_h. The existing
-- width/height columns carry the POSTER's intrinsic size on a video row —
-- that is the box the page has to reserve to avoid layout shift, and the video
-- fills exactly that box when it swaps in. Two more columns holding the same
-- two numbers would only be a chance for them to disagree.

-- 001 constrained kind to ('image','video'). 'youtube' is the third case: the
-- row holds a watch URL rather than a file in our storage bucket, so deleting
-- it must not try to remove a storage object.
alter table public.project_media drop constraint if exists project_media_kind_check;
alter table public.project_media
  add constraint project_media_kind_check check (kind in ('image', 'video', 'youtube'));

-- Verify:
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='project_media' and column_name='poster_url';
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'project_media_kind_check';
