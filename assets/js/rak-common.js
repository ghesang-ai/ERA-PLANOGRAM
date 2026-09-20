// assets/js/rak-common.js — helper bersama dashboard & detail Rak Aksesoris Samsung
// Requires: config.js. Sumber data: assets/data/rak-samsung.json (toko + katalog aksesoris)
//           dan Apps Script action getRakSamsung (sheet RAK_SAMSUNG).

var RAK = { cfg: null };
var RAK_MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
var RAK_TARGET_PCT = 90;   // target pemenuhan Qty Display (%)

function rakEsc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function rakMonthLabel(m) {
  var p = String(m || '').split('-');
  return p.length === 2 ? RAK_MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0] : String(m || '');
}
// 'yyyy-MM-dd HH:mm:ss' (teks dari sheet) → '20 Sep 2026'. Diparse manual supaya tidak geser zona waktu.
function rakFmtDate(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + ' ' + RAK_MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
  return s ? CONFIG.formatDate(s) : '-';
}
function rakPct(a, t)    { return t ? Math.round(a / t * 100) : 0; }
function rakColor(p)     { return p >= RAK_TARGET_PCT ? '#16a34a' : p >= 70 ? '#d97706' : '#dc2626'; }
function rakBadgeCls(p)  { return p >= RAK_TARGET_PCT ? 'badge-ok' : p >= 70 ? 'badge-warn' : 'badge-bad'; }
function rakSum(a)       { return a.reduce(function(x, y) { return x + y; }, 0); }

function rakThumb(fileId, w) {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + (w || 400);
}
function rakFileId(item) {
  if (item && item.fileId) return item.fileId;
  var m = String((item && item.photoUrl) || '').match(/\/d\/([^\/?]+)/);
  return m ? m[1] : '';
}

function rakLoadCfg() {
  return fetch('assets/data/rak-samsung.json').then(function(r) { return r.json(); }).then(function(c) { RAK.cfg = c; return c; });
}

// GET action=getRakSamsung (&store=&month=) → json
function rakApi(params) {
  var u = new URL(CONFIG.API_URL);
  u.searchParams.set('action', 'getRakSamsung');
  Object.keys(params || {}).forEach(function(k) { if (params[k]) u.searchParams.set(k, params[k]); });
  return fetch(u.toString()).then(function(r) { return r.json(); }).then(function(j) {
    if (j.status !== 'success') throw new Error(j.message || 'API error');
    // Apps Script versi lama tidak mengenal action ini dan menjawab dengan data LDU (tanpa field "month").
    if (typeof j.month !== 'string') throw new Error(RAK_OLD_BACKEND_MSG);
    return j;
  });
}
var RAK_OLD_BACKEND_MSG = 'Apps Script belum diperbarui. Tempel Code.gs terbaru di Extensions → Apps Script, lalu Deploy → Manage deployments → New version.';

function rakHasStrap(code) { return (RAK.cfg.strapStores || []).indexOf(code) !== -1; }
// Aksesoris yang berlaku untuk toko (Strap Watch hanya toko alokasi)
function rakItemsFor(code) {
  var strap = rakHasStrap(code);
  return RAK.cfg.items.filter(function(it) { return !it.selected || strap; });
}

function rakToast(msg) {
  var t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(rakToast._h); rakToast._h = setTimeout(function() { t.classList.remove('show'); }, 2800);
}

function rakTopbarTime(iso) {
  var el = document.getElementById('topbar-updated'); if (!el) return;
  var d = iso ? new Date(iso) : new Date();
  el.textContent = 'Last updated: ' + d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
