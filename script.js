const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const pad = (n) => String(n).padStart(2, '0');
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
    }
};

const readOffset = () => {
    const raw = store.get('utcOffset', null);
    if (raw === null || raw === '' || raw === 'auto' || typeof raw === 'boolean') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n, -12, 14) : null;
};

const readScale = () => {
    const n = Number(store.get('clockScale', 1));
    return Number.isFinite(n) ? clamp(n, 0.5, 2) : 1;
};

const themeModes = ['light', 'auto', 'dark'];
const state = {
    themeMode: themeModes.includes(store.get('themeMode', 'auto')) ? store.get('themeMode', 'auto') : 'auto',
    is24: store.get('is24Hour', true) !== false,
    showSeconds: store.get('showSeconds', true) !== false,
    wakeLock: store.get('wakeLock', false) === true,
    scale: readScale(),
    offset: readOffset()
};

const toastEl = $('toast');
let toastTimer = 0;
const showToast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
};

const liquidGlass = (() => {
    const ns = 'http://www.w3.org/2000/svg';
    const defs = $('lg-defs');
    const presets = {
        panel: { scale: 74, blur: 2.4, bezel: 0.24 },
        pill: { scale: 36, blur: 1.2, bezel: 0.5 },
        sheet: { scale: 60, blur: 7, bezel: 0.2 }
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

    const node = (tag, attrs) => {
        const n = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
        return n;
    };

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
            const bezel = clamp(Math.min(w, h) * p.bezel, 10, 64);
            const filter = node('filter', {
                id,
                x: 0,
                y: 0,
                width: w,
                height: h,
                filterUnits: 'userSpaceOnUse',
                'color-interpolation-filters': 'sRGB'
            });
            filter.append(node('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: p.blur, result: 'blur' }));
            filter.append(node('feImage', { href: buildMap(w, h, r, bezel), x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'map' }));
            channels.forEach(([c, f, values]) => {
                filter.append(node('feDisplacementMap', { in: 'blur', in2: 'map', scale: p.scale * f, xChannelSelector: 'R', yChannelSelector: 'G', result: `d${c}` }));
                filter.append(node('feColorMatrix', { in: `d${c}`, type: 'matrix', values, result: `c${c}` }));
            });
            filter.append(node('feComposite', { in: 'cr', in2: 'cg', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'rg' }));
            filter.append(node('feComposite', { in: 'rg', in2: 'cb', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'rgb' }));
            filter.append(node('feColorMatrix', { in: 'rgb', type: 'saturate', values: 1.5 }));
            defs.append(filter);
            const value = `url(#${id})`;
            el.style.backdropFilter = value;
            el.style.webkitBackdropFilter = value;
            el.lgFilter?.remove();
            el.lgFilter = filter;
        } catch (err) {
            console.error('液態玻璃濾鏡建立失敗', err);
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
            console.error('液態玻璃初始化失敗', err);
            root.classList.remove('lg-svg');
        }
    };

    return { init };
})();

const clockEl = $('clock');
const dateEl = $('date');
const zoneEl = $('zone-chip');
const ampmEl = $('ampm');
const sideEl = ampmEl.parentElement;
const colonEl = $('colon');
const sweepEl = $('dial-sweep');
const fillEl = $('progress-fill');
const groups = { hours: $('hours'), minutes: $('minutes'), seconds: $('seconds') };
const weekdays = '日一二三四五六';

const formatOffset = (off) => {
    const sign = off < 0 ? '−' : '+';
    const abs = Math.abs(off);
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    return `UTC${sign}${h}${m ? `:${pad(m)}` : ''}`;
};

const deviceOffset = () => -new Date().getTimezoneOffset() / 60;

const readTime = () => {
    const d = new Date();
    if (state.offset === null) {
        return {
            y: d.getFullYear(), mo: d.getMonth() + 1, day: d.getDate(), wd: d.getDay(),
            h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds(),
            off: -d.getTimezoneOffset() / 60
        };
    }
    const t = new Date(d.getTime() + state.offset * 3600000);
    return {
        y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, day: t.getUTCDate(), wd: t.getUTCDay(),
        h: t.getUTCHours(), m: t.getUTCMinutes(), s: t.getUTCSeconds(), ms: t.getUTCMilliseconds(),
        off: state.offset
    };
};

const makeCell = () => {
    const cell = document.createElement('span');
    cell.className = 'dg';
    const ghost = document.createElement('span');
    ghost.className = 'dg-ghost';
    ghost.textContent = '0';
    cell.append(ghost);
    return cell;
};

const setGroup = (group, text, animate) => {
    const chars = [...text];
    let canAnimate = animate && !reduceMotion.matches;
    if (group.children.length !== chars.length) {
        group.replaceChildren(...chars.map(makeCell));
        canAnimate = false;
    }
    chars.forEach((ch, i) => {
        const cell = group.children[i];
        if (cell.dataset.v === ch) return;
        cell.dataset.v = ch;
        const next = document.createElement('span');
        next.className = 'dg-val';
        next.textContent = ch;
        const prev = [...cell.querySelectorAll('.dg-val')];
        if (canAnimate) {
            next.classList.add('is-in');
            prev.forEach((old) => {
                old.classList.remove('is-in');
                old.classList.add('is-out');
                old.addEventListener('animationend', () => old.remove(), { once: true });
                setTimeout(() => old.remove(), 900);
            });
        } else {
            prev.forEach((old) => old.remove());
        }
        cell.append(next);
    });
};

const render = (t, animate) => {
    const hours = state.is24 ? pad(t.h) : String(t.h % 12 || 12);
    setGroup(groups.hours, hours, animate);
    setGroup(groups.minutes, pad(t.m), animate);
    setGroup(groups.seconds, pad(t.s), animate);
    ampmEl.textContent = state.is24 ? '' : t.h < 12 ? 'AM' : 'PM';
    sideEl.classList.toggle('is-empty', state.is24 && !state.showSeconds);
    dateEl.textContent = `${t.y} 年 ${t.mo} 月 ${t.day} 日 · 星期${weekdays[t.wd]}`;
    zoneEl.textContent = formatOffset(t.off);
    clockEl.setAttribute('aria-label', `現在時間 ${hours} 點 ${pad(t.m)} 分`);
};

let lastKey = '';
const frame = () => {
    try {
        const t = readTime();
        const sec = t.s + t.ms / 1000;
        sweepEl.style.transform = `rotate(${sec * 6}deg)`;
        fillEl.style.transform = `scaleX(${sec / 60})`;
        colonEl.classList.toggle('is-dim', t.ms >= 500);
        const key = `${t.h}:${t.m}:${t.s}:${state.is24}:${state.offset}:${state.showSeconds}`;
        if (key !== lastKey) {
            render(t, lastKey !== '');
            lastKey = key;
        }
    } catch (err) {
        console.error('時鐘更新失敗', err);
    }
    requestAnimationFrame(frame);
};

const themeMeta = document.querySelector('meta[name="theme-color"]');
const seg = $('theme-seg');
const segBtns = [...seg.querySelectorAll('.seg-btn')];

const syncSeg = () => {
    const index = themeModes.indexOf(state.themeMode);
    seg.style.setProperty('--i', index);
    segBtns.forEach((btn) => {
        const active = btn.dataset.mode === state.themeMode;
        btn.setAttribute('aria-checked', String(active));
        btn.tabIndex = active ? 0 : -1;
    });
};

const applyTheme = (origin) => {
    const resolved = state.themeMode === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : state.themeMode;
    syncSeg();
    if (root.dataset.theme === resolved) return;
    const commit = () => {
        root.dataset.theme = resolved;
        themeMeta?.setAttribute('content', resolved === 'dark' ? '#0b0d14' : '#eef1f7');
    };
    if (!origin || !document.startViewTransition || reduceMotion.matches) {
        commit();
        return;
    }
    try {
        const { x, y } = origin;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        const transition = document.startViewTransition(commit);
        transition.ready.then(() => {
            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: 760, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
            );
        }).catch((err) => console.warn('主題轉場失敗', err));
    } catch (err) {
        console.warn('主題轉場失敗', err);
        commit();
    }
};

