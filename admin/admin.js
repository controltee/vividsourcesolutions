// admin.js — the CMS. Supabase email/password auth gate, then Categories,
// Projects (+ per-project gallery), and Site & Contact settings.
//
// No framework: each tab is a render(panel) function that fetches, builds
// DOM with el(), and wires listeners. Re-rendering a tab after a mutation is
// the whole "state management" story, which is fine at this data size.

import { supabase } from '../js/supabase.js';
import { el, qs, qsa, slugify } from '../js/util.js';
import { isVideoKind, youtubeId, youtubeWatchUrl } from '../js/video.js';

const root = qs('#admin-root');
const BUCKET = 'portfolio_assets';
const MAX_UPLOAD_DIMENSION = 1920;
const WARN_BYTES = 500 * 1024;

// Video budget. Supabase Storage on this plan rejects uploads over 50MB
// outright, and the free tier's monthly egress is measured in gigabytes — a
// single 40MB film served a few hundred times spends the whole month. So the
// panel warns early and refuses well before the hard limit, and points at the
// two ways out: run it through scripts/optimize-video.mjs, or put it on
// YouTube and add the link instead.
const WARN_VIDEO_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;

/** A labeled field. Wraps the control inside the <label> so the association
 * is implicit — no id/for bookkeeping needed across forms that get rebuilt
 * on every render. */
function field(labelText, control, hint) {
  return el(
    'label',
    { class: 'admin-field' },
    el('span', { class: 'admin-field__label' }, labelText),
    control,
    hint ? el('p', { class: 'admin-field__hint' }, hint) : null
  );
}

// --- Save-state indicator ---------------------------------------------------
function setSaveState(state, message) {
  const indicator = qs('#save-state');
  if (!indicator) return;
  const label = message ?? { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Error' }[state] ?? '';

  // Rebuilt rather than re-labelled: replacing the node restarts the CSS
  // animations, so a second save animates again instead of showing a stale,
  // already-finished tick. The icon is decorative; the text beside it is what
  // aria-live announces.
  indicator.dataset.state = state;
  indicator.replaceChildren(
    state === 'idle' ? null : el('span', { class: 'admin-save-state__icon', 'aria-hidden': 'true' }),
    el('span', { class: 'admin-save-state__label' }, label)
  );

  if (state === 'saved') setTimeout(() => { if (indicator.dataset.state === 'saved') setSaveState('idle'); }, 2400);
}

// The public rail caches its category/project nav in sessionStorage. That store
// is per-tab, so clearing it from here would not reach a public tab the user
// already has open — which is exactly how a freshly-filed project appeared to
// land in the wrong category. localStorage IS shared across tabs on this origin,
// so we bump a timestamp instead and shell.js treats any cache entry older than
// it as stale. Same-browser only; another device still waits out the 5min TTL.
const CONTENT_STAMP_KEY = 'ct:content-stamp';

async function withSaveState(promise) {
  setSaveState('saving');
  try {
    const result = await promise;
    try {
      localStorage.setItem(CONTENT_STAMP_KEY, String(Date.now()));
    } catch {
      /* private mode / quota — the TTL still expires the cache on its own */
    }
    setSaveState('saved');
    return result;
  } catch (err) {
    setSaveState('error', `Error: ${err.message}`);
    throw err;
  }
}

// --- Small shared helpers ----------------------------------------------------
// slugify comes from util.js so the public site's client routing and the slugs
// written here can never drift apart.
async function uniqueSlug(table, base, excludeId) {
  let candidate = base;
  let n = 2;
  for (;;) {
    let query = supabase.from(table).select('id').eq('slug', candidate);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query;
    if (!data?.length) return candidate;
    candidate = `${base}-${n++}`;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Resizes/re-encodes an image file to WebP via canvas, capping the long edge
 * at MAX_UPLOAD_DIMENSION. Returns { blob, width, height }. This is the
 * client-side compression the spec's admin panel is expected to do. */
async function compressImage(file, maxDimension = MAX_UPLOAD_DIMENSION, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  return { blob, width, height };
}

function storagePathFromUrl(url) {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

async function uploadImage(file, pathPrefix, label) {
  const { blob, width, height } = await compressImage(file);
  const path = `${pathPrefix}/${label}-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, width, height, bytes: blob.size };
}

/** Uploads a video file AS-IS. There is no browser-side transcode here on
 * purpose: doing it properly means ffmpeg, and the only honest ways to run
 * ffmpeg in a page are a ~30MB wasm build or a server — both of which this
 * project has ruled out. Compression happens before upload, offline, via
 * `npm run vid`. This function's job is to refuse anything that skipped it. */
async function uploadVideo(file, pathPrefix, label) {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Compress it first ` +
        `(npm run vid -- "${file.name}" inside /scripts), or upload it to YouTube and paste the link instead.`
    );
  }
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${pathPrefix}/${label}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'video/mp4',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, bytes: file.size };
}

/** sql/009 adds project_media.poster_url and widens the kind constraint. Until
 * it is applied, PostgREST rejects the column and Postgres rejects the check —
 * two opaque errors for one missing migration. Name the file instead. */
function migrationHint(err) {
  const msg = String(err?.message || '');
  const code = String(err?.code || '');
  const missing =
    /poster_url/i.test(msg) ||
    /project_media_kind_check/i.test(msg) ||
    code === '23514' ||
    code === 'PGRST204';
  return missing ? ' Run sql/009_project_media_video.sql in the Supabase SQL editor first.' : '';
}

function fieldSizeWarning(bytes) {
  return bytes > WARN_BYTES
    ? el(
        'p',
        { class: 'admin-error', 'aria-live': 'polite' },
        `Heads up: this upload is ${(bytes / 1024).toFixed(0)}KB after compression, over the 500KB target.`
      )
    : null;
}

// --- Auth --------------------------------------------------------------------
function renderLogin(errorMessage) {
  const emailInput = el('input', {
    class: 'admin-input',
    id: 'login-email',
    type: 'email',
    required: true,
    autocomplete: 'username',
  });
  const passwordInput = el('input', {
    class: 'admin-input',
    id: 'login-password',
    type: 'password',
    required: true,
    autocomplete: 'current-password',
  });
  const submitBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'submit' }, 'Sign in');

  const form = el(
    'form',
    { class: 'admin-login__form' },
    el('div', { class: 'admin-field' }, el('label', { class: 'admin-field__label', for: 'login-email' }, 'Email'), emailInput),
    el(
      'div',
      { class: 'admin-field' },
      el('label', { class: 'admin-field__label', for: 'login-password' }, 'Password'),
      passwordInput
    ),
    errorMessage ? el('p', { class: 'admin-error', 'aria-live': 'polite' }, errorMessage) : null,
    submitBtn
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });
    if (error) renderLogin(error.message); // onAuthStateChange -> renderApp() on success
  });

  root.replaceChildren(
    el(
      'div',
      { class: 'admin-login' },
      el('div', { class: 'admin-login__card' }, el('p', { class: 'admin-login__brand' }, 'Control Tee'), form)
    )
  );
}

// --- App shell + tabs ----------------------------------------------------------
const TABS = [
  { id: 'projects', label: 'Projects' },
  { id: 'clients', label: 'Clients' },
  { id: 'categories', label: 'Categories' },
  { id: 'logos', label: 'Client logos' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Site & Contact' },
];

// Where you were survives a genuine RELOAD, not just an in-page tab switch.
// That distinction matters: browsers discard background tabs to save memory
// (Chrome's Memory Saver, and any mobile OS reclaiming a suspended app), so
// coming back to the admin after a while can be a full page load with every
// bit of in-memory state gone. Keeping this in localStorage is what makes the
// difference between "it reopened where I was" and "it refreshed on me".
//
// localStorage rather than sessionStorage: a discarded tab may be restored
// into a new session, and a second admin window should open where the first
// one was left.
const STATE_KEY = 'ct:admin-view';

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) || {};
  } catch {
    return {}; // private mode, or a value written by an older version
  }
}

function writeState(patch) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...patch }));
  } catch {
    /* private mode / quota — state just won't outlive this page */
  }
}

const savedState = readState();
let activeTabId = TABS.some((t) => t.id === savedState.tab) ? savedState.tab : 'projects';

// Where the Projects tab was left standing. Leaving for Clients and coming back
// used to drop you on the list with the open project closed; now the editor is
// reopened on the project you were in. Only a SAVED project is remembered — a
// half-filled "New project" form has nothing to restore from.
let projectsView =
  savedState.project && typeof savedState.project === 'string'
    ? { mode: 'editor', projectId: savedState.project, showGallery: !!savedState.gallery }
    : { mode: 'list' };

function setProjectsView(next) {
  projectsView = next;
  writeState(
    next.mode === 'editor'
      ? { project: String(next.projectId), gallery: !!next.showGallery }
      : { project: null, gallery: false }
  );
}

// Same idea for the Clients tab, which now opens onto a client rather than
// staying a flat list.
let clientsView =
  savedState.client && typeof savedState.client === 'string'
    ? { mode: 'editor', clientId: savedState.client }
    : { mode: 'list' };

function setClientsView(next) {
  clientsView = next;
  writeState(next.mode === 'editor' ? { client: String(next.clientId) } : { client: null });
}

function showLoading(panel) {
  // Only paint a placeholder into an EMPTY panel. Replacing already-rendered
  // content with "Loading…" on every mutation is what made a save or a reorder
  // read as a page refresh; leaving the current content up until the new one is
  // ready is both calmer and more honest about what changed.
  if (!panel.childNodes.length) panel.replaceChildren(el('p', {}, 'Loading…'));
}

function renderActiveTab(panel) {
  if (activeTabId === 'categories') renderCategoriesTab(panel);
  else if (activeTabId === 'clients') enterClientsTab(panel);
  else if (activeTabId === 'logos') renderLogosTab(panel);
  else if (activeTabId === 'analytics') renderAnalyticsTab(panel);
  else if (activeTabId === 'settings') renderSettingsTab(panel);
  else enterProjectsTab(panel);
}

function renderApp() {
  const topbar = el(
    'header',
    { class: 'admin-topbar' },
    el('div', { class: 'admin-topbar__brand' }, 'Control Tee · Admin'),
    el(
      'div',
      { class: 'admin-topbar__right' },
      el('span', { class: 'admin-save-state', id: 'save-state', 'aria-live': 'polite' }),
      el('button', { class: 'admin-btn', id: 'logout-btn', type: 'button' }, 'Sign out')
    )
  );

  // Plain buttons in a nav, not ARIA role="tablist"/"tab": that pattern
  // requires arrow-key navigation and a roving tabindex, which isn't
  // implemented here — announcing "tab" semantics without matching behavior
  // would be worse than not using them. aria-current mirrors how the rail
  // marks its active project link.
  const tabButtons = TABS.map((t) =>
    el(
      'button',
      {
        class: 'admin-tab',
        type: 'button',
        'aria-current': t.id === activeTabId ? 'page' : false,
        'data-tab': t.id,
      },
      t.label
    )
  );
  const tabsNav = el('nav', { class: 'admin-tabs', 'aria-label': 'Admin sections' }, ...tabButtons);
  const panel = el('div', { class: 'admin-panel', id: 'admin-panel' });

  root.replaceChildren(el('div', { class: 'admin-app' }, topbar, tabsNav, panel));

  qs('#logout-btn').addEventListener('click', () => supabase.auth.signOut());
  // Switching tabs swaps the PANEL only. Re-running renderApp() rebuilt the
  // topbar too, which threw away any in-flight save indicator and made a tab
  // change flash the whole screen.
  tabButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === activeTabId) return;
      activeTabId = btn.dataset.tab;
      writeState({ tab: activeTabId });
      tabButtons.forEach((b) => {
        if (b.dataset.tab === activeTabId) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      panel.replaceChildren();
      renderActiveTab(panel);
    })
  );

  renderActiveTab(panel);
}

