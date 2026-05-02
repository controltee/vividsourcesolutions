/* ─────────────────────────────────────────────────────────
   CONTROL TEE — Animations
   Preloader · Hero Reveal · Scroll Reveal · 3D Folders
   Custom Cursor · Page Exit Fade
───────────────────────────────────────────────────────── */

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

    /* Irregular cadence mimics real loading */
    function step() {
        const increment = Math.floor(Math.random() * 6) + 2;
        count = Math.min(count + increment, 100);

        if (counter) counter.textContent = count + '%';
        if (fill)    fill.style.width    = count + '%';

        if (count < 100) {
            setTimeout(step, Math.random() * 40 + 18);
        } else {
            setTimeout(() => {
                preloader.classList.add('done');
                setTimeout(triggerHeroReveal, 200);
            }, 380);
        }
    }

    setTimeout(step, 300);
})();

/* ── HERO REVEAL ──────────────────────────────────────── */
function triggerHeroReveal() {
    const logo     = document.querySelector('.hero-logo');
    const words    = document.querySelectorAll('.hero-title .word');
    const subtitle = document.querySelector('.hero-subtitle');
    const btn      = document.querySelector('.hero-content .btn');

    if (logo)     setTimeout(() => logo.classList.add('visible'), 80);

    words.forEach((w, i) => {
        setTimeout(() => w.classList.add('visible'), 260 + i * 130);
    });

    const afterWords = 260 + words.length * 130;
    if (subtitle) setTimeout(() => subtitle.classList.add('visible'), afterWords + 60);
    if (btn)      setTimeout(() => btn.classList.add('visible'),      afterWords + 160);
}

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

    /* Lerp ring for trailing lag effect */
    (function animateRing() {
        ringX += (mouseX - ringX) * 0.11;
        ringY += (mouseY - ringY) * 0.11;
        ring.style.left = ringX + 'px';
        ring.style.top  = ringY + 'px';
        requestAnimationFrame(animateRing);
    })();

    /* Scale on interactive elements */
    const targets = document.querySelectorAll('a, button, .folder-card, input, textarea');
    targets.forEach(el => {
        el.addEventListener('mouseenter', () => {
            dot.style.transform  = 'translate(-50%, -50%) scale(3)';
            ring.style.width     = '58px';
            ring.style.height    = '58px';
            ring.style.borderColor = 'rgba(247, 213, 79, 0.45)';
        });
        el.addEventListener('mouseleave', () => {
            dot.style.transform  = 'translate(-50%, -50%) scale(1)';
            ring.style.width     = '36px';
            ring.style.height    = '36px';
            ring.style.borderColor = 'rgba(247, 213, 79, 0.7)';
        });
    });
})();

/* ── PAGE EXIT FADE ───────────────────────────────────── */
(function () {
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
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
