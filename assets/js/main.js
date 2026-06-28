// assets/js/main.js

window._eraAllData      = [];
window._eraFilteredData = [];
window._eraViewMode     = 'summary';
var _refreshTimer = null;
var _trendChart   = null;
var _donutChart   = null;
var _storeAreas   = {};

// Brand avatar colors + logos
var BRAND_AVATAR = {
  'Erafone':       { bg: '#fff',    initials: 'ERA', logo: 'assets/img/brands/erafone.svg' },
  'iBox':          { bg: '#fff',    initials: 'iBX', logo: 'assets/img/brands/ibox.svg' },
  'Samsung Store': { bg: '#fff',    initials: 'SAM', logo: 'assets/img/brands/samsung.svg' },
  'Xiaomi Store':  { bg: '#fff',    initials: 'XIA', logo: 'assets/img/brands/xiaomi.svg' },
  'Huawei Store':  { bg: '#fff',    initials: 'HWI', logo: 'assets/img/brands/huawei.svg' },
  'Honor Store':   { bg: '#fff',    initials: 'HNR', logo: 'assets/img/brands/honor.svg' },
  'Megastore':     { bg: '#0f766e', initials: 'MEG', logo: null },
  'Lainnya':       { bg: '#64748b', initials: 'LNY', logo: null }
};

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Period Helper ──
function getSubmitPeriod(lastSubmitVal) {
  if (!lastSubmitVal || lastSubmitVal === '' || lastSubmitVal === '-') {
    return { key: 'never', label: 'Belum Pernah', short: '—' };
  }
  var d = new Date(lastSubmitVal);
  if (isNaN(d.getTime())) {
    // try parsing "22 Jun 2026 14:30" format
    d = new Date(String(lastSubmitVal).replace(/(\d{2}) (\w{3}) (\d{4})/, '$2 $1 $3'));
  }
  if (isNaN(d.getTime())) return { key: 'never', label: 'Belum Pernah', short: '—' };

  var now = new Date();
  var sameYear  = d.getFullYear() === now.getFullYear();
  var sameMonth = sameYear && d.getMonth() === now.getMonth();
  var lastMonth = sameYear && d.getMonth() === now.getMonth() - 1;

  var monthLabel = d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

  if (sameMonth)  return { key: 'this_month', label: 'Submit Bulan Ini',  short: monthLabel };
  if (lastMonth)  return { key: 'last_month', label: 'Data Bulan Lalu',   short: monthLabel };
  return           { key: 'older',      label: 'Data Lama',          short: monthLabel };
}

// ── Topbar updated time ──
function updateTopbarTime(isoStr) {
  var el = document.getElementById('topbar-updated');
  if (!el) return;
  var d = isoStr ? new Date(isoStr) : new Date();
  el.textContent = 'Last updated: ' + d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) +
    ', ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}

// ── Hero stats ──
function renderHeroStats(data) {
  var total     = data.length;
  var submitted = data.filter(function(d) { return d['Status'] === 'Submitted'; }).length;
  var thisMonth = data.filter(function(d) { return getSubmitPeriod(d['Last Submit']).key === 'this_month'; }).length;
  var totalLDU  = data.reduce(function(s, d) { return s + CONFIG.calcTotalLDU(d); }, 0);
  var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
  set('hs-toko',   total);
  set('hs-submit', submitted);
  set('hs-bulan',  thisMonth);
  set('hs-ldu',    totalLDU.toLocaleString('id-ID'));
}

// ── Fetch ──
var _activeMonth = '';

