/* ─────────────────────────────────────────────────────────
   CONTROL TEE — Animations
   Preloader · Scramble · Scroll Reveal · 3D Folders · Curtain Wipe
───────────────────────────────────────────────────────── */

/* ── SCRAMBLE ENGINE ────────────────────────────────── */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#@!?%$*';

function scrambleText(el, onComplete) {
    const text = el.textContent.trim();
    el.style.opacity = '1';
    let frame = 0;
    let raf;

    function tick() {
        let html = '';
        let allDone = true;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === ' ') { html += ' '; continue; }
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

/* ── TYPEWRITER ─────────────────────────────────────── */
function typeWriter(el, text, speed, onComplete) {
    let i = 0;
    el.textContent = '';
    function type() {
        if (i < text.length) {
            el.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        } else {
            if (onComplete) onComplete();
        }
    }
    type();
}

/* ── PRELOADER ──────────────────────────────────────── */
(function () {
    const preloader = document.querySelector('.preloader');
    if (!preloader) { triggerHeroReveal(); return; }

    const counter  = preloader.querySelector('.preloader-counter');
    const fill     = preloader.querySelector('.preloader-bar-fill');
    const tagline  = preloader.querySelector('.preloader-tagline');
    let count = 0;
    let taglineStarted = false;

    function step() {
        count = Math.min(count + Math.floor(Math.random() * 6) + 2, 100);
        if (counter) counter.textContent = count + '%';
        if (fill)    fill.style.width    = count + '%';

        // Start tagline typewriter at 40%
        if (count >= 40 && !taglineStarted && tagline) {
            taglineStarted = true;
            typeWriter(tagline, 'Entering the creative space...', 55);
        }

        if (count < 100) {
            setTimeout(step, Math.random() * 40 + 18);
        } else {
            // Animate folder icon to open
            preloader.classList.add('complete');

            setTimeout(() => {
                preloader.classList.add('done');
                setTimeout(triggerHeroReveal, 180);
            }, 500);
        }
    }

    setTimeout(step, 300);
})();

/* ── HERO REVEAL ────────────────────────────────────── */
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

/* ── SCROLL SCRAMBLE ────────────────────────────────── */
(function () {
    const targets = document.querySelectorAll('[data-scramble]:not(.hero-title)');
    if (!targets.length) return;

    const seen = new WeakSet();
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

/* ── SCROLL REVEAL ──────────────────────────────────── */
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

/* ── 3D FOLDER HOVER ────────────────────────────────── */
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

/* ── CURTAIN WIPE PAGE TRANSITION ───────────────────── */
(function () {
    const hasPreloader = document.querySelector('.preloader') !== null;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100vh;
        background-color: #000000;
        z-index: 8999;
        pointer-events: none;
        transform: translateY(${hasPreloader ? '-100%' : '0'});
        transition: transform 0.8s cubic-bezier(0.76, 0, 0.24, 1);
    `;
    document.body.appendChild(overlay);

    if (!hasPreloader) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.style.transform = 'translateY(-100%)';
            });
        });
    }

    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            overlay.style.transition = 'none';
            overlay.style.transform = 'translateY(-100%)';
        }
    });

    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', e => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto') ||
                href.startsWith('tel') || href.startsWith('http') || href.startsWith('//') ||
                link.hasAttribute('target')) return;

            e.preventDefault();
            overlay.style.transition = 'none';
            overlay.style.transform = 'translateY(100%)';
            void overlay.offsetWidth;
            overlay.style.transition = 'transform 0.8s cubic-bezier(0.76, 0, 0.24, 1)';
            overlay.style.transform = 'translateY(0)';
            setTimeout(() => { window.location.href = href; }, 750);
        });
    });
})();

/* ── HORIZONTAL SCROLL SLIDER ───────────────────────── */
(function () {
    if (typeof gsap === 'undefined') return;
    const containers = document.querySelectorAll('.slider-container');
    if (!containers.length) return;

    gsap.registerPlugin(ScrollTrigger);

    containers.forEach(container => {
        const track = container.querySelector('.horizontal-track');
        if (!track) return;

        const getScrollAmount = () => {
            const amount = track.scrollWidth - window.innerWidth + 80;
            return amount > 0 ? -amount : 0;
        };

        const tween = gsap.to(track, { x: getScrollAmount, ease: 'none' });

        ScrollTrigger.create({
            trigger: container,
            start: 'top top',
            end: () => '+=' + (Math.abs(getScrollAmount()) * 1.5),
            pin: true,
            animation: tween,
            scrub: 1,
            invalidateOnRefresh: true
        });
    });
})();
