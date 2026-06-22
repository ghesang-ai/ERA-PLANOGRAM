// assets/js/inventory.js

var _plantCode  = '';
var _storeName  = '';
var _allDevices = [];
var _filtered   = [];
var _editingId  = null;
var _returId    = null;

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, isError) {
  var t = document.getElementById('inv-toast');
  var m = document.getElementById('inv-toast-msg');
  m.textContent = msg;
  t.style.background = isError ? '#dc2626' : '#16a34a';
  t.style.display = 'flex';
  setTimeout(function() { t.style.display = 'none'; }, 3500);
}

function statusClass(s) {
  s = (s||'').toLowerCase();
  if (s === 'display')         return 's-display';
  if (s.indexOf('tidak') > -1) return 's-tidak';
  if (s === 'rusak')           return 's-rusak';
  if (s.indexOf('retur') > -1) return 's-retur';
  return 's-total';
}

async function loadInventory() {
  var params    = new URLSearchParams(window.location.search);
  _plantCode    = (params.get('code') || '').toUpperCase();
  var brand     = params.get('brand') || '';

  if (!_plantCode) {
    document.getElementById('inv-title').textContent = 'Plant Code tidak ditemukan di URL';
    return;
  }

  document.getElementById('back-link').href = 'store-detail.html?code=' + encodeURIComponent(_plantCode);
  document.getElementById('log-link').href  = 'device-log.html?code=' + encodeURIComponent(_plantCode);

  // Fetch store name + inventory in parallel
  var apiUrl = new URL(CONFIG.API_URL);
  apiUrl.searchParams.set('store', _plantCode);
  var invUrl = new URL(CONFIG.API_URL);
  invUrl.searchParams.set('action', 'getInventory');
  invUrl.searchParams.set('store', _plantCode);

  var [storeJson, invJson] = await Promise.all([
    fetch(apiUrl.toString()).then(function(r) { return r.json(); }).catch(function() { return {}; }),
    fetch(invUrl.toString()).then(function(r) { return r.json(); }).catch(function() { return { data: [] }; })
  ]);

  _storeName = (storeJson.data && storeJson.data[0]) ? (storeJson.data[0]['Store Name'] || _plantCode) : _plantCode;
  _allDevices = (invJson.data || []).map(function(d) {
    return {
      id:       d.device_id   || '',
      brand:    d.brand       || '',
      name:     d.device_name || '',
      sn:       d.serial_no   || '',
      status:   d.status      || '',
      location: d.location    || '',
      updated:  d.last_updated|| '',
      notes:    d.notes       || ''
    };
  });

  document.getElementById('inv-title').textContent = 'Inventory — ' + _storeName;
  document.getElementById('inv-sub').textContent   = '📍 ' + _plantCode + ' · ' + _allDevices.length + ' device terdaftar';

  // Brand list: gabungan dari CONFIG + existing inventory
  var brands = (typeof CONFIG !== 'undefined' && CONFIG.BRAND_LDU_COLUMNS)
    ? CONFIG.BRAND_LDU_COLUMNS.slice()
    : [];
  _allDevices.forEach(function(d) { if (d.brand && brands.indexOf(d.brand) === -1) brands.push(d.brand); });
  brands.sort();

  // Brand filter dropdown
  var bSel = document.getElementById('f-brand');
  brands.forEach(function(b) {
    var opt = document.createElement('option');
    opt.value = b; opt.textContent = b;
    if (brand && b.toLowerCase() === brand.toLowerCase()) opt.selected = true;
    bSel.appendChild(opt);
  });

  // Brand select in modal
  var mBrand = document.getElementById('m-brand');
  brands.forEach(function(b) {
    var opt = document.createElement('option');
    opt.value = b; opt.textContent = b; mBrand.appendChild(opt);
  });

  applyFilter();
}

function applyFilter() {
  var brand  = document.getElementById('f-brand').value.toLowerCase();
  var status = document.getElementById('f-status').value.toLowerCase();
  var q      = (document.getElementById('f-search').value || '').toLowerCase();

  _filtered = _allDevices.filter(function(d) {
    if (brand  && d.brand.toLowerCase() !== brand)               return false;
    if (status && d.status.toLowerCase().indexOf(status) === -1) return false;
    if (q && !d.name.toLowerCase().includes(q) && !d.sn.toLowerCase().includes(q)) return false;
    return true;
  });

  renderStats();
  renderTable();
}

