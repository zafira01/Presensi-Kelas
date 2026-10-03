// ================================================================
// KONFIGURASI  (ganti URL ini bila Web App Apps Script di-deploy ulang)
// ================================================================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwVrrfn7GLyz3XQeg0ZdROiiHC1a7_RVHY7-CoyGWF8K9OrKkW9K1VNLxr3eQKBsom2HQ/exec';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1lhqfmM4mJChGhWpmoU-DNKcTvX18dP9qOW79MGg3CJw/edit?gid=1140772947#gid=1140772947';
const AUTO_REFRESH_MS = 15000;

const S = { scanning: false, flash: false, busy: false, qr: null, data: [], today: {}, filter: 'all', query: '', first: true, qrNim: '', mk: '' };
const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const avatar = (n, nim) => `<div class="avatar" style="background:hsl(${205 + hue(nim || n) % 40} 60% 76%)">${esc(initials(n))}</div>`;

// ================================================================
// JAM & TANGGAL
// ================================================================
function tick() {
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':');
  $('dateText').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (S.mk ? ' · ' + S.mk : '');
}

// ================================================================
// UI HELPERS
// ================================================================
function setConn(status, msg) {
  $('statusDot').className = 'dot ' + status;
  $('statusLabel').textContent = msg;
}

function showStatus(msg, type = 'info', dur = 4000) {
  const el = $('status'), icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${esc(msg)}`;
  el.className = 'status ' + type; el.style.display = 'flex';
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.display = 'none'), dur);
}

function countUp(el, to) {
  const from = parseInt(el.textContent) || 0, t0 = performance.now();
  if (from === to) return;
  (function step(t) {
    const p = Math.min((t - t0) / 700, 1);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

function updateStats() {
  const total = S.data.length, hadir = S.data.filter(m => S.today[m.nim]).length;
  const pct = total ? Math.round(hadir / total * 100) : 0;
  countUp($('statTotal'), total); countUp($('statHadir'), hadir); countUp($('statBelum'), total - hadir);
  $('pctText').textContent = pct + '%';
  $('ringFg').style.strokeDashoffset = 276.46 * (1 - pct / 100);
  $('totalMahasiswa').textContent = total;
  renderFeed();
}

function renderFeed() {
  const items = Object.entries(S.today).map(([nim, v]) => ({ nim, waktu: v.waktu || '', m: S.data.find(x => x.nim === nim) }))
    .filter(x => x.m).sort((a, b) => String(b.waktu).localeCompare(String(a.waktu))).slice(0, 8);
  $('feed').innerHTML = items.length ? items.map(x => `<li>${avatar(x.m.nama, x.nim)}<div class="who"><b>${esc(x.m.nama)}</b><span>${esc(x.m.kelas)}</span></div><span class="time">${esc(x.waktu)}</span></li>`).join('')
    : '<li class="empty">Belum ada yang hadir hari ini.</li>';
}

// ================================================================
// DATA: GOOGLE SHEETS
// ================================================================
async function api(query) {
  const r = await fetch(WEB_APP_URL + query, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (!j || j.success === false) throw new Error((j && j.message) || 'Respons server tidak valid');
  return j;
}

function normalize(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(row => {
    const n = {};
    Object.keys(row || {}).forEach(k => (n[k.toString().trim().toLowerCase().replace(/\s+/g, '')] = row[k]));
    return { nim: String(n.nim ?? '').trim(), nama: String(n.nama ?? '').trim(), kelas: String(n.kelas ?? '').trim(), jurusan: String(n.jurusan ?? '').trim(), matakuliah: String(n.matakuliah ?? '').trim() };
  }).filter(m => m.nim);
}

async function fetchToday() {
  try {
    const j = await api('?action=get_today_attendance'), map = {};
    (j.data || []).forEach(i => (map[String(i.nim).trim()] = { waktu: i.waktu, status: i.status }));
    S.today = map;
  } catch (e) { console.warn('Status hari ini gagal:', e.message); }
}

async function loadDataMahasiswa(manual = false) {
  const btn = $('btnRefresh'), box = $('loadingData');
  btn.classList.add('spin');
  if (S.first && !S.data.length) box.innerHTML = '<div class="skel"></div>'.repeat(5);
  try {
    const j = await api('?action=get_all');
    const data = normalize(j.data);
    await fetchToday();
    S.data = data; S.first = false; S.mk = (data[0] && data[0].matakuliah) || S.mk;
    try { localStorage.setItem('mahasiswaData', JSON.stringify(data)); } catch (e) {}
    setConn('online', 'Tersinkron');
    if (!data.length) {
      box.innerHTML = `Belum ada data mahasiswa di sheet.<br><a class="btn ghost" href="${SHEET_URL}" target="_blank" rel="noopener">Buka Google Sheets</a>`;
    } else box.innerHTML = '';
    if (manual) showStatus('Data diperbarui', 'success', 2000);
  } catch (e) {
    let cache = []; try { cache = JSON.parse(localStorage.getItem('mahasiswaData') || '[]'); } catch (_) {}
    setConn('offline', cache.length ? 'Offline, pakai cache' : 'Gagal terhubung');
    if (cache.length) { if (!S.data.length) S.data = cache; box.innerHTML = ''; }
    else box.innerHTML = `Gagal memuat data: ${esc(e.message)}<br>Periksa URL Web App di script.js.<br><button class="btn ghost" onclick="loadDataMahasiswa(true)">Coba lagi</button>`;
  } finally { btn.classList.remove('spin'); renderList(); updateStats(); }
}

function renderList(flashNim) {
  const q = S.query.toLowerCase();
  const rows = S.data.filter(m => {
    const hadir = !!S.today[m.nim];
    return (S.filter === 'all' || (S.filter === 'hadir') === hadir) && (!q || m.nama.toLowerCase().includes(q) || m.nim.toLowerCase().includes(q));
  });
  $('tableBody').innerHTML = rows.length ? rows.map((m, i) => {
    const h = S.today[m.nim];
    return `<li data-nim="${esc(m.nim)}" class="${m.nim === flashNim ? 'flash' : ''}" style="animation-delay:${Math.min(i, 12) * 35}ms">
      ${avatar(m.nama, m.nim)}<div class="who"><b>${esc(m.nama)}</b><span>${esc(m.nim)} · ${esc(m.kelas)} · ${esc(m.jurusan)}</span></div>
      ${h && h.waktu ? `<span class="time">${esc(h.waktu)}</span>` : ''}
      <span class="pill ${h ? 'hadir' : 'belum'}"><i class="fas ${h ? 'fa-check' : 'fa-minus'}"></i> ${h ? 'Hadir' : 'Belum'}</span></li>`;
  }).join('') : (S.data.length ? '<li class="empty">Tidak ada yang cocok.</li>' : '');
}

// ================================================================
// EFEK: KONFETI, SUARA, HASIL SCAN
// ================================================================
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('confetti'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#8ab4ff', '#5b8def', '#a9c8ff', '#c8d3e6', '#fff'];
  const ps = Array.from({ length: 110 }, () => ({ x: c.width / 2, y: c.height / 2, vx: (Math.random() - .5) * 16, vy: Math.random() * -15 - 3, s: Math.random() * 7 + 4, r: Math.random() * 6, vr: Math.random() * .3 - .15, c: cols[Math.random() * 5 | 0] }));
  let f = 0;
  (function draw() {
    x.clearRect(0, 0, c.width, c.height);
    ps.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
    if (++f < 140) requestAnimationFrame(draw); else x.clearRect(0, 0, c.width, c.height);
  })();
}

function beep(ok) {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.type = 'sine';
    o.frequency.setValueAtTime(ok ? 660 : 220, a.currentTime);
    if (ok) o.frequency.setValueAtTime(990, a.currentTime + .12);
    g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .35);
    o.start(); o.stop(a.currentTime + .35);
  } catch (e) {}
}

function showResult(type, m, text) {
  const icons = { success: 'fa-check', warning: 'fa-clock', error: 'fa-xmark' };
  $('resultIcon').className = 'tick ' + type; $('resultIcon').innerHTML = `<i class="fas ${icons[type]}"></i>`;
  $('resultAvatar').outerHTML = `<div class="avatar big" id="resultAvatar" style="background:hsl(${205 + hue(m ? m.nim : 'x') % 40} 60% 76%)">${m ? esc(initials(m.nama)) : '?'}</div>`;
  $('resultName').textContent = m ? m.nama : 'Tidak dikenali';
  $('resultMeta').textContent = m ? `${m.nim} · ${m.kelas} · ${m.jurusan}` : '';
  $('resultPill').className = 'pill ' + (type === 'success' ? 'hadir' : type);
  $('resultPill').textContent = text;
  $('result').classList.add('show');
  $('scannerArea').classList.add('hit');
  setTimeout(() => $('scannerArea').classList.remove('hit'), 700);
  if (type === 'success') confetti();
  beep(type === 'success');
  if (navigator.vibrate) navigator.vibrate(type === 'success' ? 80 : [60, 40, 60]);
  clearTimeout(showResult._t);
  showResult._t = setTimeout(() => $('result').classList.remove('show'), 2600);
}

// ================================================================
// PRESENSI
// ================================================================
async function processPresensi(qrData) {
  let nim = '';
  try { nim = String(JSON.parse(qrData).nim || '').trim(); } catch (e) { nim = String(qrData).trim(); }
  const m = S.data.find(x => x.nim === nim);
  try {
    if (nim.length < 3 || !m) { showResult('error', null, `NIM ${nim || '-'} tidak terdaftar`); $('presensiStatus').textContent = 'Tidak terdaftar'; return; }
    showStatus('Memproses presensi…', 'info', 6000);
    const r = await fetch(WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'presensi', nim }) });
    const res = await r.json();
    if (!res.success) {
      if (res.alreadyPresent) {
        if (!S.today[nim]) S.today[nim] = { waktu: '', status: 'Hadir' };
        showResult('warning', m, 'Sudah presensi hari ini'); $('presensiStatus').textContent = 'Sudah hadir';
      } else { showResult('error', m, res.message || 'Gagal menyimpan'); $('presensiStatus').textContent = 'Gagal'; }
    } else {
      S.today[nim] = { waktu: (res.data && res.data.waktu) || new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':'), status: 'Hadir' };
      showResult('success', m, 'Hadir tercatat'); $('presensiStatus').textContent = m.nama + ' hadir';
    }
    renderList(nim); updateStats();
  } catch (e) {
    showStatus('Error: ' + e.message, 'error'); $('presensiStatus').textContent = 'Error';
  } finally {
    setTimeout(() => { S.busy = false; $('scanStatusText').textContent = 'Arahkan ke QR Code'; if (!S.scanning) startScanner(); }, 3000);
  }
}

function onScanSuccess(text) {
  if (S.busy) return;
  S.busy = true;
  if (S.qr && S.scanning) S.qr.stop().then(() => { S.scanning = false; setScanUI(false); }).catch(() => {});
  processPresensi(text);
}

// ================================================================
// SCANNER
// ================================================================
function setScanUI(on) {
  $('scannerArea').classList.toggle('on', on);
  const b = $('btnStartScan');
  b.classList.toggle('stop', on);
  b.innerHTML = on ? '<i class="fas fa-stop"></i> <span>Stop scan</span>' : '<i class="fas fa-play"></i> <span>Mulai scan</span>';
}

function toggleScanner() { S.scanning ? stopScanner() : startScanner(); }

async function startScanner() {
  if (S.scanning) return;
  try { if (S.qr) await S.qr.clear(); } catch (e) {}
  $('qr-reader').innerHTML = '';
  S.qr = new Html5Qrcode('qr-reader', { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
  const cfg = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
  const ok = () => { S.scanning = true; setScanUI(true); $('scanStatusText').textContent = 'Mendeteksi QR…'; $('presensiStatus').textContent = 'Mendeteksi…'; };
  try { await S.qr.start({ facingMode: 'environment' }, cfg, onScanSuccess, () => {}); ok(); }
  catch (e) {
    try { await S.qr.start({ facingMode: 'user' }, cfg, onScanSuccess, () => {}); ok(); }
    catch (e2) { showStatus('Kamera tidak bisa diakses. Izinkan kamera di browser.', 'error'); setScanUI(false); }
  }
}

function stopScanner() {
  if (!S.qr || !S.scanning) return setScanUI(false);
  S.qr.stop().then(() => { S.qr.clear(); S.scanning = false; setScanUI(false); $('scanStatusText').textContent = 'Scanner berhenti'; $('presensiStatus').textContent = 'Berhenti'; }).catch(() => {});
}

function toggleFlash() {
  S.flash = !S.flash;
  $('btnFlash').classList.toggle('active', S.flash);
  try {
    const t = document.querySelector('#qr-reader video').srcObject.getVideoTracks()[0];
    if (t.getCapabilities().torch) t.applyConstraints({ advanced: [{ torch: S.flash }] });
    else showStatus('Senter tidak didukung perangkat ini', 'warning', 2500);
  } catch (e) { showStatus('Nyalakan kamera dulu untuk memakai senter', 'warning', 2500); }
}

// ================================================================
// QR GENERATOR
// ================================================================
function generateQRCode() {
  const nim = $('qrNimInput').value.trim();
  if (nim.length < 3) return showStatus('Masukkan NIM minimal 3 karakter', 'error');
  const m = S.data.find(x => x.nim === nim);
  if (!m) return showStatus(`NIM ${nim} tidak terdaftar`, 'error');
  S.qrNim = nim;
  const text = JSON.stringify({ nim: m.nim, nama: m.nama, kelas: m.kelas, jurusan: m.jurusan, link_sheet: SHEET_URL, timestamp: new Date().toISOString() });
  $('qrResultImage').src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(text)}`;
  $('qrInfo').innerHTML = `<strong>${esc(m.nama)}</strong><br><span class="hint">${esc(m.nim)} · ${esc(m.kelas)} · ${esc(m.jurusan)}</span><p class="hint" style="margin:8px 0 12px">Tunjukkan QR ini ke kamera saat presensi.</p>`;
  $('qrPreview').classList.add('show');
  showStatus(`QR untuk ${m.nama} siap`, 'success');
}

