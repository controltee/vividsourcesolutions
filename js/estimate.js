// estimate.js — the project qualifier. This is the site's single call to
// action: the hero points here and nothing else competes with it.
//
// IT PUBLISHES NO PRICES, DELIBERATELY. An earlier draft showed a range. The
// problem with that is anchoring: a client with three million budgeted who
// reads "from four hundred thousand" negotiates from four hundred thousand, and
// the studio never finds out what it left on the table. A published floor caps
// your ceiling on every job, invisibly.
//
// So the number goes the other way. The visitor names THEIR budget, the studio
// names none, and the quote happens in the discovery call once the project is
// actually understood. Three consequences, all good: nothing anchors the studio
// down, no-budget enquiries filter themselves out, and after a few dozen
// submissions there is real data on what this market pays — which is the only
// thing that ever fixes pricing confidence.

import { qs, el, cacheWrite, cacheRead } from './util.js';
import { recordEvent } from './analytics.js';
import { WEB3FORMS_ACCESS_KEY, WEB3FORMS_ENDPOINT } from './config.js';

// ===========================================================================
// BUDGET BANDS — PLACEHOLDER NUMBERS, JESSE REPLACES THESE
// ===========================================================================
// These four boundaries are STRUCTURAL PLACEHOLDERS so the flow can be
// previewed. They are not a recommendation and they are not researched — I do
// not know what Nairobi studio work bills at, and guessing at it here is the
// exact mistake this file exists to avoid.
//
// Set them where your own projects actually cluster, so the answer tells you
// something. Two rules:
//   1. The top band stays OPEN-ENDED ("and above"). That is where the upside
//      is, and you want that client raising their hand rather than being
//      squeezed into a bracket with a ceiling.
//   2. "Not sure yet" stays. Plenty of first-time buyers of brand work
//      genuinely have no figure, and without this option they abandon at the
//      last question instead of becoming a lead.
//
// These bands are visible to visitors. They disclose the range you will
// ENTERTAIN, which is a much cheaper disclosure than what you CHARGE.
const BUDGET_BANDS_ARE_PLACEHOLDER = true;
const BUDGET_BANDS = [
  { id: 'band-1', label: 'Under KES 250,000' },
  { id: 'band-2', label: 'KES 250,000 – 750,000' },
  { id: 'band-3', label: 'KES 750,000 – 2,000,000' },
  { id: 'band-4', label: 'KES 2,000,000 and above' },
  { id: 'unsure', label: 'Not sure yet', note: 'Fine — we’ll work it out on the call.' },
];

// The Google Appointment Schedule already used on /contact.html. Same calendar,
// same CSP allowance (frame-src calendar.google.com) — no new dependency and no
// second booking system to keep in step.
const BOOKING_EMBED =
  'https://calendar.google.com/calendar/appointments/schedules/AcZssZ1Pp0n-nkuiI7-U85fburHPhb0qw3ir6a5lzVc_SWhqw277ACblxHpR8PlwclLw6OuxkjtphgMf?gv=true';
const BOOKING_LINK = 'https://calendar.app.google/8iF7VTC8a88wDPkJA';

const TIERS = {
  branding: [
    {
      id: 'identity-essentials',
      name: 'Identity essentials',
      deliverables: ['Logo system', 'Type and colour', 'One-page brand sheet'],
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
    },
  ],
  content: [
    {
      id: 'single-campaign',
      name: 'Single campaign',
      deliverables: ['One concept', 'Up to 10 assets', 'Sized for two platforms'],
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
    },
  ],
};

const PROJECT_TYPES = [
  { id: 'branding', label: 'Branding', note: 'Strategy, identity, the system itself.' },
  {
    id: 'content',
    label: 'Content Production',
    note: 'Campaigns, motion, video — work on a schedule.',
  },
  { id: 'both', label: 'Both', note: 'Build the brand, then keep it fed.' },
];

const STORE_KEY = 'ct:estimate';
const app = qs('#estimate-app');

// A visitor who wanders into a project page and comes back should not have to
// start again — a meaningful share of abandoned attempts recovered for about
// six lines. Guarded, so private browsing cannot throw here.
let state = cacheRead(STORE_KEY) || { type: null, tier: null, budget: null };
let startRecorded = false;
let completeRecorded = false;

const persist = () => cacheWrite(STORE_KEY, state);

// "Both" is priced and scoped off the branding ladder: the identity is what
// sets the size of the engagement.
const tiersFor = (type) => (type === 'content' ? TIERS.content : TIERS.branding);
const selectedTier = () => tiersFor(state.type)?.find((t) => t.id === state.tier) || null;
const selectedBand = () => BUDGET_BANDS.find((b) => b.id === state.budget) || null;
const typeLabel = () => PROJECT_TYPES.find((t) => t.id === state.type)?.label || '';