// --- Categories tab --------------------------------------------------------------
function categoryForm(existing) {
  const nameInput = el('input', {
    class: 'admin-input',
    required: true,
    value: existing?.name || '',
  });
  const slugInput = el('input', { class: 'admin-input', value: existing?.slug || '' });
  let slugTouched = !!existing; // don't auto-slug over an existing category's slug
  nameInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = slugify(nameInput.value);
  });
  slugInput.addEventListener('input', () => {
    slugTouched = true;
  });

  const errorEl = el('p', { class: 'admin-error', 'aria-live': 'polite' });
  const submitBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'submit' }, existing ? 'Save' : 'Add category');

  const form = el(
    'form',
    { class: 'admin-form' },
    el('div', { class: 'admin-form__row' }, field('Name', nameInput), field('Slug', slugInput)),
    errorEl,
    el('div', { class: 'admin-form__actions' }, submitBtn)
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const name = nameInput.value.trim();
    if (!name) return;
    const baseSlug = slugify(slugInput.value || name);
    if (!baseSlug) {
      errorEl.textContent = 'Slug can’t be empty.';
      return;
    }
    try {
      const slug = await uniqueSlug('categories', baseSlug, existing?.id);
      if (existing) {
        await withSaveState(supabase.from('categories').update({ name, slug }).eq('id', existing.id).throwOnError());
      } else {
        const { data: rows } = await supabase.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
        const sort_order = (rows?.[0]?.sort_order ?? -1) + 1;
        await withSaveState(supabase.from('categories').insert({ name, slug, sort_order }).throwOnError());
      }
      renderCategoriesTab(qs('#admin-panel'));
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  return form;
}

async function moveCategory(categories, id, direction) {
  const i = categories.findIndex((c) => c.id === id);
  const j = i + direction;
  if (j < 0 || j >= categories.length) return;
  const a = categories[i];
  const b = categories[j];
  await withSaveState(
    Promise.all([
      supabase.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id).throwOnError(),
      supabase.from('categories').update({ sort_order: a.sort_order }).eq('id', b.id).throwOnError(),
    ])
  );
  renderCategoriesTab(qs('#admin-panel'));
}

async function deleteCategory(id, projectCount, panel) {
  if (projectCount > 0) {
    alert(`Can’t delete: ${projectCount} project(s) still use this category. Move or delete them first.`);
    return;
  }
  if (!confirm('Delete this category? This can’t be undone.')) return;
  await withSaveState(supabase.from('categories').delete().eq('id', id).throwOnError());
  renderCategoriesTab(panel);
}

async function renderCategoriesTab(panel) {
  showLoading(panel);

  const [{ data: categories, error }, { data: projectRows }] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('projects').select('category_id'),
  ]);
  if (error) {
    panel.replaceChildren(el('p', { class: 'admin-error', 'aria-live': 'polite' }, `Failed to load categories: ${error.message}`));
    return;
  }

  const countByCategory = {};
  for (const p of projectRows || []) countByCategory[p.category_id] = (countByCategory[p.category_id] || 0) + 1;

  const rows = categories.map((c, i) => {
    const editBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button' }, 'Edit');
    const upBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', disabled: i === 0 }, '↑');
    const downBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', disabled: i === categories.length - 1 }, '↓');
    const deleteBtn = el('button', { class: 'admin-btn admin-btn--icon admin-btn--danger', type: 'button' }, 'Delete');

    upBtn.addEventListener('click', () => moveCategory(categories, c.id, -1));
    downBtn.addEventListener('click', () => moveCategory(categories, c.id, 1));
    deleteBtn.addEventListener('click', () => deleteCategory(c.id, countByCategory[c.id] || 0, panel));

    const row = el(
      'div',
      { class: 'admin-list__row' },
      el(
        'div',
        { class: 'admin-list__main' },
        el('span', { class: 'admin-list__title' }, c.name),
        el('span', { class: 'admin-list__meta' }, `/${c.slug} · ${countByCategory[c.id] || 0} project(s)`)
      ),
      el('div', { class: 'admin-list__actions' }, upBtn, downBtn, editBtn, deleteBtn)
    );

    editBtn.addEventListener('click', () => {
      row.replaceWith(el('div', { class: 'admin-list__row' }, categoryForm(c)));
    });

    return row;
  });

  panel.replaceChildren(
    el('section', {}, el('h2', { class: 'admin-section__title' }, 'Categories'), el('div', { class: 'admin-list' }, ...rows)),
    el('section', {}, el('h2', { class: 'admin-section__title' }, 'Add a category'), categoryForm())
  );
}

// --- Projects tab ------------------------------------------------------------
const LAYOUT_OPTIONS = [
  { value: 'gallery', label: 'Gallery', hint: 'Mixed-aspect posters in a grid. Click an image to open it full-size.' },
  { value: 'deck', label: 'Deck', hint: 'Full-width slides in a seamless vertical flow, with no gaps and no lightbox. Upload at 1920px wide; any height works and nothing gets cropped.' },
  {
    value: 'reel',
    label: 'Reel',
    hint: 'Video. Each one shows as a still with a "Press to see full video" button under it — uploaded files play in place, YouTube links open on YouTube. Add as many as the piece needs.',
  },
];

// Clients carry their project count so the dropdown can say "RUSA (2 projects)".
// That count is the whole affordance behind client grouping: picking an existing
// client is what files a new job under the same name on the site, and the number
// is the only place that is visible at the moment of choosing.
async function fetchClients() {
  const [{ data: clients }, { data: rows }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('projects').select('client_id'),
  ]);
  const counts = new Map();
  for (const r of rows || []) {
    if (r.client_id) counts.set(r.client_id, (counts.get(r.client_id) || 0) + 1);
  }
  return (clients || []).map((c) => ({ ...c, projectCount: counts.get(c.id) || 0 }));
}

function clientOptionLabel(client) {
  if (!client.projectCount) return client.name;
  return `${client.name} (${client.projectCount} project${client.projectCount === 1 ? '' : 's'})`;
}

