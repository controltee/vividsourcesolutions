// estimate.js — the project estimator. This is the site's single call to
// action: the hero points here and nothing else competes with it.
//
// Shape, and why: three questions, then a RANGE shown immediately with no email
// asked for. The contact capture comes after the number. Asking for an address
// before showing anything is what makes most "get a quote" tools feel like a
// toll gate — the visitor pays first and finds out second. Here they get
// something real for free, and the detailed breakdown is a fair trade after.

import { qs, el, cacheWrite, cacheRead } from './util.js';
import { recordEvent } from './analytics.js';
import { WEB3FORMS_ACCESS_KEY, WEB3FORMS_ENDPOINT } from './config.js';

// ===========================================================================
// PRICING — THIS IS THE PART JESSE FILLS IN
// ===========================================================================
// While PLACEHOLDER_PRICING is true the estimator runs end to end, records the
// funnel and captures leads, but shows NO numbers — it says a figure follows
// within one working day instead. That is deliberate: a made-up range published
// on a live site is worse than no estimator at all, because the first lead who
// quotes it and gets a different answer has learned the studio's prices are not
// real.
//
// To switch it on: replace every `low`/`high` below with real figures, set
// CURRENCY, then set PLACEHOLDER_PRICING to false. Nothing else has to change.
//
// Three rules for the numbers, from bitter industry experience:
//   1. Keep each range inside roughly 2x low-to-high. "80,000 – 1,600,000"
//      reads as evasion and destroys the trust the tool exists to build. If the
//      work genuinely spans that much, add a tier — do not widen a band.
//   2. You must honour the bottom of every range. Quoting above your own
//      published floor costs you the lead at the exact moment they were ready.
//   3. These are published to the world, competitors included. That is the
//      trade for the conversion lift.
const PLACEHOLDER_PRICING = true;
const CURRENCY = 'KES';

const TIERS = {
  branding: [
    {
      id: 'identity-essentials',
      name: 'Identity essentials',
      deliverables: ['Logo system', 'Type and colour', 'One-page brand sheet'],
      low: 0,
      high: 0,
    },
    {
      id: 'full-identity',
      name: 'Full identity system',
      deliverables: [
        'Strategy and positioning',
        'Complete visual identity',
        'Brand guidelines',
        'Launch asset set',
      ],
      low: 0,
      high: 0,
    },
    {
      id: 'rollout',
      name: 'Identity + rollout',
      deliverables: [
        'Everything in the full identity',
        'Environmental and print application',
        'Templates your team can run',
        'Three months of design support',
      ],
      low: 0,
      high: 0,
    },
  ],
  content: [
    {
      id: 'single-campaign',
      name: 'Single campaign',
      deliverables: ['One concept', 'Up to 10 assets', 'Sized for two platforms'],
      low: 0,
      high: 0,
    },
    {
      id: 'content-sprint',
      name: '90-day content sprint',
      deliverables: [
        'Content strategy and calendar',
        'Monthly shoot or production day',
        '30+ assets a month',
        'Motion and static',
      ],
      low: 0,
      high: 0,
    },
    {
      id: 'retained-production',
      name: 'Retained production',
      deliverables: [
        'Ongoing monthly pipeline',
        'Dedicated production team',
        'Video, motion and stills',
        'Priority turnaround',
      ],
      low: 0,
      high: 0,
    },
  ],
};

// "Both" is not the two ranges added together: a client buying identity and
// production in one engagement shares strategy, research and a single
// onboarding across them. Charging twice for that work would be dishonest, and
// visitors notice when the combined price is exactly the sum.
const BOTH_DISCOUNT = 0.85;
const RUSH_MULTIPLIER = 1.3;

const PROJECT_TYPES = [
  { id: 'branding', label: 'Branding', note: 'Strategy, identity, the system itself.' },
  {
    id: 'content',
    label: 'Content Production',
    note: 'Campaigns, motion, video — work on a schedule.',
  },
  { id: 'both', label: 'Both', note: 'Build the brand, then keep it fed.' },
];

const TIMELINES = [
  { id: 'standard', label: 'Standard', note: 'The normal schedule for the scope.' },
  { id: 'rush', label: 'Rush', note: 'Compressed timeline, prioritised over other work.' },
];

const STORE_KEY = 'ct:estimate';
const app = qs('#estimate-app');

// A visitor who wanders off into a project page and comes back should not have
// to start again — that is a meaningful share of abandoned attempts recovered
// for about six lines. Guarded, so private browsing cannot throw here.
let state = cacheRead(STORE_KEY) || { type: null, tier: null, timeline: null };
let startRecorded = false;
let completeRecorded = false;

