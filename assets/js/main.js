// assets/js/main.js

window._eraAllData      = [];
window._eraFilteredData = [];
window._eraViewMode     = 'summary';
var _refreshTimer = null;
var _trendChart   = null;
var _donutChart   = null;

// Brand avatar colors
var BRAND_AVATAR = {
  'Erafone':       { bg: '#2563eb', initials: 'ERA' },
  'iBox':          { bg: '#6d28d9', initials: 'iBX' },
  'Samsung Store': { bg: '#1428A0', initials: 'SAM' },
  'Xiaomi Store':  { bg: '#FF6900', initials: 'XIA' },
  'Huawei Store':  { bg: '#cf0a2c', initials: 'HWI' },
  'Honor Store':   { bg: '#0066cc', initials: 'HNR' },
  'Megastore':     { bg: '#0f766e', initials: 'MEG' },
  'Lainnya':       { bg: '#64748b', initials: 'LNY' }
};

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Header date ──
(function() {
  var el = document.getElementById('header-date');
  if (el) {
    var d = new Date();
    el.textContent = '📅 ' + d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
  }
})();

// ── Fetch ──
async function fetchData(params) {
  params = params || {};
  var url = new URL(CONFIG.API_URL);
  Object.keys(params).forEach(function(k) { url.searchParams.set(k, params[k]); });
  showLoading();
  try {
    if (CONFIG.API_URL === 'YOUR_SCRIPT_URL_HERE') {
      showError('Konfigurasi belum selesai: isi CONFIG.API_URL di assets/js/config.js.');
      return;
    }
    var res  = await fetch(url.toString());
    var json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'API error');
    if (!Array.isArray(json.data)) throw new Error('Format data tidak valid');

    window._eraAllData      = json.data;
    window._eraFilteredData = json.data.slice();

    renderSummaryCards(json.data);
    renderBrandComplianceCards(json.data);
    renderCharts(json.data);
    renderTopStores(json.data);
    applyFilters();

    var el = document.getElementById('last-updated');
    if (el) {
      var d = json.lastUpdated ? new Date(json.lastUpdated) : null;
      el.textContent = 'Update: ' + (d && !isNaN(d) ? d.toLocaleString('id-ID') : 'Baru saja');
    }
  } catch (err) {
    showError('Gagal memuat data. ' + err.message);
    console.error('ERA-PLANOGRAM fetchData error:', err);
  }
}