function projectForm(project, categories, clients, onSaved, onCancel) {
  const isNew = !project;
  const title = el('input', { class: 'admin-input', required: true, value: project?.title || '' });
  const slug = el('input', { class: 'admin-input', value: project?.slug || '' });
  let slugTouched = !isNew;
  title.addEventListener('input', () => {
    if (!slugTouched) slug.value = slugify(title.value);
  });
  slug.addEventListener('input', () => {
    slugTouched = true;
  });

  const categorySelect = el(
    'select',
    { class: 'admin-select', required: true },
    ...categories.map((c) => el('option', { value: c.id, selected: c.id === project?.category_id }, c.name))
  );

  const clientSelect = el(
    'select',
    { class: 'admin-select' },
    el('option', { value: '' }, 'Independent / no client'),
    ...clients.map((c) =>
      el('option', { value: c.id, selected: c.id === project?.client_id }, clientOptionLabel(c))
    ),
    el('option', { value: '__new__' }, '+ Add new client…')
  );
  const newClientInput = el('input', {
    class: 'admin-input',
    placeholder: 'New client name',
    'aria-label': 'New client name',
    hidden: true,
  });
  clientSelect.addEventListener('change', () => {
    newClientInput.hidden = clientSelect.value !== '__new__';
  });

  const summary = el('input', { class: 'admin-input', value: project?.summary || '', maxlength: 140 });
  const dateMade = el('input', { class: 'admin-input', placeholder: 'e.g. May 2026', value: project?.date_made || '' });
  const services = el('input', {
    class: 'admin-input',
    placeholder: 'Comma-separated, e.g. Branding, Social',
    value: (project?.services || []).join(', '),
  });
  const description = el('textarea', { class: 'admin-textarea' }, project?.description || '');

  const layoutSelect = el(
    'select',
    { class: 'admin-select' },
    ...LAYOUT_OPTIONS.map((o) => el('option', { value: o.value, selected: o.value === (project?.layout || 'gallery') }, o.label))
  );
  const layoutHint = el(
    'p',
    { class: 'admin-field__hint' },
    LAYOUT_OPTIONS.find((o) => o.value === (project?.layout || 'gallery')).hint
  );
  layoutSelect.addEventListener('change', () => {
    layoutHint.textContent = LAYOUT_OPTIONS.find((o) => o.value === layoutSelect.value).hint;
  });

  // Brand identity case studies get Deck by default — that category is what the
  // seamless full-width flow was built for. This is a suggestion, not a lock:
  // it only ever fires on a NEW project whose layout hasn't been set by hand, so
  // an existing project's saved layout is never overwritten, and one manual
  // change to the dropdown stops it adjusting again.
  const DECK_DEFAULT_CATEGORY_SLUG = 'brand-identity-systems';
  // Motion Design and Video Editing are video categories by definition, so they
  // start on Reel for the same reason brand identity starts on Deck.
  const REEL_DEFAULT_CATEGORY_SLUGS = new Set(['motion-design', 'video-editing']);
  let layoutTouched = !isNew;
  layoutSelect.addEventListener('change', () => {
    layoutTouched = true;
  });
  const suggestLayoutForCategory = () => {
    if (layoutTouched) return;
    const category = categories.find((c) => c.id === categorySelect.value);
    let suggested = 'gallery';
    if (category?.slug === DECK_DEFAULT_CATEGORY_SLUG) suggested = 'deck';
    else if (REEL_DEFAULT_CATEGORY_SLUGS.has(category?.slug)) suggested = 'reel';
    if (layoutSelect.value === suggested) return;
    layoutSelect.value = suggested;
    layoutHint.textContent = LAYOUT_OPTIONS.find((o) => o.value === suggested).hint;
  };
  categorySelect.addEventListener('change', suggestLayoutForCategory);
  suggestLayoutForCategory();

  const isPublished = el('input', { type: 'checkbox', checked: project?.is_published ?? true });

  const coverInput = el('input', { type: 'file', accept: 'image/*' });
  const coverPreview = el(
    'div',
    {},
    project?.cover_url ? el('img', { src: project.cover_url, alt: '', class: 'admin-cover-preview' }) : null
  );
  let pendingCover = null;
  const coverWarning = el('div');
  coverInput.addEventListener('change', async () => {
    const file = coverInput.files[0];
    if (!file) return;
    coverWarning.replaceChildren(el('p', { class: 'admin-field__hint' }, 'Compressing…'));
    pendingCover = await compressImage(file);
    coverWarning.replaceChildren(fieldSizeWarning(pendingCover.blob.size));
    // data: URL, not URL.createObjectURL — the CSP's img-src allows data: but
    // not blob:, and we keep the CSP strict rather than widen it for a preview.
    const previewSrc = await blobToDataUrl(pendingCover.blob);
    coverPreview.replaceChildren(el('img', { src: previewSrc, alt: '', class: 'admin-cover-preview' }));
  });

  const errorEl = el('p', { class: 'admin-error', 'aria-live': 'polite' });
  const submitBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'submit' }, isNew ? 'Create project' : 'Save project');
  const cancelBtn = isNew ? null : el('button', { class: 'admin-btn', type: 'button' }, 'Cancel');

  const form = el(
    'form',
    { class: 'admin-form' },
    el('div', { class: 'admin-form__row' }, field('Title', title), field('Slug', slug)),
    el('div', { class: 'admin-form__row' },
      field('Category', categorySelect),
      field(
        'Client',
        [clientSelect, newClientInput],
        'Pick the EXISTING client for repeat work. Two projects under the same client share one card on the home page and one entry in the menu. Only use “Add new client” for someone genuinely new.'
      )
    ),
    field('Summary (home card subtitle)', summary),
    el('div', { class: 'admin-form__row' }, field('Date', dateMade), field('Services', services)),
    field('Description', description),
    field('Layout', [layoutSelect, layoutHint]),
    field('Cover image', [coverInput, coverWarning, coverPreview]),
    el('label', { class: 'admin-checkbox' }, isPublished, 'Published (visible to site visitors)'),
    errorEl,
    el('div', { class: 'admin-form__actions' }, submitBtn, cancelBtn)
  );

  // onCancel lets the Clients tab reuse this form and send Cancel back to the
  // client it was opened from, instead of dumping you in the Projects list.
  cancelBtn?.addEventListener('click', () =>
    onCancel ? onCancel() : renderProjectsTab(qs('#admin-panel'))
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const titleValue = title.value.trim();
    if (!titleValue) return;
    submitBtn.disabled = true;

    try {
      let clientId = clientSelect.value || null;
      if (clientSelect.value === '__new__') {
        const name = newClientInput.value.trim();
        if (!name) throw new Error('Enter a name for the new client, or pick an existing one.');
        // Typing a name that already exists used to mint a SECOND client row, so
        // the two jobs looked unrelated on the site even though they were for
        // the same people. Match on the slug rather than the raw string so
        // "RUSA", "rusa" and "R.U.S.A." all land on the existing client.
        const key = slugify(name);
        const existing = clients.find((c) => slugify(c.name) === key);
        if (existing) {
          clientId = existing.id;
        } else {
          const { data, error } = await supabase.from('clients').insert({ name }).select('id').single();
          if (error) throw error;
          clientId = data.id;
        }
      }

      const baseSlug = slugify(slug.value || titleValue);
      if (!baseSlug) throw new Error('Slug can’t be empty.');
      const finalSlug = await uniqueSlug('projects', baseSlug, project?.id);

      const payload = {
        title: titleValue,
        slug: finalSlug,
        category_id: categorySelect.value,
        client_id: clientId,
        summary: summary.value.trim() || null,
        date_made: dateMade.value.trim() || null,
        services: services.value.split(',').map((s) => s.trim()).filter(Boolean),
        description: description.value.trim() || null,
        layout: layoutSelect.value,
        is_published: isPublished.checked,
        updated_at: new Date().toISOString(),
      };

      // A project filed under a client needs a position in THAT CLIENT's run
      // (sql/008), or it has no place in an order the client owns. Appended to
      // the end, so adding work never displaces what is already arranged.
      //
      // The probe keeps this entirely optional: a database without sql/008
      // returns an error for the unknown column, the field is left out of the
      // payload, and the client page falls back to category order exactly as
      // it did before. Moving a project to a DIFFERENT client re-positions it,
      // since its old position belonged to someone else's run; detaching it
      // clears the position rather than leaving a dangling one.
      const { error: probeError } = await supabase
        .from('projects')
        .select('client_sort_order')
        .limit(1);
      if (!probeError) {
        const clientChanged = String(project?.client_id ?? '') !== String(clientId ?? '');
        if (!clientId) {
          payload.client_sort_order = null;
        } else if (clientChanged || project?.client_sort_order == null) {
          const { data: last } = await supabase
            .from('projects')
            .select('client_sort_order')
            .eq('client_id', clientId)
            .not('client_sort_order', 'is', null)
            .order('client_sort_order', { ascending: false })
            .limit(1);
          payload.client_sort_order = (last?.[0]?.client_sort_order ?? -1) + 1;
        }
      }

      if (pendingCover) {
        const uploaded = await uploadImage(
          new File([pendingCover.blob], 'cover.webp', { type: 'image/webp' }),
          finalSlug,
          'cover'
        );
        payload.cover_url = uploaded.url;
        payload.banner_w = uploaded.width;
        payload.banner_h = uploaded.height;
      }

      let savedId = project?.id;
      if (isNew) {
        payload.sort_order = 0;
        const { data, error } = await withSaveState(supabase.from('projects').insert(payload).select('id').single());
        if (error) throw error;
        savedId = data.id;
      } else {
        const { error } = await withSaveState(supabase.from('projects').update(payload).eq('id', project.id).throwOnError());
        if (error) throw error;
      }

      onSaved?.(savedId);
    } catch (err) {
      errorEl.textContent = err.message;
      setSaveState('error', err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  return form;
}

// The data behind whatever the Projects tab last painted. Held so a reorder can
// redraw from memory instead of refetching: the swap is a pure local operation,
// and a round trip to the database only to render the same rows back is what
// made pressing ↑ blank the list and rebuild it.
let projectsData = null;

// Matches the ordering of the tab's query (.order('category_id').order('sort_order'))
// so a repaint after a local swap groups exactly as a fresh fetch would.
function compareProjects(a, b) {
  return (
    String(a.category_id).localeCompare(String(b.category_id)) ||
    (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
}

async function moveProject(projectsInCategory, id, direction) {
  const i = projectsInCategory.findIndex((p) => p.id === id);
  const j = i + direction;
  if (j < 0 || j >= projectsInCategory.length) return;
  const a = projectsInCategory[i];
  const b = projectsInCategory[j];

  // Swap locally and repaint FIRST. These are the same object references the
  // tab was painted from, so the new order is on screen in the same frame the
  // button was pressed, and the write below just catches up.
  const aSort = a.sort_order;
  const bSort = b.sort_order;
  const role = direction < 0 ? 'up' : 'down';
  a.sort_order = bSort;
  b.sort_order = aSort;
  repaintProjects(a.id, role);

  try {
    await withSaveState(
      Promise.all([
        supabase.from('projects').update({ sort_order: bSort }).eq('id', a.id).throwOnError(),
        supabase.from('projects').update({ sort_order: aSort }).eq('id', b.id).throwOnError(),
      ])
    );
  } catch {
    // Put the rows back where they were rather than leaving the screen showing
    // an order the database does not have. setSaveState already said "Error".
    a.sort_order = aSort;
    b.sort_order = bSort;
    repaintProjects(a.id, role);
  }
}

// Re-sort from the local rows and redraw, then hand focus back to the button
// that was just pressed on the project that moved.
function repaintProjects(focusId, role) {
  if (!projectsData) return;
  const panel = qs('#admin-panel');
  if (!panel) return;
  projectsData.projects.sort(compareProjects);
  paintProjectsTab(panel, projectsData);
  const btn = qs(
    `.admin-list__row[data-project-id="${CSS.escape(String(focusId))}"] [data-role="${role}"]`,
    panel
  );
  if (btn && !btn.disabled) btn.focus();
}

async function deleteProject(project) {
  if (!confirm(`Delete "${project.title}"? This removes its gallery images and can’t be undone.`)) return;
  await withSaveState(
    (async () => {
      // select('*') so poster_url comes along without naming it — PostgREST
      // errors on a column it doesn't have, and this has to keep working
      // whether or not sql/009 has been applied. A video row's poster is ours
      // and would otherwise be orphaned in the bucket; its media_url may point
      // at YouTube, where storagePathFromUrl correctly yields nothing.
      const { data: media } = await supabase.from('project_media').select('*').eq('project_id', project.id);
      const paths = (media || [])
        .flatMap((m) => [m.media_url, m.poster_url])
        .map((url) => url && storagePathFromUrl(url))
        .filter(Boolean);
      if (project.cover_url) {
        const p = storagePathFromUrl(project.cover_url);
        if (p) paths.push(p);
      }
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      await supabase.from('project_media').delete().eq('project_id', project.id).throwOnError();
      await supabase.from('projects').delete().eq('id', project.id).throwOnError();
    })()
  );
  renderProjectsTab(qs('#admin-panel'));
}

async function renderProjectsTab(panel, focusProjectId) {
  showLoading(panel);

  const [{ data: categories }, { data: projects, error }, clients] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('projects').select('*').order('category_id').order('sort_order'),
    fetchClients(),
  ]);
  if (error) {
    panel.replaceChildren(el('p', { class: 'admin-error', 'aria-live': 'polite' }, `Failed to load projects: ${error.message}`));
    return;
  }

  projectsData = { categories: categories || [], projects: projects || [], clients };

  if (focusProjectId) {
    const project = projects.find((p) => p.id === focusProjectId);
    if (project) {
      renderProjectEditor(panel, project, categories, clients, { showGallery: true });
      return;
    }
  }
  paintProjectsTab(panel, projectsData);
}

// Synchronous. Builds the whole tab from data already in hand, so a reorder is
// a repaint rather than a reload.
function paintProjectsTab(panel, { categories, projects, clients }) {
  setProjectsView({ mode: 'list' });

  const categoryById = new Map((categories || []).map((c) => [c.id, c]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const byCategory = new Map();
  for (const p of projects) {
    if (!byCategory.has(p.category_id)) byCategory.set(p.category_id, []);
    byCategory.get(p.category_id).push(p);
  }

  const sections = [];
  for (const [categoryId, list] of byCategory) {
    // `i` is the project's index in the FULL category list, not in whatever
    // client group it is rendered inside — up/down still reorders across the
    // whole category, which is what sort_order means on the public site.
    const row = (p, i) => {
      const editBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button' }, 'Edit');
      const galleryBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button' }, 'Gallery');
      // data-role + the row's data-project-id let moveProject put the keyboard
      // back on the same button after the repaint, so ↑ ↑ ↑ walks a project up
      // the list instead of dropping focus to the body on the first press.
      const upBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', 'data-role': 'up', disabled: i === 0 }, '↑');
      const downBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', 'data-role': 'down', disabled: i === list.length - 1 }, '↓');
      const deleteBtn = el('button', { class: 'admin-btn admin-btn--icon admin-btn--danger', type: 'button' }, 'Delete');

      upBtn.addEventListener('click', () => moveProject(list, p.id, -1));
      downBtn.addEventListener('click', () => moveProject(list, p.id, 1));
      deleteBtn.addEventListener('click', () => deleteProject(p));
      editBtn.addEventListener('click', () => renderProjectEditor(panel, p, categories, clients));
      galleryBtn.addEventListener('click', () => renderProjectEditor(panel, p, categories, clients, { showGallery: true }));

      const clientName = p.client_id ? clientById.get(p.client_id)?.name : null;
      return el(
        'div',
        { class: 'admin-list__row', 'data-project-id': p.id },
        el(
          'div',
          { class: 'admin-list__main' },
          el('span', { class: 'admin-list__title' }, p.title),
          el(
            'span',
            { class: 'admin-list__meta' },
            `/${p.slug || '(no slug)'} · ${p.layout} · ${clientName || 'Independent'}`
          )
        ),
        el('span', { class: `admin-badge${p.is_published ? ' admin-badge--live' : ''}` }, p.is_published ? 'Live' : 'Draft'),
        el('div', { class: 'admin-list__actions' }, upBtn, downBtn, galleryBtn, editBtn, deleteBtn)
      );
    };

    // Repeat clients are boxed together under their name, mirroring exactly how
    // the home grid and the rail present them. Seeing "RUSA · 2 projects" here
    // is the confirmation that the second job landed on the existing client
    // rather than on a new one that happens to be spelled the same.
    const counts = new Map();
    for (const p of list) {
      if (p.client_id) counts.set(p.client_id, (counts.get(p.client_id) || 0) + 1);
    }
    const emitted = new Set();
    const children = [];
    list.forEach((p, i) => {
      if (!p.client_id || counts.get(p.client_id) < 2) {
        children.push(row(p, i));
        return;
      }
      if (emitted.has(p.client_id)) return;
      emitted.add(p.client_id);
      const siblings = list
        .map((q, qi) => ({ q, qi }))
        .filter(({ q }) => q.client_id === p.client_id);
      children.push(
        el(
          'div',
          { class: 'admin-client-group' },
          el(
            'p',
            { class: 'admin-client-group__label' },
            `${clientById.get(p.client_id)?.name || 'Client'} · ${siblings.length} projects`
          ),
          ...siblings.map(({ q, qi }) => row(q, qi))
        )
      );
    });

    sections.push(
      el(
        'section',
        {},
        el('h2', { class: 'admin-section__title' }, categoryById.get(categoryId)?.name || 'Uncategorized'),
        el('div', { class: 'admin-list' }, ...children)
      )
    );
  }

  const newBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, '+ New project');
  newBtn.addEventListener('click', () => renderProjectEditor(panel, null, categories, clients));

  panel.replaceChildren(el('div', { class: 'admin-form__actions' }, newBtn), ...sections);
}

// Entry point for the Projects tab. Reopens the editor the tab was left on
// instead of always landing on the list.
async function enterProjectsTab(panel) {
  const { mode, projectId, showGallery } = projectsView;
  if (mode !== 'editor' || !projectId) {
    renderProjectsTab(panel);
    return;
  }
  showLoading(panel);
  const [{ data: categories }, { data: project }, clients] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
    fetchClients(),
  ]);
  // Deleted from another window, or the row is simply gone: fall back to the
  // list rather than showing an editor for nothing.
  if (!project) {
    setProjectsView({ mode: 'list' });
    renderProjectsTab(panel);
    return;
  }
  renderProjectEditor(panel, project, categories || [], clients, { showGallery });
}

function renderProjectEditor(panel, project, categories, clients, { showGallery = false, returnTo } = {}) {
  // Remembered so a trip to another tab (or a browser tab switch) comes back to
  // this project rather than to the list. Skipped when the editor was opened
  // from the Clients tab (returnTo is set): the Projects tab should still be
  // wherever IT was left, not follow a detour taken somewhere else.
  if (!returnTo) {
    setProjectsView(
      project?.id ? { mode: 'editor', projectId: project.id, showGallery } : { mode: 'list' }
    );
  }

  const form = projectForm(
    project,
    categories,
    clients,
    (savedId) => (returnTo ? returnTo() : renderProjectsTab(panel, savedId)),
    returnTo
  );
  const heading = el('h2', { class: 'admin-section__title' }, project ? `Edit: ${project.title}` : 'New project');
  const sections = [el('section', {}, heading, form)];

  if (project?.id) {
    const galleryContainer = el('div');
    sections.push(el('section', {}, el('h2', { class: 'admin-section__title' }, 'Gallery'), galleryContainer));
    renderGalleryManager(galleryContainer, project);
  } else if (showGallery) {
    sections.push(el('p', { class: 'admin-field__hint' }, 'Save the project first, then its gallery can be managed here.'));
  }

  panel.replaceChildren(...sections);
}

// --- Gallery manager (project_media) ------------------------------------------
// Rewrite sort_order to match array position after a drag. Only rows that
// actually moved are sent, so nudging one image up a slot is a couple of
// updates rather than one per image in the gallery.
async function persistAssetOrder(assets) {
  const changed = assets.map((a, i) => ({ a, i })).filter(({ a, i }) => a.sort_order !== i);
  if (!changed.length) return;
  await withSaveState(
    Promise.all(
      changed.map(({ a, i }) =>
        supabase.from('project_media').update({ sort_order: i }).eq('id', a.id).throwOnError()
      )
    )
  );
  for (const { a, i } of changed) a.sort_order = i;
}

async function deleteAsset(asset) {
  // A YouTube row's media_url points at youtube.com, so storagePathFromUrl
  // returns null and nothing is removed from the bucket — but its poster IS
  // ours, and used to be left behind paying rent forever.
  const paths = [storagePathFromUrl(asset.media_url), asset.poster_url && storagePathFromUrl(asset.poster_url)].filter(
    Boolean
  );
  await withSaveState(
    (async () => {
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      await supabase.from('project_media').delete().eq('id', asset.id).throwOnError();
    })()
  );
}

// The gallery updates IN PLACE. Every mutation used to end with a call back
// into this function, which refetched the rows and rebuilt every card — so
// dropping a dragged image, or finishing an upload, made the whole gallery
// blank and redraw. It reads as the page refreshing under you, and it throws
// away scroll position and any half-typed alt text in a sibling card.
//
// So: this runs ONCE per project. After that, uploads append cards, deletes
// remove them, and reorders move the existing nodes. The DOM is the source of
// truth for order; `byId` holds the row data.
async function renderGalleryManager(container, project) {
  if (!container.childNodes.length) container.replaceChildren(el('p', {}, 'Loading gallery…'));
  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order');
  if (error) {
    container.replaceChildren(el('p', { class: 'admin-error', 'aria-live': 'polite' }, `Failed to load gallery: ${error.message}`));
    return;
  }

  const assets = data || [];
  const byId = new Map(assets.map((a) => [String(a.id), a]));
  const grid = el('div', { class: 'admin-asset-grid' });

  const nodes = () => qsa('.admin-asset', grid);
  const orderedAssets = () => nodes().map((n) => byId.get(n.dataset.assetId)).filter(Boolean);

  // The only thing that goes stale when cards move: which arrows are at the
  // ends, and the handle's "image 3 of 9". Refreshed by walking the DOM, which
  // costs nothing at this size and cannot disagree with what is on screen.
  function refreshControls() {
    const list = nodes();
    list.forEach((node, i) => {
      qs('[data-role="up"]', node).disabled = i === 0;
      qs('[data-role="down"]', node).disabled = i === list.length - 1;
      qs('.admin-asset__handle', node).setAttribute(
        'aria-label',
        `Drag to reorder image ${i + 1} of ${list.length}`
      );
    });
  }

  async function saveOrder(errorEl) {
    try {
      await persistAssetOrder(orderedAssets());
      if (errorEl) errorEl.textContent = '';
    } catch (err) {
      if (errorEl) errorEl.textContent = `Could not save the new order: ${err.message}`;
      console.error('[admin] reorder failed:', err);
    }
  }

  // Reordering is driven by geometry on the GRID, not by a drop landing on a
  // particular card. The grid is multi-column with gaps between cards, so
  // per-card drop targets miss often; comparing against every card's centre
  // never does.
  let draggingEl = null;

  function insertionTarget(x, y) {
    const others = nodes().filter((n) => n !== draggingEl);
    let best = null;
    let bestDistance = Infinity;
    for (const node of others) {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance < bestDistance) {
        bestDistance = distance;
        // Same row: the pointer's side of the centre decides. Different row:
        // above the centre means insert before it.
        const sameRow = Math.abs(y - cy) < r.height / 2;
        best = { node, before: sameRow ? x < cx : y < cy };
      }
    }
    return best;
  }

  grid.addEventListener('dragover', (e) => {
    if (!draggingEl) return;
    e.preventDefault(); // marks the grid as a valid drop target
    e.dataTransfer.dropEffect = 'move';
    const target = insertionTarget(e.clientX, e.clientY);
    if (!target) return;
    // Live reorder, so the card visibly moves under the cursor and the final
    // position is never a surprise.
    grid.insertBefore(draggingEl, target.before ? target.node : target.node.nextSibling);
  });
  grid.addEventListener('drop', (e) => e.preventDefault());

  function assetCard(asset) {
    const altInput = el('input', {
      class: 'admin-input',
      placeholder: 'Alt text (required)',
      'aria-label': 'Alt text (required)',
      value: asset.alt || '',
    });
    const captionInput = el('input', {
      class: 'admin-input',
      placeholder: 'Caption (optional)',
      'aria-label': 'Caption (optional)',
      value: asset.caption || '',
    });
    const saveBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button' }, 'Save');
    const upBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', 'data-role': 'up' }, '↑');
    const downBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', 'data-role': 'down' }, '↓');
    const deleteBtn = el('button', { class: 'admin-btn admin-btn--icon admin-btn--danger', type: 'button' }, 'Delete');
    const errorEl = el('p', { class: 'admin-error', 'aria-live': 'polite' });

    saveBtn.addEventListener('click', async () => {
      const alt = altInput.value.trim();
      if (!alt) {
        errorEl.textContent = 'Alt text is required.';
        return;
      }
      errorEl.textContent = '';
      const caption = captionInput.value.trim() || null;
      await withSaveState(
        supabase.from('project_media').update({ alt, caption }).eq('id', asset.id).throwOnError()
      );
      asset.alt = alt;
      asset.caption = caption;
    });

    // Move the NODE, then save. Same path the drag takes, so both routes end up
    // writing exactly what is on screen.
    upBtn.addEventListener('click', async () => {
      const prev = figure.previousElementSibling;
      if (!prev) return;
      grid.insertBefore(figure, prev);
      refreshControls();
      upBtn.focus(); // the button moved with the card; keep the keyboard on it
      await saveOrder(errorEl);
    });
    downBtn.addEventListener('click', async () => {
      const next = figure.nextElementSibling;
      if (!next) return;
      grid.insertBefore(next, figure);
      refreshControls();
      downBtn.focus();
      await saveOrder(errorEl);
    });

    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Remove this image from the gallery?')) return;
      try {
        await deleteAsset(asset);
      } catch (err) {
        errorEl.textContent = `Could not delete: ${err.message}`;
        return;
      }
      byId.delete(String(asset.id));
      figure.remove();
      refreshControls();
      // The rows below it just closed a gap in sort_order. Harmless to the site
      // (it orders by sort_order, not by its exact values) but tidied anyway so
      // the numbers stay a straight 0..n-1.
      await saveOrder(null);
    });

    // Drag to reorder. The arrow buttons stay: dragging is pointer-only, so
    // removing them would leave keyboard and screen-reader users with no way to
    // reorder at all. Drag is the fast path, arrows are the accessible one.
    const dragHandle = el(
      'button',
      {
        class: 'admin-asset__handle',
        type: 'button',
        'aria-label': 'Drag to reorder',
        title: 'Drag to reorder',
      },
      '⠿'
    );

    // An image row previews as itself. A video row previews as its POSTER —
    // the still the site shows before anyone presses play — with a control to
    // set one, because a video with no poster borrows the project banner and
    // every video on the project then looks identical in this list.
    const isVideoRow = isVideoKind(asset.kind);
    const previewImg = (src) =>
      el('img', { src, alt: '', width: asset.width || false, height: asset.height || false });

    let preview;
    let sourceLine = null;
    let posterField = null;

    if (isVideoRow) {
      const ytId = asset.kind === 'youtube' ? youtubeId(asset.media_url) : null;
      preview = el('div', { class: 'admin-asset__poster' });
      const paintPoster = () =>
        preview.replaceChildren(
          asset.poster_url
            ? previewImg(asset.poster_url)
            : el('span', { class: 'admin-asset__poster-empty' }, 'No poster — the project banner stands in')
        );
      paintPoster();

      sourceLine = el(
        'p',
        { class: 'admin-field__hint' },
        ytId
          ? `YouTube · ${ytId}`
          : `Uploaded file · ${decodeURIComponent(asset.media_url.split('/').pop() || '')}`
      );

      const posterInput = el('input', { type: 'file', accept: 'image/*' });
      posterInput.addEventListener('change', async () => {
        const file = posterInput.files[0];
        if (!file) return;
        posterInput.disabled = true;
        errorEl.textContent = '';
        const previousPoster = asset.poster_url;
        try {
          const uploaded = await uploadImage(file, project.slug, `poster-${asset.sort_order}`);
          await withSaveState(
            supabase
              .from('project_media')
              .update({ poster_url: uploaded.url, width: uploaded.width, height: uploaded.height })
              .eq('id', asset.id)
              .throwOnError()
          );
          asset.poster_url = uploaded.url;
          asset.width = uploaded.width;
          asset.height = uploaded.height;
          paintPoster();
          // Only after the row points at the NEW file. Deleting first would
          // leave the row addressing a poster that no longer exists if the
          // update then failed.
          const stale = previousPoster && storagePathFromUrl(previousPoster);
          if (stale) await supabase.storage.from(BUCKET).remove([stale]);
        } catch (err) {
          errorEl.textContent = `Could not set the poster: ${err.message}${migrationHint(err)}`;
        } finally {
          posterInput.disabled = false;
          posterInput.value = '';
        }
      });
      posterField = el('label', { class: 'admin-asset__poster-field' }, 'Poster still: ', posterInput);
    } else {
      preview = previewImg(asset.media_url);
    }

    // NOT draggable by default. A permanently-draggable figure makes the browser
    // claim the pointer gesture inside the alt/caption inputs, so text cannot be
    // selected and a drag started from the handle button behaves inconsistently.
    // Draggability is switched on only while the handle is held (see below).
    const figure = el(
      'figure',
      { class: 'admin-asset', draggable: 'false', 'data-asset-id': asset.id },
      dragHandle,
      preview,
      sourceLine,
      posterField,
      altInput,
      captionInput,
      errorEl,
      el('div', { class: 'admin-asset__actions' }, upBtn, downBtn, saveBtn, deleteBtn)
    );

    // Arm on handle press only, so the alt/caption inputs keep normal pointer
    // behaviour the rest of the time.
    dragHandle.addEventListener('pointerdown', () => {
      figure.draggable = true;
    });
    dragHandle.addEventListener('pointerup', () => {
      figure.draggable = false;
    });

    figure.addEventListener('dragstart', (e) => {
      if (!figure.draggable) {
        e.preventDefault();
        return;
      }
      draggingEl = figure;
      // Firefox will not start a drag unless some data is set, even though the
      // reorder below never reads it back.
      e.dataTransfer.setData('text/plain', String(asset.id));
      e.dataTransfer.effectAllowed = 'move';
      figure.classList.add('admin-asset--dragging');
    });

    // dragend ALWAYS fires — including when the pointer is released over a grid
    // gap or outside the list entirely. The previous version persisted from a
    // `drop` handler on each card, so releasing anywhere else silently did
    // nothing, which is exactly the "drag works but the order never changes"
    // symptom. Reading the DOM's final order here removes that whole class of
    // failure, and surfaces any save error instead of swallowing it.
    figure.addEventListener('dragend', async () => {
      figure.draggable = false;
      figure.classList.remove('admin-asset--dragging');
      draggingEl = null;
      refreshControls();
      await saveOrder(errorEl);
    });

    return figure;
  }

  grid.append(...assets.map(assetCard));
  refreshControls();

  const fileInput = el('input', { type: 'file', accept: 'image/*,video/*', multiple: true });
  const uploadStatus = el('p', { class: 'admin-field__hint', 'aria-live': 'polite' });
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    if (!files.length) return;
    fileInput.disabled = true;
    const oversize = [];
    // Position in the grid, not a re-read of the table: the cards already on
    // screen are the order, and appending after them is what the eye expects.
    let nextSort = nodes().length;

    try {
      for (const [i, file] of files.entries()) {
        uploadStatus.textContent = `Uploading ${i + 1} of ${files.length}…`;
        const isVideo = file.type.startsWith('video/');
        const uploaded = isVideo
          ? await uploadVideo(file, project.slug, `video-${nextSort}`)
          : await uploadImage(file, project.slug, `gallery-${nextSort}`);
        // .select() so the new row comes back with its id and can be turned
        // straight into a card. Without it the only way to learn the id was to
        // refetch the whole gallery, which is what forced the full redraw.
        const { data: row, error: insertError } = await supabase
          .from('project_media')
          .insert({
            project_id: project.id,
            media_url: uploaded.url,
            // On a video row width/height describe the POSTER (sql/009), and no
            // poster has been chosen yet. Left null, the page falls back to the
            // project banner and ITS dimensions, so there is still no layout
            // shift before a poster is set.
            width: isVideo ? null : uploaded.width,
            height: isVideo ? null : uploaded.height,
            kind: isVideo ? 'video' : 'image',
            alt: '',
            sort_order: nextSort,
          })
          .select('*')
          .single();
        if (insertError) throw insertError;

        byId.set(String(row.id), row);
        grid.append(assetCard(row));
        refreshControls();
        if (uploaded.bytes > (isVideo ? WARN_VIDEO_BYTES : WARN_BYTES)) {
          oversize.push(
            isVideo
              ? `${file.name}: ${(uploaded.bytes / 1024 / 1024).toFixed(1)}MB`
              : `${file.name}: ${(uploaded.bytes / 1024).toFixed(0)}KB`
          );
        }
        nextSort += 1;
      }
      // replaceChildren is a native DOM call, not el(): it stringifies a null
      // child into the literal text "null" rather than skipping it.
      uploadStatus.replaceChildren('Done. Add alt text below before publishing.');
      if (oversize.length) {
        uploadStatus.append(
          el(
            'span',
            { class: 'admin-error' },
            ` Over target (500KB per image, 6MB per video): ${oversize.join(', ')}.`
          )
        );
      }
      try {
        localStorage.setItem(CONTENT_STAMP_KEY, String(Date.now()));
      } catch {
        /* private mode / quota — the rail cache's TTL still expires on its own */
      }
    } catch (err) {
      uploadStatus.replaceChildren(
        el('span', { class: 'admin-error' }, `Upload failed: ${err.message}${migrationHint(err)}`)
      );
      setSaveState('error', err.message);
    } finally {
      fileInput.disabled = false;
      fileInput.value = ''; // so re-picking the same file fires `change` again
    }
  });

  // A YouTube link is the OTHER way to add a video, and for anything longer
  // than a few seconds it is the right one: the file never touches Supabase
  // Storage, so it costs no storage and no egress however often it is watched.
  // The site still shows only our own poster and a button — it does not embed
  // their player (js/video.js).
  const ytInput = el('input', {
    class: 'admin-input',
    type: 'url',
    placeholder: 'https://www.youtube.com/watch?v=…',
    'aria-label': 'YouTube link',
  });
  const ytBtn = el('button', { class: 'admin-btn', type: 'button' }, 'Add YouTube link');
  const ytStatus = el('p', { class: 'admin-field__hint', 'aria-live': 'polite' });

  ytBtn.addEventListener('click', async () => {
    const id = youtubeId(ytInput.value);
    if (!id) {
      ytStatus.replaceChildren(
        el(
          'span',
          { class: 'admin-error' },
          'That is not a YouTube link. Paste the address from the browser bar, or the one the Share button gives you.'
        )
      );
      return;
    }
    ytBtn.disabled = true;
    ytStatus.textContent = 'Adding…';
    try {
      const { data: row, error } = await supabase
        .from('project_media')
        .insert({
          project_id: project.id,
          // The canonical watch URL, never a bare id: every reader then has a
          // working link without having to know how to rebuild one.
          media_url: youtubeWatchUrl(id),
          kind: 'youtube',
          alt: '',
          sort_order: nodes().length,
        })
        .select('*')
        .single();
      if (error) throw error;

      byId.set(String(row.id), row);
      grid.append(assetCard(row));
      refreshControls();
      ytInput.value = '';
      ytStatus.textContent = 'Added. Set a poster still and alt text on its card above.';
      try {
        localStorage.setItem(CONTENT_STAMP_KEY, String(Date.now()));
      } catch {
        /* private mode / quota — the rail cache's TTL still expires on its own */
      }
    } catch (err) {
      ytStatus.replaceChildren(
        el('span', { class: 'admin-error' }, `Could not add it: ${err.message}${migrationHint(err)}`)
      );
      setSaveState('error', err.message);
    } finally {
      ytBtn.disabled = false;
    }
  });

  container.replaceChildren(
    grid,
    el(
      'div',
      { class: 'admin-dropzone' },
      el('label', {}, 'Add images or video: ', fileInput),
      uploadStatus,
      el(
        'p',
        { class: 'admin-field__hint' },
        'Video files are uploaded as-is — compress them first with npm run vid (inside /scripts). Anything longer than about 10 seconds belongs on YouTube instead:'
      ),
      el('div', { class: 'admin-dropzone__row' }, ytInput, ytBtn),
      ytStatus
    )
  );
}

