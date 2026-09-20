// assets/js/rak-detail.js — detail Rak Aksesoris Samsung per toko: collage foto + Qty Display
// URL: rak-detail.html?code=S041&month=2026-09
// Requires: config.js, rak-common.js, SheetJS (Export)

var _d = { code: '', store: null, month: '', months: [], row: null, tab: 'foto', items: [], byKey: {} };

document.addEventListener('DOMContentLoaded', function() {
  var q = new URLSearchParams(location.search);
  _d.code  = (q.get('code') || '').toUpperCase();
  _d.month = q.get('month') || '';
  _d.tab   = q.get('tab') === 'qty' ? 'qty' : 'foto';
  rakLoadCfg().then(function() {
    _d.store = RAK.cfg.stores[_d.code];
    if (!_d.store) return showFail('Toko <b>' + rakEsc(_d.code || '-') + '</b> tidak terdaftar di Rak Aksesoris Samsung.');
    _d.items = rakItemsFor(_d.code);
    load();
  }).catch(function(err) { showFail('Gagal memuat data toko. ' + rakEsc(err.message)); });
});

function showFail(html) {
  document.getElementById('view').innerHTML = '<div class="state-cell">⚠️ ' + html + '<br><br><a class="btn btn-blue" href="rak-dashboard.html">← Kembali ke dashboard</a></div>';
}

function load() {
  document.getElementById('view').innerHTML = '<div class="state-cell"><span class="spinner"></span>Memuat data...</div>';
  rakApi({ store: _d.code, month: _d.month }).then(function(j) {
    _d.month  = j.month;
    _d.months = j.availableMonths && j.availableMonths.length ? j.availableMonths : [j.month];
    _d.row    = j.data || null;
    _d.byKey  = {};
    ((_d.row && _d.row.items) || []).forEach(function(it) { _d.byKey[it.key] = it; });
    history.replaceState(null, '', 'rak-detail.html?code=' + encodeURIComponent(_d.code) + '&month=' + encodeURIComponent(_d.month) + (_d.tab === 'qty' ? '&tab=qty' : ''));
    render();
  }).catch(function(err) { showFail(err.message === RAK_OLD_BACKEND_MSG ? rakEsc(err.message) : 'Gagal memuat data. ' + rakEsc(err.message)); });
}

function setTab(t) { _d.tab = t; history.replaceState(null, '', location.search.replace(/&tab=\w+/, '') + (t === 'qty' ? '&tab=qty' : '')); render(); }
function setMonth(m) { _d.month = m; load(); }

// qty & foto satu aksesoris dari data tersimpan
function stateOf(it) {
  var s = _d.byKey[it.key];
  return { has: !!(s && s.photoUrl), qty: s ? Number(s.qty) || 0 : 0, ok: s && s.ok ? s.ok : [], s: s || null };
}

function totals() {
  var target = 0, actual = 0, foto = 0, gaps = 0;
  _d.items.forEach(function(it) {
    var st = stateOf(it); target += it.target; actual += st.qty; if (st.has) foto++; if (st.qty < it.target) gaps++;
  });
  return { target: target, actual: actual, foto: foto, gaps: gaps, pct: rakPct(actual, target) };
}

