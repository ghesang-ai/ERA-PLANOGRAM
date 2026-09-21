// assets/js/export.js
// Requires: SheetJS (xlsx) loaded via CDN, CONFIG dari config.js

// opts.extraFn (opsional): function(row) -> object kolom tambahan (mis. Jumlah Foto / Status Foto).
// opts.statusFn (opsional): function(row) -> teks kolom "Status". Dipakai export dashboard supaya
// status di Excel sama dengan badge di tabel (per periode), bukan kolom Status mentah dari sheet.
function exportToExcel(data, filename, opts) {
  opts = opts || {};
  if (!data || data.length === 0) {
    alert('Tidak ada data untuk diexport.');
    return;
  }

  // ── Sheet 1: Data lengkap semua brand ──
  var wsRows = data.map(function(row) {
    var obj = {
      'Plant Code':  row['Plant Code']  || '',
      'Store Name':  row['Store Name']  || '',
      'Area':        row['Area']        || '',
      'Region':      row['Region']      || '',
      'Status':      opts.statusFn ? opts.statusFn(row) : (row['Status'] || 'Pending'),
      'Last Submit': row['Last Submit'] ? CONFIG.formatDate(row['Last Submit']) : ''
    };
    CONFIG.BRAND_LDU_COLUMNS.forEach(function(col) {
      obj[col] = parseInt(row[col]) || 0;
    });
    obj['TOTAL LDU'] = CONFIG.calcTotalLDU(row);
    if (opts.extraFn) Object.assign(obj, opts.extraFn(row));
    return obj;
  });

  // ── Sheet 2: Summary per brand LDU ──
  var summaryRows = CONFIG.BRAND_LDU_COLUMNS.map(function(col) {
    var total   = data.reduce(function(s, r) { return s + (parseInt(r[col]) || 0); }, 0);
    var adaLDU  = data.filter(function(r)   { return (parseInt(r[col]) || 0) > 0; }).length;
    return {
      'Brand LDU':          col,
      'Total Unit':         total,
      'Toko Ada LDU':       adaLDU,
      'Toko Tidak Ada LDU': data.length - adaLDU
    };
  });

  // ── Build workbook ──
  var wb = XLSX.utils.book_new();

  var ws1 = XLSX.utils.json_to_sheet(wsRows);
  var cols = Object.keys(wsRows[0]).map(function(k) {
    return { wch: Math.max(k.length + 2, 12) };
  });
  ws1['!cols'] = cols;
  XLSX.utils.book_append_sheet(wb, ws1, 'Data LDU');

  var ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary Brand');

  var dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, filename + '-' + dateStr + '.xlsx');
}

function exportAllExcel() {
  exportToExcel(window._eraAllData || [], 'ERA-PLANOGRAM-ALL');
}

// Export apa yang sedang tampil di tabel dashboard (tab Sudah/Belum Submit + Brand/Area/Cari/dst).
// Dipakai oleh tombol "Export" di toolbar tabel maupun "Export Excel" di banner atas.
function exportFilteredExcel() {
  var label = 'FILTERED';
  if (typeof _activeQuickFilter !== 'undefined') {
    if (_activeQuickFilter === 'pending_this_month')   label = 'BELUM-SUBMIT';
    if (_activeQuickFilter === 'submitted_this_month') label = 'SUDAH-SUBMIT';
    if (_activeQuickFilter === 'nofoto_this_month')    label = 'SUBMIT-BELUM-ADA-FOTO';
  }

  // Kolom Status memakai definisi yang sama dengan badge tabel & tab quick-filter
  // (submittedThisMonth di main.js), dibandingkan ke periode yang sedang dilihat.
  var periodLabel = (typeof _activeMonth !== 'undefined' && _activeMonth) ? formatMonthLabel(_activeMonth) : '';
  var statusFn = function(row) {
    return (submittedThisMonth(row) ? 'Sudah Submit' : 'Belum Submit') + (periodLabel ? ' ' + periodLabel : '');
  };
  if (periodLabel) label += '-' + periodLabel.toUpperCase().replace(/\s+/g, '-');

  // Tanggal file ditambahkan otomatis oleh exportToExcel
  // Kolom foto: jumlah foto periode ini + status (toko yang belum submit periode ini tidak punya foto periode ini)
  var extraFn = function(row) {
    var sub = submittedThisMonth(row), n = rowFotoCount(row);
    return { 'Jumlah Foto': sub ? n : '', 'Status Foto': !sub ? 'Belum submit periode ini' : (n > 0 ? 'Sudah ada foto' : 'Belum ada foto') };
  };
  exportToExcel(window._eraFilteredData || [], 'ERA-PLANOGRAM-' + label, { statusFn: statusFn, extraFn: extraFn });
}

function exportStoreExcel(plantCode, storeName) {
  var storeData = (window._eraAllData || []).filter(function(d) {
    return d['Plant Code'] === plantCode;
  });
  var safeName = (storeName || plantCode).replace(/[^a-zA-Z0-9]/g, '-');
  exportToExcel(storeData, 'ERA-PLANOGRAM-' + safeName);
}