// --- Clients tab ----------------------------------------------------------------
// A client with 2+ published projects collapses into ONE card on the home grid
// and gets its own page. This tab is where that PARENT card is set: its banner
// and its subtitle, independent of the projects underneath it. Without this the
// card could only borrow the first project's cover, so changing how the client
// reads on the homepage meant re-cropping a project's own banner.
//
// Clients are still CREATED from the project form ("+ Add new client…") — there
// is no add form here on purpose, since a client with no work attached to it
// renders nowhere and is only a stray row.
function clientForm(client, projectCount, onSaved) {
  const name = el('input', { class: 'admin-input', required: true, value: client.name || '' });
  const summary = el('input', { class: 'admin-input', maxlength: 140, value: client.description || '' });

  // card_title arrives with sql/007. PostgREST returns every column of the row,
  // so the key being present is a reliable probe for whether the migration has
  // run. Probing beats trying the write and handling the failure: the field is
  // simply not offered until it can actually be saved, and the rest of the tab
  // keeps working in the meantime.
  const hasCardTitle = 'card_title' in client;
  const cardTitle = el('input', { class: 'admin-input', value: client.card_title || '' });

  const coverInput = el('input', { type: 'file', accept: 'image/*' });
  const coverPreview = el(
    'div',
    {},
    client.banner_url ? el('img', { src: client.banner_url, alt: '', class: 'admin-cover-preview' }) : null
  );
  let pendingCover = null;
  let clearCover = false;
  const coverWarning = el('div');

  // A banner uploaded by the OLD codebase has no stored dimensions, so the card
  // can't reserve its space or build a srcset. Measure it once here and fold the
  // result into the next save, rather than writing to the row behind Jesse's
  // back the moment he opens the tab.
  let measured = null;
  if (client.banner_url && !client.banner_w) {
    const probe = new Image();
    probe.onload = () => {
      measured = { banner_w: probe.naturalWidth, banner_h: probe.naturalHeight };
    };
    probe.src = client.banner_url;
  }

  coverInput.addEventListener('change', async () => {
    const file = coverInput.files[0];
    if (!file) return;
    clearCover = false;
    coverWarning.replaceChildren(el('p', { class: 'admin-field__hint' }, 'Compressing…'));
    pendingCover = await compressImage(file);
    coverWarning.replaceChildren(fieldSizeWarning(pendingCover.blob.size));
    // data: URL, not URL.createObjectURL — the CSP's img-src allows data: but
    // not blob:, and we keep the CSP strict rather than widen it for a preview.
    const previewSrc = await blobToDataUrl(pendingCover.blob);
    coverPreview.replaceChildren(el('img', { src: previewSrc, alt: '', class: 'admin-cover-preview' }));
  });

  // Clearing is a real setting, not a no-op: with no client banner the card
  // falls back to the first project's cover, which is the old behaviour.
  const clearBtn = el('button', { class: 'admin-btn', type: 'button' }, 'Clear banner');
  clearBtn.addEventListener('click', () => {
    clearCover = true;
    pendingCover = null;
    coverInput.value = '';
    coverWarning.replaceChildren();
    coverPreview.replaceChildren(
      el('p', { class: 'admin-field__hint' }, 'Cleared on save. The card will use the first project’s banner.')
    );
  });

  const errorEl = el('p', { class: 'admin-error', 'aria-live': 'polite' });
  const submitBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'submit' }, 'Save client');
  const cancelBtn = el('button', { class: 'admin-btn', type: 'button' }, 'Cancel');
  cancelBtn.addEventListener('click', () => renderClientsTab(qs('#admin-panel')));

  const form = el(
    'form',
    { class: 'admin-form' },
    field(
      'Name',
      name,
      `The organisation's real name. Printed under "Client" on every project page and used in the Client dropdown. The client page URL is built from it, so renaming changes /client.html?c=${slugify(client.name) || '…'} and any old link stops working.`
    ),
    hasCardTitle
      ? field(
          'Card title (home page)',
          cardTitle,
          'The heading on the home card and the client page. Left empty it uses the name above. Editing this does NOT change what project pages show, and does NOT change the URL.'
        )
      : field(
          'Card title (home page)',
          el('input', { class: 'admin-input', value: client.name || '', disabled: true }),
          'Needs sql/007_client_card_title.sql run in the Supabase dashboard. Until then the card uses the name above.'
        ),
    field(
      'Summary (card subtitle)',
      summary,
      'Left empty, the card lists the client’s project titles instead.'
    ),
    field(
      'Card banner',
      [coverInput, coverWarning, coverPreview],
      `The image for this client’s card on the home page${
        projectCount ? ` and the header of their page (${projectCount} project${projectCount === 1 ? '' : 's'})` : ''
      }. Falls back to the first project’s banner when empty. This is the same banner the older control-tee.vercel.app site reads, so changing it changes that site too.`
    ),
    errorEl,
    el('div', { class: 'admin-form__actions' }, submitBtn, client.banner_url ? clearBtn : null, cancelBtn)
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const nameValue = name.value.trim();
    if (!nameValue) return;
    submitBtn.disabled = true;

    try {
      // `description` and `banner_url` are LIVE columns that predate this
      // rebuild — reused rather than duplicated, so the banner already on
      // Riara University from the old codebase shows up instead of having to be
      // uploaded again. See sql/006 for why cover_url/summary went unused.
      const payload = { name: nameValue, description: summary.value.trim() || null };
      if (hasCardTitle) payload.card_title = cardTitle.value.trim() || null;
      if (pendingCover) {
        const uploaded = await uploadImage(
          new File([pendingCover.blob], 'cover.webp', { type: 'image/webp' }),
          `clients/${slugify(nameValue) || client.id}`,
          'cover'
        );
        payload.banner_url = uploaded.url;
        payload.banner_w = uploaded.width;
        payload.banner_h = uploaded.height;
      } else if (clearCover) {
        payload.banner_url = null;
        payload.banner_w = null;
        payload.banner_h = null;
      } else if (measured) {
        Object.assign(payload, measured); // backfill dimensions for an old banner
      }
      await withSaveState(supabase.from('clients').update(payload).eq('id', client.id).throwOnError());
      onSaved?.();
    } catch (err) {
      // banner_w/banner_h arrive with sql/006. Until that runs, PostgREST
      // rejects the whole update rather than ignoring the unknown column, so
      // say which migration is missing instead of leaking the raw error.
      errorEl.textContent = /column|schema cache/i.test(err.message)
        ? `${err.message}. This needs sql/006_client_cover.sql run in the Supabase dashboard first.`
        : err.message;
      setSaveState('error', errorEl.textContent);
    } finally {
      submitBtn.disabled = false;
    }
  });

  return form;
}

