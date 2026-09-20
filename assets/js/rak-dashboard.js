// assets/js/rak-dashboard.js — dashboard Rak Aksesoris Samsung
// Requires: config.js, rak-common.js, SheetJS (untuk Export)

var _rk = { month: '', months: [], stores: [], filtered: [], qf: '', json: null };

document.addEventListener('DOMContentLoaded', function() {
  rakLoadCfg().then(function() { loadMonth(''); }).catch(function(err) { showError('Gagal memuat data toko. ' + err.message); });
});

function showError(msg) {
  document.getElementById('tb').innerHTML = '<tr><td colspan="8" class="state-cell">⚠️ ' + rakEsc(msg) + '</td></tr>';
}

function loadMonth(month) {
  document.getElementById('tb').innerHTML = '<tr><td colspan="8" class="state-cell"><span class="spinner"></span>Memuat data...</td></tr>';
  rakApi({ month: month }).then(function(j) {
    _rk.json   = j;
    _rk.month  = j.month;
    _rk.months = j.availableMonths && j.availableMonths.length ? j.availableMonths : [j.month];
    buildStores(j);
    rakTopbarTime();
    renderAll();
  }).catch(function(err) {
    showError('Gagal memuat data. ' + err.message);
    console.error('rak-dashboard load error:', err);
  });
}

// Satu baris per toko Samsung di rak-samsung.json; digabung dengan data submit bulan terpilih
function buildStores(j) {
  var byCode = {};
  (j.data || []).forEach(function(r) { byCode[String(r.plantCode).toUpperCase()] = r; });
  var lastBy = j.lastByStore || {};
  _rk.stores = Object.keys(RAK.cfg.stores).sort().map(function(code) {
    var st = RAK.cfg.stores[code], row = byCode[code] || null, apps = rakItemsFor(code);
    var target = row ? Number(row.qtyTarget) : rakSum(apps.map(function(i) { return i.target; }));
    var actual = row ? Number(row.qtyActual) : 0;
    return {
      code: code, name: st.name, area: st.area || '-', row: row, sub: !!row, alloc: rakHasStrap(code),
      target: target, actual: actual, pct: row ? rakPct(actual, target) : 0,
      gaps: row ? Number(row.itemsKurang) : 0, foto: row ? Number(row.fotoCount) : 0, frames: apps.length,
      last: row ? row.lastUpdated : (lastBy[code] || '')
    };
  });
}

function renderAll() {
  var S = _rk.stores, total = S.length, subs = S.filter(function(d) { return d.sub; });
  var nSub = subs.length, nPend = total - nSub, pct = rakPct(nSub, total);
  var tgt = rakSum(subs.map(function(d) { return d.target; })), act = rakSum(subs.map(function(d) { return d.actual; }));
  var qtyPct = rakPct(act, tgt), gapStores = subs.filter(function(d) { return d.gaps > 0; }).length;
  var bulan = rakMonthLabel(_rk.month);

  document.getElementById('kpis').innerHTML =
    '<div class="summary-card sc--accent"><div class="sc-top"><div class="sc-icon">🗄️</div><div class="sc-badge">' + pct + '% Rate</div></div>' +
      '<div class="sc-value">' + nSub + '<span>/' + total + '</span></div><div class="sc-label">Toko Sudah Submit Bulan Ini</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill" style="width:' + pct + '%"></div></div><div class="sc-foot">📆 ' + bulan + ' · ' + nPend + ' toko belum submit</div></div>' +
    '<div class="summary-card sc--month"><div class="sc-top"><div class="sc-icon">📦</div><div class="sc-badge sc-badge--month">Target ≥ ' + RAK_TARGET_PCT + '%</div></div>' +
      '<div class="sc-value sc-value--month">' + qtyPct + '<span>%</span></div><div class="sc-label">Pemenuhan Qty Display Acc</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill sc-bar-fill--month" style="width:' + qtyPct + '%"></div></div><div class="sc-foot">✅ ' + act + ' dari ' + tgt + ' model terpajang (toko submit)</div></div>' +
    '<div class="summary-card sc--pending"><div class="sc-top"><div class="sc-icon">⏳</div><div class="sc-badge">' + (100 - pct) + '%</div></div>' +
      '<div class="sc-value">' + nPend + '</div><div class="sc-label">Toko Belum Submit Bulan Ini</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill" style="width:' + (100 - pct) + '%"></div></div><div class="sc-foot">📣 Bisa dikirim Auto Reminder WhatsApp</div></div>' +
    '<div class="summary-card sc--rusak"><div class="sc-top"><div class="sc-icon">🧩</div><div class="sc-badge sc-badge--rusak">' + gapStores + ' toko</div></div>' +
      '<div class="sc-value sc-value--rusak">' + (tgt - act) + '</div><div class="sc-label">Model Belum Terpajang</div>' +
      '<div class="sc-bar"><div class="sc-bar-fill sc-bar-fill--rusak" style="width:' + (tgt ? (tgt - act) / tgt * 100 : 0) + '%"></div></div><div class="sc-foot">⚠️ ' + gapStores + ' toko masih ada item kurang</div></div>';

  renderAreas(); renderAccChart(subs); renderDonut(nSub, nPend, total, pct); renderPeriods(); populateAreaFilter();
  document.getElementById('qc-all').textContent  = total;
  document.getElementById('qc-sub').textContent  = nSub;
  document.getElementById('qc-pend').textContent = nPend;
  applyFilters();
}

