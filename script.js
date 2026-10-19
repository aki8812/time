const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const pad = (n) => String(n).padStart(2, '0');
const svgNs = 'http://www.w3.org/2000/svg';
const svgNode = (tag, attrs) => {
    const n = document.createElementNS(svgNs, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
    return n;
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

const store = {
    get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return fallback;
            try {
                return JSON.parse(raw);
            } catch {
                return raw;
            }
        } catch (err) {
            console.warn('讀取設定失敗', err);
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        } catch (err) {
            console.warn('儲存設定失敗', err);
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (err) {
            console.warn('清除設定失敗', err);
        }
    }
};

const timeEl = $('time');
const ampmEl = $('ampm');
const dateEl = $('date');
const formatToggle = $('format-toggle');
const labelText = document.querySelector('.label-text');
const utcDisplay = $('utc-display');
const utcDec = $('utc-dec');
const utcInc = $('utc-inc');
const settingsBtn = $('settings-btn');
const settingsModal = $('settings-modal');
const modalCloseBtn = $('modal-close-btn');
const scaleSlider = $('scale-slider');
const scaleValue = $('scale-value');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const seg = $('theme-seg');
const segThumb = seg.querySelector('.seg-thumb');
const segBtns = [...seg.querySelectorAll('.seg-btn')];
const styleBtn = $('style-btn');
const styleTip = $('style-tip');
const choiceBtns = [...document.querySelectorAll('#style-choice .choice-btn')];
const face = $('w-face');
const sweep = $('w-sweep');
const wDate = $('w-date');
const wTime = $('w-time');
const wAmpm = $('w-ampm');
const wZone = $('w-zone');
const hands = { hour: $('h-hour'), min: $('h-min'), sec: $('h-sec') };
const glassEls = [...document.querySelectorAll('.glass')];

const themeModes = ['light', 'auto', 'dark'];
const clockStyles = ['classic', 'glass'];
const styleLabels = { classic: '切換成指針時鐘', glass: '切換成經典數字時鐘' };
const weekdays = '日一二三四五六';

const parseOffset = (value) => {
    const num = parseInt(value, 10);
    return Number.isNaN(num) ? null : clamp(num, -12, 14);
};

const pick = (key, list, fallback) => {
    const value = store.get(key, fallback);
    return list.includes(value) ? value : fallback;
};

const state = {
    themeMode: pick('themeMode', themeModes, 'auto'),
    clockStyle: pick('clockStyle', clockStyles, 'classic'),
    is24Hour: store.get('is24Hour', true) !== false,
    utcOffset: parseOffset(store.get('utcOffset', null)),
    clockScale: parseFloat(store.get('clockScale', 1)) || 1
};

const localOffset = () => -new Date().getTimezoneOffset() / 60;

const getNow = () => {
    const now = new Date();
    if (state.utcOffset === null) return now;
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3600000 * state.utcOffset);
};

const zoneLabel = () => {
    const offset = state.utcOffset ?? localOffset();
    const abs = Math.abs(offset);
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    return `UTC${offset < 0 ? '-' : '+'}${h}${m ? `:${pad(m)}` : ''}`;
};

const centerOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const liquidGlass = (() => {
    const defs = $('lg-defs');
    const presets = {
        panel: { scale: 74, blur: 2.4, bezel: 0.24 },
        pill: { scale: 36, blur: 1.2, bezel: 0.5 },
        sheet: { scale: 60, blur: 7, bezel: 0.2 },
        ring: { scale: 0.085, blur: 0.5, inner: 0.8, sat: 1.15 }
    };
    const channels = [
        ['r', 1, '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'],
        ['g', 0.92, '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'],
        ['b', 0.84, '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0']
    ];
    const supported = (() => {
        try {
            const brands = navigator.userAgentData?.brands ?? [];
            const chromium = brands.some(({ brand }) => /Chromium|Google Chrome|Microsoft Edge/.test(brand));
            return chromium && CSS.supports('backdrop-filter', 'url(#lg)');
        } catch {
            return false;
        }
    })();

    const buildMap = (w, h, r, bezel) => {
        const k = w * h > 140000 ? 0.5 : 1;
        const cw = Math.max(2, Math.round(w * k));
        const ch = Math.max(2, Math.round(h * k));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(cw, ch);
        const data = img.data;
        const hw = w / 2;
        const hh = h / 2;
        for (let y = 0; y < ch; y++) {
            const py = (y + 0.5) / k - hh;
            const ay = Math.abs(py);
            for (let x = 0; x < cw; x++) {
                const px = (x + 0.5) / k - hw;
                const ax = Math.abs(px);
                const qx = ax - (hw - r);
                const qy = ay - (hh - r);
                let nx = 0;
                let ny = 0;
                let dist;
                if (qx > 0 && qy > 0) {
                    const len = Math.hypot(qx, qy) || 1;
                    dist = r - len;
                    nx = qx / len;
                    ny = qy / len;
                } else if (hw - ax < hh - ay) {
                    dist = hw - ax;
                    nx = 1;
                } else {
                    dist = hh - ay;
                    ny = 1;
                }
                const t = clamp(dist / bezel, 0, 1);
                const m = dist < 0 ? 0 : (1 - t) ** 2.2;
                const i = (y * cw + x) * 4;
                data[i] = 128 - Math.sign(px) * nx * m * 127;
                data[i + 1] = 128 - Math.sign(py) * ny * m * 127;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return canvas.toDataURL();
    };

    const buildRingMap = (size, inner) => {
        const k = size * size > 140000 ? 0.5 : 1;
        const cs = Math.max(2, Math.round(size * k));
        const canvas = document.createElement('canvas');
        canvas.width = cs;
        canvas.height = cs;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(cs, cs);
        const data = img.data;
        const ro = size / 2;
        const ri = ro * inner;
        const rm = (ro + ri) / 2;
        const hb = (ro - ri) / 2;
        for (let y = 0; y < cs; y++) {
            const py = (y + 0.5) / k - ro;
            for (let x = 0; x < cs; x++) {
                const px = (x + 0.5) / k - ro;
                const r = Math.hypot(px, py) || 1;
                const u = (r - rm) / hb;
                let ox = 0;
                let oy = 0;
                if (Math.abs(u) <= 1) {
                    const e = clamp((Math.abs(u) - 0.18) / 0.82, 0, 1);
                    const m = Math.sign(u) * e * e;
                    ox = (-m * px) / r;
                    oy = (-m * py) / r;
                }
                const i = (y * cs + x) * 4;
                data[i] = 128 + ox * 127;
                data[i + 1] = 128 + oy * 127;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return canvas.toDataURL();
    };

    const update = (el) => {
        try {
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            if (w < 8 || h < 8) return;
            const p = presets[el.dataset.lg] ?? presets.panel;
            const r = clamp(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, 0, Math.min(w, h) / 2);
            const key = `${w}x${h}x${r}`;
            if (el.lgKey === key) return;
            el.lgKey = key;
            el.lgVer = (el.lgVer ?? 0) + 1;
            const id = `${el.lgBase}-${el.lgVer}`;
            const map = p.inner ? buildRingMap(w, p.inner) : buildMap(w, h, r, clamp(Math.min(w, h) * p.bezel, 10, 64));
            const scale = p.inner ? w * p.scale : p.scale;
            const filter = svgNode('filter', { id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
            filter.append(svgNode('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: p.blur, result: 'blur' }));
            filter.append(svgNode('feImage', { href: map, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'map' }));
            channels.forEach(([c, f, values]) => {
                filter.append(svgNode('feDisplacementMap', { in: 'blur', in2: 'map', scale: scale * f, xChannelSelector: 'R', yChannelSelector: 'G', result: `d${c}` }));
                filter.append(svgNode('feColorMatrix', { in: `d${c}`, type: 'matrix', values, result: `c${c}` }));
            });
            filter.append(svgNode('feComposite', { in: 'cr', in2: 'cg', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'rg' }));
            filter.append(svgNode('feComposite', { in: 'rg', in2: 'cb', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'rgb' }));
            filter.append(svgNode('feColorMatrix', { in: 'rgb', type: 'saturate', values: p.sat ?? 1.5 }));
            defs.append(filter);
            const value = `url(#${id})`;
            el.style.backdropFilter = value;
            el.style.webkitBackdropFilter = value;
            el.lgFilter?.remove();
            el.lgFilter = filter;
        } catch (err) {
            console.error('玻璃濾鏡建立失敗', err);
            el.style.backdropFilter = '';
            el.style.webkitBackdropFilter = '';
        }
    };

    const timers = new Map();
    const schedule = (el) => {
        clearTimeout(timers.get(el));
        timers.set(el, setTimeout(() => requestAnimationFrame(() => update(el)), 80));
    };

    const init = () => {
        if (!supported) return;
        try {
            root.classList.add('lg-svg');
            const els = [...document.querySelectorAll('[data-lg]')];
            const ro = new ResizeObserver((entries) => entries.forEach(({ target }) => schedule(target)));
            els.forEach((el, i) => {
                el.lgBase = `lg-${i}`;
                update(el);
                ro.observe(el);
            });
        } catch (err) {
            console.error('玻璃濾鏡初始化失敗', err);
            root.classList.remove('lg-svg');
        }
    };

    const refresh = () => {
        if (!supported) return;
        document.querySelectorAll('[data-lg]').forEach((el) => {
            if (!el.lgBase) return;
            el.lgKey = '';
            update(el);
        });
    };

    return { init, refresh };
})();

const buildFace = () => {
    try {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 60; i++) {
            const major = i % 5 === 0;
            const a = (i * 6 * Math.PI) / 180;
            const sx = Math.sin(a);
            const sy = -Math.cos(a);
            const inner = major ? 66 : 71;
            frag.append(svgNode('line', {
                class: major ? 'f-major' : 'f-minor',
                x1: (sx * inner).toFixed(2),
                y1: (sy * inner).toFixed(2),
                x2: (sx * 75.5).toFixed(2),
                y2: (sy * 75.5).toFixed(2)
            }));
        }
        for (let n = 1; n <= 12; n++) {
            const a = (n * 30 * Math.PI) / 180;
            const label = svgNode('text', {
                class: n % 3 === 0 ? 'f-num f-quarter' : 'f-num',
                x: (Math.sin(a) * 56).toFixed(2),
                y: (-Math.cos(a) * 56).toFixed(2)
            });
            label.textContent = n;
            frag.append(label);
        }
        face.append(frag);
    } catch (err) {
        console.error('錶盤建立失敗', err);
    }
};

const paintHands = () => {
    try {
        const now = getNow();
        const ms = reduceMotion.matches ? 0 : now.getMilliseconds();
        const s = now.getSeconds() + ms / 1000;
        const m = now.getMinutes() + s / 60;
        const h = (now.getHours() % 12) + m / 60;
        hands.hour.style.setProperty('--a', `${h * 30}deg`);
        hands.min.style.setProperty('--a', `${m * 6}deg`);
        hands.sec.style.setProperty('--a', `${s * 6}deg`);
        sweep.style.setProperty('--a', `${s * 6}deg`);
    } catch (err) {
        console.error('指針更新失敗', err);
    }
};

let rafId = 0;
const tick = () => {
    paintHands();
    rafId = requestAnimationFrame(tick);
};
const runClock = () => {
    cancelAnimationFrame(rafId);
    rafId = 0;
    if (state.clockStyle === 'glass') tick();
};

function updateUTCUI() {
    utcDisplay.value = state.utcOffset === null ? '自動' : `${state.utcOffset >= 0 ? '+' : ''}${state.utcOffset}`;
}

const updateTime = () => {
    try {
        const now = getNow();
        const year = now.getFullYear();
        if (Number.isNaN(year)) throw new Error('Invalid Date');
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const hours = now.getHours();
        const shown = state.is24Hour ? hours : hours % 12 || 12;
        const suffix = state.is24Hour ? '' : hours >= 12 ? 'PM' : 'AM';
        const text = `${pad(shown)}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        dateEl.textContent = `${year}-${pad(month)}-${pad(day)}`;
        timeEl.textContent = text;
        ampmEl.textContent = suffix;
        wDate.textContent = `${month}月${day}日 星期${weekdays[now.getDay()]}`;
        wTime.textContent = text;
        wAmpm.textContent = suffix;
        wZone.textContent = zoneLabel();
    } catch (err) {
        console.error('時間更新失敗', err);
        store.remove('utcOffset');
        state.utcOffset = null;
        updateUTCUI();
    }
};

const clockLoop = () => {
    updateTime();
    setTimeout(clockLoop, 1000 - (Date.now() % 1000) + 8);
};

const reveal = (commit, origin) => {
    if (!origin || !document.startViewTransition || reduceMotion.matches) {
        commit();
        return;
    }
    try {
        const { x, y } = origin;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        const transition = document.startViewTransition(commit);
        transition.ready
            .then(() => {
                root.animate(
                    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                    { duration: 760, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
                );
            })
            .catch((err) => console.warn('轉場動畫失敗', err));
    } catch (err) {
        console.warn('轉場動畫失敗', err);
        commit();
    }
};

const syncMeta = () => {
    const color = root.dataset.style === 'glass' ? (root.dataset.theme === 'dark' ? '#0e0f13' : '#eeeff1') : '#2c2f33';
    themeMeta?.setAttribute('content', color);
};

const syncSeg = () => {
    seg.style.setProperty('--i', themeModes.indexOf(state.themeMode));
    segBtns.forEach((btn) => {
        const active = btn.dataset.mode === state.themeMode;
        btn.setAttribute('aria-checked', String(active));
        btn.tabIndex = active ? 0 : -1;
    });
};

const applyTheme = (origin) => {
    const resolved = state.themeMode === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : state.themeMode;
    syncSeg();
    if (root.dataset.theme === resolved) {
        syncMeta();
        return;
    }
    reveal(() => {
        root.dataset.theme = resolved;
        syncMeta();
    }, state.clockStyle === 'glass' ? origin : null);
};

const setThemeMode = (mode, origin) => {
    if (!themeModes.includes(mode)) return;
    state.themeMode = mode;
    store.set('themeMode', mode);
    applyTheme(origin);
};

const syncRange = () => {
    try {
        const min = parseFloat(scaleSlider.min);
        const max = parseFloat(scaleSlider.max);
        const t = clamp((parseFloat(scaleSlider.value) - min) / (max - min), 0, 1);
        const width = scaleSlider.clientWidth;
        if (!width) return;
        const thumb = 16;
        const fillPx = thumb * 0.5 + t * Math.max(0, width - thumb);
        scaleSlider.style.setProperty('--pct', `${clamp((fillPx / width) * 100, 0, 100)}%`);
    } catch (err) {
        console.warn('滑桿更新失敗', err);
    }
};

const syncStyleUI = () => {
    choiceBtns.forEach((btn) => {
        const active = btn.dataset.style === state.clockStyle;
        btn.setAttribute('aria-checked', String(active));
        btn.tabIndex = active ? 0 : -1;
    });
    const label = styleLabels[state.clockStyle];
    styleBtn.setAttribute('aria-label', label);
    styleTip.textContent = label;
};

const setStyle = (style, origin) => {
    if (!clockStyles.includes(style) || style === state.clockStyle) return;
    state.clockStyle = style;
    store.set('clockStyle', style);
    syncStyleUI();
    reveal(() => {
        root.dataset.style = style;
        syncMeta();
        paintHands();
        runClock();
        syncRange();
        requestAnimationFrame(() => liquidGlass.refresh());
    }, origin);
};

const bindRadios = (buttons, key, onPick) => {
    buttons.forEach((btn, i) => {
        btn.addEventListener('click', () => onPick(btn.dataset[key], centerOf(btn)));
        btn.addEventListener('keydown', (e) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            const next = buttons[(i + step + buttons.length) % buttons.length];
            next.focus();
            onPick(next.dataset[key], centerOf(next));
        });
    });
};

const stepUTC = (delta) => {
    const base = state.utcOffset ?? Math.round(localOffset());
    state.utcOffset = clamp(base + delta, -12, 14);
    store.set('utcOffset', state.utcOffset);
    updateUTCUI();
    updateTime();
    paintHands();
};

const updateLabel = () => {
    labelText.textContent = state.is24Hour ? '24小時制' : '12小時制';
};

const applyScale = (val) => {
    const scale = clamp(Number.isFinite(val) ? val : 1, 0.5, 2);
    state.clockScale = scale;
    scaleSlider.value = scale;
    scaleValue.textContent = `${scale.toFixed(1)}x`;
    root.style.setProperty('--clock-scale', scale);
    store.set('clockScale', scale);
    syncRange();
};

const openModal = () => {
    settingsModal.classList.add('active');
    requestAnimationFrame(syncRange);
};
const closeModal = () => settingsModal.classList.remove('active');

settingsBtn.addEventListener('click', openModal);
modalCloseBtn.addEventListener('click', closeModal);
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

formatToggle.addEventListener('change', (e) => {
    state.is24Hour = e.target.checked;
    store.set('is24Hour', state.is24Hour);
    updateTime();
    updateLabel();
});

utcDec.addEventListener('click', () => stepUTC(-1));
utcInc.addEventListener('click', () => stepUTC(1));
scaleSlider.addEventListener('input', (e) => applyScale(parseFloat(e.target.value)));
window.addEventListener('resize', syncRange);

bindRadios(segBtns, 'mode', setThemeMode);
bindRadios(choiceBtns, 'style', setStyle);
styleBtn.addEventListener('click', () => setStyle(state.clockStyle === 'glass' ? 'classic' : 'glass', centerOf(styleBtn)));

darkQuery.addEventListener('change', () => {
    if (state.themeMode === 'auto') applyTheme({ x: innerWidth / 2, y: innerHeight / 2 });
});
reduceMotion.addEventListener('change', runClock);

let pointerFrame = 0;
document.addEventListener('pointermove', (e) => {
    if (state.clockStyle !== 'glass' || pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        glassEls.forEach((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width) return;
            el.style.setProperty('--mx', `${e.clientX - r.left}px`);
            el.style.setProperty('--my', `${e.clientY - r.top}px`);
        });
    });
}, { passive: true });

const wakeLock = (() => {
    let sentinel = null;
    let pending = false;
    const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

    const acquire = async () => {
        if (!('wakeLock' in navigator) || !standalone() || document.visibilityState !== 'visible') return;
        if (pending || (sentinel && !sentinel.released)) return;
        pending = true;
        try {
            sentinel = await navigator.wakeLock.request('screen');
            sentinel.addEventListener('release', () => {
                sentinel = null;
            });
        } catch (err) {
            console.warn('螢幕常亮啟用失敗', err);
        } finally {
            pending = false;
        }
    };

    const init = () => {
        document.addEventListener('visibilitychange', acquire);
        ['pointerdown', 'keydown'].forEach((type) => document.addEventListener(type, acquire, { passive: true }));
        acquire();
    };

    return { init };
})();

const footer = document.getElementById('aki-footer');
if (footer) {
    const text = footer.textContent;
    footer.textContent = '';
    const spans = [];
    for (const char of text) {
        const span = document.createElement('span');
        span.textContent = char;
        if (char === ' ') span.style.width = '0.5em';
        span.className = 'char-span';
        footer.appendChild(span);
        spans.push(span);
    }
    document.addEventListener('mousemove', (e) => {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        spans.forEach(span => {
            const rect = span.getBoundingClientRect();
            const charX = rect.left + rect.width / 2;
            const charY = rect.top + rect.height / 2;
            const distX = mouseX - charX;
            const distY = mouseY - charY;
            const distance = Math.sqrt(distX * distX + distY * distY);
            const maxDist = 60;
            if (distance < maxDist) {
                const force = (maxDist - distance) / maxDist;
                const moveX = -(distX / distance) * force * 10;
                const moveY = -(distY / distance) * force * 10;
                span.style.transform = `translate(${moveX}px, ${moveY}px)`;
            } else {
                span.style.transform = 'translate(0, 0)';
            }
        });
    });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker 註冊失敗', err));
    });
}

try {
    root.dataset.style = state.clockStyle;
    formatToggle.checked = state.is24Hour;
    updateLabel();
    updateUTCUI();
    applyScale(state.clockScale);
    syncStyleUI();
    buildFace();
    segThumb.style.transition = 'none';
    applyTheme(null);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        segThumb.style.transition = '';
    }));
    clockLoop();
    paintHands();
    runClock();
    liquidGlass.init();
    wakeLock.init();
} catch (err) {
    console.error('時鐘初始化失敗', err);
}
