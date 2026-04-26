/**
 * Shared Sidebar & Theme System — حروف مع أسامة
 * Include this script + themes.css on any page to get:
 * - Hamburger menu with sidebar
 * - Dark/Light mode
 * - 10 color themes
 * - Utility functions
 */
(function () {
    'use strict';

    // Don't double-init
    if (window.__sidebarInit) return;
    window.__sidebarInit = true;

    // ===== Apply saved theme IMMEDIATELY (before DOM ready) =====
    const savedTheme = localStorage.getItem('theme');
    const savedColor = localStorage.getItem('colorTheme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    if (savedColor && savedColor !== 'default') {
        document.documentElement.setAttribute('data-color-theme', savedColor);
    }

    // ===== Inject CSS =====
    const sidebarCSS = `
        /* Hamburger Button */
        .hb-btn{position:fixed;top:20px;right:20px;z-index:200;background:var(--surface,rgba(17,25,40,0.75));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--glass-border,rgba(255,255,255,0.08));border-radius:14px;width:48px;height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;transition:all .3s cubic-bezier(.4,0,.2,1);padding:0}
        .hb-btn:hover{background:var(--surface-hover,rgba(25,35,55,0.85));transform:scale(1.05);border-color:rgba(99,102,241,.3);box-shadow:0 4px 20px var(--glow-purple,rgba(99,102,241,.4))}
        .hb-line{width:20px;height:2.5px;background:var(--text-secondary,var(--text2,#94a3b8));border-radius:4px;transition:all .35s cubic-bezier(.4,0,.2,1)}
        .hb-btn.active .hb-line:nth-child(1){transform:rotate(45deg) translate(5px,5px)}
        .hb-btn.active .hb-line:nth-child(2){opacity:0;transform:scaleX(0)}
        .hb-btn.active .hb-line:nth-child(3){transform:rotate(-45deg) translate(5px,-5px)}

        /* Sidebar Overlay */
        .sb-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:150;opacity:0;pointer-events:none;transition:opacity .35s}
        .sb-ov.active{opacity:1;pointer-events:auto}

        /* Sidebar */
        .sb{position:fixed;top:0;right:-340px;width:320px;max-width:85vw;height:100vh;height:100dvh;background:var(--bg-secondary,var(--bg2,#0d1117));border-left:1px solid var(--glass-border,rgba(255,255,255,.08));z-index:160;display:flex;flex-direction:column;transition:right .4s cubic-bezier(.4,0,.2,1);overflow-y:auto;overflow-x:hidden;box-shadow:-10px 0 40px rgba(0,0,0,.3)}
        .sb.open{right:0}
        .sb-hdr{padding:24px 20px 16px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--glass-border,rgba(255,255,255,.08))}
        .sb-logo{width:44px;height:44px;border-radius:14px;object-fit:contain;box-shadow:0 4px 12px rgba(99,102,241,.25)}
        .sb-brd{flex:1}
        .sb-brd-t{font-size:1.05rem;font-weight:900;background:linear-gradient(135deg,var(--accent-1,var(--accent,#6366f1)),var(--accent-3,var(--accent3,#a78bfa)));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .sb-brd-s{font-size:.7rem;color:var(--text-muted,var(--muted,#64748b));font-weight:600}
        .sb-sec{padding:16px 20px 10px}
        .sb-sec-t{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted,var(--muted,#64748b));margin-bottom:12px;display:flex;align-items:center;gap:6px}
        .sb-sec-t i{font-size:.6rem}
        .sb-div{height:1px;background:var(--glass-border,rgba(255,255,255,.08));margin:4px 20px}

        /* Sidebar Items */
        .sb-itm{display:flex;align-items:center;gap:12px;padding:12px 16px;margin:2px 12px;border-radius:12px;cursor:pointer;transition:all .25s;color:var(--text-secondary,var(--text2,#94a3b8));font-size:.88rem;font-weight:700;text-decoration:none;border:none;background:none;width:calc(100% - 24px);font-family:'Tajawal','Cairo',sans-serif}
        .sb-itm:hover{background:var(--glass,rgba(255,255,255,.03));color:var(--text-primary,var(--text,#f1f5f9));transform:translateX(-4px)}
        .sb-itm i{width:20px;text-align:center;font-size:.95rem}
        .sb-badge{margin-right:auto;padding:2px 8px;border-radius:100px;font-size:.6rem;font-weight:800;background:linear-gradient(135deg,var(--accent-1,var(--accent,#6366f1)),var(--accent-2,var(--accent2,#8b5cf6)));color:white}

        /* Mode Toggle */
        .sb-mode{display:flex;background:var(--glass,rgba(255,255,255,.03));border:1px solid var(--glass-border,rgba(255,255,255,.08));border-radius:12px;padding:4px;margin:4px 12px 8px;gap:4px}
        .sb-mode-btn{flex:1;padding:10px;border:none;border-radius:10px;background:transparent;color:var(--text-muted,var(--muted,#64748b));font-family:'Tajawal','Cairo',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;transition:all .3s;display:flex;align-items:center;justify-content:center;gap:6px}
        .sb-mode-btn.active{background:var(--surface,rgba(17,25,40,.75));color:var(--text-primary,var(--text,#f1f5f9));box-shadow:0 2px 8px rgba(0,0,0,.15)}
        .sb-mode-btn:hover:not(.active){color:var(--text-secondary,var(--text2,#94a3b8))}

        /* Theme Grid */
        .sb-tgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:4px 12px 8px}
        .sb-ts{aspect-ratio:1;border-radius:12px;cursor:pointer;border:2px solid var(--glass-border,rgba(255,255,255,.08));transition:all .3s;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
        .sb-ts:hover{transform:scale(1.08);border-color:rgba(255,255,255,.2)}
        .sb-ts.active{border-color:var(--accent-1,var(--accent,#6366f1));box-shadow:0 0 12px var(--glow-purple,rgba(99,102,241,.4))}
        .sb-ts.active::after{content:'\\f00c';font-family:'Font Awesome 6 Free';font-weight:900;position:absolute;font-size:.6rem;color:white;background:var(--accent-1,var(--accent,#6366f1));width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;bottom:3px;left:3px}
        .sb-tsn{font-size:.5rem;font-weight:700;color:white;text-shadow:0 1px 3px rgba(0,0,0,.5);position:absolute;bottom:4px;width:100%;text-align:center}
        .ts-def{background:linear-gradient(135deg,#6366f1,#8b5cf6)}
        .ts-ocn{background:linear-gradient(135deg,#0ea5e9,#06b6d4)}
        .ts-sun{background:linear-gradient(135deg,#f97316,#ef4444)}
        .ts-for{background:linear-gradient(135deg,#22c55e,#10b981)}
        .ts-gld{background:linear-gradient(135deg,#f59e0b,#d97706)}
        .ts-crm{background:linear-gradient(135deg,#ef4444,#dc2626)}
        .ts-sky{background:linear-gradient(135deg,#38bdf8,#67e8f9)}
        .ts-mid{background:linear-gradient(135deg,#1e1b4b,#312e81)}
        .ts-ros{background:linear-gradient(135deg,#ec4899,#f9a8d4)}
        .ts-neo{background:linear-gradient(135deg,#00ff80,#00ccff)}

        /* Promo */
        .sb-promo{margin:auto 12px 12px;padding:18px 16px;background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(34,211,238,.06));border:1px solid rgba(99,102,241,.15);border-radius:16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;transition:all .3s}
        .sb-promo:hover{border-color:rgba(99,102,241,.3);transform:translateY(-2px);box-shadow:0 6px 24px rgba(99,102,241,.12)}
        .sb-promo-ic{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--accent-1,var(--accent,#6366f1)),var(--cyan,#22d3ee));display:flex;align-items:center;justify-content:center;color:white;font-size:1.1rem;box-shadow:0 4px 12px rgba(99,102,241,.3)}
        .sb-promo-t{font-size:.9rem;font-weight:800;color:var(--text-primary,var(--text,#f1f5f9))}
        .sb-promo-d{font-size:.72rem;color:var(--text-muted,var(--muted,#64748b));line-height:1.5}
        .sb-promo-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 20px;border-radius:100px;background:linear-gradient(135deg,var(--accent-1,var(--accent,#6366f1)),var(--accent-2,var(--accent2,#8b5cf6)));color:white;font-family:'Tajawal','Cairo',sans-serif;font-size:.8rem;font-weight:700;text-decoration:none;transition:all .25s;box-shadow:0 4px 14px var(--glow-purple,rgba(99,102,241,.4));border:none;cursor:pointer}
        .sb-promo-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px var(--glow-purple,rgba(99,102,241,.4))}
        .sb-ft{padding:12px 20px 20px;text-align:center;font-size:.65rem;color:var(--text-muted,var(--muted,#64748b));opacity:.5}
    `;

    const style = document.createElement('style');
    style.textContent = sidebarCSS;
    document.head.appendChild(style);

    // ===== Inject HTML when DOM ready =====
    function injectSidebar() {
        // Skip if already injected or if page has its own sidebar (home.html)
        if (document.getElementById('__sb')) return;
        if (document.getElementById('sidebar')) {
            // Home page has its own sidebar — hide their hamburger and wire up our theme functions
            const existingHamburger = document.getElementById('hamburgerBtn');
            if (existingHamburger) existingHamburger.style.display = 'none';
            // Hide existing sidebar elements
            const existingSidebar = document.getElementById('sidebar');
            if (existingSidebar) existingSidebar.remove();
            const existingOverlay = document.getElementById('sidebarOverlay');
            if (existingOverlay) existingOverlay.remove();
        }

        const isHomePage = location.pathname === '/' || location.pathname === '/home.html';

        // Hamburger Button
        const btn = document.createElement('button');
        btn.className = 'hb-btn';
        btn.id = '__hb';
        btn.title = 'القائمة';
        btn.innerHTML = '<span class="hb-line"></span><span class="hb-line"></span><span class="hb-line"></span>';
        btn.onclick = toggleSidebar;

        // Overlay
        const ov = document.createElement('div');
        ov.className = 'sb-ov';
        ov.id = '__sbov';
        ov.onclick = toggleSidebar;

        // Sidebar
        const sb = document.createElement('nav');
        sb.className = 'sb';
        sb.id = '__sb';

        const currentMode = localStorage.getItem('theme') || 'dark';
        const currentColor = localStorage.getItem('colorTheme') || 'default';

        const themes = [
            { key: 'default', cls: 'ts-def', name: 'افتراضي' },
            { key: 'rose', cls: 'ts-ros', name: 'وردي' },
            { key: 'ocean', cls: 'ts-ocn', name: 'محيطي' },
            { key: 'sunset', cls: 'ts-sun', name: 'غروب' },
            { key: 'forest', cls: 'ts-for', name: 'غابة' },
            { key: 'golden', cls: 'ts-gld', name: 'ذهبي' },
            { key: 'crimson', cls: 'ts-crm', name: 'قرمزي' },
            { key: 'sky', cls: 'ts-sky', name: 'سماوي' },
            { key: 'midnight', cls: 'ts-mid', name: 'ليل' },
            { key: 'neon', cls: 'ts-neo', name: 'نيون' },
        ];

        const themesHTML = themes.map(t =>
            `<div class="sb-ts ${t.cls} ${currentColor === t.key ? 'active' : ''}" onclick="window.__setColor('${t.key}')" title="${t.name}"><span class="sb-tsn">${t.name}</span></div>`
        ).join('');

        sb.innerHTML = `
            <div class="sb-hdr">
                <img src="/Logo.png" alt="حروف" class="sb-logo" />
                <div class="sb-brd">
                    <div class="sb-brd-t">حروف مع أسامة</div>
                    <div class="sb-brd-s">LETTERS GAME v2.0</div>
                </div>
            </div>

            <div class="sb-sec"><div class="sb-sec-t"><i class="fas fa-compass"></i> التنقل</div></div>
            <a class="sb-itm" href="/home.html"><i class="fas fa-home" style="color:var(--accent-1,var(--accent,#6366f1))"></i> الرئيسية</a>
            ${!isHomePage ? `<a class="sb-itm" href="/home.html" onclick="localStorage.setItem('__openCreate','1')"><i class="fas fa-crown" style="color:var(--amber,#fbbf24)"></i> إنشاء غرفة</a>` : ''}
            <a class="sb-itm" href="/display.html"><i class="fas fa-tv" style="color:var(--amber,#fbbf24)"></i> شاشة العرض</a>
            <a class="sb-itm" href="https://creators.sa/engosama" target="_blank" rel="noopener noreferrer"><i class="fas fa-heart" style="color:var(--rose,#fb7185)"></i> ادعمني <span class="sb-badge">☕</span></a>

            <div class="sb-div"></div>
            <div class="sb-sec"><div class="sb-sec-t"><i class="fas fa-palette"></i> المظهر</div></div>
            <div class="sb-mode">
                <button class="sb-mode-btn ${currentMode !== 'light' ? 'active' : ''}" id="__mDark" onclick="window.__setMode('dark')"><i class="fas fa-moon"></i> ليلي</button>
                <button class="sb-mode-btn ${currentMode === 'light' ? 'active' : ''}" id="__mLight" onclick="window.__setMode('light')"><i class="fas fa-sun"></i> نهاري</button>
            </div>
            <div class="sb-sec" style="padding-top:10px"><div class="sb-sec-t"><i class="fas fa-swatchbook"></i> الثيمات</div></div>
            <div class="sb-tgrid">${themesHTML}</div>

            <div class="sb-div"></div>
            <div class="sb-sec"><div class="sb-sec-t"><i class="fas fa-bolt"></i> أدوات</div></div>
            <button class="sb-itm" onclick="window.__shareWebsite()"><i class="fas fa-share-nodes" style="color:var(--emerald,#34d399)"></i> مشاركة الموقع</button>
            <button class="sb-itm" onclick="window.__toggleFS()"><i class="fas fa-expand" style="color:var(--accent-3,var(--accent3,#a78bfa))"></i> ملء الشاشة</button>

            <div class="sb-div"></div>

            <div class="sb-promo">
                <div class="sb-promo-ic"><i class="fas fa-toolbox"></i></div>
                <div class="sb-promo-t">أدوات يوني 🛠️</div>
                <div class="sb-promo-d">أدوات تعليمية وتنظيمية تساعدك في دراستك ويومك!</div>
                <a href="https://tools-uni.onrender.com/" target="_blank" rel="noopener noreferrer" class="sb-promo-btn"><i class="fas fa-external-link-alt"></i> جرّب الحين</a>
            </div>
            <div class="sb-ft">حروف مع أسامة • مبني بـ ❤️</div>
        `;

        document.body.appendChild(btn);
        document.body.appendChild(ov);
        document.body.appendChild(sb);
    }

    // ===== Sidebar Toggle =====
    function toggleSidebar() {
        const sb = document.getElementById('__sb');
        const ov = document.getElementById('__sbov');
        const btn = document.getElementById('__hb');
        if (!sb) return;
        sb.classList.toggle('open');
        ov.classList.toggle('active');
        btn.classList.toggle('active');
    }
    window.__toggleSidebar = toggleSidebar;

    // ===== Mode =====
    window.__setMode = function (mode) {
        if (mode === 'light') {
            document.body.setAttribute('data-theme', 'light');
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.body.removeAttribute('data-theme');
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('theme', mode);
        // Update buttons
        const d = document.getElementById('__mDark');
        const l = document.getElementById('__mLight');
        if (d) { d.classList.toggle('active', mode !== 'light'); }
        if (l) { l.classList.toggle('active', mode === 'light'); }
    };

    // ===== Color Theme =====
    window.__setColor = function (theme) {
        if (theme === 'rose') {
            window.__setMode('light');
        }
        if (theme === 'default') {
            document.body.removeAttribute('data-color-theme');
            document.documentElement.removeAttribute('data-color-theme');
        } else {
            document.body.setAttribute('data-color-theme', theme);
            document.documentElement.setAttribute('data-color-theme', theme);
        }
        // Update swatches
        document.querySelectorAll('.sb-ts').forEach(s => s.classList.remove('active'));
        const cls = {
            default: 'ts-def', ocean: 'ts-ocn', sunset: 'ts-sun', forest: 'ts-for',
            golden: 'ts-gld', crimson: 'ts-crm', sky: 'ts-sky', midnight: 'ts-mid',
            rose: 'ts-ros', neon: 'ts-neo'
        };
        const el = document.querySelector('.' + (cls[theme] || 'ts-def'));
        if (el) el.classList.add('active');
        localStorage.setItem('colorTheme', theme);
    };

    // ===== Utilities =====
    window.__shareWebsite = function () {
        const url = window.location.origin;
        if (navigator.share) {
            navigator.share({ title: 'حروف مع أسامة', text: 'جرب لعبة حروف مع أسامة! 🎮', url });
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                alert('تم نسخ رابط الموقع! 📋');
            });
        }
    };

    window.__toggleFS = function () {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen();
        }
    };

    // ===== Apply saved settings to body =====
    function applySettings() {
        const mode = localStorage.getItem('theme');
        const color = localStorage.getItem('colorTheme');
        if (mode === 'light') {
            document.body.setAttribute('data-theme', 'light');
        }
        if (color && color !== 'default') {
            document.body.setAttribute('data-color-theme', color);
        }
    }

    // ===== Escape key =====
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const sb = document.getElementById('__sb');
            if (sb && sb.classList.contains('open')) toggleSidebar();
        }
    });

    // ===== Init =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            applySettings();
            injectSidebar();
        });
    } else {
        applySettings();
        injectSidebar();
    }
})();