async function fetchData(params) {
  params = params || {};
  if (_activeMonth) params.month = _activeMonth;
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

    // Simpan bulan aktif dari API
    _activeMonth = json.activeMonth || _activeMonth;
    // Inject area dari store-areas.json ke setiap row
    json.data.forEach(function(d) {
      d['Area'] = _storeAreas[d['Plant Code']] || '';
    });
    window._eraAllData      = json.data;
    window._eraFilteredData = json.data.slice();
    populateAreaFilter(json.data);

    // Update month filter dropdown
    renderMonthFilter(json.availableMonths || [], json.activeMonth || '');

    renderHeroStats(json.data);
    renderSummaryCards(json.data);
    renderBrandComplianceCards(json.data);
    renderCharts(json.data);
    renderTopStores(json.data);
    updateQuickFilterCounts(json.data);
    applyFilters();
    updateTopbarTime(json.lastUpdated);

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

function renderMonthFilter(months, activeMonth) {
  var wrap = document.getElementById('month-filter-wrap');
  if (!wrap) return;
  if (!months || months.length <= 1) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';

  var monthNames = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'Mei','06':'Jun',
                     '07':'Jul','08':'Agu','09':'Sep','10':'Okt','11':'Nov','12':'Des' };

  function fmtMonth(m) {
    if (!m) return m;
    var parts = m.split('-');
    return (monthNames[parts[1]] || parts[1]) + ' ' + parts[0];
  }

  wrap.innerHTML = '<span style="font-size:12px;font-weight:600;color:var(--gray-500);margin-right:6px">Periode:</span>' +
    months.map(function(m) {
      var isActive = m === activeMonth;
      return '<button onclick="switchMonth(\'' + m + '\')" style="' +
        'padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid ' +
        (isActive ? 'var(--blue)' : 'var(--gray-200)') + ';background:' +
        (isActive ? 'var(--blue)' : 'white') + ';color:' +
        (isActive ? 'white' : 'var(--gray-600)') + '">' +
        fmtMonth(m) + '</button>';
    }).join('');
}

function switchMonth(month) {
  _activeMonth = month;
  fetchData();
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
  var total      = data.length;
  var submitted  = data.filter(function(d) { return d['Status'] === 'Submitted'; }).length;
  var pct        = total > 0 ? Math.round((submitted / total) * 100) : 0;
  var totalLDU   = data.reduce(function(s, d) { return s + CONFIG.calcTotalLDU(d); }, 0);

  var thisMonth     = data.filter(function(d) { return getSubmitPeriod(d['Last Submit']).key === 'this_month'; }).length;
  var belumBulanIni = total - thisMonth;
  var pctBulanIni   = total > 0 ? Math.round((thisMonth / total) * 100) : 0;
  var nowLabel      = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  var totalRusak = 0;
  var tokoRusak  = 0;
  data.forEach(function(d) {
    var rusakToko = 0;
    Object.keys(d).forEach(function(col) {
      if (col.endsWith('_Rusak')) {
        var val = parseInt(d[col]) || 0;
        totalRusak += val;
        rusakToko  += val;
      }
    });
    if (rusakToko > 0) tokoRusak++;
  });

  container.innerHTML =
    '<div class="summary-card sc--submit">' +
      '<div class="sc-top"><div class="sc-icon">🏪</div><div class="sc-badge">' + pct + '% Rate</div></div>' +
      '<div class="sc-value">' + submitted + '<span>/' + total + '</span></div>' +
      '<div class="sc-label">Toko Sudah Submit (Total)</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="sc-foot">✅ ' + pct + '% Compliance Rate Region 5</div>' +
    '</div>' +
    '<div class="summary-card sc--month">' +
      '<div class="sc-top"><div class="sc-icon">📅</div><div class="sc-badge sc-badge--month">' + pctBulanIni + '%</div></div>' +
      '<div class="sc-value sc-value--month">' + thisMonth + '<span>/' + total + '</span></div>' +
      '<div class="sc-label">Submit Bulan Ini</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill sc-bar-fill--month" style="width:' + pctBulanIni + '%"></div></div>' +
      '<div class="sc-foot">📆 ' + nowLabel + ' · ' + belumBulanIni + ' toko belum submit bulan ini</div>' +
    '</div>' +
    '<div class="summary-card sc--ldu">' +
      '<div class="sc-top"><div class="sc-icon">📱</div><div class="sc-badge">Live</div></div>' +
      '<div class="sc-value">' + totalLDU.toLocaleString('id-ID') + '</div>' +
      '<div class="sc-label">Total Unit LDU Terpasang</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill" style="width:' + Math.min(pct + 20, 100) + '%"></div></div>' +
      '<div class="sc-foot">📊 Dari ' + submitted + ' toko yang sudah submit</div>' +
    '</div>' +
    '<div class="summary-card sc--rusak">' +
      '<div class="sc-top"><div class="sc-icon">⚠️</div><div class="sc-badge sc-badge--rusak">' + tokoRusak + ' toko</div></div>' +
      '<div class="sc-value sc-value--rusak">' + totalRusak + '</div>' +
      '<div class="sc-label">Total Unit Rusak Region 5</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill sc-bar-fill--rusak" style="width:' + Math.min(totalRusak, 100) + '%"></div></div>' +
      '<div class="sc-foot">🔧 ' + tokoRusak + ' toko ada device rusak</div>' +
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

    var avatarHtml = av.logo
      ? '<div class="brand-avatar brand-avatar--logo" style="background:#fff;border:1.5px solid #e2e8f0"><img src="' + av.logo + '" alt="' + brand + '" onerror="this.parentElement.innerHTML=\'' + av.initials + '\';this.parentElement.style.background=\'' + color + '\';this.parentElement.classList.remove(\'brand-avatar--logo\')"></div>'
      : '<div class="brand-avatar" style="background:' + color + '">' + av.initials + '</div>';

    return '<div class="brand-card">' +
      '<div class="brand-card-top">' +
        avatarHtml +
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
    var lastSubmit = CONFIG.formatDate(row['Last Submit']);
    var totalLDU   = CONFIG.calcTotalLDU(row);
    var period     = getSubmitPeriod(row['Last Submit']);

    var periodBadge;
    if (status !== 'Submitted') {
      periodBadge = '<span class="badge badge-period badge-period--never">❌ Belum Submit</span>';
    } else if (period.key === 'this_month') {
      periodBadge = '<span class="badge badge-period badge-period--this">✅ ' + period.short + '</span>';
    } else if (period.key === 'last_month') {
      periodBadge = '<span class="badge badge-period badge-period--last">⚠️ ' + period.short + '</span>';
    } else {
      periodBadge = '<span class="badge badge-period badge-period--old">🕐 ' + period.short + '</span>';
    }

    var brandCols  = cols.map(function(col) {
      var val = parseInt(row[col]) || 0;
      var cls = isFull ? 'col-num col-brand-full' : 'col-num';
      return '<td class="' + cls + '">' + (val > 0 ? val : '<span style="color:var(--gray-200)">0</span>') + '</td>';
    }).join('');

    return '<tr class="' + (status !== 'Submitted' ? 'row-pending' : '') + '">' +
      '<td><code>' + escHtml(row['Plant Code']) + '</code></td>' +
      '<td class="col-store">' + escHtml(row['Store Name']) +
        (row['Area'] ? '<div style="font-size:11px;color:var(--gray-400);margin-top:2px;font-weight:500">📍 ' + escHtml(row['Area']) + '</div>' : '') +
      '</td>' +
      '<td><span style="font-size:12px;color:var(--gray-600)">' + escHtml(CONFIG.detectBrandToko(row['Store Name'])) + '</span></td>' +
      '<td>' + periodBadge + '</td>' +
      brandCols +
      '<td class="col-total">' + (totalLDU > 0 ? totalLDU : '—') + '</td>' +
      '<td style="color:var(--gray-600);font-size:12px">' + lastSubmit + '</td>' +
      '<td><a href="store-detail.html?code=' + encodeURIComponent(row['Plant Code']) + '" class="btn btn-xs">Detail</a></td>' +
    '</tr>';
  }).join('');
}

