// inspect-db.mjs — read-only survey of what is already in the database.
// Run: npm run inspect
//
// Signs in so it can see drafts too (anon only sees published rows). Prints a
// summary; writes nothing.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.CT_ADMIN_EMAIL,
    password: process.env.CT_ADMIN_PASSWORD,
  }),
});
if (!res.ok) {
  console.error('Sign in failed. Run npm run check-auth first.');
  process.exit(1);
}
const { access_token } = await res.json();

const get = async (path) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

const [categories, projects, clients, media] = await Promise.all([
  get('categories?select=id,name,slug,sort_order&order=sort_order'),
  get('projects?select=id,title,slug,category_id,client_id,layout,is_published,date_made,sort_order'),
  get('clients?select=*'),
  get('project_media?select=project_id'),
]);

const mediaCount = new Map();
for (const m of media) mediaCount.set(m.project_id, (mediaCount.get(m.project_id) || 0) + 1);
const catName = new Map(categories.map((c) => [c.id, c.name]));
const clientName = new Map(clients.map((c) => [c.id, c.name]));

console.log('\n=== CATEGORIES ===');
for (const c of categories) console.log(`  [${c.sort_order}] ${c.name}  (${c.slug})  id=${c.id}`);

console.log('\n=== CLIENTS ===');
for (const c of clients) {
  console.log(`  ${c.name}  id=${c.id}  card_title=${c.card_title ?? '-'}  banner=${c.banner_url ? 'yes' : 'no'}`);
}

console.log('\n=== PROJECTS ===');
for (const p of projects.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
  console.log(
    `  ${p.is_published ? 'LIVE ' : 'DRAFT'} | ${(catName.get(p.category_id) || '?').padEnd(28)} | ` +
      `${(clientName.get(p.client_id) || 'Independent').padEnd(45)} | ${p.layout.padEnd(7)} | ` +
      `${String(mediaCount.get(p.id) || 0).padStart(2)} media | ${p.date_made || '-'} | ${p.title}`
  );
}
console.log(`\n${projects.length} projects, ${media.length} media rows, ${clients.length} clients.`);