function render() {
  var sub = !!_d.row, t = totals(), bulan = rakMonthLabel(_d.month);
  var statusBadge = sub ? '<span class="badge-ok">Submitted ' + bulan + '</span>' : '<span class="badge-warn">Belum Submit ' + bulan + '</span>';
  var warn = sub ? '' : '<div class="sd-warn">⏳ Toko ini belum submit Rak Aksesoris Samsung periode ' + bulan + '. Bingkai di bawah masih kosong (placeholder).' +
    (_d.months.length > 1 ? ' Coba pilih periode lain.' : '') + '</div>';

  document.getElementById('view').innerHTML =
    '<div class="sd-head"><h1>' + rakEsc(_d.store.name) + '</h1><div class="sd-meta">' +
      '<span>📍 Plant Code: <b>' + rakEsc(_d.code) + '</b></span><span>🏷️ Brand: <b>Samsung Store</b></span><span>🗺️ Region 5 · ' + rakEsc(_d.store.area || '-') + '</span>' +
      '<span>Status: ' + statusBadge + '</span><span>Last Submit: <b>' + (sub ? rakFmtDate(_d.row.lastUpdated) : '-') + '</b></span>' +
      '<span>Qty Display: <b style="color:' + (sub ? rakColor(t.pct) : 'var(--gray-400)') + '">' + (sub ? t.actual + ' / ' + t.target + ' model (' + t.pct + '%)' : '—') + '</b></span>' +
      (rakHasStrap(_d.code) ? '<span class="tag-sel" style="margin:0">ALOKASI STRAP WATCH</span>' : '') +
    '</div></div>' +

    '<div class="sd-bar no-print">' +
      '<button class="sd-tab' + (_d.tab === 'qty' ? ' active' : '') + '" onclick="setTab(\'qty\')">📊 Qty Display Acc</button>' +
      '<button class="sd-tab' + (_d.tab === 'foto' ? ' active' : '') + '" onclick="setTab(\'foto\')">📸 Foto Rak Acc Samsung</button>' +
      '<div class="sd-spacer"></div>' +
      (_d.months.length > 1 ? '<div class="period-row" style="padding:0"><span>Periode:</span>' + _d.months.map(function(m) {
        return '<button class="period-btn' + (m === _d.month ? ' active' : '') + '" onclick="setMonth(\'' + m + '\')">' + rakMonthLabel(m) + '</button>';
      }).join('') + '</div>' : '') +
    '</div>' + warn +
    (_d.tab === 'foto' ? fotoHtml(sub) : qtyHtml(sub, t));
}

function fotoHtml(sub) {
  var frames = RAK.cfg.items.map(function(it) {
    var label = rakEsc(it.name.toUpperCase());
    // Item khusus toko alokasi: di toko lain tetap ada bingkainya tapi kosong (seperti template)
    if (it.selected && !rakHasStrap(_d.code)) return '<div class="cg-frame na" title="Tidak dapat alokasi"><div class="cg-label">' + label + '</div><div class="cg-photo"></div></div>';
    var st = stateOf(it);
    var badge = sub ? '<span class="cg-qty" style="color:' + (st.qty >= it.target ? '#15803d' : st.qty ? '#b45309' : '#b91c1c') + '">' + st.qty + '/' + it.target + '</span>' : '';
    var body;
    if (st.has) {
      var m = st.s.meta, tip = m ? 'Diambil ' + (m.takenAt ? rakFmtDate(m.takenAt) : '-') + (m.device ? ' · ' + m.device : '') + (m.address ? ' · ' + m.address : '') : '';
      body = '<div class="cg-photo" title="' + rakEsc(tip) + '"><a href="' + rakEsc(st.s.photoUrl) + '" target="_blank" rel="noopener">' +
        '<img src="' + rakThumb(rakFileId(st.s), 500) + '" alt="' + label + '" loading="lazy" onerror="this.parentNode.innerHTML=\'📷\'"></a>' + badge + '</div>';
    } else {
      body = '<div class="cg-photo empty">' + badge + '</div>';
    }
    return '<div class="cg-frame"><div class="cg-label">' + label + '</div>' + body + '</div>';
  }).join('');

  return '<div class="sd-bar no-print" style="margin-bottom:8px"><div class="sd-title">Foto Rak Aksesoris Samsung</div><div class="sd-spacer"></div>' +
      '<label class="sd-check"><input type="checkbox" checked onchange="document.getElementById(\'collage\').classList.toggle(\'hide-qty\',!this.checked)"> Tampilkan qty di frame</label>' +
      '<button class="btn btn-blue" style="height:34px;font-size:12px" onclick="window.print()">🖨️ Cetak / Simpan PDF</button></div>' +
    '<div class="collage" id="collage">' +
      '<div class="cg-title">(' + rakEsc(_d.code) + ') ' + rakEsc(_d.store.name) + '</div>' +
      '<div class="cg-grid">' + frames + '</div>' +
      '<div class="cg-note"><ul>' +
        '<li>Upload foto dengan mode potrait / vertical dengan ukuran 3:4 agar pas di frame</li>' +
        '<li>Jangan mengupload foto screenshoot, karena ukuran akan tidak pas di frame</li>' +
        '<li>Jika ada salah satu item yg kosong tidak perlu upload pada item tersebut</li>' +
        '<li>Jangan meresize atau merubah posisi apapun di dalam design templete</li></ul></div>' +
    '</div>';
}