async function downloadQRCode() {
  const src = $('qrResultImage').src;
  if (!src) return showStatus('Buat QR dulu sebelum mengunduh', 'error');
  try {
    const blob = await (await fetch(src)).blob(), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `qr-${S.qrNim || 'mahasiswa'}.png`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    showStatus('QR berhasil diunduh', 'success');
  } catch (e) { window.open(src, '_blank'); }
}

function closeQRPreview() { $('qrPreview').classList.remove('show'); $('qrNimInput').value = ''; }

// ================================================================
// DAFTAR MAHASISWA (NAVBAR)
// ================================================================
function openRegister() { $('regMsg').classList.remove('show'); $('regModal').classList.add('show'); setTimeout(() => $('regNim').focus(), 300); }
function closeRegister() { $('regModal').classList.remove('show'); }

async function submitRegister(ev) {
  ev.preventDefault();
  const v = { nim: $('regNim').value.trim(), nama: $('regNama').value.trim(), kelas: $('regKelas').value.trim(), jurusan: $('regJurusan').value.trim() };
  const msg = $('regMsg'), btn = $('regBtn'), fail = t => { msg.textContent = t; msg.classList.add('show'); };
  msg.classList.remove('show');
  if (v.nim.length < 3) return fail('NIM minimal 3 karakter.');
  if (S.data.some(m => m.nim === v.nim)) return fail(`NIM ${v.nim} sudah terdaftar. Buka menu QR pribadi untuk mengambil QR-mu.`);
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mendaftarkan…';
  try {
    const r = await fetch(WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'register', ...v }) });
    const res = await r.json();
    if (!res.success) return fail(res.message || 'Pendaftaran gagal. Coba lagi.');
    const nm = { ...v, nama: v.nama.toUpperCase(), matakuliah: S.mk }; S.data.push(nm);
    try { localStorage.setItem('mahasiswaData', JSON.stringify(S.data)); } catch (e) {}
    $('regForm').reset(); closeRegister();
    renderList(v.nim); updateStats();
    showResult('success', nm, 'Berhasil terdaftar');
    $('qrNimInput').value = v.nim; generateQRCode();
    setTimeout(() => $('sec-qr').scrollIntoView({ behavior: 'smooth' }), 1200);
  } catch (e) {
    fail('Tidak bisa terhubung ke server: ' + e.message);
  } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Daftar sekarang'; }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeRegister(); $('sec-join').classList.remove('full'); document.body.classList.remove('lock'); } });
