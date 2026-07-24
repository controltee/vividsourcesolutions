// check-auth.mjs — proves scripts/.env is wired up correctly, and nothing else.
//
// Run:  npm run check-auth        (from inside /scripts)
//
// Prints only whether the sign in worked, the user id, and the role. It never
// prints the password, the access token, or the contents of .env. If this says
// OK, the ingest script has everything it needs.
//
// No dependencies: Node 24 has global fetch, and the anon key already lives in
// js/config.js (public by design — RLS is the real boundary). Adding a Supabase
// SDK here would mean a new runtime dependency, which CLAUDE.md rules out
// without asking first.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';

const email = process.env.CT_ADMIN_EMAIL;
const password = process.env.CT_ADMIN_PASSWORD;

function fail(message, hint) {
  console.error(`\n  FAILED: ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

if (!email || !password) {
  fail(
    'CT_ADMIN_EMAIL / CT_ADMIN_PASSWORD are not set.',
    'Did you run this with  --env-file=.env  ? Use: npm run check-auth'
  );
}
if (email.startsWith('replace-with') || password.startsWith('replace-with')) {
  fail(
    'scripts/.env still holds the placeholder values.',
    'Open scripts/.env and put the real ingest user email and password in.'
  );
}

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

if (!res.ok) {
  // Surface Supabase's own error text, which describes the failure without
  // echoing anything secret back.
  const body = await res.json().catch(() => ({}));

  // Shape-only diagnostics. These describe the SHAPE of what was read from
  // .env — length, stray quotes, stray whitespace — and never the value
  // itself, so the output stays safe to paste into a chat. Copy/paste from a
  // dashboard is the usual culprit and all three show up here.
  const shape = (label, v) => {
    const notes = [];
    if (/^["'].*["']$/.test(v)) notes.push('WRAPPED IN QUOTES (remove them)');
    if (v !== v.trim()) notes.push('HAS LEADING/TRAILING WHITESPACE (remove it)');
    return `  ${label}: ${v.length} characters${notes.length ? ' — ' + notes.join(', ') : ''}`;
  };

  console.error(`\n  FAILED: Supabase rejected the sign in.`);
  console.error(`  HTTP ${res.status}: ${body.error_description || body.msg || body.error || 'unknown'}`);
  console.error(`\n  What was read from scripts/.env (shape only, never the value):`);
  console.error(shape('email   ', email));
  console.error(shape('password', password));
  if (res.status === 400) {
    console.error(`\n  "Invalid login credentials" means the email and password pair did not match.`);
    console.error(`  Most likely one of:`);
    console.error(`    1. The password was changed in the Supabase dashboard but scripts/.env still has the old one.`);
    console.error(`    2. The value got pasted with quotes or a trailing space (see the shape check above).`);
    console.error(`    3. The dashboard reset was never actually saved.`);
    console.error(`    4. The user is not confirmed. Dashboard > Authentication > Users, tick "Auto Confirm User".`);
  }
  process.exit(1);
}

const session = await res.json();
const role = session.user?.role ?? 'unknown';
console.log(`\n  OK. Signed in as ${session.user?.email}`);
console.log(`  user id: ${session.user?.id}`);
console.log(`  role:    ${role}`);

if (role !== 'authenticated') {
  console.log(`\n  Warning: expected role "authenticated". RLS grants writes to that role only.`);
} else {
  console.log(`\n  This account can write. The ingest script is ready to run.`);
}
