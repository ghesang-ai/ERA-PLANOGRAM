// assets/js/store-detail.js
// Requires: CONFIG (config.js), exportStoreExcel (export.js)

async function loadStoreDetail() {
  var params = new URLSearchParams(window.location.search);
  var plantCode = params.get('code');

  if (!plantCode) {
    document.getElementById('detail-content').innerHTML = '<p style="padding:20px;color:var(--red)">Plant Code tidak ditemukan di URL.</p>';
    return;
  }

  document.title = 'Detail Toko ' + plantCode + ' — ERA-PLANOGRAM';

  try {
    var url = CONFIG.API_URL + '?store=' + encodeURIComponent(plantCode);
    var res  = await fetch(url);
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
    <div class="detail-store-name">' + (row['Store Name'] || plantCode) + '</div>\
    <div class="detail-meta">\
      <span>📍 Plant Code: <strong>' + plantCode + '</strong></span>\
      <span>🏷️ Brand: <strong>' + brandToko + '</strong></span>\
      <span>🗺️ ' + (row['Region'] || '-') + '</span>\
      <span>Status: <span class="badge ' + badgeClass + '">' + status + '</span></span>\
      <span>Last Submit: <strong>' + lastSubmit + '</strong></span>\
      <span>Total LDU: <strong style="color:var(--blue)">' + totalLDU + ' unit</strong></span>\
    </div>';

  var gridHtml = CONFIG.BRAND_LDU_COLUMNS.map(function(col) {
    var val  = parseInt(row[col]) || 0;
    var zero = val === 0 ? ' zero' : '';
    return '\
      <div class="ldu-card">\
        <div class="ldu-card-brand">' + col + '</div>\
        <div class="ldu-card-count' + zero + '">' + val + '</div>\
      </div>';
  }).join('');

  document.getElementById('ldu-grid').innerHTML = gridHtml;

  var exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.onclick = function() {
      exportStoreExcel(plantCode, row['Store Name']);
    };
  }
}

document.addEventListener('DOMContentLoaded', loadStoreDetail);
