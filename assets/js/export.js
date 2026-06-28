// assets/js/export.js
// Requires: SheetJS (xlsx) loaded via CDN, CONFIG dari config.js

function exportToExcel(data, filename) {
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
      'Status':      row['Status']      || 'Pending',
      'Last Submit': row['Last Submit'] || ''
    };
    CONFIG.BRAND_LDU_COLUMNS.forEach(function(col) {
      obj[col] = parseInt(row[col]) || 0;
    });
    obj['TOTAL LDU'] = CONFIG.calcTotalLDU(row);
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

function exportFilteredExcel() {
  var label = 'FILTERED';
  if (typeof _activeQuickFilter !== 'undefined') {
    if (_activeQuickFilter === 'pending_this_month')   label = 'BELUM-SUBMIT-BULAN-INI';
    if (_activeQuickFilter === 'submitted_this_month') label = 'SUDAH-SUBMIT-BULAN-INI';
  }
  var now = new Date();
  var dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  exportToExcel(window._eraFilteredData || [], 'ERA-PLANOGRAM-' + label + '_' + dateStr);
}

function exportStoreExcel(plantCode, storeName) {
  var storeData = (window._eraAllData || []).filter(function(d) {
    return d['Plant Code'] === plantCode;
  });
  var safeName = (storeName || plantCode).replace(/[^a-zA-Z0-9]/g, '-');
  exportToExcel(storeData, 'ERA-PLANOGRAM-' + safeName);
}
