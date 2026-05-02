/* ─────────────────────────────────────────────────────────
   CONTROL TEE — Animations
   Preloader · Scramble Text · Scroll Reveal · 3D Folders
   Custom Cursor · Page Exit Fade
───────────────────────────────────────────────────────── */

/* ── TEXT SCRAMBLE ENGINE ─────────────────────────────── */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#@!?&%$';

function scrambleText(el, onComplete) {
    const originalText = el.textContent.trim();
    const length       = originalText.length;

    el.style.opacity = '1';

    /* Build per-character queue */
    const queue = Array.from(originalText).map((char, i) => ({
        char,
        start:   Math.floor(i * 1.4),               /* stagger start per char  */
        end:     Math.floor(i * 1.4) + 8,            /* resolve after N frames  */
        current: '',
    }));

    let frame = 0;
    let raf;

    function tick() {
        let html     = '';
        let resolved = 0;

        queue.forEach(item => {
            if (item.char === ' ') {
                html += '&nbsp;';
                resolved++;
                return;
            }

            if (frame >= item.end) {
                html += `<span class="scramble-char">${item.char}</span>`;
                resolved++;
            } else if (frame >= item.start) {
                const rand = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
                item.current = rand;
                html += `<span class="scramble-char resolving">${rand}</span>`;
            } else {
                html += `<span class="scramble-char" style="opacity:0">${item.char}</span>`;
            }
        });

        el.innerHTML = html;

        if (resolved < length) {
            frame++;
            raf = requestAnimationFrame(tick);
        } else {
            if (onComplete) onComplete();
        }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf); /* returns cancel fn */
}

/* ── PRELOADER ────────────────────────────────────────── */
(function () {
    const preloader = document.querySelector('.preloader');
    if (!preloader) {
        triggerHeroReveal();
        return;
    }

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

    if (logo) {
        setTimeout(() => logo.classList.add('visible'), 80);
    }

    if (title) {
        setTimeout(() => {
            scrambleText(title, () => {
                if (subtitle) subtitle.classList.add('visible');
                if (btn)      setTimeout(() => btn.classList.add('visible'), 100);
            });
        }, 300);
    } else {
        /* fallback if no scramble title on page */
        if (subtitle) setTimeout(() => subtitle.classList.add('visible'), 400);
        if (btn)      setTimeout(() => btn.classList.add('visible'), 550);
    }
}

/* ── SCROLL-TRIGGERED SCRAMBLE ────────────────────────── */
(function () {
    const targets = document.querySelectorAll('[data-scramble]:not(.hero-title)');
    if (!targets.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            scrambleText(entry.target);
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.3 });

    targets.forEach(el => observer.observe(el));
})();

/* Sub-page h1 on load (not in hero, not observed) */
(function () {
    const heading = document.querySelector('.project-header h1[data-scramble], .contact-headline[data-scramble]');
    if (!heading) return;
    setTimeout(() => scrambleText(heading), 400);
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

/* ── CUSTOM CURSOR ────────────────────────────────────── */
(function () {
    const dot  = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    if (!dot || !ring) return;

    let mouseX = 0, mouseY = 0;
    let ringX  = 0, ringY  = 0;

    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        dot.style.left = mouseX + 'px';
        dot.style.top  = mouseY + 'px';
    });

    (function animateRing() {
        ringX += (mouseX - ringX) * 0.11;
        ringY += (mouseY - ringY) * 0.11;
        ring.style.left = ringX + 'px';
        ring.style.top  = ringY + 'px';
        requestAnimationFrame(animateRing);
    })();

    const targets = document.querySelectorAll('a, button, .folder-card, input, textarea');
    targets.forEach(el => {
        el.addEventListener('mouseenter', () => {
            dot.style.transform    = 'translate(-50%, -50%) scale(3)';
            ring.style.width       = '58px';
            ring.style.height      = '58px';
            ring.style.borderColor = 'rgba(247, 213, 79, 0.45)';
        });
        el.addEventListener('mouseleave', () => {
            dot.style.transform    = 'translate(-50%, -50%) scale(1)';
            ring.style.width       = '36px';
            ring.style.height      = '36px';
            ring.style.borderColor = 'rgba(247, 213, 79, 0.7)';
        });
    });
})();

/* ── PAGE EXIT FADE ───────────────────────────────────── */
(function () {
    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', e => {
            const href = link.getAttribute('href');
            if (
                !href ||
                href.startsWith('#') ||
                href.startsWith('mailto') ||
                href.startsWith('tel') ||
                href.startsWith('http') ||
                href.startsWith('//')
            ) return;

            e.preventDefault();
            document.body.style.transition = 'opacity 0.38s ease';
            document.body.style.opacity    = '0';
            setTimeout(() => { window.location.href = href; }, 400);
        });
    });
})();
