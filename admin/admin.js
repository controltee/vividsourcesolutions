// admin.js — the CMS. Supabase email/password auth gate, then Categories,
// Projects (+ per-project gallery), and Site & Contact settings.
//
// No framework: each tab is a render(panel) function that fetches, builds
// DOM with el(), and wires listeners. Re-rendering a tab after a mutation is
// the whole "state management" story, which is fine at this data size.

import { supabase } from '../js/supabase.js';
import { el, qs, qsa } from '../js/util.js';

const root = qs('#admin-root');
const BUCKET = 'portfolio_assets';
const MAX_UPLOAD_DIMENSION = 1920;
const WARN_BYTES = 500 * 1024;

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
  indicator.dataset.state = state;
  indicator.textContent = message ?? { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Error' }[state] ?? '';
  if (state === 'saved') setTimeout(() => { if (indicator.dataset.state === 'saved') setSaveState('idle'); }, 2000);
}

async function withSaveState(promise) {
  setSaveState('saving');
  try {
    const result = await promise;
    setSaveState('saved');
    return result;
  } catch (err) {
    setSaveState('error', `Error: ${err.message}`);
    throw err;
  }
}

// --- Small shared helpers ----------------------------------------------------
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

function fieldSizeWarning(bytes) {
  return bytes > WARN_BYTES
    ? el(
        'p',
        { class: 'admin-error', 'aria-live': 'polite' },
        `Heads up: this upload is ${(bytes / 1024).toFixed(0)}KB after compression — over the 500KB target.`
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
  { id: 'categories', label: 'Categories' },
  { id: 'settings', label: 'Site & Contact' },
];
let activeTabId = 'projects';

function renderApp() {
  const topbar = el(
    'header',
    { class: 'admin-topbar' },
    el('div', { class: 'admin-topbar__brand' }, 'Control Tee — Admin'),
    el(
      'div',
      { class: 'admin-topbar__right' },
      el('span', { class: 'admin-save-state', id: 'save-state', 'aria-live': 'polite' }),
      el('button', { class: 'admin-btn', id: 'logout-btn', type: 'button' }, 'Sign out')
    )
  );

  const tabButtons = TABS.map((t) =>
    el(
      'button',
      {
        class: 'admin-tab',
        type: 'button',
        role: 'tab',
        'aria-selected': String(t.id === activeTabId),
        'data-tab': t.id,
      },
      t.label
    )
  );
  const tabsNav = el('nav', { class: 'admin-tabs', role: 'tablist', 'aria-label': 'Admin sections' }, ...tabButtons);
  const panel = el('div', { class: 'admin-panel', id: 'admin-panel' });

  root.replaceChildren(el('div', { class: 'admin-app' }, topbar, tabsNav, panel));

  qs('#logout-btn').addEventListener('click', () => supabase.auth.signOut());
  tabButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      activeTabId = btn.dataset.tab;
      renderApp();
    })
  );

  if (activeTabId === 'categories') renderCategoriesTab(panel);
  else if (activeTabId === 'settings') renderSettingsTab(panel);
  else renderProjectsTab(panel);
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
    alert(`Can’t delete — ${projectCount} project(s) still use this category. Move or delete them first.`);
    return;
  }
  if (!confirm('Delete this category? This can’t be undone.')) return;
  await withSaveState(supabase.from('categories').delete().eq('id', id).throwOnError());
  renderCategoriesTab(panel);
}

async function renderCategoriesTab(panel) {
  panel.replaceChildren(el('p', {}, 'Loading…'));

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
  { value: 'deck', label: 'Deck', hint: '16:9 slides, one per row, full width. No lightbox — read in sequence.' },
  { value: 'reel', label: 'Reel', hint: 'A single video, poster frame + click to play.' },
];

async function fetchClients() {
  const { data } = await supabase.from('clients').select('id, name').order('name');
  return data || [];
}

