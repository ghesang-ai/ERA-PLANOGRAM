// assets/js/device-log.js

var _plantCode  = '';
var _allLog     = [];
var _filteredLog = [];

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function actionClass(a) {
  if (a === 'ADD')    return 'log-action-ADD';
  if (a === 'EDIT')   return 'log-action-EDIT';
  if (a === 'RETUR')  return 'log-action-RETUR';
  if (a === 'DELETE') return 'log-action-DELETE';
  return '';
}

function statusBadge(s) {
  if (!s) return '<span style="color:var(--gray-400)">—</span>';
  var color = '#475569', bg = '#f1f5f9';
  if (s.toLowerCase() === 'display')          { color='#15803d'; bg='#dcfce7'; }
  else if (s.toLowerCase().indexOf('tidak')>-1){ color='#a16207'; bg='#fef9c3'; }
  else if (s.toLowerCase() === 'rusak')        { color='#dc2626'; bg='#fee2e2'; }
  else if (s.toLowerCase().indexOf('retur')>-1){ color='#7c3aed'; bg='#f3e8ff'; }
  return '<span style="background:' + bg + ';color:' + color + ';padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">' + esc(s) + '</span>';
}

async function loadLog() {
  var action = document.getElementById('lf-action').value;
  var brand  = document.getElementById('lf-brand').value;

  var url = new URL(CONFIG.API_URL);
  url.searchParams.set('action', 'getLog');
  url.searchParams.set('store', _plantCode);
  url.searchParams.set('limit', '200');
  if (action) url.searchParams.set('action_filter', action);
  if (brand)  url.searchParams.set('brand', brand);

  document.getElementById('log-list').innerHTML = '<div style="color:var(--gray-400);padding:20px">Memuat log...</div>';

  try {
    // Note: getLog uses 'action' param for the API action, filter by log action separately
    var logUrl = new URL(CONFIG.API_URL);
    logUrl.searchParams.set('action', 'getLog');
    logUrl.searchParams.set('store', _plantCode);
    logUrl.searchParams.set('limit', '200');
    if (brand) logUrl.searchParams.set('brand', brand.toLowerCase());

    var res  = await fetch(logUrl.toString());
    var json = await res.json();

    _allLog = (json.data || []).filter(function(d) {
      if (action && d.action !== action) return false;
      return true;
    });

    // Build brand filter options
    var brands = [];
    _allLog.forEach(function(d) { if (d.brand && brands.indexOf(d.brand) === -1) brands.push(d.brand); });
    brands.sort();
    var bSel = document.getElementById('lf-brand');
    var currentBrand = bSel.value;
    bSel.innerHTML = '<option value="">Semua Brand</option>';
    brands.forEach(function(b) {
      var opt = document.createElement('option');
      opt.value = b; opt.textContent = b;
      if (b === currentBrand) opt.selected = true;
      bSel.appendChild(opt);
    });

    filterLog();
  } catch(err) {
    document.getElementById('log-list').innerHTML = '<div class="inv-empty"><div class="inv-empty-icon">⚠️</div>Gagal memuat log. Cek koneksi internet.</div>';
  }
}

function filterLog() {
  var q = (document.getElementById('lf-search').value || '').toLowerCase();
  _filteredLog = _allLog.filter(function(d) {
    if (!q) return true;
    return (d.device_name||'').toLowerCase().includes(q) ||
           (d.serial_no||'').toLowerCase().includes(q) ||
           (d.brand||'').toLowerCase().includes(q);
  });
  renderLog();
}

function renderLog() {
  var container = document.getElementById('log-list');
  if (_filteredLog.length === 0) {
    container.innerHTML = '<div class="inv-empty"><div class="inv-empty-icon">📜</div>Belum ada log untuk filter ini.<br><small>Log akan muncul setelah ada perubahan inventory.</small></div>';
    return;
  }

  var html = '<div style="background:white;border-radius:12px;box-shadow:var(--shadow);padding:8px 20px">' +
    _filteredLog.map(function(d) {
      var ac = d.action || '';
      var hasChange = d.old_status && d.new_status && d.old_status !== d.new_status;
      return '<div class="log-item">' +
        '<div>' +
          '<div class="log-action-badge ' + actionClass(ac) + '">' + esc(ac) + '</div>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="log-device-name">' + esc(d.device_name || '—') + '</div>' +
          '<div class="log-meta">' +
            esc(d.brand || '') +
            (d.serial_no ? ' · SN: ' + esc(d.serial_no) : '') +
            (d.location  ? ' · 📍 ' + esc(d.location)   : '') +
          '</div>' +
          (hasChange
            ? '<div class="log-status-change">' +
                statusBadge(d.old_status) +
                '<span style="color:var(--gray-400)">→</span>' +
                statusBadge(d.new_status) +
              '</div>'
            : (!d.old_status && d.new_status
                ? '<div class="log-status-change">' + statusBadge(d.new_status) + '</div>'
                : '')) +
          (d.notes ? '<div class="log-notes">"' + esc(d.notes) + '"</div>' : '') +
        '</div>' +
        '<div class="log-time">' + esc(d.timestamp || '') + '</div>' +
      '</div>';
    }).join('') +
  '</div>' +
  '<div style="font-size:11px;color:var(--gray-400);margin-top:8px;text-align:right">' + _filteredLog.length + ' entri log</div>';

  container.innerHTML = html;
}

async function init() {
  var params = new URLSearchParams(window.location.search);
  _plantCode = (params.get('code') || '').toUpperCase();

  if (!_plantCode) {
    document.getElementById('log-title').textContent = 'Plant Code tidak ditemukan di URL';
    return;
  }

  document.getElementById('back-link').href = 'inventory.html?code=' + encodeURIComponent(_plantCode);

  // Get store name
  try {
    var apiUrl = new URL(CONFIG.API_URL);
    apiUrl.searchParams.set('store', _plantCode);
    var res  = await fetch(apiUrl.toString());
    var json = await res.json();
    var storeName = (json.data && json.data[0]) ? (json.data[0]['Store Name'] || _plantCode) : _plantCode;
    document.getElementById('log-title').textContent = 'Log History — ' + storeName;
    document.getElementById('log-sub').textContent   = '📍 ' + _plantCode + ' · Semua perubahan inventory tercatat di sini';
  } catch(e) {
    document.getElementById('log-title').textContent = 'Log History — ' + _plantCode;
  }

  await loadLog();
}

document.addEventListener('DOMContentLoaded', init);