function getColspan() {
  return window._eraViewMode === 'full' ? (4 + CONFIG.BRAND_LDU_COLUMNS.length + 3) : 12;
}
function showLoading() {
  var tbody = document.getElementById('table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="' + getColspan() + '" class="state-cell"><span class="spinner"></span>Memuat data...</td></tr>';
}
function showError(msg) {
  var tbody = document.getElementById('table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="' + getColspan() + '" class="state-cell">⚠️ ' + msg + '</td></tr>';
}

// ── Summary Cards ──
function renderSummaryCards(data) {
  var container = document.getElementById('summary-cards');
  if (!container) return;
  var total     = data.length;
  var submitted = data.filter(function(d) { return d['Status'] === 'Submitted'; }).length;
  var pending   = total - submitted;
  var pct       = total > 0 ? Math.round((submitted / total) * 100) : 0;
  var totalLDU  = data.reduce(function(s, d) { return s + CONFIG.calcTotalLDU(d); }, 0);

  container.innerHTML =
    '<div class="summary-card sc--submit">' +
      '<div class="sc-top"><div class="sc-icon">🏪</div><div class="sc-badge">' + pct + '% Rate</div></div>' +
      '<div class="sc-value">' + submitted + '<span>/' + total + '</span></div>' +
      '<div class="sc-label">Toko Sudah Submit</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="sc-foot">✅ ' + pct + '% Compliance Rate Region 5</div>' +
    '</div>' +
    '<div class="summary-card sc--pending">' +
      '<div class="sc-top"><div class="sc-icon">⏳</div><div class="sc-badge">' + Math.round((pending/total)*100||0) + '% Belum</div></div>' +
      '<div class="sc-value">' + pending + '</div>' +
      '<div class="sc-label">Toko Belum Submit</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill" style="width:' + Math.round((pending/total)*100||0) + '%"></div></div>' +
      '<div class="sc-foot">⚠️ Perlu segera submit data LDU</div>' +
    '</div>' +
    '<div class="summary-card sc--ldu">' +
      '<div class="sc-top"><div class="sc-icon">📱</div><div class="sc-badge">Live</div></div>' +
      '<div class="sc-value">' + totalLDU.toLocaleString('id-ID') + '</div>' +
      '<div class="sc-label">Total Unit LDU Terpasang</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill" style="width:' + Math.min(pct + 20, 100) + '%"></div></div>' +
      '<div class="sc-foot">📊 Dari ' + submitted + ' toko yang sudah submit</div>' +
    '</div>';
}

// ── Brand Compliance Cards ──
function renderBrandComplianceCards(data) {
  var container = document.getElementById('brand-compliance-cards');
  if (!container) return;

  var html = CONFIG.BRAND_TOKO.map(function(brand) {
    var brandData = data.filter(function(d) { return CONFIG.detectBrandToko(d['Store Name']) === brand; });
    var total     = brandData.length;
    var submitted = brandData.filter(function(d) { return d['Status'] === 'Submitted'; }).length;
    var pct       = total > 0 ? Math.round((submitted / total) * 100) : 0;
    var color     = CONFIG.BRAND_TOKO_COLORS[brand] || '#64748b';
    var av        = BRAND_AVATAR[brand] || { bg: color, initials: brand.substring(0,3).toUpperCase() };
    var pctBg     = pct >= 80 ? '#dcfce7' : pct >= 50 ? '#fef9c3' : '#fee2e2';
    var pctColor  = pct >= 80 ? '#15803d' : pct >= 50 ? '#a16207' : '#b91c1c';

    return '<div class="brand-card">' +
      '<div class="brand-card-top">' +
        '<div class="brand-avatar" style="background:' + color + '">' + av.initials + '</div>' +
        '<div class="brand-pct-badge" style="background:' + pctBg + ';color:' + pctColor + '">' + pct + '%</div>' +
      '</div>' +
      '<div class="brand-card-name">' + brand + '</div>' +
      '<div class="brand-card-count">' + submitted + ' / ' + total + ' toko submit</div>' +
      '<div class="brand-bar"><div class="brand-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
    '</div>';
  }).join('');

  container.innerHTML = html;
}

// ── Charts ──
function renderCharts(data) {
  renderTrendChart();
  renderDonutChart(data);
}

function renderTrendChart() {
  var ctx = document.getElementById('trend-chart');
  if (!ctx) return;
  if (_trendChart) { _trendChart.destroy(); }

  // Simulasi dummy data 7 hari
  var labels = [];
  var vals   = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' }));
    // Simulasi trend naik menuju compliance saat ini
    var base = 15 + (6-i) * 8 + Math.round(Math.random() * 5);
    vals.push(Math.min(base, 95));
  }

  _trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Compliance %',
        data: vals,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#2563eb',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: .4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ' ' + ctx.parsed.y + '% Compliance'; }
          }
        }
      },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { callback: function(v) { return v + '%'; }, font: { size: 11 } },
          grid: { color: '#f1f5f9' }
        },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function renderDonutChart(data) {
  var ctx = document.getElementById('donut-chart');
  if (!ctx) return;
  if (_donutChart) { _donutChart.destroy(); }

  var total     = data.length;
  var submitted = data.filter(function(d) { return d['Status'] === 'Submitted'; }).length;
  var pending   = total - submitted;

  var center = document.getElementById('donut-center');
  if (center) {
    center.querySelector('.donut-total').textContent = total.toLocaleString('id-ID');
  }

  var legend = document.getElementById('donut-legend');
  if (legend) {
    legend.innerHTML =
      '<div class="donut-legend-item"><div class="donut-dot" style="background:#2563eb"></div>' +
        '<span style="flex:1">Sudah Submit (' + submitted + ')</span>' +
        '<strong style="color:#2563eb">' + (total>0?Math.round(submitted/total*100):0) + '%</strong></div>' +
      '<div class="donut-legend-item"><div class="donut-dot" style="background:#f43f5e"></div>' +
        '<span style="flex:1">Belum Submit (' + pending + ')</span>' +
        '<strong style="color:#f43f5e">' + (total>0?Math.round(pending/total*100):0) + '%</strong></div>';
  }

  _donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [submitted, pending],
        backgroundColor: ['#2563eb', '#f43f5e'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      cutout: '72%',
      responsive: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } }
    }
  });
}

// ── Top Stores ──
function renderTopStores(data) {
  var list = document.getElementById('top-stores-list');
  if (!list) return;

  var sorted = data
    .map(function(d) { return { name: d['Store Name'], ldu: CONFIG.calcTotalLDU(d) }; })
    .filter(function(d) { return d.ldu > 0; })
    .sort(function(a, b) { return b.ldu - a.ldu; })
    .slice(0, 5);

  if (sorted.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--gray-400);font-size:13px;padding:20px 0">Belum ada data LDU</div>';
    return;
  }

  var max = sorted[0].ldu;
  list.innerHTML = sorted.map(function(d, i) {
    var pct = Math.round((d.ldu / max) * 100);
    return '<div class="top-store-item">' +
      '<div class="top-store-rank">' + (i+1) + '</div>' +
      '<div class="top-store-name" title="' + escHtml(d.name) + '">' + escHtml(d.name) + '</div>' +
      '<div class="top-store-bar-wrap"><div class="top-store-bar"><div class="top-store-bar-fill" style="width:' + pct + '%"></div></div></div>' +
      '<div class="top-store-val">' + d.ldu + '</div>' +
    '</div>';
  }).join('');
}

