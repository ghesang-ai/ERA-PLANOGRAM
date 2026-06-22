// assets/js/brand-detail.js

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var _allDevices    = [];
var _deviceStatus  = {};   // SN/name → 'display'|'tidak'|'rusak'
var _activeFilter  = null; // null | 'display' | 'tidak' | 'rusak'

function setFilter(status) {
  _activeFilter = (_activeFilter === status) ? null : status;
  renderStatCards();
  renderDeviceList();
}

function renderStatCards() {
  var nTotal   = _allDevices.length;
  var nDisplay = _allDevices.filter(function(d) { return _deviceStatus[d._key] === 'display'; }).length;
  var nTidak   = _allDevices.filter(function(d) { return _deviceStatus[d._key] === 'tidak';   }).length;
  var nRusak   = _allDevices.filter(function(d) { return _deviceStatus[d._key] === 'rusak';   }).length;
  var hasStatus = Object.keys(_deviceStatus).length > 0;

  var activeStyle = 'box-shadow:0 0 0 3px var(--blue);';

  document.getElementById('stat-total').innerHTML =
    '<span class="bd-stat-num">' + nTotal + '</span><span class="bd-stat-label">Total LDU</span>';

  if (hasStatus) {
    document.getElementById('stat-display').innerHTML =
      '<span class="bd-stat-num">' + nDisplay + '</span><span class="bd-stat-label">Display</span>';
    document.getElementById('stat-display').style.cssText = 'cursor:pointer' + (_activeFilter === 'display' ? ';' + activeStyle : '');
    document.getElementById('stat-display').onclick = function() { setFilter('display'); };

    document.getElementById('stat-tidak').innerHTML =
      '<span class="bd-stat-num">' + nTidak + '</span><span class="bd-stat-label">Tidak Display</span>';
    document.getElementById('stat-tidak').style.cssText = 'cursor:pointer' + (_activeFilter === 'tidak' ? ';' + activeStyle : '');
    document.getElementById('stat-tidak').onclick = function() { setFilter('tidak'); };

    document.getElementById('stat-rusak').innerHTML =
      '<span class="bd-stat-num">' + nRusak + '</span><span class="bd-stat-label">Rusak</span>';
    document.getElementById('stat-rusak').style.cssText = 'cursor:pointer' + (_activeFilter === 'rusak' ? ';' + activeStyle : '');
    document.getElementById('stat-rusak').onclick = function() { setFilter('rusak'); };
  } else {
    // No status data yet — show sheet aggregate counts from DOM data attributes
    var el = document.getElementById('stat-display');
    el.querySelector('.bd-stat-label').textContent = 'Display';
    el.style.cursor = '';
    el.onclick = null;
  }
}

