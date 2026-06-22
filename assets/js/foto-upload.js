// assets/js/foto-upload.js
// Tanggung jawab: compress foto, render accordion Step 3, upload ke Apps Script

var _fotoData = {};
// _fotoData = { "Apple_LDU": { base64, brand, type }, "Apple_Wallbay": {...} }

function compressImage(file, maxKB, callback) {
  maxKB = maxKB || 800;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var MAX_W = 1200;
      var w = img.width, h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var quality = 0.85;
      var dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > maxKB * 1024 * 1.37 && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Render accordion Step 3 — semua 32 brand dari CONFIG.BRAND_LDU_COLUMNS,
// hanya expand brand yang ada di brandsWithCount
function buildFotoAccordion(brandsWithCount) {
  _fotoData = {};
  var container = document.getElementById('foto-accordion');
  if (!container) return;

  if (!brandsWithCount || brandsWithCount.length === 0) {
    container.innerHTML = '<p style="color:var(--gray-400);font-size:13px;padding:8px 0">Pilih device di Step 2 terlebih dahulu.</p>';
    return;
  }

  // Gunakan semua brand dari CONFIG.BRAND_LDU_COLUMNS, filter yang ada di brandsWithCount
  var countMap = {};
  brandsWithCount.forEach(function(b) { countMap[b.name] = b.count; });

  // Tampilkan semua 32 brand, bukan hanya yang terpilih
  var allBrands = (typeof CONFIG !== 'undefined' && CONFIG.BRAND_LDU_COLUMNS)
    ? CONFIG.BRAND_LDU_COLUMNS
    : brandsWithCount.map(function(b) { return b.name; });

  container.innerHTML = allBrands.map(function(brandName) {
    var key   = brandName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    var count = countMap[brandName] || 0;
    var countLabel = count > 0
      ? '<span style="color:var(--blue);font-weight:600;font-size:11px">(' + count + ' device tercentang)</span>'
      : '';

    return '<div class="foto-brand-item" id="fbi-' + key + '">' +
      '<div class="foto-brand-header" onclick="toggleFotoAccordion(\'' + key + '\')">' +
        '<span class="foto-brand-name">' + escHtml(brandName) + ' ' + countLabel + '</span>' +
        '<span id="fbadge-' + key + '" class="foto-badge-zero">0 foto</span>' +
      '</div>' +
      '<div class="foto-brand-body" id="fbbody-' + key + '" style="display:none">' +
        renderFotoTypeZone(brandName, 'LDU') +
        renderFotoTypeZone(brandName, 'Wallbay') +
      '</div>' +
    '</div>';
  }).join('');
}

function renderFotoTypeZone(brand, type) {
  var safeKey  = brand.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  var key      = safeKey + '_' + type;
  var labelClass = type === 'LDU' ? 'foto-type-label--ldu' : 'foto-type-label--wall';
  var icon       = type === 'LDU' ? '📺' : '🗂️';
  var label      = type === 'LDU' ? 'FOTO LDU DISPLAY' : 'FOTO WALLBAY';

  return '<div class="foto-type-section">' +
    '<div class="foto-type-label ' + labelClass + '"><span class="dot"></span>' + icon + ' ' + label + '</div>' +
    '<div class="foto-upload-zone">' +
      '<div class="foto-preview-thumb" id="fthumb-' + key + '" onclick="document.getElementById(\'finput-' + key + '\').click()">' +
        '<span class="thumb-placeholder">📷</span>' +
      '</div>' +
      '<div class="foto-upload-btn-wrap">' +
        '<label class="foto-upload-btn" for="finput-' + key + '">📁 Pilih Foto</label>' +
        '<input type="file" id="finput-' + key + '" accept="image/*" capture="environment" style="display:none" ' +
          'onchange="onFotoSelect(\'' + brand.replace(/'/g, "\\'") + '\',\'' + type + '\',this)">' +
        '<div class="foto-upload-info" id="finfo-' + key + '">JPG/PNG · Max 5MB</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function toggleFotoAccordion(key) {
  var body = document.getElementById('fbbody-' + key);
  if (!body) return;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

function onFotoSelect(brand, type, input) {
  if (!input.files || !input.files[0]) return;
  var file    = input.files[0];
  var safeKey = brand.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  var key     = safeKey + '_' + type;
  var infoEl  = document.getElementById('finfo-' + key);
  var thumbEl = document.getElementById('fthumb-' + key);
  var dataKey = brand + '_' + type;

  if (infoEl) infoEl.textContent = '⏳ Memproses...';

  compressImage(file, 800, function(base64) {
    var sizeKB = Math.round(base64.length * 0.75 / 1024);
    _fotoData[dataKey] = { base64: base64, brand: brand, type: type };
    if (thumbEl) thumbEl.innerHTML = '<img src="' + base64 + '" alt="">';
    if (infoEl)  infoEl.textContent = '✅ ' + sizeKB + 'KB — siap upload';
    updateFotoBadge(brand);
  });
}

function updateFotoBadge(brand) {
  var safeKey = brand.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  var count   = Object.keys(_fotoData).filter(function(k) {
    return k === brand + '_LDU' || k === brand + '_Wallbay';
  }).length;
  var badge = document.getElementById('fbadge-' + safeKey);
  if (!badge) return;
  if (count > 0) {
    badge.className   = 'foto-badge-count';
    badge.textContent = count + ' foto';
  } else {
    badge.className   = 'foto-badge-zero';
    badge.textContent = '0 foto';
  }
}

async function uploadAllFotos(plantCode, storeName) {
  var keys = Object.keys(_fotoData);
  if (keys.length === 0) return {};

  var fotoMap = {};
  for (var i = 0; i < keys.length; i++) {
    var entry    = _fotoData[keys[i]];
    var brand    = entry.brand;
    var type     = entry.type;
    var today    = new Date();
    var ymd      = today.getFullYear() +
                   String(today.getMonth() + 1).padStart(2, '0') +
                   String(today.getDate()).padStart(2, '0');
    var safeName = brand.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    var fileName = safeName + '_' + type + '_' + ymd + '.jpg';
    var colName  = brand + '_' + type + '_Foto';

    try {
      var res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:    'uploadFoto',
          plantCode: plantCode,
          storeName: storeName,
          brand:     brand,
          type:      type,
          fileData:  entry.base64,
          fileName:  fileName
        })
      });
      var json = await res.json();
      if (json.status === 'success') {
        fotoMap[colName] = json.url;
      } else {
        console.warn('Upload gagal:', brand, type, json.message);
      }
    } catch (err) {
      console.warn('Upload error:', brand, type, err);
    }
  }
  return fotoMap;
}

async function saveFotoUrlsToSheet(plantCode, fotoMap) {
  if (!fotoMap || Object.keys(fotoMap).length === 0) return;
  try {
    await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:    'saveFotoUrls',
        plantCode: plantCode,
        fotoMap:   fotoMap
      })
    });
  } catch (err) {
    console.warn('saveFotoUrls error:', err);
  }
}

async function saveDeviceStatusToSheet(plantCode, deviceStatusMap) {
  if (!deviceStatusMap || Object.keys(deviceStatusMap).length === 0) return;
  var statusData = {};
  Object.keys(deviceStatusMap).forEach(function(brand) {
    if (Object.keys(deviceStatusMap[brand]).length > 0) {
      statusData[brand + '_DeviceStatus'] = JSON.stringify(deviceStatusMap[brand]);
    }
  });
  if (Object.keys(statusData).length === 0) return;
  try {
    await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:    'saveFotoUrls',
        plantCode: plantCode,
        fotoMap:   statusData
      })
    });
  } catch (err) {
    console.warn('saveDeviceStatus error:', err);
  }
}

function getFotoCount() {
  return Object.keys(_fotoData).length;
}