function renderStats() {
  var nTotal   = _allDevices.length;
  var nDisplay = _allDevices.filter(function(d) { return d.status.toLowerCase() === 'display'; }).length;
  var nTidak   = _allDevices.filter(function(d) { return d.status.toLowerCase().indexOf('tidak') > -1; }).length;
  var nRusak   = _allDevices.filter(function(d) { return d.status.toLowerCase() === 'rusak'; }).length;
  var nRetur   = _allDevices.filter(function(d) { return d.status.toLowerCase().indexOf('retur') > -1; }).length;

  document.getElementById('inv-stats-row').innerHTML =
    '<div class="inv-stat-bar">' +
    statCard(nTotal,   'Total',         's-total',   '') +
    statCard(nDisplay, 'Display',       's-display', 'display') +
    statCard(nTidak,   'Tidak Display', 's-tidak',   'tidak') +
    statCard(nRusak,   'Rusak',         's-rusak',   'rusak') +
    statCard(nRetur,   'Retur',         's-retur',   'retur') +
    '</div>';
}

function statCard(n, label, cls, filterVal) {
  var activeFilter = document.getElementById('f-status').value.toLowerCase();
  var isActive     = filterVal && activeFilter.indexOf(filterVal) > -1;
  return '<div class="inv-stat ' + cls + (isActive ? ' active' : '') + '" onclick="quickFilter(\'' + filterVal + '\')">' +
    '<span class="inv-stat-num">' + n + '</span>' +
    '<span class="inv-stat-label">' + label + '</span>' +
  '</div>';
}

function quickFilter(val) {
  var sel = document.getElementById('f-status');
  sel.value = (sel.value.toLowerCase().indexOf(val) > -1 && val) ? '' : val;
  applyFilter();
}