const setThemeMode = (mode, origin) => {
    if (!themeModes.includes(mode)) return;
    state.themeMode = mode;
    store.set('themeMode', mode);
    applyTheme(origin);
};

segBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        const r = btn.getBoundingClientRect();
        setThemeMode(btn.dataset.mode, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
});

seg.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const index = (themeModes.indexOf(state.themeMode) + step + themeModes.length) % themeModes.length;
    const btn = segBtns[index];
    btn.focus();
    const r = btn.getBoundingClientRect();
    setThemeMode(themeModes[index], { x: r.left + r.width / 2, y: r.top + r.height / 2 });
});

darkQuery.addEventListener('change', () => {
    if (state.themeMode === 'auto') applyTheme({ x: innerWidth / 2, y: innerHeight / 2 });
});

const syncRangeFill = (el) => {
    try {
        const min = Number(el.min) || 0;
        const max = Number(el.max) || 100;
        const span = max - min || 1;
        const t = (Number(el.value) - min) / span;
        const width = el.getBoundingClientRect().width || el.clientWidth || 1;
        const thumb = 16;
        const fillPx = thumb * 0.5 + t * Math.max(0, width - thumb);
        const pct = Math.max(0, Math.min(100, (fillPx / width) * 100));
        el.style.setProperty('--pct', `${pct}%`);
    } catch (err) {
        console.error('同步拉桿填色失敗', err);
    }
};

