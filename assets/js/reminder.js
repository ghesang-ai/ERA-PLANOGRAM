// assets/js/reminder.js — Auto Reminder (WhatsApp / Fonnte)

var _rows      = [];          // data toko belum submit dari server
var _areas     = {};          // plant_code -> city (fallback dari store-areas.json)
var _templates = { l1: '', l2: '', l3: '' };
var _campaign  = '';
var _period    = '';
var _hasToken  = false;
var _pendingCount = 0;
var _submittedCount = 0;
var _selected  = {};          // plantCode -> true
var _previewLvl = 1;
var _sending   = false;
var _loadSeq   = 0;           // penanda pemuatan terbaru: jawaban dari pemuatan lama (mis. pindah tab saat masih loading) diabaikan
var _rowsMod   = '';          // modul pemilik data _rows saat ini ('ldu' | 'foto-ldu' | 'rak-samsung')

var SEND_BATCH = 15;          // plant code per request (hindari timeout Apps Script)

// ── Modul: 'ldu' (LDU & Wallbay) atau 'rak-samsung' (Rak Aksesoris Samsung) ──
var _mod    = 'ldu';        // 'ldu' | 'foto-ldu' | 'rak-samsung'
var _rakCfg = null;          // assets/data/rak-samsung.json (25 toko Samsung)
var RAK_OLD_MSG = 'Apps Script belum diperbarui. Tempel Code.gs terbaru di Extensions → Apps Script, lalu Deploy → Manage deployments → New version.';
var MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function isRak()  { return _mod === 'rak-samsung'; }
function isFoto() { return _mod === 'foto-ldu'; }
// Pesan Rak & Foto menampilkan periode sebagai nama bulan ("September 2026"); LDU tetap "2026-09"
function usesMonthName() { return isRak() || isFoto(); }
var FOTO_OLD_MSG = RAK_OLD_MSG;
function monthNameId(m) {
  var p = String(m || '').split('-');
  return p.length === 2 ? MONTHS_ID[parseInt(p[1], 10) - 1] + ' ' + p[0] : String(m || '');
}