document.addEventListener('pointermove', e => {
  const c = e.target.closest && e.target.closest('.card,.stat');
  if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
});

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  $('sheetLink').href = SHEET_URL;
  tick(); setInterval(tick, 1000);
  $('searchInput').addEventListener('input', e => { S.query = e.target.value; renderList(); });
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    S.filter = b.dataset.f; renderList();
  });
  $('qrNimInput').addEventListener('keydown', e => e.key === 'Enter' && generateQRCode());
  await loadDataMahasiswa();
  setInterval(loadDataMahasiswa, AUTO_REFRESH_MS);
  if (!JOIN_MODE) setTimeout(startScanner, 600);
});

window.addEventListener('beforeunload', () => { if (S.qr && S.scanning) S.qr.stop().catch(() => {}); });

// ================================================================
// UPGRADE: TEMA, QR PENDAFTARAN, EKSPOR, NAVBAR AKTIF, TOAST
// ================================================================
const JOIN_MODE = new URLSearchParams(location.search).has('daftar');
const joinUrl = () => location.href.split(/[?#]/)[0] + '?daftar=1';

function toast(msg) {
  const t = $('toast'); $('toastText').textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('themeIcon').className = 'fas ' + (t === 'light' ? 'fa-sun' : 'fa-moon');
  document.querySelector('meta[name=theme-color]').content = t === 'light' ? '#edf1f7' : '#0f131a';
}
function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('theme', t); } catch (e) {}
  applyTheme(t);
}