function renderAreas() {
  var areas = [], S = _rk.stores;
  S.forEach(function(d) { if (areas.indexOf(d.area) === -1) areas.push(d.area); });
  areas.sort();
  document.getElementById('area-cards').innerHTML = areas.map(function(a) {
    var ds = S.filter(function(d) { return d.area === a; }), sd = ds.filter(function(d) { return d.sub; }).length, p = rakPct(sd, ds.length);
    var bg = p >= 80 ? '#dcfce7' : p >= 50 ? '#fef9c3' : '#fee2e2', fg = p >= 80 ? '#15803d' : p >= 50 ? '#a16207' : '#b91c1c';
    return '<div class="brand-card"><div class="brand-card-top"><div class="brand-avatar" style="background:var(--accent);font-size:18px">📍</div>' +
      '<div class="brand-pct-badge" style="background:' + bg + ';color:' + fg + '">' + p + '%</div></div>' +
      '<div class="brand-card-name">' + rakEsc(a) + '</div><div class="brand-card-count">' + sd + ' / ' + ds.length + ' toko submit</div>' +
      '<div class="brand-bar"><div class="brand-bar-fill" style="width:' + p + '%;background:var(--accent)"></div></div></div>';
  }).join('');
}

// Pemenuhan per aksesoris dari toko yang sudah submit dan berlaku untuk item tsb
function renderAccChart(subs) {
  document.getElementById('acc-chart').innerHTML = RAK.cfg.items.map(function(it) {
    var rel = subs.filter(function(d) { return !it.selected || d.alloc; });
    var t = rel.length * it.target, a = 0;
    rel.forEach(function(d) {
      var saved = (d.row.items || []).filter(function(x) { return x.key === it.key; })[0];
      a += saved ? Number(saved.qty) || 0 : 0;
    });
    var p = rakPct(a, t), c = rakColor(p);
    var none = rel.length === 0;
    return '<div class="acc-row" title="' + rakEsc(it.name) + ': ' + a + ' dari ' + t + ' model terpajang di ' + rel.length + ' toko">' +
      '<div class="acc-name">' + rakEsc(it.name) + (it.selected ? '<span class="tag-sel">STRAP</span>' : '') + '</div>' +
      '<div class="acc-bar"><div style="width:' + (none ? 0 : p) + '%;background:' + c + '"></div></div>' +
      '<div class="acc-val" style="color:' + (none ? 'var(--gray-400)' : c) + '">' + (none ? '—' : p + '%') + '</div></div>';
  }).join('');
}