const formatToggle = $('format-toggle');
const formatLabel = document.querySelector('.label-text');
const secondsToggle = $('seconds-toggle');
const wakeToggle = $('wake-toggle');
const wakeRow = $('wake-row');
const slider = $('scale-slider');
const scaleValue = $('scale-value');
const utcDisplay = $('utc-display');
const utcDesc = $('utc-desc');
const utcReset = $('utc-reset');

const syncSettings = () => {
    formatToggle.checked = state.is24;
    formatLabel.textContent = `目前：${state.is24 ? '24' : '12'} 小時制`;
    secondsToggle.checked = state.showSeconds;
    root.classList.toggle('no-seconds', !state.showSeconds);
    wakeToggle.checked = state.wakeLock;
    slider.value = String(state.scale);
    scaleValue.textContent = `${state.scale.toFixed(2)}x`;
    root.style.setProperty('--clock-scale', String(state.scale));
    syncRangeFill(slider);
    const auto = state.offset === null;
    utcDisplay.textContent = auto ? '自動' : formatOffset(state.offset);
    utcDesc.textContent = auto ? `跟隨裝置時區（${formatOffset(deviceOffset())}）` : '已手動指定時區';
    utcReset.setAttribute('aria-pressed', String(auto));
};

const shiftOffset = (delta) => {
    const base = state.offset ?? deviceOffset();
    state.offset = clamp(Math.round((base + delta) * 4) / 4, -12, 14);
    store.set('utcOffset', state.offset);
    syncSettings();
};

$('utc-dec').addEventListener('click', () => shiftOffset(-1));
$('utc-inc').addEventListener('click', () => shiftOffset(1));
utcReset.addEventListener('click', () => {
    if (state.offset === null) return;
    state.offset = null;
    store.set('utcOffset', null);
    syncSettings();
    showToast('已恢復為裝置時區');
});

formatToggle.addEventListener('change', () => {
    state.is24 = formatToggle.checked;
    store.set('is24Hour', state.is24);
    syncSettings();
});

secondsToggle.addEventListener('change', () => {
    state.showSeconds = secondsToggle.checked;
    store.set('showSeconds', state.showSeconds);
    syncSettings();
});

slider.addEventListener('input', () => {
    state.scale = clamp(Number(slider.value) || 1, 0.5, 2);
    scaleValue.textContent = `${state.scale.toFixed(2)}x`;
    root.style.setProperty('--clock-scale', String(state.scale));
    syncRangeFill(slider);
});
slider.addEventListener('change', () => store.set('clockScale', state.scale));
slider.addEventListener('pointerdown', () => slider.classList.add('is-dragging'));
['pointerup', 'pointercancel'].forEach((ev) => addEventListener(ev, () => slider.classList.remove('is-dragging')));
addEventListener('resize', () => syncRangeFill(slider));

let wakeSentinel = null;
const wakeSupported = 'wakeLock' in navigator;