// 'submitted_this_month' | 'pending_this_month' | ''
var _activeQuickFilter = '';

function submittedThisMonth(d) {
  var lastSubmit = d['Last Submit'];
  if (!lastSubmit || lastSubmit === '-') return false;
  var submitDate = new Date(lastSubmit);
  if (isNaN(submitDate.getTime())) {
    submitDate = new Date(String(lastSubmit).replace(/(\d{2}) (\w{3}) (\d{4})/, '$2 $1 $3'));
  }
  if (isNaN(submitDate.getTime())) return false;
  var windowStart = new Date(CONFIG.SUBMIT_WINDOW_START);
  return submitDate >= windowStart;
}

function setQuickFilter(val) {
  _activeQuickFilter = val;
  ['qf-all','qf-submitted','qf-pending'].forEach(function(id) {
    var btn = document.getElementById(id);
    if (btn) btn.classList.remove('active');
  });
  var activeId = val === 'submitted_this_month' ? 'qf-submitted'
               : val === 'pending_this_month'   ? 'qf-pending'
               : 'qf-all';
  var activeBtn = document.getElementById(activeId);
  if (activeBtn) activeBtn.classList.add('active');
  applyFilters();
}

function updateQuickFilterCounts(data) {
  var total     = data.length;
  var submitted = data.filter(submittedThisMonth).length;
  var pending   = total - submitted;
  var now = new Date();
  var bulan = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  var el;
  el = document.getElementById('qf-count-all');       if (el) el.textContent = total;
  el = document.getElementById('qf-count-submitted'); if (el) el.textContent = submitted;
  el = document.getElementById('qf-count-pending');   if (el) el.textContent = pending;
  // Update label pill to show current month
  var pillSub = document.getElementById('qf-submitted');
  if (pillSub) pillSub.title = 'Submit di bulan ' + bulan;
  var pillPend = document.getElementById('qf-pending');
  if (pillPend) pillPend.title = 'Belum submit di bulan ' + bulan;
}

