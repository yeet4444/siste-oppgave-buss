const express = require('express');
const app = express();

let db = null;
let currentUser = null; 
let currentStopId = null;
let departureTimers = {};
let allStops = [];
window.addEventListener('DOMContentLoaded', async () => {
    await initDB();
});
// ── INIT ─────────────────────────────────────────
async function initDB() {
    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${file}`
    });

    // Try loading the existing database.db
    try {
        const resp = await fetch('database.db');
        if (resp.ok) {
            const buf = await resp.arrayBuffer();
        } else {
            throw new Error('no file');
        }
    } catch {

    }
    console.log('DB ready');
}



function run(sql, params = []) {
    try { db.run(sql, params); return true; }
    catch(e) { console.error('DB run error:', e); return false; }
}

function lastInsertId() {
    return query('SELECT last_insert_rowid() as id')[0]?.id ?? null;
}

// ── AUTH TABS ────────────────────────────────────
function showTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b,i) => {
        b.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
    });
    document.getElementById('loginTab').classList.toggle('active', tab === 'login');
    document.getElementById('registerTab').classList.toggle('active', tab === 'register');
}

function login() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';

    if (!username || !password) { errEl.textContent = 'Fyll inn brukernavn og passord.'; return; }

    const users = query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (users.length === 0) { errEl.textContent = 'Feil brukernavn eller passord.'; return; }

    currentUser = { id: users[0].id, username: users[0].username };
    enterApp();
}

function register() {
    const username = document.getElementById('regUser').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    const errEl    = document.getElementById('regError');
    const okEl     = document.getElementById('regSuccess');

    errEl.textContent = '';
    okEl.textContent = '';
    
    if (!username || !email || !password) {
        errEl.textContent = 'Fyll inn alle felt.';
        return;
    }

    if (password.length < 4) {
        errEl.textContent = 'Passord må ha minst 4 tegn.';
        return;
    }

    if (!success) {
        errEl.textContent = 'Noe gikk galt.';
        return;
    }

    okEl.textContent = '✓ Konto opprettet! Logger inn…';

    setTimeout(() => {
        const id = lastInsertId() || query(
            'SELECT id FROM users WHERE username=?',[username]
        )[0]?.id;

        currentUser = { id, username };
        enterApp();
    }, 900);
}
function guestLogin() {
    currentUser = null;
    enterApp();
}

function logout() {
    currentUser = null;
    document.getElementById('mainScreen').classList.remove('active');
    document.getElementById('authScreen').classList.add('active');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').textContent = '';
    closeModalDirect();
}

function enterApp() {
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainScreen').classList.add('active');
    document.getElementById('headerUser').textContent = currentUser ? '👤 ' + currentUser.username : 'Gjest';
    renderStops();
    renderFavorites();
}

// ── STOPS ────────────────────────────────────────
function renderStops(filter = '') {
    allStops = query('SELECT * FROM bus_stops ORDER BY name');
    const list = document.getElementById('stopList');
    const filtered = filter
        ? allStops.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()))
        : allStops;

    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<p class="empty-hint">Ingen holdeplasser funnet.</p>';
        return;
    }
    filtered.forEach((stop, i) => {
        const card = document.createElement('div');
        card.className = 'stop-card';
        card.style.animationDelay = `${i * 0.05}s`;
        card.innerHTML = `
            <div class="stop-icon">🚏</div>
            <div class="stop-info">
                <div class="stop-name">${escHtml(stop.name)}</div>
                <div class="stop-coords">${stop.latitude || '–'}, ${stop.longitude || '–'}</div>
            </div>
            <span class="stop-arrow">›</span>
        `;
        card.onclick = () => openStop(stop.id);
        list.appendChild(card);
    });
}

function filterStops() {
    const q = document.getElementById('stopSearch').value;
    renderStops(q);
}

function addStop() {
    const name = document.getElementById('newStopName').value.trim();
    const lat  = document.getElementById('newStopLat').value;
    const lng  = document.getElementById('newStopLng').value;
    if (!name) { alert('Skriv inn navn på holdeplassen.'); return; }

    run('INSERT INTO bus_stops (name, latitude, longitude) VALUES (?,?,?)',
        [name, lat || null, lng || null]);
    document.getElementById('newStopName').value = '';
    document.getElementById('newStopLat').value = '';
    document.getElementById('newStopLng').value = '';
    renderStops(document.getElementById('stopSearch').value);
    renderFavorites();
}

// ── FAVORITES ────────────────────────────────────
function renderFavorites() {
    const favSection = document.getElementById('favSection');
    const favList    = document.getElementById('favList');
    const favEmpty   = document.getElementById('favEmpty');

    if (!currentUser) {
        favSection.style.display = 'none';
        return;
    }
    favSection.style.display = 'block';

    const favs = query(`
        SELECT bs.* FROM bus_stops bs
        JOIN user_favorites uf ON uf.bus_stop_id = bs.id
        WHERE uf.user_id = ?
        ORDER BY bs.name
    `, [currentUser.id]);

    favList.innerHTML = '';
    favEmpty.style.display = favs.length === 0 ? 'block' : 'none';

    favs.forEach((stop, i) => {
        const card = document.createElement('div');
        card.className = 'stop-card';
        card.style.animationDelay = `${i * 0.05}s`;
        card.innerHTML = `
            <div class="stop-icon">⭐</div>
            <div class="stop-info">
                <div class="stop-name">${escHtml(stop.name)}</div>
                <div class="stop-coords">${stop.latitude || '–'}, ${stop.longitude || '–'}</div>
            </div>
            <span class="stop-arrow">›</span>
        `;
        card.onclick = () => openStop(stop.id);
        favList.appendChild(card);
    });
}

function isFavorite(stopId) {
    if (!currentUser) return false;
    return query('SELECT id FROM user_favorites WHERE user_id=? AND bus_stop_id=?',
        [currentUser.id, stopId]).length > 0;
}

function toggleFavorite() {
    if (!currentUser) { alert('Du må logge inn for å lagre favoritter.'); return; }
    if (isFavorite(currentStopId)) {
        run('DELETE FROM user_favorites WHERE user_id=? AND bus_stop_id=?',
            [currentUser.id, currentStopId]);
    } else {
        run('INSERT OR IGNORE INTO user_favorites (user_id, bus_stop_id) VALUES (?,?)',
            [currentUser.id, currentStopId]);
    }
    updateFavButton();
    renderFavorites();
}

function updateFavButton() {
    const btn = document.getElementById('favBtn');
    const fav = isFavorite(currentStopId);
    btn.textContent = fav ? '★ Fjern favoritt' : '☆ Legg til favoritt';
    btn.classList.toggle('is-fav', fav);
}

// ── MODAL ────────────────────────────────────────
function openStop(stopId) {
    currentStopId = stopId;
    const stop = query('SELECT * FROM bus_stops WHERE id=?', [stopId])[0];
    if (!stop) return;

    document.getElementById('modalStopName').textContent = stop.name;
    document.getElementById('modalCoords').textContent =
        stop.latitude ? `${stop.latitude}, ${stop.longitude}` : 'Ingen koordinater';

    updateFavButton();
    loadBusOptions();
    renderDepartures();

    document.getElementById('modal').classList.add('open');

    // Auto-refresh departures every 30s
    clearInterval(departureTimers[stopId]);
    departureTimers[stopId] = setInterval(renderDepartures, 30000);
}

function closeModal(e) {
    if (e.target === document.getElementById('modal')) closeModalDirect();
}
function closeModalDirect() {
    document.getElementById('modal').classList.remove('open');
    Object.values(departureTimers).forEach(clearInterval);
    departureTimers = {};
    currentStopId = null;
}

// ── DEPARTURES ───────────────────────────────────
function renderDepartures() {
    if (!currentStopId) return;
    const now = Math.floor(Date.now() / 1000);

    // Clean up old departures (arrived already, older than 2 min)
    run('DELETE FROM AVgang WHERE stop_id=? AND (avgang + created_at) < ?',
        [currentStopId, now - 120]);

    const rows = query(`
        SELECT a.avgang, a.line_number, b.driver_name
        FROM AVgang a
        LEFT JOIN buses b ON b.line_number = CAST(a.line_number AS VARCHAR)
        WHERE a.stop_id = ?
        ORDER BY a.avgang ASC
    `, [currentStopId]);

    const list  = document.getElementById('departures');
    const empty = document.getElementById('depEmpty');
    list.innerHTML = '';

    if (rows.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    rows.forEach(r => {
        const mins = Math.max(0, Math.round(r.avgang));
        const item = document.createElement('div');
        item.className = 'dep-item';

        let timeClass = mins <= 1 ? 'now' : mins <= 5 ? 'soon' : 'later';
        let timeLabel = mins <= 0 ? 'NÅ' : mins === 1 ? '1 min' : `${mins} min`;

        item.innerHTML = `
            <div class="dep-line">${escHtml(String(r.line_number))}</div>
            <div class="dep-info">
                <div>Linje ${escHtml(String(r.line_number))}</div>
                ${r.driver_name ? `<div class="dep-driver">🧑‍✈️ ${escHtml(r.driver_name)}</div>` : ''}
            </div>
            <div class="dep-time ${timeClass}">
                ${timeLabel}
                <div class="dep-mins">${mins > 0 ? 'til ankomst' : 'ankommer'}</div>
            </div>
        `;
        list.appendChild(item);
    });
}

function addDeparture() {
    const busSelect = document.getElementById('depBusSelect');
    const minsEl    = document.getElementById('depMinutes');
    const lineNum   = busSelect.value;
    const mins      = parseInt(minsEl.value);

    if (!lineNum) { alert('Velg en buss.'); return; }
    if (isNaN(mins) || mins < 0) { alert('Skriv inn gyldige minutter.'); return; }
    if (!currentStopId) return;

    run('INSERT INTO AVgang (avgang, line_number, stop_id) VALUES (?,?,?)',
        [mins, lineNum, currentStopId]);

    minsEl.value = '';
    busSelect.value = '';
    renderDepartures();
}

function loadBusOptions() {
    const buses = query('SELECT * FROM buses ORDER BY line_number');
    const sel = document.getElementById('depBusSelect');
    sel.innerHTML = '<option value="">Velg buss...</option>';
    buses.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.line_number;
        opt.textContent = `Linje ${b.line_number}${b.driver_name ? ' – ' + b.driver_name : ''}`;
        sel.appendChild(opt);
    });
}

// ── ADD BUS ──────────────────────────────────────
function addBus() {
    const line   = document.getElementById('newBusLine').value.trim();
    const driver = document.getElementById('newBusDriver').value.trim();
    if (!line) { alert('Skriv inn linjenummer.'); return; }

    run('INSERT INTO buses (line_number, driver_name) VALUES (?,?)', [line, driver || null]);
    document.getElementById('newBusLine').value = '';
    document.getElementById('newBusDriver').value = '';
    alert(`Buss linje ${line} lagt til!`);
}

// ── UTILS ─────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

// ── BOOTSTRAP ────────────────────────────────────
/*(async function() {
    // Inject sql.js from CDN
    await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
    });
    await initDB();
    /*/

window.onload(initDB);

const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello from Express!');
});

app.listen(port, () => {
  console.log(`Express server running at http://localhost:${port}`);
});
