/* ─────────────────────────────────────────────────────────
   CONTROL TEE — Animations
   Preloader · Scramble Text · Scroll Reveal · 3D Folders · Page Exit
───────────────────────────────────────────────────────── */

/* ── TEXT SCRAMBLE ENGINE ─────────────────────────────── */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#@!?%$*';

function scrambleText(el, onComplete) {
    const text = el.textContent.trim();
    el.style.opacity = '1';

    let frame = 0;
    let raf;

    function tick() {
        let html    = '';
        let allDone = true;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            /* spaces pass through unchanged */
            if (ch === ' ') { html += ' '; continue; }

            /* each character resolves left-to-right with a stagger */
            const resolveAt = Math.floor(i * 1.6) + 12;

            if (frame >= resolveAt) {
                html += `<span class="scramble-char">${ch}</span>`;
            } else {
                allDone = false;
                const rand = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
                html += `<span class="scramble-char resolving">${rand}</span>`;
            }
        }

        el.innerHTML = html;

        if (allDone) {
            if (onComplete) onComplete();
        } else {
            frame++;
            raf = requestAnimationFrame(tick);
        }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
}

/* ── PRELOADER ────────────────────────────────────────── */
(function () {
    const preloader = document.querySelector('.preloader');
    if (!preloader) { triggerHeroReveal(); return; }

    const counter = preloader.querySelector('.preloader-counter');
    const fill    = preloader.querySelector('.preloader-bar-fill');
    let count = 0;

    function step() {
        count = Math.min(count + Math.floor(Math.random() * 6) + 2, 100);
        if (counter) counter.textContent = count + '%';
        if (fill)    fill.style.width    = count + '%';

        if (count < 100) {
            setTimeout(step, Math.random() * 40 + 18);
        } else {
            setTimeout(() => {
                preloader.classList.add('done');
                setTimeout(triggerHeroReveal, 180);
            }, 380);
        }
    }

    setTimeout(step, 300);
})();

/* ── HERO REVEAL ──────────────────────────────────────── */
function triggerHeroReveal() {
    const logo     = document.querySelector('.hero-logo');
    const title    = document.querySelector('.hero-title[data-scramble]');
    const subtitle = document.querySelector('.hero-subtitle');
    const btn      = document.querySelector('.hero-content .btn');

    if (logo) setTimeout(() => logo.classList.add('visible'), 80);

    if (title) {
        setTimeout(() => {
            scrambleText(title, () => {
                if (subtitle) subtitle.classList.add('visible');
                if (btn)      setTimeout(() => btn.classList.add('visible'), 100);
            });
        }, 300);
    } else {
        if (subtitle) setTimeout(() => subtitle.classList.add('visible'), 400);
        if (btn)      setTimeout(() => btn.classList.add('visible'), 550);
    }
}

/* ── SCROLL-TRIGGERED SCRAMBLE ────────────────────────── */
/* Handles ALL [data-scramble] elements except .hero-title (triggered above).
   Works for both scroll-into-view AND elements visible on page load.        */
(function () {
    const targets = document.querySelectorAll('[data-scramble]:not(.hero-title)');
    if (!targets.length) return;

    const seen = new WeakSet(); /* prevent double-trigger */

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting || seen.has(entry.target)) return;
            seen.add(entry.target);
            scrambleText(entry.target);
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.25 });

    targets.forEach(el => observer.observe(el));
})();

/* ── SCROLL REVEAL ────────────────────────────────────── */
(function () {
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const delay = parseInt(entry.target.dataset.delay || 0, 10);
            setTimeout(() => entry.target.classList.add('is-visible'), delay);
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.1 });

    reveals.forEach(el => observer.observe(el));
})();

/* ── 3D FOLDER HOVER ──────────────────────────────────── */
(function () {
    document.querySelectorAll('.folder-card').forEach(card => {
        const inner = card.querySelector('.folder-inner');
        if (!inner) return;

        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width  - 0.5;
            const y = (e.clientY - r.top)  / r.height - 0.5;
            inner.style.transform = `rotateY(${x * 20}deg) rotateX(${-y * 20}deg)`;
        });

        card.addEventListener('mouseleave', () => {
            inner.style.transform = 'rotateY(0deg) rotateX(0deg)';
        });
    });
})();

/* ── PAGE EXIT FADE ───────────────────────────────────── */
(function () {
    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', e => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto') ||
                href.startsWith('tel') || href.startsWith('http') || href.startsWith('//'))
                return;

            e.preventDefault();
            document.body.style.transition = 'opacity 0.38s ease';
            document.body.style.opacity    = '0';
            setTimeout(() => { window.location.href = href; }, 400);
        });
    });
})();
