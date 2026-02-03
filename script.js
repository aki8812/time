const timeEl = document.getElementById('time');
const ampmEl = document.getElementById('ampm');
const dateEl = document.getElementById('date');
const formatToggle = document.getElementById('format-toggle');
const labelText = document.querySelector('.label-text');
const utcInput = document.getElementById('utc-input');
const utcDisplay = document.getElementById('utc-display');
const utcDec = document.getElementById('utc-dec');
const utcInc = document.getElementById('utc-inc');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const scaleSlider = document.getElementById('scale-slider');
const scaleValue = document.getElementById('scale-value');
const clockBox = document.getElementById('clock-box');

let is24Hour = localStorage.getItem('is24Hour') !== 'false';
let utcOffsetStr = localStorage.getItem('utcOffset');
let utcOffset = null;
let clockScale = parseFloat(localStorage.getItem('clockScale')) || 1.0;

if (utcOffsetStr !== null && utcOffsetStr !== "NaN" && utcOffsetStr !== "") {
    let num = parseInt(utcOffsetStr);
    if (!isNaN(num)) {
        utcOffset = Math.max(-12, Math.min(14, num));
    }
}

formatToggle.checked = is24Hour;
updateUTCUI();
scaleSlider.value = clockScale;
applyScale(clockScale);
updateLabel();

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('active');
});

modalCloseBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('active');
    }
});

formatToggle.addEventListener('change', (e) => {
    is24Hour = e.target.checked;
    localStorage.setItem('is24Hour', is24Hour);
    updateTime();
    updateLabel();
});

function updateUTCUI() {
    if (utcOffset === null) {
        utcDisplay.value = "自動";
    } else {
        const prefix = utcOffset >= 0 ? "+" : "";
        utcDisplay.value = prefix + utcOffset;
    }
}

utcDec.addEventListener('click', () => {
    if (utcOffset === null) {
        const local = -(new Date().getTimezoneOffset() / 60);
        utcOffset = local - 1;
    } else {
        utcOffset = Math.max(-12, utcOffset - 1);
    }
    localStorage.setItem('utcOffset', utcOffset);
    updateUTCUI();
    updateTime();
});

utcInc.addEventListener('click', () => {
    if (utcOffset === null) {
        const local = -(new Date().getTimezoneOffset() / 60);
        utcOffset = local + 1;
    } else {
        utcOffset = Math.min(14, utcOffset + 1);
    }
    localStorage.setItem('utcOffset', utcOffset);
    updateUTCUI();
    updateTime();
});

scaleSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    applyScale(val);
});

function applyScale(val) {
    clockScale = val;
    scaleValue.textContent = `${val.toFixed(1)}x`;
    document.documentElement.style.setProperty('--clock-scale', val);
    localStorage.setItem('clockScale', val);
}

function updateLabel() {
    labelText.textContent = is24Hour ? '24小時制' : '12小時制';
}

const footer = document.getElementById('aki-footer');
if (footer) {
    const text = footer.textContent;
    footer.textContent = '';
    const spans = [];
    for (let char of text) {
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
                span.style.transform = `translate(0, 0)`;
            }
        });
    });
}

function updateTime() {
    try {
        let now = new Date();

        if (utcOffset !== null) {
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            now = new Date(utc + (3600000 * utcOffset));
        }

        const year = now.getFullYear();
        if (isNaN(year)) throw new Error("Invalid Date");

        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        dateEl.textContent = `${year}-${month}-${day}`;

        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        if (!is24Hour) {
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            timeEl.textContent = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
            ampmEl.textContent = ampm;
        } else {
            timeEl.textContent = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
            ampmEl.textContent = '';
        }
    } catch (err) {
        console.error("Time update failed", err);
        localStorage.removeItem('utcOffset');
        utcOffset = null;
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    });
}

updateTime();
setInterval(updateTime, 1000);