// --- Client editor: one client, its card and all its work ----------------------
// Repeat work for a client reads as ONE body of work on the site, so it should
// be editable as one too. Before this the card lived in this tab while the
// projects under it lived in Projects, and joining the two up was a matter of
// remembering which was which. Opening a client here now shows both: the card
// at the top, the work beneath it.
//
// The breakdown only becomes the POINT once a client has a second project —
// the same threshold the site uses to collapse them into one card and give
// them a page. With one project it still lists, with a note saying it renders
// as a plain project card until there is a second published one.

// Every project is fetched, not just this client's: sort_order is scoped to a
// CATEGORY across all projects in it, so reordering safely means knowing the
// whole category, not one client's slice of it.
async function loadClientEditorData(clientId) {
  const [{ data: client }, { data: projects }, { data: categories }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
    supabase.from('projects').select('*'),
    supabase.from('categories').select('*').order('sort_order'),
  ]);
  return { client, projects: projects || [], categories: categories || [] };
}

// The same ordering the public client page uses (js/client.js): category order
// first, then position within the category. Keeping the two in step is what
// stops the admin showing an order the site does not.
function orderedForCategory(projects, categoryId) {
  return projects
    .filter((p) => p.category_id === categoryId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title));
}

// sql/008 adds projects.client_sort_order — a position within the CLIENT,
// independent of category. PostgREST returns every column of a row, so the key
// being present is a reliable probe for whether that migration has run. Before
// it, ordering falls back to the category-scoped sort_order and the view groups
// by category; after it, the client's work is one list it can order freely.
function hasClientOrder(projects) {
  return projects.length > 0 && 'client_sort_order' in projects[0];
}