const acquireWake = async (silent = false) => {
    if (!wakeSupported || !state.wakeLock || wakeSentinel || document.visibilityState !== 'visible') return;
    try {
        wakeSentinel = await navigator.wakeLock.request('screen');
        wakeSentinel.addEventListener('release', () => {
            wakeSentinel = null;
        });
    } catch (err) {
        console.warn('螢幕常亮失敗', err);
        if (silent) return;
        state.wakeLock = false;
        store.set('wakeLock', false);
        wakeToggle.checked = false;
        showToast('無法保持螢幕常亮，請確認瀏覽器權限或電量模式');
    }
};

const releaseWake = async () => {
    try {
        await wakeSentinel?.release();
    } catch (err) {
        console.warn('釋放螢幕常亮失敗', err);
    }
    wakeSentinel = null;
};

if (!wakeSupported) wakeRow.hidden = true;

wakeToggle.addEventListener('change', async () => {
    state.wakeLock = wakeToggle.checked;
    store.set('wakeLock', state.wakeLock);
    if (state.wakeLock) {
        await acquireWake();
        if (state.wakeLock) showToast('螢幕將保持常亮');
    } else {
        await releaseWake();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') acquireWake(true);
});

const fsWrap = $('fs-wrap');
const fsBtn = $('fs-btn');
const fsTip = $('fs-tip');

if (!document.fullscreenEnabled) fsWrap.style.display = 'none';

fsBtn.addEventListener('click', async () => {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await root.requestFullscreen({ navigationUI: 'hide' });
    } catch (err) {
        console.warn('切換全螢幕失敗', err);
        showToast('目前無法切換全螢幕');
    }
});

document.addEventListener('fullscreenchange', () => {
    const on = Boolean(document.fullscreenElement);
    root.classList.toggle('is-fullscreen', on);
    fsTip.textContent = on ? '離開全螢幕' : '全螢幕';
    fsBtn.setAttribute('aria-label', fsTip.textContent);
});

const overlay = $('settings-modal');
const settingsBtn = $('settings-btn');
const closeBtn = $('modal-close-btn');

const openModal = () => {
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    syncSettings();
    requestAnimationFrame(() => {
        syncRangeFill(slider);
        closeBtn.focus({ preventScroll: true });
    });
};

const closeModal = () => {
    if (!overlay.classList.contains('active')) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    settingsBtn.focus({ preventScroll: true });
};

settingsBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

const dock = $('dock');
let idleTimer = 0;
const goIdle = () => {
    if (overlay.classList.contains('active') || dock.matches(':hover, :focus-within')) {
        idleTimer = setTimeout(goIdle, 3500);
        return;
    }
    document.body.classList.add('is-idle');
};
const wakeUi = () => {
    document.body.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(goIdle, 3500);
};
['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, wakeUi, { passive: true }));

const glassEls = [...document.querySelectorAll('.glass')];
let pointer = null;
let pointerQueued = false;
addEventListener('pointermove', (e) => {
    pointer = e;
    if (pointerQueued) return;
    pointerQueued = true;
    requestAnimationFrame(() => {
        pointerQueued = false;
        glassEls.forEach((el) => {
            const r = el.getBoundingClientRect();
            el.style.setProperty('--mx', `${pointer.clientX - r.left}px`);
            el.style.setProperty('--my', `${pointer.clientY - r.top}px`);
        });
    });
}, { passive: true });
root.addEventListener('mouseleave', () => {
    glassEls.forEach((el) => {
        el.style.setProperty('--mx', '-9999px');
        el.style.setProperty('--my', '-9999px');
    });
});

try {
    syncSettings();
    const segThumb = seg.querySelector('.seg-thumb');
    segThumb.style.transition = 'none';
    applyTheme(null);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        segThumb.style.transition = '';
    }));
    liquidGlass.init();
    requestAnimationFrame(frame);
    wakeUi();
    acquireWake(true);
    document.fonts?.ready.then(() => syncRangeFill(slider)).catch(() => { });
} catch (err) {
    console.error('初始化失敗', err);
    showToast('時鐘初始化失敗，請重新整理頁面');
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker 註冊失敗', err));
    });
}

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
