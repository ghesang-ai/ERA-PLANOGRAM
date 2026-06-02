// assets/js/main.js
// Requires: CONFIG (config.js), exportAllExcel/exportFilteredExcel (export.js)

window._eraAllData      = [];
window._eraFilteredData = [];
var _refreshTimer = null;

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fetchData(params) {
  params = params || {};
  var url = new URL(CONFIG.API_URL);
  Object.keys(params).forEach(function(k) { url.searchParams.set(k, params[k]); });

  showLoading();

  try {
    if (CONFIG.API_URL === 'YOUR_SCRIPT_URL_HERE') {
      showError('Konfigurasi belum selesai: isi CONFIG.API_URL di assets/js/config.js dengan URL Apps Script Web App Anda.');
      return;
    }
    var res  = await fetch(url.toString());
    var json = await res.json();

    if (json.status !== 'success') throw new Error(json.message || 'API error');
    if (!Array.isArray(json.data)) throw new Error('Format data tidak valid dari API');

    window._eraAllData      = json.data;
    window._eraFilteredData = json.data.slice();

    renderSummaryCards(json.data);
    renderBrandComplianceCards(json.data);
    applyFilters();

    var el = document.getElementById('last-updated');
    if (el) {
      var updatedDate = json.lastUpdated ? new Date(json.lastUpdated) : null;
      el.textContent = 'Update: ' + (updatedDate && !isNaN(updatedDate) ? updatedDate.toLocaleString('id-ID') : 'Baru saja');
    }

  } catch (err) {
    showError('Gagal memuat data. Cek koneksi atau API URL di config.js.<br><small>' + err.message + '</small>');
    console.error('ERA-PLANOGRAM fetchData error:', err);
  }
}

function showLoading() {
  var tbody = document.getElementById('table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="state-cell"><span class="spinner"></span>Memuat data...</td></tr>';
}

function showError(msg) {
  var tbody = document.getElementById('table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="state-cell">⚠️ ' + msg + '</td></tr>';
}

function renderSummaryCards(data) {
  var container = document.getElementById('summary-cards');
  if (!container) return;

  var total     = data.length;
  var submitted = data.filter(function(d) { return d['Status'] === 'Submitted'; }).length;
  var pending   = total - submitted;
  var pct       = total > 0 ? Math.round((submitted / total) * 100) : 0;
  var totalLDU  = data.reduce(function(s, d) { return s + CONFIG.calcTotalLDU(d); }, 0);

  container.innerHTML = '\
    <div class="card card--highlight">\
      <div class="card-icon">🏪</div>\
      <div class="card-value">' + submitted + '<span class="card-total">/' + total + '</span></div>\
      <div class="card-label">Toko Sudah Submit</div>\
      <div class="card-bar"><div class="card-bar-fill" style="width:' + pct + '%;background:var(--blue)"></div></div>\
      <div class="card-pct">' + pct + '% Compliance</div>\
    </div>\
    <div class="card">\
      <div class="card-icon">⏳</div>\
      <div class="card-value" style="color:var(--red)">' + pending + '</div>\
      <div class="card-label">Belum Submit</div>\
    </div>\
    <div class="card">\
      <div class="card-icon">📱</div>\
      <div class="card-value">' + totalLDU.toLocaleString("id-ID") + '</div>\
      <div class="card-label">Total Unit LDU</div>\
    </div>';
}

function renderBrandComplianceCards(data) {
  var container = document.getElementById('brand-compliance-cards');
  if (!container) return;

  var html = CONFIG.BRAND_TOKO.map(function(brand) {
    var brandData = data.filter(function(d) {
      return CONFIG.detectBrandToko(d['Store Name']) === brand;
    });
    var total     = brandData.length;
    var submitted = brandData.filter(function(d) { return d['Status'] === 'Submitted'; }).length;
    var pct       = total > 0 ? Math.round((submitted / total) * 100) : 0;
    var color     = CONFIG.BRAND_TOKO_COLORS[brand] || '#64748b';

    return '\
      <div class="brand-card" style="border-left-color:' + color + '">\
        <div class="brand-card-name">' + brand + '</div>\
        <div class="brand-card-count">' + submitted + '<span style="font-size:13px;font-weight:400;color:var(--gray-400)">/' + total + '</span></div>\
        <div class="brand-card-sub">toko submit</div>\
        <div class="brand-card-bar"><div class="brand-card-fill" style="width:' + pct + '%;background:' + color + '"></div></div>\
        <div class="brand-card-pct" style="color:' + color + '">' + pct + '%</div>\
      </div>';
  }).join('');

  container.innerHTML = html;
}

function renderTable(data) {
  var tbody = document.getElementById('table-body');
  if (!tbody) return;

  var filterCount = document.getElementById('filter-count');
  if (filterCount) filterCount.textContent = data.length + ' toko';

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="state-cell">Tidak ada data sesuai filter</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(function(row) {
    var status     = row['Status'] || 'Pending';
    var badgeClass = status === 'Submitted' ? 'badge-green' : 'badge-red';
    var lastSubmit = CONFIG.formatDate(row['Last Submit']);
    var totalLDU   = CONFIG.calcTotalLDU(row);
    var isPending  = status !== 'Submitted';

    var brandCols = CONFIG.BRAND_LDU_DISPLAY.map(function(col) {
      var val = parseInt(row[col]) || 0;
      return '<td class="col-num">' + (val > 0 ? val : '<span style="color:var(--gray-200)">0</span>') + '</td>';
    }).join('');

    return '<tr class="' + (isPending ? 'row-pending' : '') + '">\
      <td><code>' + escHtml(row['Plant Code']) + '</code></td>\
      <td class="col-store">' + escHtml(row['Store Name']) + '</td>\
      <td>' + escHtml(CONFIG.detectBrandToko(row['Store Name'])) + '</td>\
      <td><span class="badge ' + badgeClass + '">' + escHtml(status) + '</span></td>\
      ' + brandCols + '\
      <td class="col-total">' + (totalLDU > 0 ? totalLDU : '-') + '</td>\
      <td style="color:var(--gray-600);font-size:12px">' + lastSubmit + '</td>\
      <td><a href="store-detail.html?code=' + encodeURIComponent(row['Plant Code']) + '" class="btn btn-xs">Detail</a></td>\
    </tr>';
  }).join('');
}

function applyFilters() {
  var brand  = document.getElementById('filter-brand');
  var search = document.getElementById('search-store');
  var status = document.getElementById('filter-status');

  var brandVal  = brand  ? brand.value.toLowerCase()  : '';
  var searchVal = search ? search.value.toLowerCase() : '';
  var statusVal = status ? status.value : '';

  window._eraFilteredData = window._eraAllData.filter(function(d) {
    var matchBrand  = !brandVal  || CONFIG.detectBrandToko(d['Store Name']).toLowerCase() === brandVal;
    var matchSearch = !searchVal ||
      (d['Store Name'] || '').toLowerCase().includes(searchVal) ||
      (d['Plant Code'] || '').toLowerCase().includes(searchVal);
    var matchStatus = !statusVal || (d['Status'] || 'Pending') === statusVal;
    return matchBrand && matchSearch && matchStatus;
  });

  renderTable(window._eraFilteredData);
}

function refreshData() {
  fetchData();
}

document.addEventListener('DOMContentLoaded', function() {
  fetchData();
  _refreshTimer = setInterval(fetchData, 5 * 60 * 1000);
});