function byClientPosition(a, b) {
  const ao = a.client_sort_order;
  const bo = b.client_sort_order;
  if (ao != null && bo != null) return ao - bo;
  if (ao != null) return -1;
  if (bo != null) return 1;
  return a.title.localeCompare(b.title);
}

/**
 * Move a project up or down within its CLIENT, across categories. Renumbers the
 * client's whole run 0..n-1 so positions never collide or drift, and returns the
 * rows that actually changed. Only used once sql/008 is applied.
 */
function reorderWithinClient(mine, project, direction) {
  const list = [...mine].sort(byClientPosition);
  const i = list.findIndex((p) => p.id === project.id);
  const j = i + direction;
  if (i === -1 || j < 0 || j >= list.length) return null;

  [list[i], list[j]] = [list[j], list[i]];

  const changed = [];
  list.forEach((p, idx) => {
    if (p.client_sort_order !== idx) {
      p.client_sort_order = idx;
      changed.push(p);
    }
  });
  return changed;
}

async function persistClientOrder(changed) {
  if (!changed?.length) return;
  await withSaveState(
    Promise.all(
      changed.map((p) =>
        supabase
          .from('projects')
          .update({ client_sort_order: p.client_sort_order })
          .eq('id', p.id)
          .throwOnError()
      )
    )
  );
}

/**
 * Move one of a client's projects up or down PAST ITS NEXT SIBLING FROM THE SAME
 * CLIENT, which is what the ↑/↓ mean in a view that only lists that client. The
 * whole category is then renumbered 0..n-1, so ties in sort_order (which the
 * seed data has) are resolved permanently instead of leaving the order
 * ambiguous. Returns the rows whose sort_order actually changed, or null when
 * the project is already at the end of its client's run.
 *
 * This is the PRE-sql/008 path, kept so the tab still works against a database
 * without that migration.
 */
function reorderWithinCategory(projects, project, direction) {
  const list = orderedForCategory(projects, project.category_id);
  const i = list.findIndex((p) => p.id === project.id);
  if (i === -1) return null;

  let j = i + direction;
  while (j >= 0 && j < list.length && list[j].client_id !== project.client_id) j += direction;
  if (j < 0 || j >= list.length) return null;

  [list[i], list[j]] = [list[j], list[i]];

  const changed = [];
  list.forEach((p, idx) => {
    if (p.sort_order !== idx) {
      p.sort_order = idx;
      changed.push(p);
    }
  });
  return changed;
}

async function persistProjectOrder(changed) {
  if (!changed?.length) return;
  await withSaveState(
    Promise.all(
      changed.map((p) =>
        supabase.from('projects').update({ sort_order: p.sort_order }).eq('id', p.id).throwOnError()
      )
    )
  );
}

async function enterClientsTab(panel) {
  const { mode, clientId } = clientsView;
  if (mode !== 'editor' || !clientId) {
    renderClientsTab(panel);
    return;
  }
  showLoading(panel);
  const data = await loadClientEditorData(clientId);
  // Deleted from another window, or the row is simply gone.
  if (!data.client) {
    setClientsView({ mode: 'list' });
    renderClientsTab(panel);
    return;
  }
  paintClientEditor(panel, data);
}

async function openClientEditor(panel, clientId) {
  setClientsView({ mode: 'editor', clientId });
  showLoading(panel);
  const data = await loadClientEditorData(clientId);
  if (!data.client) {
    setClientsView({ mode: 'list' });
    renderClientsTab(panel);
    return;
  }
  paintClientEditor(panel, data);
}

// Synchronous, like paintProjectsTab: a reorder or a publish toggle repaints
// from data already in hand rather than refetching, so the panel never blanks.
function paintClientEditor(panel, data, focus) {
  const { client, projects, categories } = data;
  const mine = projects.filter((p) => String(p.client_id) === String(client.id));
  const live = mine.filter((p) => p.is_published).length;
  const heading = client.card_title?.trim() || client.name;

  const backBtn = el('button', { class: 'admin-btn', type: 'button' }, '← All clients');
  backBtn.addEventListener('click', () => {
    setClientsView({ mode: 'list' });
    renderClientsTab(panel);
  });

  const repaint = (f) => paintClientEditor(panel, data, f);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const categoryLabel = (p) => catById.get(p.category_id)?.name || '';
  // sql/008 applied? Decides both how the arrows behave and how the work is laid
  // out below. Probed once here so the two can never disagree.
  const clientScoped = hasClientOrder(mine);

  // --- one project row -------------------------------------------------------
  const projectRow = (p, indexInList, listLength) => {
    const upBtn = el('button', {
      class: 'admin-btn admin-btn--icon',
      type: 'button',
      'data-role': 'up',
      disabled: indexInList === 0,
    }, '↑');
    const downBtn = el('button', {
      class: 'admin-btn admin-btn--icon',
      type: 'button',
      'data-role': 'down',
      disabled: indexInList === listLength - 1,
    }, '↓');
    const galleryBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button' }, 'Gallery');
    const editBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button' }, 'Edit');
    const publishBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', 'data-role': 'publish' },
      p.is_published ? 'Unpublish' : 'Publish');
    const errorEl = el('p', { class: 'admin-error', 'aria-live': 'polite' });

    // With sql/008 the arrows move a project within the CLIENT and can cross
    // categories; without it they fall back to moving it among its
    // category-mates, which is all the category-scoped sort_order can express.
    const move = async (direction, role) => {
      const field = clientScoped ? 'client_sort_order' : 'sort_order';
      const before = new Map(projects.map((q) => [q.id, q[field]]));
      const changed = clientScoped
        ? reorderWithinClient(mine, p, direction)
        : reorderWithinCategory(projects, p, direction);
      if (!changed) return;
      repaint({ id: p.id, role });
      try {
        await (clientScoped ? persistClientOrder(changed) : persistProjectOrder(changed));
      } catch (err) {
        for (const q of projects) q[field] = before.get(q.id);
        repaint({ id: p.id, role });
        console.error('[admin] client reorder failed:', err);
      }
    };
    upBtn.addEventListener('click', () => move(-1, 'up'));
    downBtn.addEventListener('click', () => move(1, 'down'));

    publishBtn.addEventListener('click', async () => {
      const next = !p.is_published;
      p.is_published = next;
      repaint({ id: p.id, role: 'publish' });
      try {
        await withSaveState(
          supabase
            .from('projects')
            .update({ is_published: next, updated_at: new Date().toISOString() })
            .eq('id', p.id)
            .throwOnError()
        );
      } catch (err) {
        p.is_published = !next;
        repaint({ id: p.id, role: 'publish' });
        console.error('[admin] publish toggle failed:', err);
      }
    });

    // Edits open the SAME project editor the Projects tab uses — one form, not
    // a second one to keep in step. returnTo brings Save and Cancel back here.
    const openProject = async (showGallery) => {
      const clients = await fetchClients();
      renderProjectEditor(panel, p, categories, clients, {
        showGallery,
        returnTo: () => openClientEditor(panel, client.id),
      });
    };
    editBtn.addEventListener('click', () => openProject(false));
    galleryBtn.addEventListener('click', () => openProject(true));

    return el(
      'div',
      { class: 'admin-list__row', 'data-project-id': p.id },
      el(
        'div',
        { class: 'admin-list__main' },
        el('span', { class: 'admin-list__title' }, p.title),
        el('span', { class: 'admin-list__meta' },
          `/${p.slug || '(no slug)'} · ${p.layout}` +
            (clientScoped && categoryLabel(p) ? ` · ${categoryLabel(p)}` : '')),
        errorEl
      ),
      el('span', { class: `admin-badge${p.is_published ? ' admin-badge--live' : ''}` },
        p.is_published ? 'Live' : 'Draft'),
      el('div', { class: 'admin-list__actions' }, upBtn, downBtn, publishBtn, galleryBtn, editBtn)
    );
  };

  // --- the work ---------------------------------------------------------------
  // Two shapes, decided by whether sql/008 has been applied.
  //
  // WITH client_sort_order: ONE list the client owns outright. Category becomes
  // a label on the row rather than a boundary, because it no longer constrains
  // the order — which is the whole point of that migration.
  //
  // WITHOUT it: grouped by category, because category order is then what
  // actually decides the sequence on the client's page and hiding that would
  // only make the arrows look broken when they refuse to cross a boundary.
  let groups;
  if (clientScoped) {
    const ordered = [...mine].sort(byClientPosition);
    groups = [
      el(
        'div',
        { class: 'admin-client-group' },
        ...ordered.map((p, i) => projectRow(p, i, ordered.length))
      ),
    ];
  } else {
    const usedCategories = [...new Set(mine.map((p) => p.category_id))].sort(
      (a, b) => (catById.get(a)?.sort_order ?? 999) - (catById.get(b)?.sort_order ?? 999)
    );
    groups = usedCategories.map((categoryId) => {
      const inCategory = orderedForCategory(projects, categoryId).filter(
        (p) => String(p.client_id) === String(client.id)
      );
      return el(
        'div',
        { class: 'admin-client-group' },
        el('p', { class: 'admin-client-group__label' },
          `${catById.get(categoryId)?.name || 'Uncategorized'} · ${inCategory.length} project${inCategory.length === 1 ? '' : 's'}`),
        ...inCategory.map((p, i) => projectRow(p, i, inCategory.length))
      );
    });
  }

  const workSection = el(
    'section',
    {},
    el('h2', { class: 'admin-section__title' }, 'Work'),
    el(
      'p',
      { class: 'admin-field__hint' },
      mine.length
        ? `${mine.length} project${mine.length === 1 ? '' : 's'} filed under this client, ${live} live. ↑ ↓ set the order they appear in on the client's page` +
          (clientScoped
            ? ', in one run across every category. Projects are filed under a client from the project’s own form.'
            : '; category order decides which group comes first, so the arrows only move a project among its category-mates. Run sql/008 to order them freely. Projects are filed under a client from the project’s own form.')
        : 'No projects are filed under this client yet. Open a project in the Projects tab and pick this client to add one.'
    ),
    live > 1
      ? null
      : el(
          'p',
          { class: 'admin-field__hint' },
          live === 1
            ? 'With one published project this client renders as a plain project card on the home page — no grouped card and no client page. Publish a second and it switches over automatically.'
            : 'Nothing is published for this client yet, so it does not render on the site at all.'
        ),
    ...groups
  );

  panel.replaceChildren(
    el('div', { class: 'admin-form__actions' }, backBtn),
    el(
      'section',
      {},
      el('h2', { class: 'admin-section__title' }, `Client: ${heading}`),
      clientForm(client, mine.length, () => openClientEditor(panel, client.id))
    ),
    workSection
  );

  // Put the keyboard back on the control that was just used. Moving a project
  // to the end of its run DISABLES the arrow that got it there, so fall back to
  // the opposite arrow rather than dropping focus to the body and stranding a
  // keyboard user mid-reorder.
  if (focus) {
    const row = qs(`.admin-list__row[data-project-id="${CSS.escape(String(focus.id))}"]`, panel);
    if (row) {
      const preferred = [focus.role, focus.role === 'up' ? 'down' : 'up', 'publish'];
      for (const role of preferred) {
        const btn = qs(`[data-role="${role}"]`, row);
        if (btn && !btn.disabled) {
          btn.focus();
          break;
        }
      }
    }
  }
}