function renderTable() {
  var wrap = document.getElementById('inv-table-wrap');
  if (_filtered.length === 0) {
    wrap.innerHTML = '<div class="inv-empty"><div class="inv-empty-icon">📦</div>Tidak ada device ditemukan.<br><small>Coba ubah filter atau tambah device baru.</small></div>';
    return;
  }

  var rows = _filtered.map(function(d, i) {
    var sc = statusClass(d.status);
    var isRetur = d.status.toLowerCase().indexOf('retur') > -1;
    return '<tr>' +
      '<td style="color:var(--gray-400);font-size:11px;font-family:monospace">' + esc(d.id) + '</td>' +
      '<td><span class="inv-badge ' + sc + '">' + esc(d.brand) + '</span></td>' +
      '<td><div class="inv-device-name">' + esc(d.name) + '</div><div class="inv-sn">SN: ' + esc(d.sn||'-') + '</div></td>' +
      '<td><span class="inv-badge ' + sc + '">' + esc(d.status) + '</span></td>' +
      '<td style="font-size:11px;color:var(--gray-400)">' + esc(d.location||'-') + '</td>' +
      '<td style="font-size:11px;color:var(--gray-400);white-space:nowrap">' + esc(d.updated||'-') + '</td>' +
      '<td><div class="inv-actions">' +
        (!isRetur ? '<button class="inv-btn inv-btn-edit" onclick="openEditModal(\'' + esc(d.id) + '\')">✏️ Edit</button>' : '') +
        (!isRetur ? '<button class="inv-btn inv-btn-retur" onclick="openReturModal(\'' + esc(d.id) + '\')">🔄 Retur</button>' : '') +
        '<button class="inv-btn inv-btn-delete" onclick="confirmDelete(\'' + esc(d.id) + '\',\'' + esc(d.name) + '\')" title="Hapus">🗑</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  wrap.innerHTML = '<div class="inv-table-wrap"><table class="inv-table">' +
    '<thead><tr>' +
    '<th>ID</th><th>Brand</th><th>Device</th><th>Status</th><th>Lokasi</th><th>Update</th><th>Aksi</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div style="font-size:11px;color:var(--gray-400);margin-top:8px;text-align:right">' + _filtered.length + ' dari ' + _allDevices.length + ' device</div>';
}

// ── Modal Add ──
function openAddModal() {
  _editingId = null;
  document.getElementById('modal-title').textContent = '＋ Tambah Device Baru';
  document.getElementById('m-device-id').value = '';
  document.getElementById('m-name').value     = '';
  document.getElementById('m-sn').value       = '';
  document.getElementById('m-status').value   = 'Display';
  document.getElementById('m-location').value = '';
  document.getElementById('m-notes').value    = '';
  document.getElementById('modal-save-btn').textContent = '💾 Simpan';
  document.getElementById('inv-modal').style.display = 'flex';
}

function openEditModal(deviceId) {
  var d = _allDevices.find(function(x) { return x.id === deviceId; });
  if (!d) return;
  _editingId = deviceId;
  document.getElementById('modal-title').textContent = '✏️ Edit Device';
  document.getElementById('m-device-id').value = deviceId;
  document.getElementById('m-brand').value    = d.brand;
  document.getElementById('m-name').value     = d.name;
  document.getElementById('m-sn').value       = d.sn;
  document.getElementById('m-status').value   = d.status;
  document.getElementById('m-location').value = d.location;
  document.getElementById('m-notes').value    = d.notes;
  document.getElementById('modal-save-btn').textContent = '💾 Update';
  document.getElementById('inv-modal').style.display = 'flex';
}

function closeModal(event) {
  if (event && event.target !== document.getElementById('inv-modal')) return;
  document.getElementById('inv-modal').style.display = 'none';
}

async function saveDevice() {
  var brand  = document.getElementById('m-brand').value.trim();
  var name   = document.getElementById('m-name').value.trim();
  var sn     = document.getElementById('m-sn').value.trim();
  var status = document.getElementById('m-status').value;
  var loc    = document.getElementById('m-location').value.trim();
  var notes  = document.getElementById('m-notes').value.trim();

  if (!name) { showToast('Nama device wajib diisi.', true); return; }

  var btn = document.getElementById('modal-save-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Menyimpan...';

  try {
    var payload, action;
    if (_editingId) {
      action  = 'editDevice';
      payload = { action, deviceId: _editingId, newStatus: status, location: loc, notes };
    } else {
      action  = 'addDevice';
      payload = { action, plantCode: _plantCode, storeName: _storeName, brand, deviceName: name, serialNo: sn, status, location: loc, notes };
    }

    var res  = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
    var text = await res.text();
    var json;
    try { json = JSON.parse(text); } catch(e) { throw new Error('Non-JSON: ' + text.substring(0, 200)); }

    if (json.status === 'success') {
      showToast(_editingId ? '✅ Device berhasil diupdate.' : '✅ Device berhasil ditambahkan.');
      document.getElementById('inv-modal').style.display = 'none';
      await loadInventory();
    } else {
      showToast('❌ ' + (json.message || 'Gagal menyimpan.'), true);
    }
  } catch(err) {
    showToast('❌ Error: ' + err.message, true);
  }

  btn.disabled = false;
  btn.textContent = _editingId ? '💾 Update' : '💾 Simpan';
}

// ── Modal Retur ──
function openReturModal(deviceId) {
  var d = _allDevices.find(function(x) { return x.id === deviceId; });
  if (!d) return;
  _returId = deviceId;
  document.getElementById('retur-device-info').innerHTML =
    '<strong>' + esc(d.name) + '</strong><br>' +
    '<span style="font-size:11px;color:var(--gray-400)">SN: ' + esc(d.sn||'-') + ' · ' + esc(d.brand) + ' · Status: ' + esc(d.status) + '</span>';
  document.getElementById('r-notes').value = '';
  document.getElementById('retur-modal').style.display = 'flex';
}

function closeReturModal(event) {
  if (event && event.target !== document.getElementById('retur-modal')) return;
  document.getElementById('retur-modal').style.display = 'none';
}

async function confirmRetur() {
  var destination = document.getElementById('r-destination').value;
  var reason      = document.getElementById('r-reason').value;
  var notes       = document.getElementById('r-notes').value.trim();

  try {
    var res  = await fetch(CONFIG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'returDevice', deviceId: _returId, destination, reason, notes })
    });
    var json = await res.json();
    if (json.status === 'success') {
      showToast('✅ Device berhasil diretur ke ' + destination + '.');
      document.getElementById('retur-modal').style.display = 'none';
      await loadInventory();
    } else {
      showToast('❌ ' + (json.message || 'Gagal.'), true);
    }
  } catch(err) {
    showToast('❌ Gagal menghubungi server.', true);
  }
}

// ── Delete ──
async function confirmDelete(deviceId, deviceName) {
  if (!confirm('Hapus "' + deviceName + '"?\n\nHapus hanya untuk data salah input. Untuk retur ke gudang gunakan tombol Retur.')) return;
  try {
    var res  = await fetch(CONFIG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'deleteDevice', deviceId, reason: 'Hapus manual oleh user' })
    });
    var json = await res.json();
    if (json.status === 'success') {
      showToast('✅ Device berhasil dihapus.');
      await loadInventory();
    } else {
      showToast('❌ ' + (json.message || 'Gagal.'), true);
    }
  } catch(err) {
    showToast('❌ Gagal menghubungi server.', true);
  }
}

document.addEventListener('DOMContentLoaded', loadInventory);
