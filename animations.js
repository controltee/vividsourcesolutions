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

-- 1. Create the posters table
CREATE TABLE public.posters (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    image_url TEXT NOT NULL
);

-- 2. Create the videos table
CREATE TABLE public.videos (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    youtube_url TEXT NOT NULL
);

-- 3. Create the public storage bucket for your posters
INSERT INTO storage.buckets (id, name, public) 
VALUES ('portfolio_assets', 'portfolio_assets', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Enable Row Level Security (RLS) on tables
ALTER TABLE public.posters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies for Posters (Allow anyone to view, and your admin panel to insert)
CREATE POLICY "Allow public read access to posters" ON public.posters FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to posters" ON public.posters FOR INSERT WITH CHECK (true);

-- 6. Create Policies for Videos (Allow anyone to view, and your admin panel to insert)
CREATE POLICY "Allow public read access to videos" ON public.videos FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to videos" ON public.videos FOR INSERT WITH CHECK (true);

-- 7. Create Policies for Storage (Allow anyone to view images, and your admin panel to upload)
CREATE POLICY "Give public access to portfolio_assets" ON storage.objects FOR SELECT USING (bucket_id = 'portfolio_assets');
CREATE POLICY "Allow public uploads to portfolio_assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'portfolio_assets');
// Replace these with your actual keys before you push!
const SUPABASE_URL = 'https://supabase.com/dashboard/project/ccaggjhyeygyosbdnxmq';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjYWdnamh5ZXlneW9zYmRueG1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjMzNzksImV4cCI6MjA5NjgzOTM3OX0.Z2NJXnSNoJtugQ0Co-R_SMH3dXbErVcCcItgxj_PQxs;
/* ── PREMIUM PAGE TRANSITION (CURTAIN WIPE) ───────────── */
(function () {
    const hasPreloader = document.querySelector('.preloader') !== null;
    
    // 1. Create and inject the transition overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100vh;
        background-color: var(--black);
        z-index: 9999;
        pointer-events: none;
        transform: translateY(${hasPreloader ? '-100%' : '0'});
        transition: transform 0.8s cubic-bezier(0.76, 0, 0.24, 1);
    `;
    document.body.appendChild(overlay);

    // 2. If no preloader (subpages), slide curtain up to reveal page
    if (!hasPreloader) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.style.transform = 'translateY(-100%)';
            });
        });
    }

    // 3. Handle browser back button cache (safeguard)
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            overlay.style.transition = 'none';
            overlay.style.transform = 'translateY(-100%)';
        }
    });

    // 4. On click, sweep curtain up to cover the screen
    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', e => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto') ||
                href.startsWith('tel') || href.startsWith('http') || href.startsWith('//') ||
                link.hasAttribute('target'))
                return;

            e.preventDefault();
            
            // Prepare overlay at the bottom instantly
            overlay.style.transition = 'none';
            overlay.style.transform = 'translateY(100%)';
            
            // Force reflow
            void overlay.offsetWidth;
            
            // Sweep up to cover
            overlay.style.transition = 'transform 0.8s cubic-bezier(0.76, 0, 0.24, 1)';
            overlay.style.transform = 'translateY(0)';
            
            // Navigate once the screen is fully covered
            setTimeout(() => { window.location.href = href; }, 750);
        });
    });
})();

/* -- HORIZONTAL SCROLL SLIDER --------------------------- */
(function() {
    if (typeof gsap === 'undefined') return;
    
    const containers = document.querySelectorAll('.slider-container');
    if (!containers.length) return;

    gsap.registerPlugin(ScrollTrigger);

    containers.forEach(container => {
        const track = container.querySelector('.horizontal-track');
        if (!track) return;
        
        const getScrollAmount = () => {
            const amount = track.scrollWidth - window.innerWidth + 80; // 80px for padding
            return amount > 0 ? -amount : 0; // Prevent reverse scrolling if track is shorter than screen width
        };
        
        const tween = gsap.to(track, {
            x: getScrollAmount,
            ease: "none"
        });

        ScrollTrigger.create({
            trigger: container,
            start: "top top",
            end: () => "+=" + (Math.abs(getScrollAmount()) * 1.5),
            pin: true,
            animation: tween,
            scrub: 1,
            invalidateOnRefresh: true
        });
    });
})();
