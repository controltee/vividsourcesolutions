-- 005 · Site settings rows (contact + socials) in the existing site_content table
--
-- site_content already exists live (id text, content text) holding marketing
-- copy (hero_subtitle, about_headline, about_body, contact_body). Reusing the
-- same key-value shape for contact/social settings means zero schema change —
-- just new rows the admin's "Site & Contact" tab reads and writes, and the
-- rail footer (shell.js) reads to populate the Contact link and social hrefs
-- without a redeploy.
--
-- contact_email starts EMPTY on purpose — Jesse fills it in via the admin
-- panel once it exists, rather than the build guessing at a placeholder. Until
-- it's set, the footer keeps its static fallback (Contact -> /about.html, and
-- the real current Instagram/Behance/LinkedIn URLs already in the HTML).

insert into public.site_content (id, content) values
  ('contact_email', ''),
  ('social_instagram_url', 'https://www.instagram.com/control.tee/'),
  ('social_behance_url', 'https://www.behance.net/controltee'),
  ('social_linkedin_url', 'https://www.linkedin.com/in/controltee/')
on conflict (id) do nothing;