async function deleteClient(client, projectCount, panel) {
  if (projectCount > 0) {
    alert(`Can’t delete: ${projectCount} project(s) are still filed under ${client.name}. Move or delete them first.`);
    return;
  }
  if (!confirm(`Delete ${client.name}? This can’t be undone.`)) return;
  await withSaveState(supabase.from('clients').delete().eq('id', client.id).throwOnError());
  renderClientsTab(panel);
}

async function renderClientsTab(panel) {
  showLoading(panel);
  setClientsView({ mode: 'list' });

  // select('*') rather than a named column list: it keeps this tab working
  // whether or not sql/006 has been applied yet, instead of erroring on a
  // column PostgREST hasn't seen.
  const [{ data: clients, error }, { data: projectRows }] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('projects').select('client_id, is_published'),
  ]);
  if (error) {
    panel.replaceChildren(
      el('p', { class: 'admin-error', 'aria-live': 'polite' }, `Failed to load clients: ${error.message}`)
    );
    return;
  }

  const total = new Map();
  const published = new Map();
  for (const p of projectRows || []) {
    if (!p.client_id) continue;
    total.set(p.client_id, (total.get(p.client_id) || 0) + 1);
    if (p.is_published) published.set(p.client_id, (published.get(p.client_id) || 0) + 1);
  }

  const rows = (clients || []).map((c) => {
    const count = total.get(c.id) || 0;
    const live = published.get(c.id) || 0;
    const openBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', 'data-role': 'open' }, 'Open');
    const deleteBtn = el('button', { class: 'admin-btn admin-btn--icon admin-btn--danger', type: 'button' }, 'Delete');
    deleteBtn.addEventListener('click', () => deleteClient(c, count, panel));
    openBtn.addEventListener('click', () => openClientEditor(panel, c.id));

    return el(
      'div',
      { class: 'admin-list__row', 'data-client-id': c.id },
      c.banner_url
        ? el('img', { src: c.banner_url, alt: '', class: 'admin-list__thumb' })
        : el('span', { class: 'admin-list__thumb admin-list__thumb--empty', 'aria-hidden': 'true' }),
      el(
        'div',
        { class: 'admin-list__main' },
        el('span', { class: 'admin-list__title' }, c.name),
        el(
          'span',
          { class: 'admin-list__meta' },
          `${count} project${count === 1 ? '' : 's'}` +
            (count ? ` · ${live} live` : '') +
            (c.banner_url ? ' · own banner' : ' · banner from first project') +
            (c.card_title ? ` · card: “${c.card_title}”` : '')
        )
      ),
      // Only a client with 2+ PUBLISHED projects actually gets a grouped card
      // and a page — say so, so an unused banner is never a mystery.
      el(
        'span',
        { class: `admin-badge${live > 1 ? ' admin-badge--live' : ''}` },
        live > 1 ? 'Grouped card' : 'Single card'
      ),
      el('div', { class: 'admin-list__actions' }, openBtn, deleteBtn)
    );
  });

  panel.replaceChildren(
    el(
      'section',
      {},
      el('h2', { class: 'admin-section__title' }, 'Clients'),
      el(
        'p',
        { class: 'admin-field__hint' },
        'A client with two or more published projects becomes one card on the home page and gets its own page. Open a client to set that card and to arrange the work underneath it. New clients are added from the project form.'
      ),
      rows.length ? el('div', { class: 'admin-list' }, ...rows) : el('p', { class: 'admin-field__hint' }, 'No clients yet.')
    )
  );
}

// --- Client logos tab (partner_logos -> the homepage marquee) -------------------
// Quality in the marquee is decided at upload time, so the rules below are
// ENFORCED, not merely suggested: a 60px-tall PNG cannot be rescued later, and
// one soft logo drags down a strip where everything else is crisp.
const LOGO_MIN_HEIGHT = 200; // renders at ~44px, so this still has retina headroom
const LOGO_MAX_BYTES = 500 * 1024;

async function uploadLogoFile(file) {
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error(`That file is ${(file.size / 1024).toFixed(0)}KB. Keep logos under 500KB.`);
  }
  // SVG is stored verbatim. Pushing a vector through the canvas would rasterise
  // it and throw away the one property that keeps it sharp at any size.
  if (file.type === 'image/svg+xml') {
    const path = `partners/logo-${Date.now()}.svg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: 'image/svg+xml', upsert: false });
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  const bitmap = await createImageBitmap(file);
  const height = bitmap.height;
  bitmap.close();
  if (height < LOGO_MIN_HEIGHT) {
    throw new Error(
      `This logo is only ${height}px tall. Use at least ${LOGO_MIN_HEIGHT}px (400px, or an SVG, is better) or it will look soft as it scrolls.`
    );
  }
  const uploaded = await uploadImage(file, 'partners', 'logo');
  return uploaded.url;
}

async function renderLogosTab(panel) {
  showLoading(panel);
  const { data: logos, error } = await supabase
    .from('partner_logos')
    .select('*')
    .order('created_at');
  if (error) {
    panel.replaceChildren(
      el('p', { class: 'admin-error', 'aria-live': 'polite' }, `Failed to load logos: ${error.message}`)
    );
    return;
  }

  const grid = el('div', { class: 'admin-asset-grid' });
  (logos || []).forEach((logo) => {
    const deleteBtn = el('button', { class: 'admin-btn admin-btn--icon admin-btn--danger', type: 'button' }, 'Delete');
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Remove ${logo.name || 'this logo'} from the marquee?`)) return;
      const path = storagePathFromUrl(logo.logo_url || '');
      await withSaveState(
        (async () => {
          if (path) await supabase.storage.from(BUCKET).remove([path]);
          await supabase.from('partner_logos').delete().eq('id', logo.id).throwOnError();
        })()
      );
      renderLogosTab(panel);
    });
    grid.append(
      el(
        'figure',
        { class: 'admin-asset admin-asset--logo' },
        el('img', { src: logo.logo_url, alt: logo.name || '', width: 176, height: 44 }),
        el('p', { class: 'admin-field__hint' }, logo.name || '(unnamed)'),
        el('div', { class: 'admin-asset__actions' }, deleteBtn)
      )
    );
  });

  const nameInput = el('input', { class: 'admin-input', placeholder: 'Client name', 'aria-label': 'Client name' });
  const fileInput = el('input', { type: 'file', accept: 'image/svg+xml,image/png,image/webp' });
  const statusEl = el('p', { class: 'admin-field__hint', 'aria-live': 'polite' });
  const errorEl = el('p', { class: 'admin-error', 'aria-live': 'polite' });
  const addBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, 'Add logo');

  addBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const file = fileInput.files?.[0];
    const name = nameInput.value.trim();
    if (!file) {
      errorEl.textContent = 'Choose a logo file first.';
      return;
    }
    if (!name) {
      errorEl.textContent = 'Add the client name. It becomes the image alt text.';
      return;
    }
    addBtn.disabled = true;
    statusEl.textContent = 'Uploading…';
    try {
      const url = await uploadLogoFile(file);
      await withSaveState(
        supabase.from('partner_logos').insert({ name, logo_url: url }).throwOnError()
      );
      renderLogosTab(panel);
    } catch (err) {
      errorEl.textContent = err.message;
      statusEl.textContent = '';
      addBtn.disabled = false;
    }
  });

  panel.replaceChildren(
    el(
      'section',
      {},
      el('h2', { class: 'admin-section__title' }, 'Client logos'),
      el(
        'p',
        { class: 'admin-field__hint' },
        'These scroll in the homepage marquee, in the order they were added.'
      ),
      grid
    ),
    el(
      'section',
      {},
      el('h2', { class: 'admin-section__title' }, 'Add a logo'),
      el(
        'div',
        { class: 'admin-logo-spec' },
        el('p', { class: 'admin-field__hint' }, 'For a crisp marquee, upload in this order of preference:'),
        el(
          'ul',
          { class: 'admin-field__hint' },
          el('li', {}, 'SVG is best. It stays sharp at any size and is stored as-is.'),
          el('li', {}, 'Otherwise PNG or WebP with a TRANSPARENT background, at least 200px tall (400px is better).'),
          el('li', {}, 'One colour, ideally white. Logos are shown at a single muted opacity, so full-colour marks look inconsistent next to each other.'),
          el('li', {}, 'Trim the empty space around the mark, or it will float with odd gaps.'),
          el('li', {}, 'Under 500KB.')
        )
      ),
      field('Client name', nameInput),
      field('Logo file', fileInput),
      statusEl,
      errorEl,
      addBtn
    )
  );
}

