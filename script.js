const timeEl = document.getElementById('time');
const dateEl = document.getElementById('date');
const formatToggle = document.getElementById('format-toggle');
const labelText = document.querySelector('.label-text');
const utcInput = document.getElementById('utc-input');

let is24Hour = localStorage.getItem('is24Hour') !== 'false';
let utcOffset = localStorage.getItem('utcOffset');

formatToggle.checked = is24Hour;
if (utcOffset !== null) {
    utcInput.value = utcOffset;
}
updateLabel();

formatToggle.addEventListener('change', (e) => {
    is24Hour = e.target.checked;
    localStorage.setItem('is24Hour', is24Hour);
    updateTime();
    updateLabel();
});

utcInput.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === '') {
        utcOffset = null;
        localStorage.removeItem('utcOffset');
    } else {
        let num = parseInt(val);
        if (isNaN(num)) num = 0;
        if (num < -12) num = -12;
        if (num > 14) num = 14;
        utcOffset = num;
        utcInput.value = num;
        localStorage.setItem('utcOffset', utcOffset);
    }
    updateTime();
});

updateTime();
setInterval(updateTime, 1000);

function updateLabel() {
    labelText.textContent = is24Hour ? '24小時制' : '12小時制';
}

const footer = document.getElementById('aki-footer');
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


function updateTime() {
    let now = new Date();

    if (utcOffset !== null) {
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        now = new Date(utc + (3600000 * utcOffset));
    }

    const year = now.getFullYear();
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
        timeEl.textContent = `${orders(hours)}:${minutes}:${seconds} ${ampm}`;
    } else {
        timeEl.textContent = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(reg => console.log('SW registered!', reg))
                    .catch(err => console.log('SW failed!', err));
            });
        }

        function orders(h) {

            return String(h).padStart(2, '0');
        }

        updateTime();
        setInterval(updateTime, 1000);