function projectForm(project, categories, clients, onSaved) {
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
    ...clients.map((c) => el('option', { value: c.id, selected: c.id === project?.client_id }, c.name)),
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

  const isPublished = el('input', { type: 'checkbox', checked: project?.is_published ?? true });

  const coverInput = el('input', { type: 'file', accept: 'image/*' });
  const coverPreview = el(
    'div',
    {},
    project?.cover_url ? el('img', { src: project.cover_url, alt: '', style: 'max-width:160px;display:block' }) : null
  );
  let pendingCover = null;
  const coverWarning = el('div');
  coverInput.addEventListener('change', async () => {
    const file = coverInput.files[0];
    if (!file) return;
    coverWarning.replaceChildren(el('p', { class: 'admin-field__hint' }, 'Compressing…'));
    pendingCover = await compressImage(file);
    coverWarning.replaceChildren(fieldSizeWarning(pendingCover.blob.size));
    coverPreview.replaceChildren(el('img', { src: URL.createObjectURL(pendingCover.blob), alt: '', style: 'max-width:160px;display:block' }));
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
      field('Client', [clientSelect, newClientInput])
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

  cancelBtn?.addEventListener('click', () => renderProjectsTab(qs('#admin-panel')));

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
        const { data, error } = await supabase.from('clients').insert({ name }).select('id').single();
        if (error) throw error;
        clientId = data.id;
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

async function moveProject(projectsInCategory, id, direction) {
  const i = projectsInCategory.findIndex((p) => p.id === id);
  const j = i + direction;
  if (j < 0 || j >= projectsInCategory.length) return;
  const a = projectsInCategory[i];
  const b = projectsInCategory[j];
  await withSaveState(
    Promise.all([
      supabase.from('projects').update({ sort_order: b.sort_order }).eq('id', a.id).throwOnError(),
      supabase.from('projects').update({ sort_order: a.sort_order }).eq('id', b.id).throwOnError(),
    ])
  );
  renderProjectsTab(qs('#admin-panel'));
}

async function deleteProject(project) {
  if (!confirm(`Delete "${project.title}"? This removes its gallery images and can’t be undone.`)) return;
  await withSaveState(
    (async () => {
      const { data: media } = await supabase.from('project_media').select('media_url').eq('project_id', project.id);
      const paths = (media || []).map((m) => storagePathFromUrl(m.media_url)).filter(Boolean);
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
  panel.replaceChildren(el('p', {}, 'Loading…'));

  const [{ data: categories }, { data: projects, error }, clients] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('projects').select('*').order('category_id').order('sort_order'),
    fetchClients(),
  ]);
  if (error) {
    panel.replaceChildren(el('p', { class: 'admin-error', 'aria-live': 'polite' }, `Failed to load projects: ${error.message}`));
    return;
  }

  const categoryById = new Map((categories || []).map((c) => [c.id, c]));
  const byCategory = new Map();
  for (const p of projects) {
    if (!byCategory.has(p.category_id)) byCategory.set(p.category_id, []);
    byCategory.get(p.category_id).push(p);
  }

  const sections = [];
  for (const [categoryId, list] of byCategory) {
    const rows = list.map((p, i) => {
      const editBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button' }, 'Edit');
      const galleryBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button' }, 'Gallery');
      const upBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', disabled: i === 0 }, '↑');
      const downBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', disabled: i === list.length - 1 }, '↓');
      const deleteBtn = el('button', { class: 'admin-btn admin-btn--icon admin-btn--danger', type: 'button' }, 'Delete');

      upBtn.addEventListener('click', () => moveProject(list, p.id, -1));
      downBtn.addEventListener('click', () => moveProject(list, p.id, 1));
      deleteBtn.addEventListener('click', () => deleteProject(p));
      editBtn.addEventListener('click', () => renderProjectEditor(panel, p, categories, clients));
      galleryBtn.addEventListener('click', () => renderProjectEditor(panel, p, categories, clients, { showGallery: true }));

      return el(
        'div',
        { class: 'admin-list__row' },
        el(
          'div',
          { class: 'admin-list__main' },
          el('span', { class: 'admin-list__title' }, p.title),
          el('span', { class: 'admin-list__meta' }, `/${p.slug || '(no slug)'} · ${p.layout}`)
        ),
        el('span', { class: `admin-badge${p.is_published ? ' admin-badge--live' : ''}` }, p.is_published ? 'Live' : 'Draft'),
        el('div', { class: 'admin-list__actions' }, upBtn, downBtn, galleryBtn, editBtn, deleteBtn)
      );
    });

    sections.push(
      el(
        'section',
        {},
        el('h2', { class: 'admin-section__title' }, categoryById.get(categoryId)?.name || 'Uncategorized'),
        el('div', { class: 'admin-list' }, ...rows)
      )
    );
  }

  const newBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'button' }, '+ New project');
  newBtn.addEventListener('click', () => renderProjectEditor(panel, null, categories, clients));

  panel.replaceChildren(el('div', { class: 'admin-form__actions' }, newBtn), ...sections);

  if (focusProjectId) {
    const project = projects.find((p) => p.id === focusProjectId);
    if (project) renderProjectEditor(panel, project, categories, clients, { showGallery: true });
  }
}

function renderProjectEditor(panel, project, categories, clients, { showGallery = false } = {}) {
  const form = projectForm(project, categories, clients, (savedId) => renderProjectsTab(panel, savedId));
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
async function moveAsset(assets, id, direction) {
  const i = assets.findIndex((a) => a.id === id);
  const j = i + direction;
  if (j < 0 || j >= assets.length) return;
  const a = assets[i];
  const b = assets[j];
  await withSaveState(
    Promise.all([
      supabase.from('project_media').update({ sort_order: b.sort_order }).eq('id', a.id).throwOnError(),
      supabase.from('project_media').update({ sort_order: a.sort_order }).eq('id', b.id).throwOnError(),
    ])
  );
}

async function deleteAsset(asset) {
  if (!confirm('Remove this image from the gallery?')) return;
  const path = storagePathFromUrl(asset.media_url);
  await withSaveState(
    (async () => {
      if (path) await supabase.storage.from(BUCKET).remove([path]);
      await supabase.from('project_media').delete().eq('id', asset.id).throwOnError();
    })()
  );
}

async function renderGalleryManager(container, project) {
  container.replaceChildren(el('p', {}, 'Loading gallery…'));
  const { data: assets, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order');
  if (error) {
    container.replaceChildren(el('p', { class: 'admin-error', 'aria-live': 'polite' }, `Failed to load gallery: ${error.message}`));
    return;
  }

  const grid = el('div', { class: 'admin-asset-grid' });
  assets.forEach((asset, i) => {
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
    const upBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', disabled: i === 0 }, '↑');
    const downBtn = el('button', { class: 'admin-btn admin-btn--icon', type: 'button', disabled: i === assets.length - 1 }, '↓');
    const deleteBtn = el('button', { class: 'admin-btn admin-btn--icon admin-btn--danger', type: 'button' }, 'Delete');
    const errorEl = el('p', { class: 'admin-error', 'aria-live': 'polite' });

    saveBtn.addEventListener('click', async () => {
      const alt = altInput.value.trim();
      if (!alt) {
        errorEl.textContent = 'Alt text is required.';
        return;
      }
      errorEl.textContent = '';
      await withSaveState(
        supabase
          .from('project_media')
          .update({ alt, caption: captionInput.value.trim() || null })
          .eq('id', asset.id)
          .throwOnError()
      );
    });
    upBtn.addEventListener('click', async () => {
      await moveAsset(assets, asset.id, -1);
      renderGalleryManager(container, project);
    });
    downBtn.addEventListener('click', async () => {
      await moveAsset(assets, asset.id, 1);
      renderGalleryManager(container, project);
    });
    deleteBtn.addEventListener('click', async () => {
      await deleteAsset(asset);
      renderGalleryManager(container, project);
    });

    grid.append(
      el(
        'figure',
        { class: 'admin-asset' },
        el('img', { src: asset.media_url, alt: '', width: asset.width || false, height: asset.height || false }),
        altInput,
        captionInput,
        errorEl,
        el('div', { class: 'admin-asset__actions' }, upBtn, downBtn, saveBtn, deleteBtn)
      )
    );
  });

  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true });
  const uploadStatus = el('p', { class: 'admin-field__hint', 'aria-live': 'polite' });
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    if (!files.length) return;
    const { data: maxRow } = await supabase
      .from('project_media')
      .select('sort_order')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: false })
      .limit(1);
    let nextSort = (maxRow?.[0]?.sort_order ?? -1) + 1;

    for (const [i, file] of files.entries()) {
      uploadStatus.textContent = `Uploading ${i + 1} of ${files.length}…`;
      const uploaded = await uploadImage(file, project.slug, `gallery-${nextSort}`);
      await supabase.from('project_media').insert({
        project_id: project.id,
        media_url: uploaded.url,
        width: uploaded.width,
        height: uploaded.height,
        kind: 'image',
        alt: '',
        sort_order: nextSort,
      });
      if (uploaded.bytes > WARN_BYTES) {
        uploadStatus.append(
          el('span', { class: 'admin-error', 'aria-live': 'polite' }, ` ${file.name}: ${(uploaded.bytes / 1024).toFixed(0)}KB after compression.`)
        );
      }
      nextSort += 1;
    }
    uploadStatus.textContent = 'Done. Add alt text below before publishing.';
    renderGalleryManager(container, project);
  });

  container.replaceChildren(
    grid,
    el('div', { class: 'admin-dropzone' }, el('label', {}, 'Add images: ', fileInput), uploadStatus)
  );
}