// --- Site & Contact settings tab ------------------------------------------------
const SETTINGS_FIELDS = [
  { id: 'brand_tagline', label: 'Tagline (shown under the logo/name)', type: 'input' },
  { id: 'contact_email', label: 'Contact email', hint: 'Used for the rail’s Contact link (mailto:).', type: 'input' },
  { id: 'social_instagram_url', label: 'Instagram URL', type: 'input' },
  { id: 'social_behance_url', label: 'Behance URL', type: 'input' },
  { id: 'social_linkedin_url', label: 'LinkedIn URL', type: 'input' },
  // Home band. Kept separate from the About copy on purpose: this headline is
  // the homepage h1, so it carries first impression and SEO weight, where the
  // About heading is only a section title. Both rows are created on first save
  // (the settings form upserts), so no migration is needed. Left empty, the
  // homepage falls back to about_headline + the first paragraph of about_body.
  { id: 'home_headline', label: 'Home: headline (the homepage h1)', hint: 'Say what the studio is. Falls back to the About headline if blank.', type: 'input' },
  { id: 'home_intro', label: 'Home: synopsis', hint: 'Two or three lines above the work. Plain text. Falls back to the first paragraph of the About body.', type: 'textarea' },
  { id: 'about_headline', label: 'About: headline', type: 'input' },
  { id: 'about_body', label: 'About: body (HTML)', type: 'textarea' },
  { id: 'contact_body', label: 'Contact: intro (HTML)', type: 'textarea' },
];

// Logo uploads immediately (like gallery images) and stores its URL in
// site_content.logo_url. Separate from the text-field "Save settings" button.
function logoUploader(currentUrl, onChange) {
  const preview = el('div', { class: 'admin-logo-preview' });
  if (currentUrl) preview.append(el('img', { src: currentUrl, alt: 'Current logo', class: 'admin-cover-preview' }));
  else preview.append(el('p', { class: 'admin-field__hint' }, 'No logo set. The “Control Tee” wordmark is shown.'));

  const fileInput = el('input', { type: 'file', accept: 'image/*', 'aria-label': 'Upload a logo' });
  const status = el('p', { class: 'admin-field__hint', 'aria-live': 'polite' });
  const removeBtn = el('button', { class: 'admin-btn admin-btn--danger', type: 'button' }, 'Remove logo');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    status.textContent = 'Uploading…';
    try {
      const uploaded = await uploadImage(file, 'branding', 'logo');
      await withSaveState(
        supabase.from('site_content').upsert({ id: 'logo_url', content: uploaded.url }, { onConflict: 'id' }).throwOnError()
      );
      onChange();
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    }
  });
  removeBtn.addEventListener('click', async () => {
    if (!confirm('Remove the logo and go back to the text wordmark?')) return;
    await withSaveState(
      supabase.from('site_content').upsert({ id: 'logo_url', content: '' }, { onConflict: 'id' }).throwOnError()
    );
    onChange();
  });

  return el(
    'section',
    {},
    el('h2', { class: 'admin-section__title' }, 'Logo'),
    preview,
    field('Upload a logo (PNG/SVG with transparency works best)', fileInput),
    status,
    currentUrl ? el('div', { class: 'admin-form__actions' }, removeBtn) : null
  );
}

// --- Analytics tab -------------------------------------------------------------
// First-party traffic, read straight out of page_views (sql/010). No third
// party is involved, which is the point: these numbers are Jesse's, in his own
// panel, and nothing about them is shared with anyone.
//
// The counts are DIRECTIONALLY TRUE, not audited — anon can insert and the anon
// key is public, so fabricated rows are possible. The tab says so rather than
// quietly implying precision it does not have.
const ANALYTICS_WINDOWS = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
];

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key == null) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** A ranked list with an inline bar. The bar is a proportion of the top row,
 * not of the total: on a portfolio the leader usually dwarfs everything else,
 * and scaling to the total leaves every other row an invisible sliver. */
function rankedList(rows, emptyText, format = (k) => k) {
  if (!rows.length) return el('p', { class: 'admin-field__hint' }, emptyText);
  const max = rows[0][1];
  return el(
    'ol',
    { class: 'admin-stat-list' },
    ...rows.slice(0, 12).map(([key, count]) =>
      el(
        'li',
        { class: 'admin-stat' },
        el('span', { class: 'admin-stat__label' }, format(key)),
        el('span', { class: 'admin-stat__count' }, String(count)),
        el('span', {
          class: 'admin-stat__bar',
          style: `--w:${Math.round((count / max) * 100)}%`,
          'aria-hidden': 'true',
        })
      )
    )
  );
}

// Deliberately NOT one three-step funnel. `process_cta` fires on the landing
// page and the two inquiry events fire on /contact.html, and a visitor can
// reach the form without ever passing the landing page — so a percentage from
// one to the other would be an invented number. Only `started` → `sent` is a
// true funnel, because both ends happen on the same page to the same person.
//
// The previous version of this counted 'estimate_submit', which nothing ever
// recorded (the estimator fired 'estimate_submit_call' / '..._message'), so its
// third row read 0 for its whole life. Any event named here must exist in the
// page that claims to send it.
function funnelPanel(rows) {
  const step = (event) => rows.filter((r) => r.event === event).length;
  const toWork = step('process_cta');
  const started = step('inquiry_start');
  const submitted = step('inquiry_submit');
  const rate = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '—');

  return el(
    'div',
    { class: 'admin-funnel' },
    el('h3', { class: 'admin-subhead' }, 'Landing page and inquiries'),
    el(
      'p',
      { class: 'admin-field__hint' },
      'The first number is how many people read the process and chose to see the work. The second pair is the inquiry form: a big drop from started to sent means a question on the form is doing damage.'
    ),
    el(
      'ul',
      { class: 'admin-funnel__steps' },
      el(
        'li',
        {},
        el('span', { class: 'admin-funnel__n' }, String(toWork)),
        el('span', { class: 'admin-funnel__label' }, 'went on to the work')
      ),
      el(
        'li',
        {},
        el('span', { class: 'admin-funnel__n' }, String(started)),
        el('span', { class: 'admin-funnel__label' }, 'started an inquiry')
      ),
      el(
        'li',
        {},
        el('span', { class: 'admin-funnel__n' }, String(submitted)),
        el('span', { class: 'admin-funnel__label' }, `sent it · ${rate(submitted, started)}`)
      )
    )
  );
}

let analyticsDays = 30;

async function renderAnalyticsTab(panel) {
  panel.replaceChildren(el('p', {}, 'Loading analytics…'));

  const since = new Date(Date.now() - analyticsDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('page_views')
    .select('path, referrer, event, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20000);

  if (error) {
    // The overwhelmingly likely cause the first time is that sql/010 has not
    // been run, and "relation does not exist" is not a helpful thing to read.
    const missing = /page_views/i.test(error.message) || error.code === '42P01';
    panel.replaceChildren(
      el('h2', { class: 'admin-subhead' }, 'Analytics'),
      el(
        'p',
        { class: 'admin-error' },
        missing
          ? 'No analytics table yet. Run sql/010_page_views.sql in the Supabase SQL editor, then reload this tab — counting starts from the moment it exists.'
          : `Could not load analytics: ${error.message}`
      )
    );
    return;
  }

  const rows = data || [];
  const views = rows.filter((r) => !r.event);

  // Housekeeping, here because there is no cron on this project: the admin
  // opening this tab is the only reliable moment anything runs on a schedule.
  // Failure is ignored — pruning is tidiness, not correctness.
  supabase.rpc('prune_page_views').then(
    () => {},
    () => {}
  );

  const windowPicker = el(
    'div',
    { class: 'admin-seg' },
    ...ANALYTICS_WINDOWS.map((w) => {
      const btn = el(
        'button',
        {
          class: w.id === analyticsDays ? 'admin-btn admin-btn--icon is-active' : 'admin-btn admin-btn--icon',
          type: 'button',
          'aria-pressed': w.id === analyticsDays ? 'true' : 'false',
        },
        w.label
      );
      btn.addEventListener('click', () => {
        analyticsDays = w.id;
        renderAnalyticsTab(panel);
      });
      return btn;
    })
  );

  // A project's slug is the readable half of its path; showing the raw
  // "/project.html?p=riara-rebrand" in a ranked list is noise.
  const prettyPath = (path) => {
    const [file, query] = path.split('?');
    const slug = new URLSearchParams(query || '').get('p') || new URLSearchParams(query || '').get('c');
    if (slug) return `${file.replace('.html', '').replace('/', '')} · ${slug}`;
    // '/' is the process landing page, not the work grid — the grid moved to
    // /work.html. Labelling it "Home" would read as the portfolio.
    return file === '/' ? 'Process (landing)' : file.replace('.html', '').replace('/', '');
  };

  panel.replaceChildren(
    el(
      'div',
      { class: 'admin-panel__head' },
      el('h2', { class: 'admin-subhead' }, 'Analytics'),
      windowPicker
    ),
    el(
      'p',
      { class: 'admin-field__hint' },
      `${views.length.toLocaleString()} page views in the last ${analyticsDays} days. First-party, no cookies, nothing that identifies a visitor — and not audited: anyone can post rows with the public key, so read these as direction, not as evidence for a pitch.`
    ),
    funnelPanel(rows),
    el('h3', { class: 'admin-subhead' }, 'Most viewed'),
    rankedList(countBy(views, (r) => r.path), 'Nothing yet.', prettyPath),
    el('h3', { class: 'admin-subhead' }, 'Where they came from'),
    rankedList(
      countBy(views, (r) => r.referrer),
      'No referrers yet — every visit so far was typed in or came from a link with no referrer.'
    )
  );
}

async function renderSettingsTab(panel) {
  showLoading(panel);
  const ids = [...SETTINGS_FIELDS.map((f) => f.id), 'logo_url'];
  const { data, error } = await supabase.from('site_content').select('id, content').in('id', ids);
  if (error) {
    panel.replaceChildren(el('p', { class: 'admin-error', 'aria-live': 'polite' }, `Failed to load settings: ${error.message}`));
    return;
  }
  const values = Object.fromEntries((data || []).map((r) => [r.id, r.content]));

  const inputs = {};
  const fieldEls = SETTINGS_FIELDS.map((f) => {
    const control =
      f.type === 'textarea'
        ? el('textarea', { class: 'admin-textarea' }, values[f.id] || '')
        : el('input', { class: 'admin-input', value: values[f.id] || '' });
    inputs[f.id] = control;
    return field(f.label, control, f.hint);
  });

  const errorEl = el('p', { class: 'admin-error', 'aria-live': 'polite' });
  const saveBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'submit' }, 'Save settings');
  const form = el('form', { class: 'admin-form' }, ...fieldEls, errorEl, el('div', { class: 'admin-form__actions' }, saveBtn));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    try {
      const rows = SETTINGS_FIELDS.map((f) => ({ id: f.id, content: inputs[f.id].value }));
      await withSaveState(supabase.from('site_content').upsert(rows, { onConflict: 'id' }).throwOnError());
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  panel.replaceChildren(
    logoUploader(values.logo_url, () => renderSettingsTab(panel)),
    el('section', {}, el('h2', { class: 'admin-section__title' }, 'Site & Contact'), form)
  );
}

// --- Boot ------------------------------------------------------------------------
// The app is mounted ONCE per sign-in, not once per auth event. supabase-js
// re-emits SIGNED_IN whenever a background tab regains focus and its token is
// refreshed, so calling renderApp() straight from the listener tore the panel
// down and rebuilt it from scratch every time Jesse came back from another
// browser tab — losing the open project, the active tab and the scroll
// position. mountApp() is idempotent, so a refresh is now invisible.
let appMounted = false;

function mountApp() {
  if (appMounted) return;
  appMounted = true;
  renderApp();
}

function mountLogin(errorMessage) {
  appMounted = false;
  renderLogin(errorMessage);
}

supabase.auth.onAuthStateChange(async (event, session) => {
  // Only an explicit SIGNED_OUT tears the panel down. Returning to a tab that
  // has been backgrounded for a while fires a refresh, and a refresh can
  // briefly report no session before it settles — treating that as a sign-out
  // threw the whole app away and rebuilt it, which is the "it logged me out of
  // the project" symptom coming back by another route. So when an event
  // arrives without a session and isn't SIGNED_OUT, ask what the session
  // actually is before doing anything destructive.
  if (event === 'SIGNED_OUT') {
    mountLogin();
    return;
  }
  if (session) {
    mountApp();
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (data?.session) mountApp();
  else mountLogin();
});

const {
  data: { session },
} = await supabase.auth.getSession();
if (session) mountApp();
else mountLogin();