// --- Question rendering ------------------------------------------------------
// An answered question collapses to one line you can click to reopen, and the
// next question only appears once the last is answered. Every option on screen
// at once would be fourteen buttons, which is the "bloated form" feeling in a
// different costume.
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
// No number here. What the visitor gets for their three answers is the sense of
// having been understood — their brief read back to them, and exactly what the
// engagement contains — followed by the shortest possible route to a human.
function resultPanel() {
  const tier = selectedTier();

  return el(
    'div',
    { class: 'estimate__result' },
    el(
      'div',
      { class: 'estimate__result-grid' },
      el(
        'div',
        { class: 'estimate__brief' },
        el('p', { class: 'estimate__figure-label' }, 'Your brief'),
        el(
          'ul',
          { class: 'estimate__brief-list' },
          el('li', {}, el('span', {}, 'Need'), el('strong', {}, typeLabel())),
          el('li', {}, el('span', {}, 'Scope'), el('strong', {}, tier.name)),
          el('li', {}, el('span', {}, 'Budget'), el('strong', {}, selectedBand()?.label || '—'))
        ),
        el(
          'p',
          { class: 'estimate__figure-note' },
          'We quote on the call, once we understand the project properly. A figure guessed from three answers would only have to be revised — and you would have anchored on it by then.'
        )
      ),
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
}

// The booking calendar, revealed only AFTER the details are captured. Booking is
// deliberately never the only route out of this page: a visitor who is
// interested but cannot commit half an hour right now — evenings, a phone
// between meetings — would otherwise leave no trace at all. Capture is the
// floor, a booked call is the upside.
function bookingPanel() {
  return el(
    'div',
    { class: 'estimate__booking' },
    el('h2', { class: 'estimate__booking-title' }, 'Now pick a time'),
    el(
      'p',
      { class: 'estimate__booking-lede' },
      'Thirty minutes. We’ll have read your brief before you join, and you’ll leave the call with a real figure.'
    ),
    el(
      'div',
      { class: 'booking__frame' },
      el('iframe', {
        src: BOOKING_EMBED,
        title: 'Book a discovery call with Control Tee',
        loading: 'lazy',
        referrerpolicy: 'no-referrer-when-downgrade',
      })
    ),
    el(
      'p',
      { class: 'booking__fallback' },
      'Trouble loading? ',
      el(
        'a',
        { href: BOOKING_LINK, target: '_blank', rel: 'noopener noreferrer' },
        'Open the booking page in a new tab'
      ),
      '.'
    )
  );
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
  const submit = el('button', { class: 'estimate__submit', type: 'submit' }, 'Send brief & book a call');
  const status = el('p', { class: 'estimate__status', role: 'status', 'aria-live': 'polite' });

  const form = el(
    'form',
    { class: 'estimate__capture' },
    el('h2', { class: 'estimate__capture-title' }, 'Send this brief and pick a time'),
    el(
      'p',
      { class: 'estimate__capture-note' },
      'Your answers reach us either way — booking a slot is optional, and you can always reply to the email instead.'
    ),
    el('div', { class: 'estimate__capture-fields' }, nameInput, emailInput, submit),
    // Honeypot, same device the contact form uses: real people never see it,
    // and anything filling it in is not a person.
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
    const data = new FormData(form);
    data.append('access_key', WEB3FORMS_ACCESS_KEY);
    data.append('subject', `Discovery request — ${tier.name} (${typeLabel()})`);
    data.append('from_name', 'Control Tee estimator');
    // So hitting Reply in the inbox answers the CLIENT, not the form service.
    data.append('replyto', emailInput.value.trim());
    data.append('Project type', typeLabel());
    data.append('Scope', tier.name);
    // The whole point of the redesign: the budget arrives BEFORE any figure is
    // named, so the call starts from their number rather than from ours.
    data.append('Budget', selectedBand()?.label || 'not given');

    submit.disabled = true;
    submit.textContent = 'Sending…';
    try {
      const response = await fetch(WEB3FORMS_ENDPOINT, { method: 'POST', body: data });
      if (!response.ok) throw new Error('rejected');
      recordEvent('estimate_submit');
      const sent = el(
        'div',
        { class: 'estimate__sent-block' },
        el('p', { class: 'estimate__sent' }, 'Brief received. We’ll reply within one working day.')
      );
      form.replaceChildren(sent);
      // Revealed rather than navigated to: the visitor stays on the page they
      // already trust, and the calendar arrives as a next step rather than as
      // a redirect that feels like being handed off.
      form.after(bookingPanel());
    } catch {
      status.textContent = 'That didn’t send. Try again in a moment, or use the contact form.';
      submit.disabled = false;
      submit.textContent = 'Send brief & book a call';
    }
  });

  return form;
}

// --- Orchestration -----------------------------------------------------------
// `openStep` is which question is expanded. Everything before it collapses to
// its answer; everything after is not shown at all, so the visitor only ever
// faces one decision.
function render(openStep) {
  const step = openStep ?? (!state.type ? 1 : !state.tier ? 2 : !state.budget ? 3 : 4);
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
        // Asked third on purpose. It is the only uncomfortable question here,
        // and by now the visitor has already invested two answers — abandonment
        // at question three is far lower than at question one. This is the
        // cheapest place on the page to ask it.
        legend: 'What have you budgeted?',
        options: BUDGET_BANDS,
        value: state.budget,
        open: step === 3,
        onPick: (id) => {
          state.budget = id;
          persist();
          render();
        },
      })
    );
  }

  const done = state.type && state.tier && state.budget;
  if (done && step === 4) {
    children.push(resultPanel());
    if (!completeRecorded) {
      completeRecorded = true;
      recordEvent('estimate_complete');
    }
  }

  app.replaceChildren(...children);
  app.hidden = false;
}

if (app) render();