function populateAreaFilter(data) {
  var sel = document.getElementById('filter-area');
  if (!sel) return;
  var areas = [];
  data.forEach(function(d) {
    if (d['Area'] && areas.indexOf(d['Area']) === -1) areas.push(d['Area']);
  });
  areas.sort();
  var current = sel.value;
  sel.innerHTML = '<option value="">Semua Area</option>' +
    areas.map(function(a) {
      return '<option value="' + escHtml(a) + '"' + (a === current ? ' selected' : '') + '>' + escHtml(a) + '</option>';
    }).join('');
}

function applyFilters() {
  var brandVal  = (document.getElementById('filter-brand')  || {}).value || '';
  var areaVal   = (document.getElementById('filter-area')   || {}).value || '';
  var searchVal = ((document.getElementById('search-store') || {}).value || '').toLowerCase();
  var statusVal = (document.getElementById('filter-status') || {}).value || '';
  var periodVal = (document.getElementById('filter-period') || {}).value || '';

  window._eraFilteredData = window._eraAllData.filter(function(d) {
    var matchBrand  = !brandVal  || CONFIG.detectBrandToko(d['Store Name']).toLowerCase() === brandVal.toLowerCase();
    var matchArea   = !areaVal   || (d['Area'] || '') === areaVal;
    var matchSearch = !searchVal ||
      (d['Store Name'] || '').toLowerCase().includes(searchVal) ||
      (d['Plant Code'] || '').toLowerCase().includes(searchVal) ||
      (d['Area'] || '').toLowerCase().includes(searchVal);
    var matchStatus = !statusVal || (d['Status'] || 'Pending') === statusVal;
    if (_activeQuickFilter === 'submitted_this_month') {
      if (!submittedThisMonth(d)) return false;
    } else if (_activeQuickFilter === 'pending_this_month') {
      if (submittedThisMonth(d)) return false;
    }
    var matchPeriod = true;
    if (periodVal) {
      var p = getSubmitPeriod(d['Last Submit']);
      if (periodVal === 'never') {
        matchPeriod = p.key === 'never' || (d['Status'] || 'Pending') === 'Pending';
      } else {
        matchPeriod = p.key === periodVal;
      }
    }
    return matchBrand && matchArea && matchSearch && matchStatus && matchPeriod;
  });

  renderTable(window._eraFilteredData);
}

function refreshData() { fetchData(); }

document.addEventListener('DOMContentLoaded', function() {
  applyHeaderSettings();
  startCountdown();
  fetch('assets/data/store-areas.json')
    .then(function(r) { return r.json(); })
    .then(function(data) { _storeAreas = data; })
    .catch(function() {})
    .finally(function() { fetchData(); });
  _refreshTimer = setInterval(fetchData, 5 * 60 * 1000);
});

// ══════════════════════════════════════════
// HEADER SETTINGS
// ══════════════════════════════════════════

var HS_KEY = 'era_header_settings';
var _cdTimer = null;

var HS_DEFAULT = {
  bgImage: null,
  bgColor: '#1e3a8a',
  cdLabel: '',
  cdEnd: ''
};

function loadHs() {
  try { return Object.assign({}, HS_DEFAULT, JSON.parse(localStorage.getItem(HS_KEY) || '{}')); }
  catch(e) { return Object.assign({}, HS_DEFAULT); }
}