function persist() {
  cacheWrite(STORE_KEY, state);
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The tiers on offer depend on the type. "Both" is priced off the branding
// ladder, because the identity is what sets the size of the engagement.
const tiersFor = (type) => (type === 'content' ? TIERS.content : TIERS.branding);

function selectedTier() {
  return tiersFor(state.type)?.find((t) => t.id === state.tier) || null;
}

function priceRange() {
  const tier = selectedTier();
  if (!tier) return null;
  let { low, high } = tier;
  if (state.type === 'both') {
    const partner = TIERS.content[tiersFor('branding').indexOf(tier)] || TIERS.content[1];
    low = (low + partner.low) * BOTH_DISCOUNT;
    high = (high + partner.high) * BOTH_DISCOUNT;
  }
  if (state.timeline === 'rush') {
    low *= RUSH_MULTIPLIER;
    high *= RUSH_MULTIPLIER;
  }
  return { low: Math.round(low), high: Math.round(high) };
}

const money = (n) => `${CURRENCY} ${n.toLocaleString('en-KE')}`;

/** Counts a number up on reveal. The one place on this site where motion earns
 * its keep: it puts the eye on the figure that decides whether they enquire.
 * Still a fade and a settle — nothing bounces. */
function countUp(node, target, format) {
  if (prefersReducedMotion()) {
    node.textContent = format(target);
    return;
  }
  const DURATION = 400;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / DURATION);
    // Same curve as --ease-out, so it settles like everything else here.
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = format(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// --- Question rendering ------------------------------------------------------
// An answered question collapses to one line you can click to reopen. The
// alternative — every option staying on screen — turns three questions into a
// wall of twelve buttons, which is the "bloated form" feeling in a different
// costume.
function question({ number, legend, options, value, onPick, open }) {
  const answered = value != null;
  const chosen = options.find((o) => o.id === value);

  if (answered && !open) {
    const summary = el(
      'button',
      { class: 'estimate__answered', type: 'button' },
      el('span', { class: 'estimate__answered-legend' }, legend),
      el('span', { class: 'estimate__answered-value' }, chosen?.label || ''),
      el('span', { class: 'estimate__answered-change', 'aria-hidden': 'true' }, 'Change')
    );
    summary.addEventListener('click', () => render(number));
    return summary;
  }

  return el(
    'fieldset',
    { class: 'estimate__step' },
    el(
      'legend',
      { class: 'estimate__legend' },
      el('span', { class: 'estimate__step-number', 'aria-hidden': 'true' }, `${number}`),
      legend
    ),
    el(
      'div',
      { class: 'estimate__options' },
      ...options.map((option) => {
        const btn = el(
          'button',
          {
            class: option.id === value ? 'estimate__option is-selected' : 'estimate__option',
            type: 'button',
            'aria-pressed': option.id === value ? 'true' : 'false',
          },
          el('span', { class: 'estimate__option-label' }, option.label),
          option.note ? el('span', { class: 'estimate__option-note' }, option.note) : null,
          option.deliverables
            ? el(
                'ul',
                { class: 'estimate__option-list' },
                ...option.deliverables.map((d) => el('li', {}, d))
              )
            : null
        );
        btn.addEventListener('click', () => onPick(option.id));
        return btn;
      })
    )
  );
}

// --- Result ------------------------------------------------------------------
// Deliverables sit BESIDE the number, not under it. A price alone invites
// sticker shock; the same price next to a concrete list of what lands in the
// client's hands reads as value. Identical data, materially different response.
function resultPanel() {
  const tier = selectedTier();

  const figure = PLACEHOLDER_PRICING
    ? el(
        'div',
        { class: 'estimate__pending' },
        el('p', { class: 'estimate__pending-lead' }, 'We’ll send your figure within one working day.'),
        el(
          'p',
          { class: 'estimate__pending-note' },
          'Every project at this scope is quoted on its specifics rather than off a table — leave your details and we’ll come back with a real number, not a bracket.'
        )
      )
    : el(
        'div',
        { class: 'estimate__figure' },
        el('p', { class: 'estimate__figure-label' }, 'Indicative range'),
        el(
          'p',
          { class: 'estimate__figure-value' },
          el('span', { class: 'estimate__amount', id: 'estimate-low' }, money(0)),
          el('span', { class: 'estimate__figure-dash', 'aria-hidden': 'true' }, '–'),
          el('span', { class: 'estimate__amount', id: 'estimate-high' }, money(0))
        ),
        el(
          'p',
          { class: 'estimate__figure-note' },
          state.timeline === 'rush'
            ? 'Includes the rush schedule. Final figure confirmed after a short call.'
            : 'Final figure confirmed after a short call.'
        )
      );

  const panel = el(
    'div',
    { class: 'estimate__result' },
    el(
      'div',
      { class: 'estimate__result-grid' },
      figure,
      el(
        'div',
        { class: 'estimate__included' },
        el('h2', { class: 'estimate__included-title' }, `${tier.name} — what’s included`),
        el(
          'ul',
          { class: 'estimate__included-list' },
          ...tier.deliverables.map((d) => el('li', {}, d))
        )
      )
    ),
    captureForm()
  );

  return panel;
}

function captureForm() {
  const nameInput = el('input', {
    class: 'estimate__input',
    name: 'name',
    type: 'text',
    required: true,
    autocomplete: 'name',
    'aria-label': 'Your name',
    placeholder: 'Your name',
  });
  const emailInput = el('input', {
    class: 'estimate__input',
    name: 'email',
    type: 'email',
    required: true,
    autocomplete: 'email',
    'aria-label': 'Email',
    placeholder: 'Email',
  });
  const submit = el(
    'button',
    { class: 'estimate__submit', type: 'submit' },
    'Send me the full breakdown'
  );
  const status = el('p', { class: 'estimate__status', role: 'status', 'aria-live': 'polite' });

  const form = el(
    'form',
    { class: 'estimate__capture' },
    el(
      'h2',
      { class: 'estimate__capture-title' },
      'Want the full breakdown of what’s included?'
    ),
    el('div', { class: 'estimate__capture-fields' }, nameInput, emailInput, submit),
    // Honeypot, same device the contact form uses: real people never see it,
    // and anything that fills it in is not a person.
    el('input', {
      class: 'estimate__botcheck',
      type: 'checkbox',
      name: 'botcheck',
      tabindex: '-1',
      autocomplete: 'off',
      'aria-hidden': 'true',
    }),
    status
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!nameInput.value.trim() || !emailInput.checkValidity()) {
      status.textContent = 'A name and a working email address, and it’s on its way.';
      (nameInput.value.trim() ? emailInput : nameInput).focus();
      return;
    }

    const tier = selectedTier();
    const range = priceRange();
    const data = new FormData(form);
    data.append('access_key', WEB3FORMS_ACCESS_KEY);
    data.append('subject', `Estimate request — ${tier.name} (${state.type})`);
    data.append('from_name', 'Control Tee estimator');
    data.append('Project type', state.type);
    data.append('Scope', tier.name);
    data.append('Timeline', state.timeline);
    data.append(
      'Range shown',
      PLACEHOLDER_PRICING ? 'none — pricing not yet published' : `${money(range.low)} – ${money(range.high)}`
    );

    submit.disabled = true;
    submit.textContent = 'Sending…';
    try {
      const response = await fetch(WEB3FORMS_ENDPOINT, { method: 'POST', body: data });
      if (!response.ok) throw new Error('rejected');
      recordEvent('estimate_submit');
      form.replaceChildren(
        el('p', { class: 'estimate__sent' }, 'On its way. We’ll be in touch within one working day.')
      );
    } catch {
      status.textContent = 'That didn’t send. Try again in a moment, or use the contact form.';
      submit.disabled = false;
      submit.textContent = 'Send me the full breakdown';
    }
  });

  return form;
}