function initJoin() {
  const u = joinUrl(); $('joinLink').value = u;
  $('joinQr').src = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=0&color=1b2432&data=${encodeURIComponent(u)}`;
}
function copyJoinLink() {
  navigator.clipboard.writeText($('joinLink').value).then(() => toast('Tautan pendaftaran disalin'))
    .catch(() => { $('joinLink').select(); toast('Tekan Ctrl+C untuk menyalin'); });
}
async function downloadJoinQR() {
  try {
    const blob = await (await fetch($('joinQr').src)).blob(), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'qr-pendaftaran.png';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    toast('QR pendaftaran diunduh');
  } catch (e) { window.open($('joinQr').src, '_blank'); }
}
function toggleProject() {
  const on = $('sec-join').classList.toggle('full');
  document.body.classList.toggle('lock', on);
  if (on) toast('Tekan Esc untuk keluar');
}

function exportCSV() {
  if (!S.data.length) return toast('Belum ada data untuk diekspor');
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['NIM', 'Nama', 'Kelas', 'Jurusan', 'Status', 'Waktu']].concat(S.data.map(m => {
    const h = S.today[m.nim]; return [m.nim, m.nama, m.kelas, m.jurusan, h ? 'Hadir' : 'Belum hadir', h ? (h.waktu || '') : ''];
  }));
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'presensi-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  toast('Rekap presensi diunduh');
}

function initNav() {
  const links = [...document.querySelectorAll('.nav .lnk[href^="#"]')];
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  links.forEach(l => { const t = document.querySelector(l.getAttribute('href')); if (t) io.observe(t); });
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(document.documentElement.dataset.theme || 'dark');
  initJoin(); initNav();
  if (JOIN_MODE) setTimeout(openRegister, 700);
});