function renderDonut(nSub, nPend, total, pct) {
  var C = 2 * Math.PI * 62, dash = total ? C * nSub / total : 0;
  document.getElementById('donut-card').innerHTML =
    '<div class="chart-card" style="display:flex;flex-direction:column;align-items:center;height:100%">' +
    '<div class="chart-card-header" style="width:100%"><div><div class="chart-title">📊 Status Submit</div><div class="chart-sub">Rak Aksesoris Samsung</div></div></div>' +
    '<div class="donut-wrap"><svg width="160" height="160" viewBox="0 0 160 160">' +
      '<circle cx="80" cy="80" r="62" fill="none" stroke="#f43f5e" stroke-width="18"/>' +
      '<circle cx="80" cy="80" r="62" fill="none" stroke="var(--accent)" stroke-width="18" stroke-dasharray="' + dash + ' ' + C + '" transform="rotate(-90 80 80)"/></svg>' +
      '<div class="donut-center"><div class="donut-total">' + total + '</div><div class="donut-label">Total Toko</div></div></div>' +
    '<div class="donut-legend" style="width:100%">' +
      '<div class="donut-legend-item"><span class="donut-dot" style="background:var(--accent)"></span>Sudah Submit (' + nSub + ')<b style="margin-left:auto;color:var(--accent)">' + pct + '%</b></div>' +
      '<div class="donut-legend-item"><span class="donut-dot" style="background:#f43f5e"></span>Belum Submit (' + nPend + ')<b style="margin-left:auto;color:#f43f5e">' + (100 - pct) + '%</b></div>' +
    '</div></div>';
}

function renderPeriods() {
  var row = document.getElementById('period-row');
  if (_rk.months.length <= 1) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  row.innerHTML = '<span>Periode:</span>' + _rk.months.map(function(m) {
    return '<button class="period-btn' + (m === _rk.month ? ' active' : '') + '" onclick="loadMonth(\'' + m + '\')">' + rakMonthLabel(m) + '</button>';
  }).join('');
}

function populateAreaFilter() {
  var sel = document.getElementById('f-area'), cur = sel.value, areas = [];
  _rk.stores.forEach(function(d) { if (areas.indexOf(d.area) === -1) areas.push(d.area); });
  areas.sort();
  sel.innerHTML = '<option value="">Semua Area</option>' + areas.map(function(a) {
    return '<option' + (a === cur ? ' selected' : '') + '>' + rakEsc(a) + '</option>';
  }).join('');
}

function setQf(v) {
  _rk.qf = v;
  [['qf-all', ''], ['qf-sub', 'sub'], ['qf-pend', 'pend']].forEach(function(p) {
    document.getElementById(p[0]).classList.toggle('active', p[1] === v);
  });
  applyFilters();
}

function applyFilters() {
  var q = (document.getElementById('q').value || '').toLowerCase();
  var area = document.getElementById('f-area').value, st = document.getElementById('f-status').value;
  _rk.filtered = _rk.stores.filter(function(d) {
    if (_rk.qf === 'sub'  && !d.sub) return false;
    if (_rk.qf === 'pend' && d.sub)  return false;
    if (area && d.area !== area) return false;
    if (q && d.name.toLowerCase().indexOf(q) === -1 && d.code.toLowerCase().indexOf(q) === -1) return false;
    if (st === 'full' && !(d.sub && d.gaps === 0)) return false;
    if (st === 'gap'  && !(d.sub && d.gaps > 0))   return false;
    return true;
  });
  renderTable();
}