function qtyHtml(sub, t) {
  var rows = RAK.cfg.items.map(function(it, k) {
    if (it.selected && !rakHasStrap(_d.code)) {
      return '<tr class="na-row"><td class="col-num">' + (k + 1) + '</td><td class="col-store">' + rakEsc(it.name) + '<span class="tag-sel">STRAP</span></td>' +
        '<td colspan="5">Tidak dapat alokasi (thematic table only)</td></tr>';
    }
    var st = stateOf(it);
    var chips = it.types.length > 1
      ? it.types.map(function(tp, j) {
          var cls = !sub ? 'x' : (st.has && st.ok[j]) ? 'y' : 'n';
          return '<span class="type-chip ' + cls + '">' + (cls === 'y' ? '✓ ' : cls === 'n' ? '✕ ' : '') + rakEsc(tp) + '</span>';
        }).join('')
      : '<span class="muted" style="font-size:12px">1 model</span>';
    var status = !sub ? '<span class="muted">—</span>' : st.qty >= it.target ? '<span class="badge-ok">Lengkap</span>' : st.qty ? '<span class="badge-warn">Kurang</span>' : '<span class="badge-bad">Kosong</span>';
    var foto = st.has ? '<a href="' + rakEsc(st.s.photoUrl) + '" target="_blank" rel="noopener" title="Buka foto">📷</a>' : '<span class="muted">—</span>';
    return '<tr><td class="col-num">' + (k + 1) + '</td><td class="col-store">' + rakEsc(it.name) + (it.selected ? '<span class="tag-sel">STRAP</span>' : '') + '</td><td>' + chips + '</td>' +
      '<td class="col-num">' + it.target + '</td>' +
      '<td class="col-num" style="color:' + (!sub ? 'var(--gray-400)' : st.qty >= it.target ? '#15803d' : '#b45309') + '">' + (sub ? st.qty : '—') + '</td>' +
      '<td style="text-align:center">' + status + '</td><td style="text-align:center">' + foto + '</td></tr>';
  }).join('');

  return '<div class="sd-title" style="margin-bottom:12px">Update Qty Display Acc</div><div class="table-wrap"><table class="data-table">' +
    '<thead><tr><th style="text-align:center">No</th><th>Aksesoris</th><th>Type Model</th><th style="text-align:center">Target Display</th><th style="text-align:center">Aktual</th><th style="text-align:center">Status</th><th style="text-align:center">Foto</th></tr></thead>' +
    '<tbody>' + rows + '<tr class="qty-total"><td></td><td>TOTAL</td><td></td><td class="col-num">' + t.target + '</td><td class="col-num">' + (sub ? t.actual : '—') +
    '</td><td style="text-align:center">' + (sub ? t.pct + '%' : '—') + '</td><td style="text-align:center">' + (sub ? t.foto + '/' + _d.items.length : '—') + '</td></tr></tbody></table></div>';
}

// Export Excel: tabel Qty Display toko ini untuk periode terpilih
function exportStoreRak() {
  if (!_d.store) return;
  var rows = _d.items.map(function(it, k) {
    var st = stateOf(it), m = st.s && st.s.meta;
    return {
      'No': k + 1, 'Aksesoris': it.name, 'Type Model': it.types.join(', '), 'Target Display': it.target,
      'Aktual': _d.row ? st.qty : '', 'Status': !_d.row ? '' : st.qty >= it.target ? 'Lengkap' : st.qty ? 'Kurang' : 'Kosong',
      'Type Ter-display': it.types.length > 1 && st.has ? it.types.filter(function(_, j) { return st.ok[j]; }).join(', ') : '',
      'Link Foto': st.has ? st.s.photoUrl : '', 'Foto Diambil': m && m.takenAt ? rakFmtDate(m.takenAt) : '', 'Lokasi Foto': m && m.address ? m.address : ''
    };
  });
  var wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 26 }, { wch: 46 }, { wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Qty Display Acc');
  var now = new Date(), ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  XLSX.writeFile(wb, 'ERA-PLANOGRAM-RAK-SAMSUNG-' + _d.code + '-' + rakMonthLabel(_d.month).toUpperCase().replace(/\s+/g, '-') + '_' + ymd + '.xlsx');
}