// --- Orchestration -----------------------------------------------------------
// `openStep` is which question is expanded. Everything before it is collapsed
// to its answer; everything after it is not shown at all, so the visitor only
// ever sees one decision.
function render(openStep) {
  const step = openStep ?? (!state.type ? 1 : !state.tier ? 2 : !state.timeline ? 3 : 4);
  const children = [];

  children.push(
    question({
      number: 1,
      legend: 'What do you need?',
      options: PROJECT_TYPES,
      value: state.type,
      open: step === 1,
      onPick: (id) => {
        // Changing the type invalidates the tier: the ladders differ.
        if (state.type !== id) state.tier = null;
        state.type = id;
        if (!startRecorded) {
          startRecorded = true;
          recordEvent('estimate_start');
        }
        persist();
        render();
      },
    })
  );

  if (state.type) {
    children.push(
      question({
        number: 2,
        legend: 'How much of it?',
        options: tiersFor(state.type).map((t) => ({
          id: t.id,
          label: t.name,
          deliverables: t.deliverables,
        })),
        value: state.tier,
        open: step === 2,
        onPick: (id) => {
          state.tier = id;
          persist();
          render();
        },
      })
    );
  }

  if (state.type && state.tier) {
    children.push(
      question({
        number: 3,
        legend: 'When do you need it?',
        options: TIMELINES,
        value: state.timeline,
        open: step === 3,
        onPick: (id) => {
          state.timeline = id;
          persist();
          render();
        },
      })
    );
  }

  const done = state.type && state.tier && state.timeline;
  if (done && step === 4) {
    children.push(resultPanel());
    if (!completeRecorded) {
      completeRecorded = true;
      recordEvent('estimate_complete');
    }
  }

  app.replaceChildren(...children);
  app.hidden = false;

  if (done && step === 4 && !PLACEHOLDER_PRICING) {
    const range = priceRange();
    countUp(qs('#estimate-low'), range.low, money);
    countUp(qs('#estimate-high'), range.high, money);
  }
}

if (app) render();
