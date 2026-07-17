# Control Tee — portfolio site

Portfolio for Control Tee, a Nairobi design studio. Vanilla HTML/CSS/JS — no build
step, no frameworks, no bundler. Files are served exactly as written.

- **Host:** Vercel
- **Backend:** Supabase (auth + Postgres + Storage), project `ccaggjhyeygyosbdnxmq`
- **Runtime deps:** Supabase JS, loaded from CDN as an ES module. Nothing else.

## Structure

```
index.html          home — rail + project grid
project.html        single project — rail + description + media
about.html
admin/              login + CMS panel
css/                tokens, reset, shell, per-page styles
js/                 config, supabase client, shell, per-page logic
fonts/              self-hosted .woff2 (Cabinet Grotesk, DM Sans)
img/                static site chrome only (never project assets)
scripts/            offline image pipeline (sharp) — dev only, never runs on server
sql/                schema, RLS, seed
```

## Local development

No build. Serve the repo root with any static server, e.g.:

```
npx serve .        # or: python -m http.server
```

## Image pipeline

Project images are optimized offline before commit — no raw JPEG/PNG is referenced
in production.

```
cd scripts && npm install      # sharp, dev only (node_modules gitignored)
npm run img -- ../raw/<folder>
```

## Deploy

```
vercel --prod
```

## Conventions

See [CLAUDE.md](CLAUDE.md) for the hard rules (design tokens, accessibility,
CSP, no inline styles/scripts).
