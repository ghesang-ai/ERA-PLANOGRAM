// assets/js/brand-detail.js

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

  // Fetch store row + device list in parallel
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
  var nDisplay  = parseInt(row[brand + '_Display'])      || 0;
  var nTidak    = parseInt(row[brand + '_TidakDisplay']) || 0;
  var nRusak    = parseInt(row[brand + '_Rusak'])        || 0;
  var nTotal    = parseInt(row[brand])                   || 0;

  var lduFoto  = row[brand + '_LDU_Foto']    || '';
  var wallFoto = row[brand + '_Wallbay_Foto'] || '';

  // Devices for this brand
  var allDevices = [];
  if (deviceData[plantCode]) {
    allDevices = (deviceData[plantCode].devices || []).filter(function(d) {
      return (d.brand || '').toUpperCase() === brand.toUpperCase();
    });
  }

  // Build HTML
  var fotoHtml = '';
  if (lduFoto || wallFoto) {
    function fotoItem(url, label) {
      if (!url) return '<div class="bd-foto-item"><div class="bd-foto-label">' + label + '</div><div class="bd-foto-empty">Tidak ada foto</div></div>';
      var prev = url.replace('/view', '/preview');
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

  var devHtml = '';
  if (allDevices.length > 0) {
    devHtml = allDevices.map(function(d, i) {
      return '<div class="bd-device-item">' +
        '<div class="bd-device-num">' + (i + 1) + '</div>' +
        '<div>' +
          '<div class="bd-device-name">' + escHtml(d.name) + '</div>' +
          '<div class="bd-device-sn">SN: ' + escHtml(d.sn || '-') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } else {
    devHtml = '<div class="bd-empty">Tidak ada data device terdaftar untuk brand ini.</div>';
  }

  document.getElementById('page-content').innerHTML =
    // Hero
    '<div class="bd-hero">' +
      '<div class="bd-brand-name">' + escHtml(brand.toUpperCase()) + '</div>' +
      '<div class="bd-store-name">📍 ' + escHtml(storeName) + ' · ' + escHtml(plantCode) + '</div>' +
      '<div class="bd-status-bar">' +
        '<div class="bd-stat s-total"><span class="bd-stat-num">' + nTotal + '</span><span class="bd-stat-label">Total LDU</span></div>' +
        '<div class="bd-stat s-display"><span class="bd-stat-num">' + nDisplay + '</span><span class="bd-stat-label">Display</span></div>' +
        '<div class="bd-stat s-tidak"><span class="bd-stat-num">' + nTidak + '</span><span class="bd-stat-label">Tidak Display</span></div>' +
        '<div class="bd-stat s-rusak"><span class="bd-stat-num">' + nRusak + '</span><span class="bd-stat-label">Rusak</span></div>' +
      '</div>' +
    '</div>' +

    // Foto
    fotoHtml +

    // Device list
    '<div class="bd-card"><div class="bd-section">' +
      '<div class="bd-section-title">📦 Daftar Device (' + allDevices.length + ')</div>' +
      devHtml +
    '</div></div>';
}

document.addEventListener('DOMContentLoaded', loadBrandDetail);