function setModule(m, silent) {
  if (_sending) return;
  _mod = m === 'rak-samsung' ? 'rak-samsung' : m === 'foto-ldu' ? 'foto-ldu' : 'ldu';
  document.getElementById('mod-ldu').classList.toggle('active', _mod === 'ldu');
  document.getElementById('mod-foto').classList.toggle('active', isFoto());
  document.getElementById('mod-rak').classList.toggle('active', isRak());
  document.getElementById('rmd-what').textContent = isRak() ? 'Status submit Rak Aksesoris Samsung'
    : isFoto() ? 'Status upload Foto LDU & Wallbay (toko yang sudah submit LDU)' : 'Status submit checklist LDU';
  document.getElementById('rmd-back').href = isRak() ? 'rak-dashboard.html' : 'index.html';
  var brand = document.getElementById('rmd-filter-brand');
  brand.style.display = isRak() ? 'none' : '';
  if (isRak()) brand.value = '';
  var fs = document.getElementById('rmd-filter-submit');
  fs.options[0].textContent = isFoto() ? '❌ Belum Upload Foto' : '❌ Belum Submit';
  fs.options[1].textContent = isFoto() ? '✅ Sudah Upload Foto' : '✅ Sudah Submit';
  fs.value = 'belum';
  document.getElementById('rmd-result-box').innerHTML = '';
  var u = new URL(location.href);
  if (_mod !== 'ldu') u.searchParams.set('modul', _mod); else u.searchParams.delete('modul');
  history.replaceState(null, '', u.toString());
  if (!silent) loadReminderData();
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtPhone(p) {
  // 628123456789 -> 0812-3456-789
  if (!p) return '';
  var local = p.indexOf('62') === 0 ? '0' + p.slice(2) : p;
  return local.replace(/(\d{4})(?=\d)/g, '$1-');
}

// ── Load ──
async function fetchLduData(campaign) {
  if (!Object.keys(_areas).length) {
    try {
      var ares = await fetch('assets/data/store-areas.json');
      _areas = await ares.json();
    } catch (e) { _areas = {}; }
  }
  var url = new URL(CONFIG.API_URL);
  url.searchParams.set('action', 'getReminderData');
  if (campaign) url.searchParams.set('campaign', campaign);
  var json = await (await fetch(url.toString())).json();
  if (json.status !== 'success') throw new Error(json.message || 'Gagal memuat data');
  if (campaign && json.campaign !== campaign) throw new Error(RAK_OLD_MSG);   // Apps Script lama mengabaikan campaign
  json.data = (json.data || []).map(function (r) {
    if (!r.city && _areas[r.plantCode]) r.city = _areas[r.plantCode];
    return r;
  });
  return json;
}

// Rak Samsung: daftar toko dari assets/data/rak-samsung.json, status submit + Store Leader dari server
async function fetchRakData() {
  if (!_rakCfg) _rakCfg = await (await fetch('assets/data/rak-samsung.json')).json();
  var url = new URL(CONFIG.API_URL);
  url.searchParams.set('action', 'getReminderData');
  url.searchParams.set('campaign', 'rak_samsung');
  url.searchParams.set('codes', Object.keys(_rakCfg.stores).join(','));
  var json = await (await fetch(url.toString())).json();
  if (json.status !== 'success') throw new Error(json.message || 'Gagal memuat data');
  if (json.campaign !== 'rak_samsung') throw new Error(RAK_OLD_MSG);   // Apps Script lama menjawab dengan data LDU
  json.data = (json.data || []).map(function (r) {
    var st = _rakCfg.stores[r.plantCode] || {};
    r.storeName = st.name || r.storeName || r.plantCode;
    r.city = r.city || st.area || '';
    r.brandToko = 'Samsung Store';
    return r;
  });
  return json;
}

function updateLeaderWarn() {
  var box = document.getElementById('rmd-leader-warn');
  var miss = isRak() ? _rows.filter(function (r) { return !r.phoneOk; }).length : 0;
  if (!miss) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = '⚠️ <b>' + miss + ' dari ' + _rows.length + ' toko Samsung</b> belum punya Store Leader / nomor HP di database, jadi belum bisa dikirimi WhatsApp. ' +
    'Import file Store Leader Samsung di <a href="reminder-settings.html">Settings → Database Store Leader</a> ' +
    'dengan mode <b>“Tambahkan / perbarui”</b> (data toko lain tetap aman).';
}

async function loadReminderData() {
  var seq = ++_loadSeq, modAtStart = _mod;
  _rowsMod = '';                                     // sampai data tab ini selesai dimuat, tombol kirim diblokir
  var tbody = document.getElementById('rmd-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-icon">⏳</div>Memuat data...</td></tr>';
  _selected = {};
  document.getElementById('rmd-check-all').checked = false;

  try {
    var json = modAtStart === 'rak-samsung' ? await fetchRakData() : await fetchLduData(modAtStart === 'foto-ldu' ? 'foto_ldu' : '');
    if (seq !== _loadSeq) return;                    // ada pemuatan yang lebih baru (mis. Anda pindah tab) — abaikan jawaban ini

    _rows      = json.data || [];
    _rowsMod   = modAtStart;
    _templates = json.templates || _templates;
    _campaign  = json.campaignName || '';
    _period    = json.activeMonth || '';
    _hasToken  = !!json.hasToken;
    _pendingCount   = json.pendingCount != null ? json.pendingCount : _rows.filter(function (r) { return !r.submitted; }).length;
    _submittedCount = json.submittedCount != null ? json.submittedCount : _rows.filter(function (r) { return r.submitted; }).length;

    document.getElementById('rmd-period').textContent   = _period || '—';
    document.getElementById('rmd-campaign').textContent = _campaign || '—';
    document.getElementById('rmd-token-warn').style.display = _hasToken ? 'none' : 'block';

    populateFilters();
    updateLeaderWarn();
    renderRows();
    renderPreview();
  } catch (err) {
    if (seq !== _loadSeq) return;
    document.getElementById('rmd-leader-warn').style.display = 'none';
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><div class="empty-icon">⚠️</div>' + escHtml(err.message) + '</td></tr>';
  }
}

function populateFilters() {
  var cities = [].concat.apply([], _rows.map(function (r) { return r.city ? [r.city] : []; }));
  cities = cities.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
  var brands = _rows.map(function (r) { return r.brandToko; })
    .filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort();

  var cSel = document.getElementById('rmd-filter-city');
  var bSel = document.getElementById('rmd-filter-brand');
  var cPrev = cSel.value, bPrev = bSel.value;
  cSel.innerHTML = '<option value="">Semua City</option>' +
    cities.map(function (c) { return '<option>' + escHtml(c) + '</option>'; }).join('');
  bSel.innerHTML = '<option value="">Semua Brand Toko</option>' +
    brands.map(function (b) { return '<option>' + escHtml(b) + '</option>'; }).join('');
  cSel.value = cPrev; bSel.value = bPrev;
}

function currentFiltered() {
  var q = (document.getElementById('rmd-search').value || '').toLowerCase();
  var fs = document.getElementById('rmd-filter-submit').value;
  var fc = document.getElementById('rmd-filter-city').value;
  var fb = document.getElementById('rmd-filter-brand').value;
  var fl = document.getElementById('rmd-filter-level').value;
  return _rows.filter(function (r) {
    if (fs === 'belum' && r.submitted) return false;
    if (fs === 'sudah' && !r.submitted) return false;
    if (fc && r.city !== fc) return false;
    if (fb && r.brandToko !== fb) return false;
    if (fl && String(r.level) !== fl) return false;
    if (q) {
      var hay = (r.plantCode + ' ' + r.storeName + ' ' + (r.storeLeader || '') + ' ' + (r.city || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function renderRows() {
  var list = currentFiltered();
  var nBelum = list.filter(function (r) { return !r.submitted; }).length;
  var nSudah = list.length - nBelum;
  document.getElementById('rmd-count').textContent = isFoto()
    ? '❌ ' + nBelum + ' belum upload foto · ✅ ' + nSudah + ' sudah upload foto' + (list.length !== _rows.length ? '  (total ' + _rows.length + ')' : '')
    : '❌ ' + nBelum + ' belum submit · ✅ ' + nSudah + ' sudah submit' + (list.length !== _rows.length ? '  (total ' + _rows.length + ')' : '');

  var tbody = document.getElementById('rmd-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><div class="empty-icon">✅</div>' +
      (isFoto() && !_rows.length ? 'Belum ada toko yang sudah submit LDU periode ini.' : 'Tidak ada toko yang cocok filter.') + '</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function (r) {
    var lvlCls = 'lvl-' + r.level;
    var lvlTxt = r.level === 1 ? 'Lv.1 Gentle' : r.level === 2 ? 'Lv.2 Urgent' : 'Lv.3 Escalate';
    var stBadge = isFoto()
      ? (r.submitted ? '<span class="st-badge st-sudah">📷 ' + (r.fotoCount || 0) + ' foto</span>' : '<span class="st-badge st-belum">Belum Ada Foto</span>')
      : (r.submitted ? '<span class="st-badge st-sudah">Sudah Submit</span>' : '<span class="st-badge st-belum">Belum Submit</span>');
    var phoneCell = r.phoneOk
      ? '<span class="phone-ok">' + escHtml(fmtPhone(r.phone)) + '</span>'
      : '<span class="phone-missing">Tidak di DB</span>';
    var canSend = r.phoneOk && !r.submitted;
    var checked = _selected[r.plantCode] ? ' checked' : '';
    var cb = canSend
      ? '<input type="checkbox" data-pc="' + escHtml(r.plantCode) + '" onchange="toggleOne(this)"' + checked + '>'
      : '<input type="checkbox" disabled title="' + (r.submitted ? 'Sudah submit' : 'Nomor HP tidak ada') + '">';
    var sendBtn = '<button class="rmd-sendone" onclick="sendOne(\'' + escHtml(r.plantCode) + '\')"' +
      (canSend ? '' : ' disabled') + '>Kirim</button>';
    return '<tr class="' + (r.submitted ? 'is-submitted' : '') + '">' +
      '<td>' + cb + '</td>' +
      '<td><span class="pc">' + escHtml(r.plantCode) + '</span></td>' +
      '<td>' + escHtml(r.storeName) + '<div class="pc">' + escHtml(r.brandToko || '') + '</div></td>' +
      '<td>' + escHtml(r.city || '—') + '</td>' +
      '<td>' + stBadge + '</td>' +
      '<td>' + escHtml(r.storeLeader || '—') + '</td>' +
      '<td>' + phoneCell + '</td>' +
      '<td><span class="lvl-badge ' + lvlCls + '">' + lvlTxt + '</span></td>' +
      '<td style="text-align:center">' + (r.reminderCount || 0) + '×</td>' +
      '<td>' + sendBtn + '</td>' +
    '</tr>';
  }).join('');
}

function toggleOne(cb) {
  var pc = cb.getAttribute('data-pc');
  if (cb.checked) _selected[pc] = true; else delete _selected[pc];
}

function toggleAll(checked) {
  currentFiltered().forEach(function (r) {
    if (!r.phoneOk || r.submitted) return;
    if (checked) _selected[r.plantCode] = true; else delete _selected[r.plantCode];
  });
  renderRows();
}

// ── Preview ──
function setPreviewTab(lvl) {
  _previewLvl = lvl;
  Array.prototype.forEach.call(document.querySelectorAll('.rmd-tab'), function (t) {
    t.classList.toggle('active', Number(t.getAttribute('data-lvl')) === lvl);
  });
  renderPreview();
}

function renderTpl(tpl, ctx) {
  return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) {
    return (ctx[k] !== undefined && ctx[k] !== null && ctx[k] !== '') ? ctx[k] : m;
  });
}

function renderPreview() {
  var tpl = _previewLvl === 1 ? _templates.l1 : _previewLvl === 2 ? _templates.l2 : _templates.l3;
  var pending = _rows.filter(function (r) { return !r.submitted; });
  var sample = currentFiltered()[0] || pending[0] || _rows[0] || {
    storeName: isRak() ? 'SES CONTOH' : 'ERAFONE CONTOH', plantCode: isRak() ? 'S000' : 'E000', storeLeader: 'Budi', city: 'JAKARTA', region: 'Region 5'
  };
  var msg = renderTpl(tpl, {
    nama_toko: sample.storeName,
    kode_toko: sample.plantCode,
    store_leader: sample.storeLeader || 'Store Leader',
    city: sample.city || '-',
    region: sample.region || 'Region 5',
    campaign: _campaign || (isRak() ? 'Rak Aksesoris Samsung' : isFoto() ? 'Foto LDU & Wallbay' : 'Compliance LDU'),
    level: 'Level ' + _previewLvl,
    periode: usesMonthName() ? monthNameId(_period) : (_period || '')
  });
  document.getElementById('rmd-msg').textContent = msg || '(template kosong — atur di Settings)';
}

// ── Send ──
function sendSelected() {
  var pcs = Object.keys(_selected);
  if (!pcs.length) { alert('Belum ada toko yang dicentang.'); return; }
  confirmAndSend(pcs, 'Blast Terpilih');
}

function sendAllFiltered() {
  if (_rowsMod !== _mod) { alert('Data tab ini belum selesai dimuat. Tunggu sebentar lalu coba lagi.'); return; }
  var pcs = currentFiltered()
    .filter(function (r) { return r.phoneOk && !r.submitted; })
    .map(function (r) { return r.plantCode; });
  if (!pcs.length) { alert(isFoto() ? 'Tidak ada toko "Belum Ada Foto" dengan nomor HP pada filter ini.' : 'Tidak ada toko "Belum Submit" dengan nomor HP pada filter ini.'); return; }
  confirmAndSend(pcs, 'Scan & Kirim Semua');
}

function sendOne(pc) {
  confirmAndSend([pc], 'Kirim 1 toko');
}

function confirmAndSend(pcs, label) {
  if (_sending) return;
  // Data di layar harus milik tab yang sedang aktif; kalau tidak (masih memuat), jangan kirim dengan kampanye yang salah.
  if (_rowsMod !== _mod) { alert('Data tab ini belum selesai dimuat. Tunggu sebentar lalu coba lagi.'); return; }
  var valid = {}; _rows.forEach(function (r) { valid[r.plantCode] = true; });
  pcs = pcs.filter(function (pc) { return valid[pc]; });
  if (!pcs.length) { alert('Tidak ada toko valid untuk dikirim.'); return; }
  if (!_hasToken && !confirm('Token Fonnte belum diset — pesan kemungkinan besar GAGAL. Lanjut coba?')) return;
  if (!confirm(label + ': kirim WhatsApp ke ' + pcs.length + ' toko sekarang?')) return;
  doSend(pcs);
}

async function doSend(pcs) {
  _sending = true;
  setButtons(true);
  var box = document.getElementById('rmd-result-box');
  box.innerHTML = '<div class="rmd-result">⏳ Mengirim ke ' + pcs.length + ' toko...</div>';

  var all = [];
  try {
    for (var i = 0; i < pcs.length; i += SEND_BATCH) {
      var chunk = pcs.slice(i, i + SEND_BATCH);
      var res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(isRak() ? { action: 'sendReminder', campaign: 'rak_samsung', plantCodes: chunk }
                           : isFoto() ? { action: 'sendReminder', campaign: 'foto_ldu', plantCodes: chunk }
                           : { action: 'sendReminder', plantCodes: chunk })
      });
      var json = await res.json();
      if (json.status !== 'success') throw new Error(json.message || 'Gagal mengirim');
      all = all.concat(json.results || []);
      box.innerHTML = '<div class="rmd-result">⏳ ' + Math.min(i + SEND_BATCH, pcs.length) + ' / ' + pcs.length + ' diproses...</div>';
    }
    renderResult(all);
  } catch (err) {
    box.innerHTML = '<div class="rmd-result"><b>⚠️ ' + escHtml(err.message) + '</b></div>';
  } finally {
    _sending = false;
    setButtons(false);
    loadReminderData();
  }
}

function setButtons(disabled) {
  ['btn-scan', 'btn-blast'].forEach(function (id) {
    var b = document.getElementById(id); if (b) b.disabled = disabled;
  });
}

function renderResult(results) {
  var ok  = results.filter(function (r) { return r.ok; });
  var bad = results.filter(function (r) { return !r.ok; });
  var html = '<div class="rmd-result"><b>✅ Terkirim ' + ok.length + ' · ❌ Gagal ' + bad.length + '</b>';
  if (bad.length) {
    html += '<ul>' + bad.map(function (r) {
      return '<li class="bad">' + escHtml(r.plantCode) + (r.storeName ? ' — ' + escHtml(r.storeName) : '') +
        ': ' + escHtml(r.detail || 'gagal') + '</li>';
    }).join('') + '</ul>';
  }
  html += '</div>';
  document.getElementById('rmd-result-box').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function () {
  var m = new URLSearchParams(location.search).get('modul');
  setModule(m === 'rak-samsung' || m === 'foto-ldu' ? m : 'ldu', true);
  loadReminderData();
});