function applyHeaderSettings() {
  var s = loadHs();
  var banner = document.querySelector('.hero-banner');
  if (!banner) return;

  var heroContent = document.querySelector('.hero-content');
  var heroBg      = document.querySelector('.hero-banner-bg');
  var bannerImg = document.getElementById('hero-banner-img');
  if (bannerImg) {
    bannerImg.src = 'assets/img/banner-default.jpg';
    bannerImg.style.display = 'block';
  }
  banner.style.backgroundImage = '';
  banner.style.backgroundColor = '';
  if (heroContent) heroContent.style.display = 'none';
  if (heroBg)      heroBg.style.display      = 'none';

  var cdEl = document.getElementById('hero-countdown');
  var cdLabel = document.getElementById('hero-cd-label');
  if (cdEl) {
    if (s.cdEnd) {
      cdEl.style.display = 'block';
      if (cdLabel) cdLabel.textContent = s.cdLabel || 'Berakhir dalam';
    } else {
      cdEl.style.display = 'none';
    }
  }
}

function startCountdown() {
  if (_cdTimer) clearInterval(_cdTimer);
  function tick() {
    var s = loadHs();
    if (!s.cdEnd) return;
    var end  = new Date(s.cdEnd).getTime();
    var now  = Date.now();
    var diff = Math.max(0, end - now);
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000)  / 60000);
    var sec = Math.floor((diff % 60000)  / 1000);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set('cd-d', pad(d)); set('cd-h', pad(h)); set('cd-m', pad(m)); set('cd-s', pad(sec));
  }
  tick();
  _cdTimer = setInterval(tick, 1000);
}

function openHeaderSettings() {
  var s = loadHs();
  document.getElementById('hs-cd-label').value = s.cdLabel || '';
  document.getElementById('hs-cd-date').value  = s.cdEnd   || '';
  document.getElementById('hs-color-picker').value = s.bgColor || '#1e3a8a';
  document.getElementById('hs-color-hex').value    = s.bgColor || '#1e3a8a';
  updateHsColorPreview();

  var previewImg = document.getElementById('hs-preview-img');
  var uploadEmpty   = document.getElementById('hs-upload-empty');
  var uploadPreview = document.getElementById('hs-upload-preview');
  if (s.bgImage) {
    previewImg.src = s.bgImage;
    uploadEmpty.style.display   = 'none';
    uploadPreview.style.display = 'block';
  } else {
    uploadEmpty.style.display   = 'block';
    uploadPreview.style.display = 'none';
  }

  document.getElementById('hs-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeHeaderSettings() {
  document.getElementById('hs-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function onHsImageUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var previewImg = document.getElementById('hs-preview-img');
    previewImg.src = e.target.result;
    document.getElementById('hs-upload-empty').style.display   = 'none';
    document.getElementById('hs-upload-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeHsImage() {
  document.getElementById('hs-preview-img').src = '';
  document.getElementById('hs-upload-empty').style.display   = 'block';
  document.getElementById('hs-upload-preview').style.display = 'none';
  document.getElementById('hs-file-input').value = '';
}

function updateHsColorPreview() {
  var color = document.getElementById('hs-color-picker').value;
  document.getElementById('hs-color-hex').value = color;
  var card = document.getElementById('hs-color-preview');
  if (card) card.style.background = 'linear-gradient(135deg, ' + color + ' 0%, ' + color + 'cc 100%)';
}

function syncHsColorFromHex() {
  var hex = document.getElementById('hs-color-hex').value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    document.getElementById('hs-color-picker').value = hex;
    var card = document.getElementById('hs-color-preview');
    if (card) card.style.background = 'linear-gradient(135deg, ' + hex + ' 0%, ' + hex + 'cc 100%)';
  }
}

function saveHeaderSettings() {
  var imgSrc = document.getElementById('hs-preview-img').src;
  var s = {
    bgImage: (imgSrc && imgSrc !== window.location.href) ? imgSrc : null,
    bgColor: document.getElementById('hs-color-hex').value || '#1e3a8a',
    cdLabel: document.getElementById('hs-cd-label').value.trim(),
    cdEnd:   document.getElementById('hs-cd-date').value
  };
  localStorage.setItem(HS_KEY, JSON.stringify(s));
  applyHeaderSettings();
  startCountdown();
  closeHeaderSettings();
}

function resetHsDefaults() {
  localStorage.removeItem(HS_KEY);
  removeHsImage();
  document.getElementById('hs-cd-label').value     = '';
  document.getElementById('hs-cd-date').value      = '';
  document.getElementById('hs-color-picker').value = '#1e3a8a';
  document.getElementById('hs-color-hex').value    = '#1e3a8a';
  updateHsColorPreview();
  applyHeaderSettings();
  startCountdown();
  closeHeaderSettings();
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeHeaderSettings();
});
