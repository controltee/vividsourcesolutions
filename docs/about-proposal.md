# About section rewrite, for approval

**Nothing in here has been written to the database.** The live About page is unchanged.
Everything below is ready to paste into **/admin → Site & Contact** once you approve it.

Written from the LinkedIn copy you gave me, plus the two facts that were not on
LinkedIn and are the most useful things in the whole page: **2022** and **self taught**.

All copy below is free of em dashes and of hyphens used as punctuation, per your note.

---

## 1. Headline

**Current:** `Creativity`

**Proposed:** `Free To Transform`

Your own tagline, and it does two jobs at once where the current one does none.
"Creativity" is a category, not a claim. Every studio on earth could put it up.
"Free To Transform" says what the work is for and quietly explains the name, which
means the CTRL+T story lands before anyone has to read a paragraph about it.

**Field:** `about_headline`

```
Free To Transform
```

---

## 2. Body

**Current:** two paragraphs, both about what the studio believes. No founding date,
no person, no proof.

**Proposed:** keeps the CTRL+T origin, adds the story, ends on how the work is
actually made. `about_body` stores HTML, so paste this in exactly as it is.

**Field:** `about_body`

```html
<p>Control Tee is a design studio in Nairobi. The name comes from CTRL+T, the shortcut for transform, which is the plainest description of the work there is: take an idea, give it a form people recognise.</p>
<p>The studio started in 2022, self taught. That is worth saying out loud, because it shaped everything about how we work. Nobody hands you a brief when you are teaching yourself. You make the work anyway, you make it daily, and you let the craft catch up with the ambition. That habit never left.</p>
<p>Today the studio builds brand identity systems, campaigns, posters and motion. Some projects are a full identity built from strategy up. Some are a single poster that has to earn a second of attention in a feed and hold it. The process does not change: work out what the thing actually has to do, then design until it does it.</p>
<p>We are careful about restraint. Bold is easy. Bold and considered is the job.</p>
```

---

## 3. Services

Your LinkedIn lists nine services. They are currently nowhere on the site.

I have **not** put them in the About body, on purpose. Nine bullet points would flatten
a page that is meant to have a voice, and eight of the nine are already implied by the
work itself. My recommendation is to fold them into the contact page instead, where
somebody is actively deciding whether to get in touch and a concrete list genuinely helps.

If you want them on About regardless, say so and I will add them as a compact
two column list under the body.

**Optional, for `contact_body`:**

```
Control Tee is a design studio in Nairobi, built for brands that would rather be
recognised than blend in. Brand consulting, brand and graphic design, logo and
presentation design, print, video editing and creative direction.

If you have a project in mind, an identity, a campaign, or a story that needs to
move, tell me about it below.
```

---

## 4. Tagline

**Current:** `Control Tee Studios`

**Proposed:** `Free To Transform`

`brand_tagline` renders directly under the logo in the rail. Right now it repeats the
studio name that is already sitting immediately above it, so the line is doing no work.
Putting the tagline there gives it presence on every single page rather than only on About.

**Only do this if you take the headline suggestion too**, otherwise the same three words
appear twice on the About page.

---

## 5. Things I noticed but did not change

- **`hero_subtitle`** still reads `Marketing Campaigns · Brand Identity · Motion Design`.
  It is not rendered anywhere on the current site. Either it is dead and should be
  cleared, or the homepage should use it. Your call.

- **"impactful"** in the current copy. It is the single most worn word in agency writing
  and it is doing nothing that "recognised" or "hard to ignore" would not do better.
  Gone in the proposed version.

- **British and American spelling** are mixed across the site: "specialising" in About,
  "authorised" in Terms, but "Organisation" and "organization" both appear in project
  titles. The new copy is consistently British, which matches Kenyan usage. The project
  titles are yours to fix in /admin since they are content, not code.

---

## How to apply

1. Open `/admin`, go to **Site & Contact**
2. Paste the fields you approve
3. Save

Changes appear immediately. No deploy needed, since this copy is served from the
database rather than the HTML.