function renderDeviceList() {
  var container = document.getElementById('device-list-container');
  if (!container) return;

  var filtered = _activeFilter
    ? _allDevices.filter(function(d) { return _deviceStatus[d._key] === _activeFilter; })
    : _allDevices;

  var filterLabel = '';
  if (_activeFilter === 'display') filterLabel = ' — <span style="color:#15803d">Display</span>';
  if (_activeFilter === 'tidak')   filterLabel = ' — <span style="color:#a16207">Tidak Display</span>';
  if (_activeFilter === 'rusak')   filterLabel = ' — <span style="color:#dc2626">Rusak</span>';

  document.getElementById('device-list-title').innerHTML =
    '📦 Daftar Device (' + filtered.length + ')' + filterLabel +
    (_activeFilter ? ' <button onclick="setFilter(null)" style="font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid var(--gray-200);background:white;cursor:pointer;margin-left:6px">Reset</button>' : '');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="bd-empty">Tidak ada device dengan status ini.</div>';
    return;
  }

  container.innerHTML = filtered.map(function(d, i) {
    var st = _deviceStatus[d._key];
    var stBadge = '';
    if (st === 'display') stBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#dcfce7;color:#15803d;font-weight:700;margin-left:6px">Display</span>';
    if (st === 'tidak')   stBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#fef9c3;color:#a16207;font-weight:700;margin-left:6px">Tidak Display</span>';
    if (st === 'rusak')   stBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#fee2e2;color:#dc2626;font-weight:700;margin-left:6px">Rusak</span>';

    return '<div class="bd-device-item">' +
      '<div class="bd-device-num">' + (i + 1) + '</div>' +
      '<div>' +
        '<div class="bd-device-name">' + escHtml(d.name) + stBadge + '</div>' +
        '<div class="bd-device-sn">SN: ' + escHtml(d.sn || '-') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function loadBrandDetail() {
  var params    = new URLSearchParams(window.location.search);
  var plantCode = (params.get('code')  || '').toUpperCase();
  var brand     = params.get('brand')  || '';

  if (!plantCode || !brand) {
    document.getElementById('page-content').innerHTML =
      '<div style="padding:40px;color:var(--red)">Parameter tidak lengkap.</div>';
    return;
  }

  document.title = brand.toUpperCase() + ' — ' + plantCode + ' · ERA-PLANOGRAM';
  document.getElementById('back-link').href = 'store-detail.html?code=' + encodeURIComponent(plantCode);
  var invLink = document.getElementById('inv-link');
  if (invLink) invLink.href = 'inventory.html?code=' + encodeURIComponent(plantCode) + '&brand=' + encodeURIComponent(brand);

  var urlObj = new URL(CONFIG.API_URL);
  urlObj.searchParams.set('store', plantCode);

  var [apiJson, deviceData] = await Promise.all([
    fetch(urlObj.toString()).then(function(r) { return r.json(); }),
    fetch('assets/data/ldu-devices.json').then(function(r) { return r.json(); }).catch(function() { return {}; })
  ]);

  if (apiJson.status !== 'success' || !apiJson.data.length) {
    document.getElementById('page-content').innerHTML =
      '<div style="padding:40px;color:var(--red)">Data toko tidak ditemukan.</div>';
    return;
  }

  var row       = apiJson.data[0];
  var storeName = row['Store Name'] || plantCode;
  var nTotal    = parseInt(row[brand]) || 0;
  var nDisplay  = parseInt(row[brand + '_Display'])      || 0;
  var nTidak    = parseInt(row[brand + '_TidakDisplay']) || 0;
  var nRusak    = parseInt(row[brand + '_Rusak'])        || 0;
  var lduFoto   = row[brand + '_LDU_Foto']    || '';
  var wallFoto  = row[brand + '_Wallbay_Foto'] || '';

  // Parse per-device status JSON
  var deviceStatusRaw = row[brand + '_DeviceStatus'] || '';
  _deviceStatus = {};
  if (deviceStatusRaw) {
    try { _deviceStatus = JSON.parse(deviceStatusRaw); } catch(e) {}
  }
  var hasDeviceStatus = Object.keys(_deviceStatus).length > 0;

  // Device list
  _allDevices = [];
  if (deviceData[plantCode]) {
    _allDevices = (deviceData[plantCode].devices || []).filter(function(d) {
      return (d.brand || '').toUpperCase() === brand.toUpperCase();
    }).map(function(d) {
      var key = (d.sn && d.sn !== '-') ? d.sn : d.name;
      return Object.assign({}, d, { _key: key });
    });
  }

  // Foto HTML
  var fotoHtml = '';
  if (lduFoto || wallFoto) {
    function fotoItem(url, label) {
      if (!url) return '<div class="bd-foto-item"><div class="bd-foto-label">' + label + '</div><div class="bd-foto-empty">Tidak ada foto</div></div>';
      var fileId = url.match(/\/d\/([^\/]+)/);
      var prev = fileId ? 'https://drive.google.com/thumbnail?id=' + fileId[1] + '&sz=w800' : url;
      return '<div class="bd-foto-item">' +
        '<div class="bd-foto-label">' + label + '</div>' +
        '<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' +
          '<img src="' + escHtml(prev) + '" class="bd-foto-img" alt="' + escHtml(label) + '">' +
        '</a>' +
      '</div>';
    }
    fotoHtml = '<div class="bd-card"><div class="bd-section">' +
      '<div class="bd-section-title">📷 Foto LDU &amp; Wallbay</div>' +
      '<div class="bd-foto-grid">' +
        fotoItem(lduFoto,  '📺 LDU Display') +
        fotoItem(wallFoto, '🗂️ Wallbay') +
      '</div>' +
    '</div></div>';
  }

  var clickHint = hasDeviceStatus
    ? '<div style="font-size:11px;color:var(--gray-400);margin-top:8px;text-align:center">Klik kartu untuk filter device</div>'
    : '<div style="font-size:11px;color:var(--gray-400);margin-top:8px;text-align:center">Submit checklist untuk lihat status per device</div>';

  document.getElementById('page-content').innerHTML =
    '<div class="bd-hero">' +
      '<div class="bd-brand-name">' + escHtml(brand.toUpperCase()) + '</div>' +
      '<div class="bd-store-name">📍 ' + escHtml(storeName) + ' · ' + escHtml(plantCode) + '</div>' +
      '<div class="bd-status-bar">' +
        '<div class="bd-stat s-total" id="stat-total">' +
          '<span class="bd-stat-num">' + (hasDeviceStatus ? _allDevices.length : nTotal) + '</span>' +
          '<span class="bd-stat-label">Total LDU</span>' +
        '</div>' +
        '<div class="bd-stat s-display" id="stat-display">' +
          '<span class="bd-stat-num">' + (hasDeviceStatus ? _allDevices.filter(function(d){return _deviceStatus[d._key]==='display';}).length : nDisplay) + '</span>' +
          '<span class="bd-stat-label">Display</span>' +
        '</div>' +
        '<div class="bd-stat s-tidak" id="stat-tidak">' +
          '<span class="bd-stat-num">' + (hasDeviceStatus ? _allDevices.filter(function(d){return _deviceStatus[d._key]==='tidak';}).length : nTidak) + '</span>' +
          '<span class="bd-stat-label">Tidak Display</span>' +
        '</div>' +
        '<div class="bd-stat s-rusak" id="stat-rusak">' +
          '<span class="bd-stat-num">' + (hasDeviceStatus ? _allDevices.filter(function(d){return _deviceStatus[d._key]==='rusak';}).length : nRusak) + '</span>' +
          '<span class="bd-stat-label">Rusak</span>' +
        '</div>' +
      '</div>' +
      clickHint +
    '</div>' +

    fotoHtml +

    '<div class="bd-card"><div class="bd-section">' +
      '<div class="bd-section-title" id="device-list-title">📦 Daftar Device (' + _allDevices.length + ')</div>' +
      '<div id="device-list-container"></div>' +
    '</div></div>';

  // Wire up stat cards if we have per-device status
  if (hasDeviceStatus) {
    renderStatCards();
    renderDeviceList();
  } else {
    // No per-device data — just show full list
    renderDeviceList();
  }
}

document.addEventListener('DOMContentLoaded', loadBrandDetail);