// ── Table ──
function setView(mode) {
  window._eraViewMode = mode;
  document.getElementById('btn-summary-view').classList.toggle('active', mode === 'summary');
  document.getElementById('btn-full-view').classList.toggle('active', mode === 'full');
  var tw = document.getElementById('table-wrap');
  if (tw) tw.classList.toggle('full-view', mode === 'full');
  renderTableHead();
  renderTable(window._eraFilteredData);
}

function renderTableHead() {
  var thead = document.getElementById('table-head');
  if (!thead) return;
  var fixed = '<th>Plant Code</th><th>Nama Toko</th><th>Brand</th><th>Status</th>';
  var cols  = window._eraViewMode === 'full' ? CONFIG.BRAND_LDU_COLUMNS : CONFIG.BRAND_LDU_DISPLAY;
  var brandCols = cols.map(function(c) {
    return '<th' + (window._eraViewMode==='full'?' class="col-brand-full"':'') + '>' + escHtml(c) + '</th>';
  }).join('');
  thead.innerHTML = '<tr>' + fixed + brandCols + '<th>Total LDU</th><th>Last Submit</th><th>Aksi</th></tr>';
}

function renderTable(data) {
  var tbody = document.getElementById('table-body');
  if (!tbody) return;
  var fc = document.getElementById('filter-count');
  if (fc) fc.textContent = data.length + ' toko';
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + getColspan() + '" class="state-cell">Tidak ada data sesuai filter</td></tr>';
    return;
  }
  var isFull = window._eraViewMode === 'full';
  var cols   = isFull ? CONFIG.BRAND_LDU_COLUMNS : CONFIG.BRAND_LDU_DISPLAY;

  tbody.innerHTML = data.map(function(row) {
    var status     = row['Status'] || 'Pending';
    var badgeClass = status === 'Submitted' ? 'badge-green' : 'badge-red';
    var lastSubmit = CONFIG.formatDate(row['Last Submit']);
    var totalLDU   = CONFIG.calcTotalLDU(row);
    var brandCols  = cols.map(function(col) {
      var val = parseInt(row[col]) || 0;
      var cls = isFull ? 'col-num col-brand-full' : 'col-num';
      return '<td class="' + cls + '">' + (val > 0 ? val : '<span style="color:var(--gray-200)">0</span>') + '</td>';
    }).join('');
    return '<tr class="' + (status !== 'Submitted' ? 'row-pending' : '') + '">' +
      '<td><code>' + escHtml(row['Plant Code']) + '</code></td>' +
      '<td class="col-store">' + escHtml(row['Store Name']) + '</td>' +
      '<td><span style="font-size:12px;color:var(--gray-600)">' + escHtml(CONFIG.detectBrandToko(row['Store Name'])) + '</span></td>' +
      '<td><span class="badge ' + badgeClass + '">' + escHtml(status) + '</span></td>' +
      brandCols +
      '<td class="col-total">' + (totalLDU > 0 ? totalLDU : '—') + '</td>' +
      '<td style="color:var(--gray-600);font-size:12px">' + lastSubmit + '</td>' +
      '<td><a href="store-detail.html?code=' + encodeURIComponent(row['Plant Code']) + '" class="btn btn-xs">Detail</a></td>' +
    '</tr>';
  }).join('');
}

function applyFilters() {
  var brandVal  = (document.getElementById('filter-brand')  || {}).value || '';
  var searchVal = ((document.getElementById('search-store') || {}).value || '').toLowerCase();
  var statusVal = (document.getElementById('filter-status') || {}).value || '';

  window._eraFilteredData = window._eraAllData.filter(function(d) {
    var matchBrand  = !brandVal  || CONFIG.detectBrandToko(d['Store Name']).toLowerCase() === brandVal.toLowerCase();
    var matchSearch = !searchVal ||
      (d['Store Name'] || '').toLowerCase().includes(searchVal) ||
      (d['Plant Code'] || '').toLowerCase().includes(searchVal);
    var matchStatus = !statusVal || (d['Status'] || 'Pending') === statusVal;
    return matchBrand && matchSearch && matchStatus;
  });

  renderTable(window._eraFilteredData);
}

function refreshData() { fetchData(); }

document.addEventListener('DOMContentLoaded', function() {
  fetchData();
  _refreshTimer = setInterval(fetchData, 5 * 60 * 1000);
});
