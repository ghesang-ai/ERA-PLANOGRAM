// assets/js/store-detail.js
// Requires: CONFIG (config.js), exportStoreExcel (export.js)

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._eraAllData  = [];
var _deviceData     = null;  // full ldu-devices.json
var _currentPlant   = null;

async function loadDeviceData() {
  try {
    var res = await fetch('assets/data/ldu-devices.json');
    _deviceData = await res.json();
  } catch (e) { console.warn('Device data unavailable', e); }
}

function openDeviceModal(brand) {
  var modal = document.getElementById('device-modal');
  var titleEl = document.getElementById('modal-brand-title');
  var subEl   = document.getElementById('modal-brand-sub');
  var listEl  = document.getElementById('modal-device-list');

  // Normalize brand name: BRAND_LDU_COLUMNS uses title-case, JSON uses uppercase
  var brandUpper = brand.toUpperCase();
  var devices = [];
  if (_deviceData && _currentPlant && _deviceData[_currentPlant]) {
    devices = (_deviceData[_currentPlant].devices || []).filter(function(d) {
      return (d.brand || '').toUpperCase() === brandUpper;
    });
  }

  titleEl.textContent = brand.toUpperCase() + ' — ' + (devices.length > 0 ? devices.length + ' device' : 'tidak ada data');
  subEl.textContent   = _deviceData && _currentPlant && _deviceData[_currentPlant]
    ? _deviceData[_currentPlant].storeName || _currentPlant
    : _currentPlant;

  if (devices.length === 0) {
    listEl.innerHTML = '<div class="modal-empty">Tidak ada data device untuk brand ini di toko ini.<br><small>Data mungkin belum ada di file LDU Device.</small></div>';
  } else {
    listEl.innerHTML = devices.map(function(d, i) {
      return '<div class="modal-device-item">' +
        '<div class="modal-device-num">' + (i + 1) + '</div>' +
        '<div class="modal-device-info">' +
          '<div class="modal-device-name">' + escHtml(d.name) + '</div>' +
          '<div class="modal-device-sn">SN: ' + escHtml(d.sn || '-') + ' · ' + escHtml(d.status || '') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeDeviceModal(event) {
  if (event && event.target !== document.getElementById('device-modal')) return;
  document.getElementById('device-modal').style.display = 'none';
  document.body.style.overflow = '';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeDeviceModal();
});

async function loadStoreDetail() {
  var params = new URLSearchParams(window.location.search);
  var plantCode = params.get('code');
  _currentPlant = plantCode;
  loadDeviceData();

  if (!plantCode) {
    document.getElementById('detail-content').innerHTML = '<p style="padding:20px;color:var(--red)">Plant Code tidak ditemukan di URL.</p>';
    return;
  }

  document.title = 'Detail Toko ' + plantCode + ' — ERA-PLANOGRAM';

  var exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.disabled = true;

  try {
    var urlObj = new URL(CONFIG.API_URL);
    urlObj.searchParams.set('store', plantCode);
    var res  = await fetch(urlObj.toString());
    var json = await res.json();

    if (json.status !== 'success' || json.data.length === 0) {
      throw new Error('Data toko tidak ditemukan');
    }

    window._eraAllData = json.data;

    var row = json.data[0];
    renderStoreDetail(row, plantCode);

  } catch (err) {
    document.getElementById('detail-content').innerHTML =
      '<p style="padding:20px;color:var(--red)">⚠️ Gagal memuat data: ' + err.message + '</p>';
  }
}

function renderStoreDetail(row, plantCode) {
  var status     = row['Status'] || 'Pending';
  var badgeClass = status === 'Submitted' ? 'badge-green' : 'badge-red';
  var lastSubmit = CONFIG.formatDate(row['Last Submit']);
  var totalLDU   = CONFIG.calcTotalLDU(row);
  var brandToko  = CONFIG.detectBrandToko(row['Store Name']);

  document.getElementById('detail-header').innerHTML = '\
    <div class="detail-store-name">' + escHtml(row['Store Name'] || plantCode) + '</div>\
    <div class="detail-meta">\
      <span>📍 Plant Code: <strong>' + escHtml(plantCode) + '</strong></span>\
      <span>🏷️ Brand: <strong>' + escHtml(brandToko) + '</strong></span>\
      <span>🗺️ ' + escHtml(row['Region'] || '-') + '</span>\
      <span>Status: <span class="badge ' + badgeClass + '">' + escHtml(status) + '</span></span>\
      <span>Last Submit: <strong>' + escHtml(lastSubmit) + '</strong></span>\
      <span>Total LDU: <strong style="color:var(--blue)">' + totalLDU + ' unit</strong></span>\
    </div>';

  var gridHtml = CONFIG.BRAND_LDU_COLUMNS.map(function(col) {
    var val  = parseInt(row[col]) || 0;
    var zero = val === 0 ? ' zero' : '';
    return '<div class="ldu-card ldu-card--clickable" onclick="openDeviceModal(\'' + escHtml(col).replace(/'/g, "\\'") + '\')">' +
        '<div class="ldu-card-brand">' + escHtml(col) + '</div>' +
        '<div class="ldu-card-count' + zero + '">' + val + '</div>' +
        '<div class="ldu-card-hint">Tap untuk lihat detail</div>' +
      '</div>';
  }).join('');

  document.getElementById('ldu-grid').innerHTML = gridHtml;

  var exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.disabled = false;
    exportBtn.onclick = function() {
      exportStoreExcel(plantCode, row['Store Name']);
    };
  }
}

document.addEventListener('DOMContentLoaded', loadStoreDetail);
