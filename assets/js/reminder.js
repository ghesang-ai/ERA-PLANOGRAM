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

var SEND_BATCH = 15;          // plant code per request (hindari timeout Apps Script)

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
async function loadReminderData() {
  var tbody = document.getElementById('rmd-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-icon">⏳</div>Memuat data...</td></tr>';
  _selected = {};
  document.getElementById('rmd-check-all').checked = false;

  try {
    if (!Object.keys(_areas).length) {
      try {
        var ares = await fetch('assets/data/store-areas.json');
        _areas = await ares.json();
      } catch (e) { _areas = {}; }
    }

    var url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', 'getReminderData');
    var res  = await fetch(url.toString());
    var json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'Gagal memuat data');

    _rows      = (json.data || []).map(function (r) {
      if (!r.city && _areas[r.plantCode]) r.city = _areas[r.plantCode];
      return r;
    });
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
    renderRows();
    renderPreview();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-icon">⚠️</div>' + escHtml(err.message) + '</td></tr>';
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
  document.getElementById('rmd-count').textContent =
    '❌ ' + nBelum + ' belum submit · ✅ ' + nSudah + ' sudah submit' +
    (list.length !== _rows.length ? '  (total ' + _rows.length + ')' : '');

  var tbody = document.getElementById('rmd-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><div class="empty-icon">✅</div>Tidak ada toko yang cocok filter.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function (r) {
    var lvlCls = 'lvl-' + r.level;
    var lvlTxt = r.level === 1 ? 'Lv.1 Gentle' : r.level === 2 ? 'Lv.2 Urgent' : 'Lv.3 Escalate';
    var stBadge = r.submitted
      ? '<span class="st-badge st-sudah">Sudah Submit</span>'
      : '<span class="st-badge st-belum">Belum Submit</span>';
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
    storeName: 'ERAFONE CONTOH', plantCode: 'E000', storeLeader: 'Budi', city: 'JAKARTA', region: 'Region 5'
  };
  var msg = renderTpl(tpl, {
    nama_toko: sample.storeName,
    kode_toko: sample.plantCode,
    store_leader: sample.storeLeader || 'Store Leader',
    city: sample.city || '-',
    region: sample.region || 'Region 5',
    campaign: _campaign || 'Compliance LDU',
    level: 'Level ' + _previewLvl,
    periode: _period || ''
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
  var pcs = currentFiltered()
    .filter(function (r) { return r.phoneOk && !r.submitted; })
    .map(function (r) { return r.plantCode; });
  if (!pcs.length) { alert('Tidak ada toko "Belum Submit" dengan nomor HP pada filter ini.'); return; }
  confirmAndSend(pcs, 'Scan & Kirim Semua');
}

function sendOne(pc) {
  confirmAndSend([pc], 'Kirim 1 toko');
}

function confirmAndSend(pcs, label) {
  if (_sending) return;
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
        body: JSON.stringify({ action: 'sendReminder', plantCodes: chunk })
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

document.addEventListener('DOMContentLoaded', loadReminderData);