function renderTable() {
  var bulan = rakMonthLabel(_rk.month), D = _rk.filtered;
  document.getElementById('fc').textContent = D.length + ' toko';
  document.getElementById('tb').innerHTML = D.length === 0
    ? '<tr><td colspan="8" class="state-cell">Tidak ada data sesuai filter</td></tr>'
    : D.map(function(d) {
        var status = d.sub ? '<span class="badge badge-period badge-period--this">✅ Submit ' + bulan + '</span>'
          : d.last ? '<span class="badge badge-period badge-period--last">⚠️ Belum Submit ' + bulan + '</span>'
          : '<span class="badge badge-period badge-period--never">❌ Belum Submit</span>';
        var qty = d.sub
          ? '<div class="score"><div class="score-bar"><div style="width:' + d.pct + '%;background:' + rakColor(d.pct) + '"></div></div>' +
            '<b style="color:' + rakColor(d.pct) + ';font-size:12px;white-space:nowrap">' + d.actual + '<span class="muted" style="font-weight:600">/' + d.target + '</span></b></div>'
          : '<span class="muted">—</span>';
        var gap = !d.sub ? '<span class="muted">—</span>' : d.gaps === 0 ? '<span class="badge-ok">Lengkap</span>'
          : '<span class="' + (d.gaps > 3 ? 'badge-bad' : 'badge-warn') + '">' + d.gaps + ' item</span>';
        return '<tr class="' + (d.sub ? '' : 'row-pending') + '"><td><code>' + rakEsc(d.code) + '</code></td>' +
          '<td class="col-store">' + rakEsc(d.name) + (d.alloc ? '<span class="tag-sel" title="Dapat alokasi Strap Watch">STRAP</span>' : '') +
            '<div style="font-size:11px;color:var(--gray-400);margin-top:2px;font-weight:500">📍 ' + rakEsc(d.area) + '</div></td>' +
          '<td>' + status + '</td><td>' + qty + '</td><td style="text-align:center">' + gap + '</td>' +
          '<td style="text-align:center">' + (d.sub ? '<span class="foto-chip">📷 ' + d.foto + '/' + d.frames + '</span>' : '<span class="muted">—</span>') + '</td>' +
          '<td style="color:var(--gray-600);font-size:12px">' + (d.last ? rakFmtDate(d.last) : '-') + '</td>' +
          '<td><a class="btn btn-xs" href="rak-detail.html?code=' + encodeURIComponent(d.code) + '&month=' + encodeURIComponent(_rk.month) + '">Detail</a></td></tr>';
      }).join('');
}

// ── Export Excel: mengikuti tab (Sudah/Belum Submit) + filter yang sedang tampil ──
function exportRakExcel() {
  var D = _rk.filtered;
  if (!D.length) { alert('Tidak ada data untuk diexport.'); return; }
  var bulan = rakMonthLabel(_rk.month);

  var rows = D.map(function(d) {
    var o = {
      'Plant Code': d.code, 'Store Name': d.name, 'Area': d.area,
      'Status': (d.sub ? 'Sudah Submit ' : 'Belum Submit ') + bulan,
      'Last Submit': d.last ? rakFmtDate(d.last) : '',
      'Qty Display (Aktual)': d.sub ? d.actual : '', 'Qty Display (Target)': d.sub ? d.target : '',
      'Pemenuhan (%)': d.sub ? d.pct : '', 'Item Kurang': d.sub ? d.gaps : '', 'Jumlah Foto': d.sub ? d.foto : ''
    };
    RAK.cfg.items.forEach(function(it) {
      if (it.selected && !d.alloc) { o[it.name] = 'N/A'; return; }
      if (!d.sub) { o[it.name] = ''; return; }
      var saved = (d.row.items || []).filter(function(x) { return x.key === it.key; })[0];
      o[it.name] = (saved ? Number(saved.qty) || 0 : 0) + '/' + it.target;
    });
    return o;
  });

  var summary = RAK.cfg.items.map(function(it) {
    var rel = D.filter(function(d) { return d.sub && (!it.selected || d.alloc); });
    var t = rel.length * it.target, a = 0;
    rel.forEach(function(d) { var s = (d.row.items || []).filter(function(x) { return x.key === it.key; })[0]; a += s ? Number(s.qty) || 0 : 0; });
    return { 'Aksesoris': it.name, 'Target per Toko (model)': it.target, 'Toko Submit': rel.length, 'Model Terpajang': a, 'Total Target': t, 'Pemenuhan (%)': t ? rakPct(a, t) : '' };
  });

  var wb = XLSX.utils.book_new();
  var ws1 = XLSX.utils.json_to_sheet(rows);
  ws1['!cols'] = Object.keys(rows[0]).map(function(k) { return { wch: Math.max(k.length + 2, 12) }; });
  XLSX.utils.book_append_sheet(wb, ws1, 'Rak Aksesoris Samsung');
  var ws2 = XLSX.utils.json_to_sheet(summary);
  ws2['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary Aksesoris');

  var label = _rk.qf === 'pend' ? 'BELUM-SUBMIT' : _rk.qf === 'sub' ? 'SUDAH-SUBMIT' : 'SEMUA-TOKO';
  var now = new Date(), ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  XLSX.writeFile(wb, 'ERA-PLANOGRAM-RAK-SAMSUNG-' + label + '-' + bulan.toUpperCase().replace(/\s+/g, '-') + '_' + ymd + '.xlsx');
}