// --- Site & Contact settings tab ------------------------------------------------
const SETTINGS_FIELDS = [
  { id: 'contact_email', label: 'Contact email', hint: 'Used for the rail’s Contact link (mailto:).', type: 'input' },
  { id: 'social_instagram_url', label: 'Instagram URL', type: 'input' },
  { id: 'social_behance_url', label: 'Behance URL', type: 'input' },
  { id: 'social_linkedin_url', label: 'LinkedIn URL', type: 'input' },
  { id: 'about_headline', label: 'About: headline', type: 'input' },
  { id: 'about_body', label: 'About: body (HTML)', type: 'textarea' },
  { id: 'contact_body', label: 'Contact: intro (HTML)', type: 'textarea' },
];

async function renderSettingsTab(panel) {
  panel.replaceChildren(el('p', {}, 'Loading…'));
  const ids = SETTINGS_FIELDS.map((f) => f.id);
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

  panel.replaceChildren(el('section', {}, el('h2', { class: 'admin-section__title' }, 'Site & Contact'), form));
}

// --- Boot ------------------------------------------------------------------------
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') renderApp();
  else if (event === 'SIGNED_OUT') renderLogin();
});

const {
  data: { session },
} = await supabase.auth.getSession();
if (session) renderApp();
else renderLogin();
