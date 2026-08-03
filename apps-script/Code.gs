// ============================================================
// ERA-PLANOGRAM — Google Apps Script
// ============================================================

const SHEET_NAME       = 'ERA-PLANOGRAM';
const INV_SHEET        = 'DEVICE_INVENTORY';
const LOG_SHEET        = 'DEVICE_LOG';
const FOTO_ROOT_FOLDER_ID = '1LG9I2fhm3YY6rNUpRUBOHjP6dCQ0FeXc';

// Tanggal mulai periode submit yang valid — data sebelum ini dianggap lama
// Ganti setiap awal periode kampanye baru (format: 'YYYY-MM-DD')
const SUBMIT_WINDOW_START = '2026-08-01';

// Foto LDU/Wallbay harus diambil maks sekian menit sebelum di-upload —
// dicek di sini juga (bukan cuma client) supaya tidak bisa dilewati via DevTools/API langsung.
const FOTO_MAX_AGE_MIN = 30;

// Jalankan fungsi ini SATU KALI di editor untuk grant izin Drive penuh
function testDriveAccess() {
  var root = DriveApp.getFolderById(FOTO_ROOT_FOLDER_ID);
  var test = root.createFolder('_TEST_DELETE_ME');
  test.setTrashed(true);
  Logger.log('Drive createFolder OK: ' + root.getName());
}

// ── Helper: buat sheet jika belum ada ──
function getOrCreateSheetWithHeaders(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1e293b').setFontColor('#ffffff').setFontWeight('bold');
  }
  return sheet;
}

function getInventorySheet(ss) {
  return getOrCreateSheetWithHeaders(ss, INV_SHEET, [
    'device_id','plant_code','store_name','brand','device_name','serial_no',
    'status','location','added_date','last_updated','notes'
  ]);
}

function getLogSheet(ss) {
  return getOrCreateSheetWithHeaders(ss, LOG_SHEET, [
    'timestamp','device_id','plant_code','store_name','brand',
    'device_name','serial_no','action','old_status','new_status','location','notes'
  ]);
}

// ── Generate device_id unik ──
function generateDeviceId() {
  var now = new Date();
  return 'DEV-' + now.getFullYear().toString().slice(2) +
    String(now.getMonth()+1).padStart(2,'0') +
    String(now.getDate()).padStart(2,'0') + '-' +
    Math.random().toString(36).substr(2,5).toUpperCase();
}

// ── Cari baris device di DEVICE_INVENTORY berdasarkan device_id ──
function findInventoryRow(invSheet, deviceId) {
  var lastRow = invSheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = invSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0].toString() === deviceId) return i + 2;
  }
  return -1;
}

// ── Append ke LOG ──
function appendLog(logSheet, data) {
  var now = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
  logSheet.appendRow([
    now,
    data.deviceId    || '',
    data.plantCode   || '',
    data.storeName   || '',
    data.brand       || '',
    data.deviceName  || '',
    data.serialNo    || '',
    data.action      || '',
    data.oldStatus   || '',
    data.newStatus   || '',
    data.location    || '',
    data.notes       || ''
  ]);
}

// ── INVENTORY: Tambah device baru ──
function addDevice(payload) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var invSheet = getInventorySheet(ss);
  var logSheet = getLogSheet(ss);

  var deviceId   = generateDeviceId();
  var plantCode  = (payload.plantCode  || '').toUpperCase().trim();
  var storeName  = (payload.storeName  || '').trim();
  var brand      = (payload.brand      || '').trim();
  var deviceName = (payload.deviceName || '').trim();
  var serialNo   = (payload.serialNo   || '').trim();
  var status     = (payload.status     || 'Display').trim();
  var location   = (payload.location   || '').trim();
  var notes      = (payload.notes      || '').trim();
  var now        = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');

  invSheet.appendRow([deviceId, plantCode, storeName, brand, deviceName, serialNo, status, location, now, now, notes]);
  appendLog(logSheet, { deviceId, plantCode, storeName, brand, deviceName, serialNo, action: 'ADD', oldStatus: '', newStatus: status, location, notes });

  return { status: 'success', deviceId: deviceId, message: 'Device berhasil ditambahkan.' };
}

// ── INVENTORY: Edit status/lokasi device ──
function editDevice(payload) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var invSheet = getInventorySheet(ss);
  var logSheet = getLogSheet(ss);

  var deviceId  = (payload.deviceId  || '').trim();
  var newStatus = (payload.newStatus || '').trim();
  var newLoc    = (payload.location  || '').trim();
  var notes     = (payload.notes     || '').trim();

  var targetRow = findInventoryRow(invSheet, deviceId);
  if (targetRow === -1) throw new Error('Device ID tidak ditemukan: ' + deviceId);

  var rowData    = invSheet.getRange(targetRow, 1, 1, 11).getValues()[0];
  var oldStatus  = rowData[6].toString();
  var plantCode  = rowData[1].toString();
  var storeName  = rowData[2].toString();
  var brand      = rowData[3].toString();
  var deviceName = rowData[4].toString();
  var serialNo   = rowData[5].toString();
  var now        = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');

  if (newStatus) invSheet.getRange(targetRow, 7).setValue(newStatus);
  if (newLoc)    invSheet.getRange(targetRow, 8).setValue(newLoc);
  invSheet.getRange(targetRow, 10).setValue(now);
  if (notes)     invSheet.getRange(targetRow, 11).setValue(notes);

  appendLog(logSheet, { deviceId, plantCode, storeName, brand, deviceName, serialNo, action: 'EDIT', oldStatus, newStatus: newStatus || oldStatus, location: newLoc, notes });

  return { status: 'success', message: 'Device berhasil diupdate.' };
}

// ── INVENTORY: Retur device ke gudang ──
function returDevice(payload) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var invSheet = getInventorySheet(ss);
  var logSheet = getLogSheet(ss);

  var deviceId    = (payload.deviceId    || '').trim();
  var destination = (payload.destination || 'Gudang Pusat').trim();
  var reason      = (payload.reason      || '').trim();
  var notes       = (payload.notes       || '').trim();

  var targetRow = findInventoryRow(invSheet, deviceId);
  if (targetRow === -1) throw new Error('Device ID tidak ditemukan: ' + deviceId);

  var rowData    = invSheet.getRange(targetRow, 1, 1, 11).getValues()[0];
  var oldStatus  = rowData[6].toString();
  var plantCode  = rowData[1].toString();
  var storeName  = rowData[2].toString();
  var brand      = rowData[3].toString();
  var deviceName = rowData[4].toString();
  var serialNo   = rowData[5].toString();
  var now        = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');

  var fullNotes = reason + (notes ? ' — ' + notes : '');

  invSheet.getRange(targetRow, 7).setValue('Retur ' + destination);
  invSheet.getRange(targetRow, 8).setValue(destination);
  invSheet.getRange(targetRow, 10).setValue(now);
  invSheet.getRange(targetRow, 11).setValue(fullNotes);

  appendLog(logSheet, { deviceId, plantCode, storeName, brand, deviceName, serialNo, action: 'RETUR', oldStatus, newStatus: 'Retur ' + destination, location: destination, notes: fullNotes });

  return { status: 'success', message: 'Device berhasil diretur ke ' + destination + '.' };
}

// ── INVENTORY: Delete (hanya untuk koreksi data salah) ──
function deleteDevice(payload) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var invSheet = getInventorySheet(ss);
  var logSheet = getLogSheet(ss);

  var deviceId = (payload.deviceId || '').trim();
  var reason   = (payload.reason   || 'Data salah input').trim();

  var targetRow = findInventoryRow(invSheet, deviceId);
  if (targetRow === -1) throw new Error('Device ID tidak ditemukan: ' + deviceId);

  var rowData    = invSheet.getRange(targetRow, 1, 1, 11).getValues()[0];
  var plantCode  = rowData[1].toString();
  var storeName  = rowData[2].toString();
  var brand      = rowData[3].toString();
  var deviceName = rowData[4].toString();
  var serialNo   = rowData[5].toString();
  var oldStatus  = rowData[6].toString();

  appendLog(logSheet, { deviceId, plantCode, storeName, brand, deviceName, serialNo, action: 'DELETE', oldStatus, newStatus: 'Deleted', notes: reason });
  invSheet.deleteRow(targetRow);

  return { status: 'success', message: 'Device berhasil dihapus.' };
}

// ── INVENTORY: Baca daftar device ──
function getInventory(params) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var invSheet = getInventorySheet(ss);
  var lastRow  = invSheet.getLastRow();

  if (lastRow < 2) return { status: 'success', count: 0, data: [] };

  var headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
  var allRows = invSheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  var filterStore  = (params.store  || '').toUpperCase().trim();
  var filterBrand  = (params.brand  || '').toLowerCase().trim();
  var filterStatus = (params.status || '').toLowerCase().trim();

  var result = [];
  allRows.forEach(function(row) {
    if (!row[0]) return;
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    if (filterStore  && obj.plant_code.toString().toUpperCase() !== filterStore) return;
    if (filterBrand  && obj.brand.toString().toLowerCase() !== filterBrand)       return;
    if (filterStatus && obj.status.toString().toLowerCase().indexOf(filterStatus) === -1) return;
    result.push(obj);
  });

  return { status: 'success', count: result.length, data: result };
}

// ── LOG: Baca history ──
function getLog(params) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = getLogSheet(ss);
  var lastRow  = logSheet.getLastRow();

  if (lastRow < 2) return { status: 'success', count: 0, data: [] };

  var headers = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
  var allRows = logSheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  var filterStore  = (params.store  || '').toUpperCase().trim();
  var filterBrand  = (params.brand  || '').toLowerCase().trim();
  var filterAction = (params.action_filter || '').toUpperCase().trim();
  var limit        = parseInt(params.limit || '100');

  var result = [];
  for (var i = allRows.length - 1; i >= 0; i--) {
    if (!allRows[i][0]) continue;
    var obj = {};
    headers.forEach(function(h, idx) { obj[h] = allRows[i][idx]; });
    if (filterStore  && obj.plant_code.toString().toUpperCase() !== filterStore) continue;
    if (filterBrand  && obj.brand.toString().toLowerCase() !== filterBrand)       continue;
    if (filterAction && obj.action.toString().toUpperCase() !== filterAction)     continue;
    result.push(obj);
    if (result.length >= limit) break;
  }

  return { status: 'success', count: result.length, data: result };
}

// ── TRIGGER: dipanggil otomatis saat Google Form disubmit ──
function onFormSubmit(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) { Logger.log('ERROR: Sheet tidak ditemukan: ' + SHEET_NAME); return; }
    const formData = e.namedValues;
    const plantCode = ((formData['Plant Code'] || [''])[0]).toString().trim().toUpperCase();
    if (!plantCode) { Logger.log('ERROR: Plant Code kosong'); return; }
    updateMasterSheet(sheet, formData, plantCode);
    Logger.log('SUCCESS: Updated plant code ' + plantCode);
  } catch (err) {
    Logger.log('ERROR onFormSubmit: ' + err.toString());
  }
}

// ── UPDATE BARIS DI SHEET BERDASARKAN PLANT CODE ──
function updateMasterSheet(sheet, formData, plantCode, storeNameHint) {
  const now     = new Date();
  const tz      = 'Asia/Jakarta';
  const submitMonth = Utilities.formatDate(now, tz, 'yyyy-MM');   // e.g. "2026-07"
  const submitTs    = Utilities.formatDate(now, tz, 'dd MMM yyyy HH:mm');

  // ── Pastikan kolom Submit_Month ada di header ──
  let lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerMap = {};
  headers.forEach(function(h, i) {
    if (h) headerMap[h.toString().toLowerCase().trim()] = i + 1;
  });
  if (!headerMap['submit_month']) {
    lastCol++;
    sheet.getRange(1, lastCol).setValue('Submit_Month');
    headerMap['submit_month'] = lastCol;
  }

  // ── Cari storeName dari baris manapun yang punya Plant Code ini ──
  const allRows = sheet.getDataRange().getValues();
  let storeName = storeNameHint || plantCode;
  const pcColIdx = headerMap['plant code'];
  const snColIdx = headerMap['store name'];
  if (pcColIdx && snColIdx) {
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][pcColIdx - 1].toString().trim().toUpperCase() === plantCode) {
        storeName = allRows[i][snColIdx - 1].toString() || plantCode;
        break;
      }
    }
  }

  // ── Cari baris bulan ini untuk plant code ini (update jika sudah ada) ──
  const smColIdx = headerMap['submit_month'];
  let targetRow = -1;
  let fallbackRow = -1; // baris dengan PC sama tapi Submit_Month kosong
  for (let i = 1; i < allRows.length; i++) {
    const rowPc = (pcColIdx ? allRows[i][pcColIdx - 1] : allRows[i][0]).toString().trim().toUpperCase();
    if (rowPc !== plantCode) continue;
    const smRaw = smColIdx ? allRows[i][smColIdx - 1] : '';
    const rowSm = smRaw instanceof Date
      ? Utilities.formatDate(smRaw, 'Asia/Jakarta', 'yyyy-MM')
      : (smRaw || '').toString().trim();
    if (rowSm === submitMonth) { targetRow = i + 1; break; }
    if (!rowSm && fallbackRow === -1) fallbackRow = i + 1; // baris kosong Submit_Month
  }

  // ── Kalau belum ada baris bulan ini → pakai fallback atau append baris baru ──
  if (targetRow === -1) {
    if (fallbackRow !== -1) {
      targetRow = fallbackRow; // pakai baris existing yang Submit_Month-nya kosong
    } else {
      targetRow = sheet.getLastRow() + 1;
      if (pcColIdx) sheet.getRange(targetRow, pcColIdx).setValue(plantCode);
      if (snColIdx) sheet.getRange(targetRow, snColIdx).setValue(storeName);
    }
    sheet.getRange(targetRow, smColIdx).setValue(submitMonth);
  }

  // ── Cek apakah Last Submit existing masih dalam window yang valid ──
  const windowStart = new Date(SUBMIT_WINDOW_START);
  const lastSubmitColCheck = headerMap['last submit'];
  let isNewWindow = true; // default: anggap submit baru / fresh
  if (lastSubmitColCheck && targetRow <= sheet.getLastRow()) {
    const existingLastSubmitRaw = sheet.getRange(targetRow, lastSubmitColCheck).getValue();
    if (existingLastSubmitRaw) {
      const existingLastSubmitDate = new Date(existingLastSubmitRaw);
      if (!isNaN(existingLastSubmitDate.getTime()) && existingLastSubmitDate >= windowStart) {
        isNewWindow = false; // Last Submit sudah dalam window → lakukan merge (partial submit)
      }
    }
  }

  // ── Tulis field-field dari formData ──
  // Jika isNewWindow = true → overwrite bersih (data lama dianggap tidak valid)
  // Jika isNewWindow = false → merge (partial submit dalam window yang sama)
  const skipFields = ['plant code', 'store name', 'timestamp', 'submit_month'];
  let currentLastCol = sheet.getLastColumn();

  // Baca nilai existing di baris target (hanya untuk merge)
  const existingVals = (!isNewWindow && targetRow <= sheet.getLastRow())
    ? sheet.getRange(targetRow, 1, 1, currentLastCol).getValues()[0]
    : [];

  Object.keys(formData).forEach(function(fieldName) {
    const fKey = fieldName.toLowerCase().trim();
    if (skipFields.indexOf(fKey) !== -1) return;
    let colIdx = headerMap[fKey];
    if (!colIdx) {
      currentLastCol++;
      sheet.getRange(1, currentLastCol).setValue(fieldName);
      headerMap[fKey] = currentLastCol;
      colIdx = currentLastCol;
    }
    const rawVal = (formData[fieldName][0] || '').toString().trim();
    const isTextCol = fKey.endsWith('_devicestatus') || fKey.endsWith('_foto') ||
                      fKey.endsWith('_wallbay_foto') || fKey.endsWith('_ldu_foto');
    if (isTextCol) {
      if (rawVal !== '') sheet.getRange(targetRow, colIdx).setValue(rawVal);
    } else {
      const numVal = parseInt(rawVal, 10);
      if (isNewWindow) {
        // Overwrite bersih — tulis nilai baru langsung (0 pun ditulis)
        sheet.getRange(targetRow, colIdx).setValue(isNaN(numVal) ? 0 : numVal);
      } else {
        // Merge partial submit — pertahankan nilai terbesar
        const existingNum = parseInt((existingVals[colIdx - 1] || '0').toString(), 10) || 0;
        if (!isNaN(numVal) && numVal > 0) {
          sheet.getRange(targetRow, colIdx).setValue(numVal);
        } else if (existingNum > 0) {
          // Pertahankan nilai existing
        } else {
          sheet.getRange(targetRow, colIdx).setValue(0);
        }
      }
    }
  });

  // ── Update Last Submit & Status ──
  const lastSubmitCol = headerMap['last submit'];
  const statusCol     = headerMap['status'];
  if (lastSubmitCol) sheet.getRange(targetRow, lastSubmitCol).setValue(submitTs);
  if (statusCol)     sheet.getRange(targetRow, statusCol).setValue('Submitted');
  sheet.getRange(targetRow, smColIdx).setValue(submitMonth);

  return { success: true, storeName: storeName, submitMonth: submitMonth };
}

// ── Helper: get folder by name, buat jika belum ada ──
function getOrCreateFolder(parentFolder, name) {
  var iter = parentFolder.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(name);
}

// Reverse-geocode lat/lng → alamat pakai Maps Service bawaan Apps Script.
// Soft-fail: kalau quota habis / service error, alamat kosong tapi lat/lng tetap disimpan.
function reverseGeocodeSafe(lat, lng) {
  try {
    var geo = Maps.newGeocoder().reverseGeocode(lat, lng);
    if (geo && geo.results && geo.results.length > 0) {
      return geo.results[0].formatted_address || '';
    }
  } catch (e) {
    Logger.log('reverseGeocode error: ' + e.message);
  }
  return '';
}

// ── Upload foto ke Drive ──
function uploadFotoToDrive(payload) {
  var plantCode = (payload.plantCode || '').toUpperCase().trim();
  var storeName = (payload.storeName || plantCode).trim();
  var brand     = (payload.brand || '').trim();
  var type      = (payload.type  || '').trim();
  var fileData  = payload.fileData || '';
  var fileName  = payload.fileName || (brand + '_' + type + '.jpg');
  var meta      = payload.meta || null;

  if (!meta || typeof meta.lat !== 'number' || typeof meta.lng !== 'number' || !meta.takenAt) {
    return { status: 'error', message: 'Metadata foto (GPS/tanggal EXIF) tidak lengkap. Ambil foto langsung dari kamera.' };
  }
  var takenAtMs = new Date(meta.takenAt).getTime();
  if (isNaN(takenAtMs)) {
    return { status: 'error', message: 'Format tanggal EXIF foto tidak valid.' };
  }
  var ageMin = (Date.now() - takenAtMs) / 60000;
  if (ageMin > FOTO_MAX_AGE_MIN || ageMin < -5) {
    return { status: 'error', message: 'Foto harus baru diambil (maks ' + FOTO_MAX_AGE_MIN + ' menit sebelum upload). Ambil ulang foto dari kamera.' };
  }

  var base64 = fileData.replace(/^data:image\/\w+;base64,/, '');
  var blob   = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', fileName);
  var root   = DriveApp.getFolderById(FOTO_ROOT_FOLDER_ID);
  var now    = new Date();
  var monthFolder = getOrCreateFolder(root, Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM MMMM'));
  var tokoFolder  = getOrCreateFolder(monthFolder, plantCode + ' ' + storeName);

  var existing = tokoFolder.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);

  var file = tokoFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var resultMeta = null;
  if (meta && typeof meta.lat === 'number' && typeof meta.lng === 'number') {
    resultMeta = {
      takenAt: meta.takenAt || '',
      device:  meta.device  || '',
      lat:     meta.lat,
      lng:     meta.lng,
      address: reverseGeocodeSafe(meta.lat, meta.lng)
    };
  }

  return {
    status: 'success',
    url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    fileId: file.getId(),
    meta: resultMeta
  };
}

// ── Simpan URL foto / DeviceStatus ke kolom sheet ──
function saveFotoUrls(payload) {
  var plantCode = (payload.plantCode || '').toUpperCase().trim();
  var fotoMap   = payload.fotoMap || {};

  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tidak ditemukan');

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headerMap = {};
  headers.forEach(function(h, i) { if (h) headerMap[h.toString().trim()] = i + 1; });

  var pcColIdx = headerMap['Plant Code'];
  var smColIdx = headerMap['Submit_Month'];
  var submitMonth = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM');

  var allRows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var targetRow = -1;
  var emptyMonthRow = -1; // baris Plant Code sama dgn Submit_Month kosong (belum pernah submit bulan manapun)
  for (var i = 0; i < allRows.length; i++) {
    var rowPc = (pcColIdx ? allRows[i][pcColIdx - 1] : allRows[i][0]).toString().trim().toUpperCase();
    if (rowPc !== plantCode) continue;
    var smRaw = smColIdx ? allRows[i][smColIdx - 1] : '';
    var rowSm = smRaw instanceof Date
      ? Utilities.formatDate(smRaw, 'Asia/Jakarta', 'yyyy-MM')
      : (smRaw || '').toString().trim();
    // Cocokkan baris bulan aktif ini, agar foto/DeviceStatus tersimpan di baris yang sama
    // dengan submit angka LDU (updateMasterSheet), bukan baris bulan lama toko yang sama.
    if (rowSm === submitMonth) { targetRow = i + 2; break; }
    if (!rowSm && emptyMonthRow === -1) emptyMonthRow = i + 2; // hanya baris kosong yang boleh jadi fallback
  }
  if (targetRow === -1) targetRow = emptyMonthRow;
  // Jangan pernah jatuh ke baris bulan lama yang sudah terisi — itu akan menimpa data bulan lain.
  if (targetRow === -1) throw new Error('Baris submit bulan ' + submitMonth + ' belum ditemukan untuk Plant Code: ' + plantCode + ' (submit checklist LDU dulu sebelum upload foto)');

  Object.keys(fotoMap).forEach(function(colName) {
    var colIdx = headerMap[colName];
    if (!colIdx) {
      lastCol++;
      sheet.getRange(1, lastCol).setValue(colName);
      headerMap[colName] = lastCol;
      colIdx = lastCol;
    }
    sheet.getRange(targetRow, colIdx).setValue(fotoMap[colName] || '');
  });

  return { status: 'success', updated: Object.keys(fotoMap).length };
}

// ── Device Issues: kumpulkan semua device Tidak Display / Rusak dari master sheet ──
function getIssues(ss, params) {
  var sheet   = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { status: 'error', message: 'Sheet tidak ditemukan' };

  var allData = sheet.getDataRange().getValues();
  var headers = allData[0].map(function(h) { return h.toString().trim(); });

  // Temukan kolom _DeviceStatus
  var dsColIdxs = []; // { col: idx, brand: "Honor" }
  headers.forEach(function(h, idx) {
    var m = h.match(/^(.+)_DeviceStatus$/i);
    if (m) dsColIdxs.push({ idx: idx, brand: m[1] });
  });

  // Temukan kolom store name, plant code, last submit
  var storeNameIdx  = headers.indexOf('Store Name');
  var plantCodeIdx  = headers.indexOf('Plant Code');
  var lastSubmitIdx = headers.indexOf('Last Submit');

  var issues = [];
  for (var i = 1; i < allData.length; i++) {
    var row = allData[i];
    if (!row[plantCodeIdx]) continue;
    var plantCode = row[plantCodeIdx].toString().trim();
    var storeName = row[storeNameIdx] ? row[storeNameIdx].toString().trim() : plantCode;
    var lastSubmit = row[lastSubmitIdx] ? row[lastSubmitIdx].toString() : '';

    dsColIdxs.forEach(function(ds) {
      var raw = row[ds.idx] ? row[ds.idx].toString().trim() : '';
      if (!raw) return;
      var parsed;
      try { parsed = JSON.parse(raw); } catch(e) { return; }
      Object.keys(parsed).forEach(function(deviceKey) {
        var val    = parsed[deviceKey] || '';
        var parts  = val.split('|');
        var status = parts[0].trim();
        var note   = parts.slice(1).join('|').trim();
        if (status === 'tidak' || status === 'rusak') {
          issues.push({
            plantCode:  plantCode,
            storeName:  storeName,
            brand:      ds.brand,
            device:     deviceKey,
            status:     status,
            note:       note,
            lastSubmit: lastSubmit
          });
        }
      });
    });
  }

  return { status: 'success', count: issues.length, data: issues };
}

// ── doPost ──
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || 'submit';

    if (action === 'uploadFoto')    return jsonOut(uploadFotoToDrive(body));
    if (action === 'saveFotoUrls')  return jsonOut(saveFotoUrls(body));
    if (action === 'addDevice')     return jsonOut(addDevice(body));
    if (action === 'editDevice')    return jsonOut(editDevice(body));
    if (action === 'returDevice')   return jsonOut(returDevice(body));
    if (action === 'deleteDevice')  return jsonOut(deleteDevice(body));

    // Default: submit checklist
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tidak ditemukan: ' + SHEET_NAME);

    const plantCode = (body['Plant Code'] || '').toString().trim().toUpperCase();
    if (!plantCode) throw new Error('Plant Code kosong');

    const formData = {};
    Object.keys(body).forEach(function(k) { formData[k] = [body[k] !== undefined ? body[k].toString() : '0']; });

    const result = updateMasterSheet(sheet, formData, plantCode);
    if (!result.success) throw new Error(result.reason);

    return jsonOut({ status: 'success', message: 'Data berhasil disimpan untuk ' + plantCode });

  } catch (err) {
    return jsonOut({ status: 'error', message: err.toString() });
  }
}

// ── doGet ──
function doGet(e) {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const params = (e && e.parameter) ? e.parameter : {};

    if (params.action === 'submit') {
      const sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) throw new Error('Sheet tidak ditemukan: ' + SHEET_NAME);
      const plantCode = (params.store || '').toString().trim().toUpperCase();
      if (!plantCode) throw new Error('Plant Code kosong');
      const storeNameParam = (params.storeName || '').toString().trim();
      const skipKeys = ['action', 'store', 'storeName'];
      const formData = {};
      Object.keys(params).forEach(function(k) {
        if (skipKeys.indexOf(k) === -1) formData[k] = [params[k] !== undefined ? params[k].toString() : '0'];
      });
      const result = updateMasterSheet(sheet, formData, plantCode, storeNameParam);
      if (!result.success) return jsonOut({ status: 'error', message: result.reason || 'Gagal menyimpan data' });
      return jsonOut({ status: 'success', message: 'Data berhasil disimpan untuk ' + plantCode, storeName: result.storeName });
    }

    if (params.action === 'getInventory') return jsonOut(getInventory(params));
    if (params.action === 'getLog')       return jsonOut(getLog(params));
    if (params.action === 'getIssues')    return jsonOut(getIssues(ss, params));

    // Default: baca ERA-PLANOGRAM sheet
    const sheet   = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tidak ditemukan: ' + SHEET_NAME);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0].map(function(h) { return h.toString().trim(); });
    const filterStore  = (params.store  || '').toUpperCase().trim();
    const filterStatus = (params.status || '').toLowerCase().trim();
    const filterMonth  = (params.month  || '').trim(); // e.g. "2026-06"

    // Kumpulkan semua baris jadi objek
    const allObjs = [];
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      if (!row[0]) continue;
      const obj = {};
      headers.forEach(function(h, idx) { obj[h] = row[idx]; });
      allObjs.push(obj);
    }

    // Helper: baca Submit_Month sebagai string yyyy-MM (handle Date object dari Sheets)
    function readMonth(val) {
      if (!val) return '';
      if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Jakarta', 'yyyy-MM');
      return val.toString().trim();
    }

    // Kumpulkan semua bulan yang tersedia (sorted desc)
    const monthSet = {};
    allObjs.forEach(function(o) {
      const m = readMonth(o['Submit_Month']);
      if (m) monthSet[m] = true;
    });
    const availableMonths = Object.keys(monthSet).sort().reverse(); // ["2026-07","2026-06",...]

    // Tentukan bulan yang dipakai: filterMonth, atau bulan terbaru MILIK toko ini
    // (kalau filter per-toko), atau bulan terbaru di seluruh sheet (kalau tidak difilter).
    // Tidak boleh pakai bulan terbaru GLOBAL untuk toko spesifik — toko yang belum
    // submit bulan terbaru akan salah dianggap "tidak ditemukan".
    let activeMonth = filterMonth;
    if (!activeMonth) {
      if (filterStore) {
        const storeMonths = {};
        allObjs.forEach(function(o) {
          const pc = (o['Plant Code'] || '').toString().toUpperCase().trim();
          if (pc !== filterStore) return;
          const m = readMonth(o['Submit_Month']);
          if (m) storeMonths[m] = true;
        });
        const storeAvailableMonths = Object.keys(storeMonths).sort().reverse();
        activeMonth = storeAvailableMonths[0] || availableMonths[0] || '';
      } else {
        activeMonth = availableMonths[0] || '';
      }
    }

    // Filter per store: ambil baris bulan aktif (atau latest jika tidak ada Submit_Month)
    // Untuk backward compat: baris tanpa Submit_Month dianggap bulan pertama tersedia
    const storeMap = {};
    allObjs.forEach(function(obj) {
      const pc = (obj['Plant Code'] || '').toString().toUpperCase().trim();
      if (!pc) return;
      if (filterStore && pc !== filterStore) return;
      if (filterStatus && (obj['Status'] || '').toString().toLowerCase() !== filterStatus) return;
      const rowMonth = readMonth(obj['Submit_Month']);
      // Hanya ambil baris yang cocok bulan aktif, atau baris tanpa bulan (legacy) saat activeMonth adalah bulan pertama
      if (rowMonth === activeMonth || (rowMonth === '' && activeMonth === (availableMonths[availableMonths.length - 1] || activeMonth))) {
        storeMap[pc] = obj;
      }
    });

    // Kalau activeMonth adalah bulan TERBARU (periode yang sedang berjalan), toko yang belum
    // submit bulan ini tidak akan punya baris yang cocok di atas — jadi hilang dari daftar.
    // Supaya "Belum Submit Bulan Ini" tetap kelihatan di tabel, isi toko yang belum ada
    // pakai data submission terakhir mereka (bulan sebelumnya). Untuk bulan LAMA/histori
    // (bukan bulan terbaru) tidak dilakukan fallback ini, supaya snapshot historisnya akurat.
    if (!filterStore && activeMonth === availableMonths[0]) {
      const latestPerStore = {}; // pc -> { obj, month }
      allObjs.forEach(function(obj) {
        const pc = (obj['Plant Code'] || '').toString().toUpperCase().trim();
        if (!pc || storeMap[pc]) return;
        if (filterStatus && (obj['Status'] || '').toString().toLowerCase() !== filterStatus) return;
        const rowMonth = readMonth(obj['Submit_Month']);
        const existing = latestPerStore[pc];
        if (!existing || rowMonth > existing.month) latestPerStore[pc] = { obj: obj, month: rowMonth };
      });
      Object.keys(latestPerStore).forEach(function(pc) { storeMap[pc] = latestPerStore[pc].obj; });
    }

    // Query per-toko spesifik (mis. halaman Detail dibuka dengan &month=2026-07 dari link
    // dashboard) tapi toko itu belum punya baris di bulan tsb → jangan tampilkan "tidak
    // ditemukan", fallback ke data submission terakhir toko ini apa pun bulannya, dan
    // koreksi activeMonth di response supaya sesuai data yang benar-benar dikembalikan.
    if (filterStore && Object.keys(storeMap).length === 0) {
      let bestRow = null, bestMonth = '';
      allObjs.forEach(function(obj) {
        const pc = (obj['Plant Code'] || '').toString().toUpperCase().trim();
        if (pc !== filterStore) return;
        if (filterStatus && (obj['Status'] || '').toString().toLowerCase() !== filterStatus) return;
        const rowMonth = readMonth(obj['Submit_Month']);
        if (!bestRow || rowMonth > bestMonth) { bestRow = obj; bestMonth = rowMonth; }
      });
      if (bestRow) { storeMap[filterStore] = bestRow; activeMonth = bestMonth || activeMonth; }
    }

    const result = Object.values(storeMap);
    return jsonOut({
      status: 'success',
      count: result.length,
      lastUpdated: new Date().toISOString(),
      activeMonth: activeMonth,
      availableMonths: availableMonths,
      data: result
    });

  } catch (err) {
    return jsonOut({ status: 'error', message: err.toString() });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── Backfill Submit_Month untuk data lama (jalankan SATU KALI) ──
function backfillSubmitMonth() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('Sheet tidak ditemukan'); return; }

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headerMap = {};
  headers.forEach(function(h, i) { if (h) headerMap[h.toString().toLowerCase().trim()] = i + 1; });

  // Tambah kolom Submit_Month jika belum ada
  if (!headerMap['submit_month']) {
    lastCol++;
    sheet.getRange(1, lastCol).setValue('Submit_Month');
    headerMap['submit_month'] = lastCol;
    Logger.log('Kolom Submit_Month ditambahkan di kolom ' + lastCol);
  }

  var smCol = headerMap['submit_month'];
  var lastRow = sheet.getLastRow();
  var smRange = sheet.getRange(2, smCol, lastRow - 1, 1).getValues();
  var updated = 0;

  for (var i = 0; i < smRange.length; i++) {
    if (!smRange[i][0] || smRange[i][0].toString().trim() === '') {
      sheet.getRange(i + 2, smCol).setValue('2026-06');
      updated++;
    }
  }
  Logger.log('Backfill selesai: ' + updated + ' baris diupdate ke 2026-06');
}

// ── PERBAIKAN DATA SATU KALI: pindahkan URL foto Juli yang kesasar ke baris Juni ──
// Bug lama di saveFotoUrls() menulis link foto submission bulan berjalan ke baris
// bulan LAMA milik toko yang sama (lihat fix di saveFotoUrls di atas). Jalankan fungsi
// ini SATU KALI dari editor untuk pindahkan foto yang sudah kesasar ke baris bulan
// yang benar. Aman dipakai berulang (idempotent) — hanya memindah kalau ketemu match.
function migrateMisplacedFoto() {
  var TARGET_MONTH  = '2026-07';                 // bulan yang fotonya kesasar
  var MONTH_FOLDER  = '2026-07 July';             // nama folder Drive utk bulan itu

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('Sheet tidak ditemukan'); return; }

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headerMap = {};
  headers.forEach(function(h, i) { if (h) headerMap[h.toString().trim()] = i + 1; });
  var pcColIdx = headerMap['Plant Code'];
  var smColIdx = headerMap['Submit_Month'];
  if (!pcColIdx || !smColIdx) { Logger.log('Kolom Plant Code / Submit_Month tidak ditemukan'); return; }

  var fotoColIdx = [];
  headers.forEach(function(h, i) {
    var name = (h || '').toString().trim();
    if (/_Foto$/.test(name)) fotoColIdx.push({ name: name, col: i + 1 });
  });

  // Semua Plant Code unik di sheet ini (bukan daftar tetap) — supaya jalan utk semua toko
  var AFFECTED_CODES = (function() {
    var seen = {};
    var all = sheet.getRange(2, pcColIdx, sheet.getLastRow() - 1, 1).getValues();
    all.forEach(function(r) {
      var pc = (r[0] || '').toString().trim().toUpperCase();
      if (pc) seen[pc] = true;
    });
    return Object.keys(seen);
  })();

  // Ambil root folder foto bulan Juli, index semua subfolder toko SEKALI di awal (bukan per toko)
  var root = DriveApp.getFolderById(FOTO_ROOT_FOLDER_ID);
  var monthFolders = root.getFoldersByName(MONTH_FOLDER);
  if (!monthFolders.hasNext()) { Logger.log('Folder bulan ' + MONTH_FOLDER + ' tidak ditemukan di Drive'); return; }
  var monthFolder = monthFolders.next();

  var storeFolderByCode = {}; // "<PLANTCODE>" -> Folder
  var storeSubIter = monthFolder.getFolders();
  while (storeSubIter.hasNext()) {
    var sf = storeSubIter.next();
    var code = sf.getName().trim().split(' ')[0].toUpperCase();
    if (code && !storeFolderByCode[code]) storeFolderByCode[code] = sf;
  }

  var allRows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  AFFECTED_CODES.forEach(function(plantCode) {
    var storeFolder = storeFolderByCode[plantCode.toUpperCase()];
    if (!storeFolder) { Logger.log(plantCode + ': folder Juli tidak ditemukan, skip'); return; }

    var julyFileIds = {};
    var fIter = storeFolder.getFiles();
    while (fIter.hasNext()) julyFileIds[fIter.next().getId()] = true;

    // Cari baris Submit_Month == TARGET_MONTH (tujuan) dan baris lain milik plant code sama (sumber)
    var targetRow = -1;
    var sourceRows = [];
    for (var i = 0; i < allRows.length; i++) {
      var rowPc = (allRows[i][pcColIdx - 1] || '').toString().trim().toUpperCase();
      if (rowPc !== plantCode.toUpperCase()) continue;
      var smRaw = allRows[i][smColIdx - 1];
      var rowSm = smRaw instanceof Date
        ? Utilities.formatDate(smRaw, 'Asia/Jakarta', 'yyyy-MM')
        : (smRaw || '').toString().trim();
      if (rowSm === TARGET_MONTH) targetRow = i + 2;
      else sourceRows.push(i + 2);
    }
    if (targetRow === -1) { Logger.log(plantCode + ': baris ' + TARGET_MONTH + ' tidak ditemukan, skip'); return; }
    if (sourceRows.length === 0) { Logger.log(plantCode + ': tidak ada baris lain utk dicek, skip'); return; }

    var moved = 0;
    sourceRows.forEach(function(srcRow) {
      fotoColIdx.forEach(function(fc) {
        var srcVal = sheet.getRange(srcRow, fc.col).getValue();
        if (!srcVal) return;
        var m = srcVal.toString().match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!m || !julyFileIds[m[1]]) return; // bukan file dari folder Juli toko ini
        var dstVal = sheet.getRange(targetRow, fc.col).getValue();
        if (dstVal) return; // jangan timpa kalau baris Juli sudah ada isinya
        sheet.getRange(targetRow, fc.col).setValue(srcVal);
        sheet.getRange(srcRow, fc.col).setValue('');
        moved++;
        Logger.log(plantCode + ': pindah ' + fc.name + ' dari baris ' + srcRow + ' ke baris ' + targetRow);
      });
    });
    Logger.log(plantCode + ': selesai, ' + moved + ' kolom foto dipindah ke baris ' + targetRow);
  });

  Logger.log('Migrasi selesai.');
}

// ── PERBAIKAN DATA SATU KALI: pindahkan JSON DeviceStatus (checklist per-device) yang kesasar ──
// Bug yang sama dengan migrateMisplacedFoto() di atas juga menimpa kolom "<Brand>_DeviceStatus"
// (dipakai untuk menandai status Display/Tidak Display/Rusak per unit device). Karena DeviceStatus
// bukan link Drive, kita tidak bisa cek "file asli"-nya — sebagai gantinya kita validasi dengan
// mencocokkan isi JSON (jumlah status "tidak"/"rusak"/total) terhadap angka agregat resmi bulan
// TARGET_MONTH (kolom <Brand>_TidakDisplay / <Brand>_Rusak / <Brand>) yang SUDAH benar (tidak
// terpengaruh bug ini). Kalau cocok persis baru dipindah; kalau tidak cocok, dibiarkan & dicatat
// di log untuk dicek manual (supaya tidak salah timpa data asli bulan lama).
function migrateMisplacedDeviceStatus() {
  var TARGET_MONTH   = '2026-07';

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('Sheet tidak ditemukan'); return; }

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headerMap = {};
  headers.forEach(function(h, i) { if (h) headerMap[h.toString().trim()] = i + 1; });
  var pcColIdx = headerMap['Plant Code'];
  var smColIdx = headerMap['Submit_Month'];
  if (!pcColIdx || !smColIdx) { Logger.log('Kolom Plant Code / Submit_Month tidak ditemukan'); return; }

  var statusColIdx = [];
  headers.forEach(function(h, i) {
    var name = (h || '').toString().trim();
    var m = name.match(/^(.+)_DeviceStatus$/);
    if (m) statusColIdx.push({ name: name, brand: m[1], col: i + 1 });
  });

  var allRows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  // Semua Plant Code unik di sheet ini (bukan daftar tetap) — supaya jalan utk semua toko
  var AFFECTED_CODES = (function() {
    var seen = {};
    allRows.forEach(function(r) {
      var pc = (r[pcColIdx - 1] || '').toString().trim().toUpperCase();
      if (pc) seen[pc] = true;
    });
    return Object.keys(seen);
  })();

  function tally(jsonStr) {
    var obj;
    try { obj = JSON.parse(jsonStr); } catch (e) { return null; }
    var out = { total: 0, tidak: 0, rusak: 0, display: 0 };
    Object.keys(obj).forEach(function(k) {
      out.total++;
      var st = (obj[k] || '').toString().split('|')[0].trim().toLowerCase();
      if (st === 'tidak') out.tidak++;
      else if (st === 'rusak') out.rusak++;
      else out.display++;
    });
    return out;
  }

  AFFECTED_CODES.forEach(function(plantCode) {
    var targetRow = -1;
    var sourceRows = [];
    for (var i = 0; i < allRows.length; i++) {
      var rowPc = (allRows[i][pcColIdx - 1] || '').toString().trim().toUpperCase();
      if (rowPc !== plantCode.toUpperCase()) continue;
      var smRaw = allRows[i][smColIdx - 1];
      var rowSm = smRaw instanceof Date
        ? Utilities.formatDate(smRaw, 'Asia/Jakarta', 'yyyy-MM')
        : (smRaw || '').toString().trim();
      if (rowSm === TARGET_MONTH) targetRow = i + 2;
      else sourceRows.push(i + 2);
    }
    if (targetRow === -1) { Logger.log(plantCode + ': baris ' + TARGET_MONTH + ' tidak ditemukan, skip'); return; }
    if (sourceRows.length === 0) { Logger.log(plantCode + ': tidak ada baris lain utk dicek, skip'); return; }

    var moved = 0, skipped = 0;
    sourceRows.forEach(function(srcRow) {
      statusColIdx.forEach(function(sc) {
        var srcVal = sheet.getRange(srcRow, sc.col).getValue();
        if (!srcVal) return;
        var dstVal = sheet.getRange(targetRow, sc.col).getValue();
        if (dstVal) return; // baris target sudah terisi, jangan timpa

        var t = tally(srcVal.toString());
        if (!t) return; // bukan JSON valid, skip

        var brandColIdx    = headerMap[sc.brand];
        var tidakColIdx     = headerMap[sc.brand + '_TidakDisplay'];
        var rusakColIdx     = headerMap[sc.brand + '_Rusak'];
        var targetTotal     = brandColIdx ? Number(sheet.getRange(targetRow, brandColIdx).getValue()) || 0 : null;
        var targetTidak     = tidakColIdx ? Number(sheet.getRange(targetRow, tidakColIdx).getValue()) || 0 : null;
        var targetRusak     = rusakColIdx ? Number(sheet.getRange(targetRow, rusakColIdx).getValue()) || 0 : null;

        // Tidak/Rusak harus cocok PERSIS (itu yang menandakan JSON ini benar milik bulan target).
        // Total JSON boleh <= agregat target — selisihnya wajar kalau ada item baru ditambahkan
        // setelah checklist diisi (item baru dihitung "display" di agregat tapi belum ada di JSON).
        var cocok = (targetTidak === null || targetTidak === t.tidak) &&
                    (targetRusak === null || targetRusak === t.rusak) &&
                    (targetTotal === null || t.total <= targetTotal);

        if (!cocok) {
          skipped++;
          Logger.log(plantCode + ': ' + sc.name + ' TIDAK dipindah (tidak cocok dgn agregat ' + TARGET_MONTH +
            ' — JSON: total=' + t.total + ' tidak=' + t.tidak + ' rusak=' + t.rusak +
            ' | agregat: total=' + targetTotal + ' tidak=' + targetTidak + ' rusak=' + targetRusak + '). Cek manual.');
          return;
        }
        sheet.getRange(targetRow, sc.col).setValue(srcVal);
        sheet.getRange(srcRow, sc.col).setValue('');
        moved++;
        Logger.log(plantCode + ': pindah ' + sc.name + ' dari baris ' + srcRow + ' ke baris ' + targetRow);
      });
    });
    Logger.log(plantCode + ': selesai, ' + moved + ' kolom DeviceStatus dipindah, ' + skipped + ' dilewati (perlu cek manual) ke baris ' + targetRow);
  });

  Logger.log('Migrasi DeviceStatus selesai.');
}

// ── TEST MANUAL ──
function testDoGet() {
  const fakeE = { parameter: {} };
  const result = doGet(fakeE);
  Logger.log(result.getContent().substring(0, 500));
}

function testGetInventory() {
  const result = getInventory({ store: 'E281' });
  Logger.log(JSON.stringify(result).substring(0, 500));
}

function testGetLog() {
  const result = getLog({ store: 'E281', limit: '10' });
  Logger.log(JSON.stringify(result).substring(0, 500));
}

var BRAND_LDU_COLUMNS_GS = ["Apple", "Samsung", "Oppo", "Vivo", "Xiaomi", "Infinix", "Honor", "Realme", "Tecno", "Sharp", "IQOO", "Huawei", "Motorola", "Advan", "Apple Macbook", "Acer Laptop", "Asus Laptop", "HP Laptop", "Huawei Laptop", "Lenovo Laptop", "Others Laptop", "Samsung CE", "Xiaomi CE", "Infinix CE", "Toshiba CE", "LG CE", "Polytron CE", "Sharp CE", "TCL CE", "Sony CE", "Changhong CE", "Accesories C-Brand"];

var AGU2026_SEED = {
  'E027': { n: "ERAFONE DAAN MOGOT MALL", c: {"Apple": 14, "Samsung": 35, "Oppo": 20, "Vivo": 9, "Xiaomi": 25, "Infinix": 5, "Honor": 10, "Realme": 7, "IQOO": 4, "Huawei": 8, "Samsung CE": 1, "Xiaomi CE": 2, "Toshiba CE": 1, "Accesories C-Brand": 5} },
  'E028': { n: "ERAFONE MAL PURI INDAH", c: {"Apple": 12, "Samsung": 23, "Oppo": 18, "Vivo": 9, "Xiaomi": 12, "Honor": 5, "Realme": 6, "Sharp": 3, "IQOO": 4, "Huawei": 14, "Accesories C-Brand": 5} },
  'E029': { n: "ERAFONE PX PAVILION ST MORITS", c: {"Apple": 8, "Samsung": 28, "Oppo": 20, "Vivo": 10, "Xiaomi": 13, "Infinix": 5, "Honor": 8, "Realme": 5, "Tecno": 1, "IQOO": 2, "Huawei": 16, "Motorola": 5, "Samsung CE": 1, "Toshiba CE": 2, "Sharp CE": 1, "TCL CE": 3, "Accesories C-Brand": 6} },
  'E037': { n: "ERAFONE GAJAH MADA PLAZA", c: {"Apple": 6, "Samsung": 25, "Oppo": 11, "Vivo": 6, "Xiaomi": 13, "Honor": 1, "Realme": 3, "Tecno": 3, "Huawei": 6, "Samsung CE": 1, "Xiaomi CE": 4, "Polytron CE": 1, "TCL CE": 1, "Accesories C-Brand": 5} },
  'E038': { n: "ERAFONE MAL ATRIUM SENEN (ERAFONE MILLENIUM MALL)", c: {"Apple": 5, "Samsung": 17, "Oppo": 7, "Vivo": 5, "Xiaomi": 3, "Infinix": 3, "Honor": 6, "Realme": 3, "Tecno": 1, "IQOO": 2, "Huawei": 2, "Toshiba CE": 2, "Polytron CE": 1, "TCL CE": 1} },
  'E043': { n: "ERAFONE PLAZA BINTARO JAYA", c: {"Apple": 14, "Samsung": 27, "Oppo": 12, "Vivo": 8, "Xiaomi": 12, "Infinix": 7, "Honor": 15, "Realme": 7, "Tecno": 3, "IQOO": 2, "Huawei": 24, "Motorola": 4, "Accesories C-Brand": 1} },
  'E047': { n: "ERAFONE 1 ITC CEMPAKA MAS", c: {"Apple": 3, "Samsung": 13, "Oppo": 10, "Vivo": 4, "Xiaomi": 5, "Honor": 4, "Realme": 2, "Tecno": 3, "Accesories C-Brand": 3} },
  'E081': { n: "ERAFONE MALL OF SERANG", c: {"Apple": 5, "Samsung": 21, "Oppo": 13, "Vivo": 10, "Xiaomi": 17, "Infinix": 6, "Honor": 6, "Realme": 3, "Tecno": 4, "IQOO": 2, "Huawei": 3, "Samsung CE": 1, "Xiaomi CE": 2, "Toshiba CE": 1, "TCL CE": 1, "Accesories C-Brand": 1} },
  'E082': { n: "ERAFONE LIVING WORLD ALAM SUTERA", c: {"Apple": 13, "Samsung": 24, "Oppo": 15, "Vivo": 7, "Xiaomi": 15, "Infinix": 6, "Honor": 8, "Realme": 6, "Tecno": 3, "Sharp": 1, "IQOO": 2, "Huawei": 4, "Advan": 2, "Apple Macbook": 1, "Samsung CE": 1, "Toshiba CE": 2, "Sharp CE": 1, "TCL CE": 2, "Accesories C-Brand": 5} },
  'E084': { n: "ERAFONE 1 SUPERMALL KARAWACI", c: {"Apple": 25, "Samsung": 37, "Oppo": 24, "Vivo": 9, "Xiaomi": 23, "Infinix": 6, "Honor": 8, "Realme": 10, "Tecno": 6, "IQOO": 4, "Huawei": 27, "Motorola": 6, "Apple Macbook": 2, "Xiaomi CE": 4, "Toshiba CE": 1, "Accesories C-Brand": 13} },
  'E087': { n: "ERAFONE ITC BSD", c: {"Apple": 4, "Samsung": 16, "Oppo": 5, "Vivo": 8, "Xiaomi": 2, "IQOO": 1, "Accesories C-Brand": 2} },
  'E088': { n: "ERAFONE AEON MAL BSD CITY", c: {"Apple": 11, "Samsung": 36, "Oppo": 21, "Vivo": 13, "Xiaomi": 25, "Infinix": 8, "Honor": 8, "Realme": 4, "IQOO": 3, "Huawei": 26, "Xiaomi CE": 1, "Accesories C-Brand": 7} },
  'E096': { n: "ERAFONE 2 ITC ROXY MAS", c: {"Samsung": 12, "Oppo": 7, "Vivo": 7, "Xiaomi": 12, "Realme": 4, "Tecno": 2, "Accesories C-Brand": 1} },
  'E113': { n: "ERAFONE GRAND INDONESIA", c: {"Apple": 18, "Samsung": 30, "Oppo": 20, "Vivo": 10, "Xiaomi": 15, "Infinix": 5, "Honor": 6, "Sharp": 2, "IQOO": 3, "Huawei": 10, "Motorola": 6, "Advan": 2, "Samsung CE": 1, "Xiaomi CE": 2, "Toshiba CE": 1, "Accesories C-Brand": 20} },
  'E119': { n: "ERAFONE TANGERANG CITY MALL", c: {"Apple": 15, "Samsung": 29, "Oppo": 14, "Vivo": 8, "Xiaomi": 11, "Infinix": 6, "Honor": 6, "Realme": 5, "Tecno": 5, "Huawei": 3, "Samsung CE": 1, "Xiaomi CE": 1, "Infinix CE": 1, "Toshiba CE": 1, "Polytron CE": 1, "Sharp CE": 1, "TCL CE": 1, "Accesories C-Brand": 2} },
  'E137': { n: "ERAFONE GREEN PRAMUKA SQUARE", c: {"Apple": 9, "Samsung": 25, "Oppo": 18, "Vivo": 9, "Xiaomi": 17, "Infinix": 5, "Honor": 9, "Realme": 3, "Tecno": 2, "IQOO": 1, "Huawei": 17, "Samsung CE": 1, "Xiaomi CE": 2, "Toshiba CE": 1, "Polytron CE": 1, "Sharp CE": 1, "Accesories C-Brand": 3} },
  'E150': { n: "ERAFONE CILEGON CENTER MALL", c: {"Apple": 14, "Samsung": 31, "Oppo": 18, "Vivo": 8, "Xiaomi": 7, "Infinix": 7, "Honor": 9, "Realme": 3, "Tecno": 6, "IQOO": 3, "Huawei": 26, "Advan": 2, "Samsung CE": 1, "Xiaomi CE": 1, "Infinix CE": 1, "Toshiba CE": 1, "LG CE": 1, "TCL CE": 3, "Accesories C-Brand": 7} },
  'E158': { n: "ERAFONE MAL CIPUTRA JAKARTA", c: {"Apple": 4, "Samsung": 18, "Oppo": 10, "Vivo": 6, "Xiaomi": 7, "Infinix": 6, "Honor": 7, "Realme": 6, "Xiaomi CE": 1} },
  'E160': { n: "ERAFONE RUKO CEGER TANGERANG", c: {"Apple": 7, "Samsung": 18, "Oppo": 13, "Vivo": 8, "Xiaomi": 11, "Infinix": 6, "Honor": 6, "Realme": 6, "Tecno": 1, "Sharp": 1, "IQOO": 2, "Huawei": 7, "Sharp CE": 1, "Accesories C-Brand": 4} },
  'E164': { n: "ERAFONE MAL TAMAN ANGGREK", c: {"Apple": 13, "Samsung": 38, "Oppo": 30, "Vivo": 13, "Xiaomi": 21, "Infinix": 5, "Honor": 8, "Realme": 7, "Tecno": 1, "IQOO": 2, "Huawei": 30, "Motorola": 3, "Advan": 2, "Samsung CE": 1, "Accesories C-Brand": 24} },
  'E172': { n: "ERAFONE RUKO KEBON JERUK BINUS", c: {"Apple": 5, "Samsung": 27, "Oppo": 21, "Vivo": 9, "Xiaomi": 18, "Infinix": 4, "Honor": 7, "Realme": 7, "Tecno": 2, "IQOO": 2, "Huawei": 4, "Advan": 2, "Samsung CE": 1, "Xiaomi CE": 1, "Toshiba CE": 1, "Polytron CE": 3, "TCL CE": 1, "Changhong CE": 1, "Accesories C-Brand": 3} },
  'E191': { n: "ERAFONE RUKO SURYA KENCANA PAMULANG", c: {"Apple": 7, "Samsung": 17, "Oppo": 12, "Vivo": 10, "Xiaomi": 11, "Infinix": 6, "Honor": 6, "Realme": 6, "Tecno": 6, "IQOO": 2, "Huawei": 14, "Polytron CE": 1, "Accesories C-Brand": 4} },
  'E194': { n: "ERAFONE RUKO RANGKASBITUNG", c: {"Apple": 6, "Samsung": 25, "Oppo": 13, "Vivo": 7, "Xiaomi": 10, "Infinix": 6, "Honor": 7, "Realme": 6, "Tecno": 2, "IQOO": 2, "Huawei": 9, "Xiaomi CE": 1, "TCL CE": 1, "Accesories C-Brand": 3} },
  'E201': { n: "ERAFONE RUKO KRESEK BALARAJA", c: {"Apple": 5, "Samsung": 19, "Oppo": 9, "Vivo": 5, "Xiaomi": 12, "Infinix": 5, "Honor": 10, "Realme": 3, "Tecno": 5, "IQOO": 2, "Huawei": 3, "Xiaomi CE": 3, "Toshiba CE": 1, "TCL CE": 1, "Accesories C-Brand": 3} },
  'E209': { n: "ERAFONE RUKO AHMAD YANI SERANG", c: {"Apple": 16, "Samsung": 34, "Oppo": 22, "Vivo": 12, "Xiaomi": 12, "Infinix": 6, "Honor": 7, "Realme": 6, "Tecno": 8, "IQOO": 3, "Huawei": 17, "Motorola": 3, "Advan": 1, "Apple Macbook": 1, "Samsung CE": 1, "Xiaomi CE": 3, "Infinix CE": 1, "Polytron CE": 1, "TCL CE": 3, "Accesories C-Brand": 4} },
  'E215': { n: "ERAFONE GREEN SEDAYU MALL", c: {"Apple": 7, "Samsung": 26, "Oppo": 13, "Vivo": 9, "Xiaomi": 9, "Honor": 6, "Realme": 6, "IQOO": 2, "Huawei": 14, "Accesories C-Brand": 5} },
  'E216': { n: "ERAFONE SENAYAN PARK", c: {"Apple": 4, "Samsung": 22, "Oppo": 12, "Vivo": 6, "Xiaomi": 12, "Honor": 2, "Realme": 4, "Tecno": 4, "Huawei": 2, "Accesories C-Brand": 8} },
  'E221': { n: "ERAFONE MALL CITRARAYA TANGERANG", c: {"Apple": 10, "Samsung": 33, "Oppo": 17, "Vivo": 10, "Xiaomi": 24, "Infinix": 7, "Honor": 16, "Realme": 8, "Tecno": 7, "Sharp": 3, "IQOO": 4, "Huawei": 22, "Motorola": 2, "Advan": 4, "Samsung CE": 1, "Xiaomi CE": 4, "Infinix CE": 1, "Toshiba CE": 1, "LG CE": 2, "Polytron CE": 1, "TCL CE": 3, "Accesories C-Brand": 6} },
  'E231': { n: "ERAFONE RUKO COKROAMINOTO CILEDUG", c: {"Apple": 15, "Samsung": 25, "Oppo": 9, "Vivo": 9, "Xiaomi": 12, "Infinix": 5, "Honor": 7, "Realme": 7, "IQOO": 2, "Huawei": 9, "Motorola": 1, "Apple Macbook": 1, "Xiaomi CE": 3, "Accesories C-Brand": 1} },
  'E233': { n: "ERAFONE RUKO TAMAN SURYA JAKBA", c: {"Apple": 3, "Samsung": 24, "Oppo": 12, "Vivo": 7, "Xiaomi": 9, "Infinix": 7, "Honor": 7, "Realme": 6, "IQOO": 3, "Huawei": 11, "Xiaomi CE": 1, "LG CE": 1, "Polytron CE": 1, "TCL CE": 1, "Accesories C-Brand": 5} },
  'E253': { n: "ERAFONE RUKO CURUG TANGERANG", c: {"Apple": 5, "Samsung": 20, "Oppo": 11, "Vivo": 10, "Xiaomi": 7, "Infinix": 6, "Realme": 3, "Tecno": 3, "Xiaomi CE": 1, "Accesories C-Brand": 2} },
  'E281': { n: "ERAFONE 3.0 SENAYAN CITY", c: {"Apple": 18, "Samsung": 33, "Oppo": 23, "Vivo": 9, "Xiaomi": 11, "Infinix": 5, "Honor": 8, "Realme": 3, "Tecno": 4, "Sharp": 4, "IQOO": 4, "Huawei": 28, "Motorola": 7, "Accesories C-Brand": 41} },
  'E290': { n: "ERAFONE FRANCHISE RUKO PORIS", c: {"Apple": 6, "Samsung": 25, "Oppo": 10, "Vivo": 9, "Xiaomi": 12, "Infinix": 5, "Honor": 8, "Realme": 3, "Xiaomi CE": 2, "Accesories C-Brand": 5} },
  'E308': { n: "ERAFONE RUKO MAYOR SAFEI SERANG", c: {"Apple": 5, "Samsung": 22, "Oppo": 12, "Vivo": 8, "Xiaomi": 22, "Infinix": 4, "Honor": 5, "Realme": 13, "Tecno": 6, "Xiaomi CE": 2, "Toshiba CE": 1, "Accesories C-Brand": 1} },
  'E312': { n: "ERAFONE KRESEK KOSAMBI", c: {"Apple": 5, "Samsung": 20, "Oppo": 7, "Vivo": 8, "Xiaomi": 7, "Infinix": 5, "Honor": 1, "Realme": 5, "IQOO": 1, "Accesories C-Brand": 5} },
  'E320': { n: "ERAFONE RUKO PANDEGLANG BANTEN", c: {"Apple": 5, "Samsung": 14, "Oppo": 10, "Vivo": 7, "Xiaomi": 16, "Infinix": 3, "Honor": 5, "Realme": 4, "Tecno": 1, "Xiaomi CE": 3, "Accesories C-Brand": 5} },
  'E321': { n: "ERAFONE RUKO SUDIMARA CIPUTAT", c: {"Apple": 5, "Samsung": 16, "Oppo": 13, "Vivo": 7, "Xiaomi": 19, "Infinix": 6, "Honor": 7, "Realme": 2, "IQOO": 2, "Huawei": 7, "Motorola": 3, "Advan": 1, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E322': { n: "ERAFONE RUKO MERUYA", c: {"Apple": 5, "Samsung": 16, "Oppo": 11, "Vivo": 8, "Xiaomi": 18, "Infinix": 7, "Realme": 4, "IQOO": 2, "Xiaomi CE": 2, "Accesories C-Brand": 4} },
  'E369': { n: "ERAFONE FRANCHISE RUKO BOROBUDUR RAYA", c: {"Apple": 5, "Samsung": 13, "Oppo": 6, "Vivo": 7, "Xiaomi": 11, "Infinix": 7, "Honor": 2, "Realme": 2, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E370': { n: "ERAFONE FRANCHISE RUKO BERINGIN KARAWACI", c: {"Apple": 5, "Samsung": 14, "Oppo": 7, "Vivo": 9, "Xiaomi": 16, "Infinix": 5, "Realme": 4, "Xiaomi CE": 4, "Toshiba CE": 1, "Accesories C-Brand": 4} },
  'E381': { n: "ERAFONE RUKO PETA BARAT JAKBAR", c: {"Apple": 4, "Samsung": 18, "Oppo": 11, "Vivo": 11, "Xiaomi": 18, "Infinix": 1, "Honor": 8, "Realme": 3, "Tecno": 5, "IQOO": 2, "Xiaomi CE": 4, "Toshiba CE": 1, "TCL CE": 1, "Accesories C-Brand": 3} },
  'E391': { n: "ERAFONE RUKO WR SUPRATMAN CIPUTAT", c: {"Apple": 5, "Samsung": 15, "Oppo": 9, "Vivo": 5, "Xiaomi": 14, "Infinix": 6, "Honor": 5, "Realme": 1, "Tecno": 1, "Xiaomi CE": 2, "Accesories C-Brand": 4} },
  'E396': { n: "ERAFONE ANDMORE RUKO ITC ROXY MAS", c: {"Apple": 8, "Samsung": 22, "Oppo": 18, "Vivo": 9, "Xiaomi": 28, "Infinix": 7, "Honor": 12, "Realme": 6, "Tecno": 8, "IQOO": 3, "Huawei": 18, "Motorola": 1, "Advan": 2, "Apple Macbook": 1, "Xiaomi CE": 4, "Infinix CE": 1, "Toshiba CE": 3, "TCL CE": 7, "Accesories C-Brand": 23} },
  'E408': { n: "ERAFONE FRANCHISE RUKO SUMUR BATU", c: {"Apple": 5, "Samsung": 18, "Oppo": 8, "Vivo": 7, "Xiaomi": 17, "Infinix": 5, "Honor": 7, "Realme": 6, "IQOO": 1, "Huawei": 6, "Xiaomi CE": 1, "Accesories C-Brand": 3} },
  'E413': { n: "ERAFONE RUKO GOLDEN GREEN KEDOYA", c: {"Apple": 5, "Samsung": 14, "Oppo": 8, "Vivo": 7, "Xiaomi": 14, "Infinix": 5, "Honor": 8, "Realme": 7, "IQOO": 2, "Xiaomi CE": 1, "Accesories C-Brand": 4} },
  'E414': { n: "ERAFONE RUKO PERCETAKAN NEGARA", c: {"Apple": 9, "Samsung": 16, "Oppo": 12, "Vivo": 8, "Xiaomi": 17, "Infinix": 6, "Honor": 8, "Realme": 6, "Tecno": 1, "IQOO": 1, "Huawei": 11, "Samsung CE": 1, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E422': { n: "ERAFONE RUKO M TOHA TANGERANG", c: {"Apple": 9, "Samsung": 22, "Oppo": 15, "Vivo": 10, "Xiaomi": 26, "Infinix": 3, "Realme": 3, "Xiaomi CE": 4, "Toshiba CE": 2, "LG CE": 1, "Accesories C-Brand": 3} },
  'E453': { n: "ERAFONE RUKO DURI KOSAMBI", c: {"Apple": 4, "Samsung": 12, "Oppo": 11, "Vivo": 7, "Xiaomi": 10, "Infinix": 5, "Honor": 8, "Realme": 7, "IQOO": 2, "Motorola": 3, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E465': { n: "ERAFONE RUKO KEBAYORAN LAMA", c: {"Apple": 5, "Samsung": 16, "Oppo": 12, "Vivo": 7, "Xiaomi": 12, "Honor": 5, "Realme": 5, "Tecno": 3, "IQOO": 2, "Xiaomi CE": 2, "Accesories C-Brand": 2} },
  'E484': { n: "ERAFONE SERPONG PARADISE WALK", c: {"Apple": 11, "Samsung": 31, "Oppo": 11, "Vivo": 10, "Xiaomi": 14, "Honor": 5, "Huawei": 14, "Xiaomi CE": 1, "Accesories C-Brand": 1} },
  'E499': { n: "ERAFONE LABUAN PANDEGLANG", c: {"Apple": 5, "Samsung": 13, "Oppo": 6, "Vivo": 9, "Xiaomi": 10, "Infinix": 4, "Xiaomi CE": 1, "Accesories C-Brand": 3} },
  'E508': { n: "ERAFONE JEMBATAN LIMA", c: {"Apple": 5, "Samsung": 13, "Oppo": 11, "Vivo": 8, "Xiaomi": 22, "Honor": 8, "Huawei": 5, "Xiaomi CE": 1, "Accesories C-Brand": 4} },
  'E514': { n: "ERAFONE FRANCHISE RUKO MERUYA SELATAN", c: {"Apple": 5, "Samsung": 14, "Oppo": 11, "Vivo": 7, "Xiaomi": 7, "Honor": 6, "Xiaomi CE": 2, "Accesories C-Brand": 1} },
  'E544': { n: "ERAFONE RUKO MULTIBRAND CILEGON", c: {"Apple": 7, "Samsung": 20, "Oppo": 11, "Vivo": 14, "Xiaomi": 14, "Honor": 6, "Realme": 1, "Tecno": 1, "Huawei": 12, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E582': { n: "ERAFONE MB SRENGSENG", c: {"Apple": 5, "Samsung": 20, "Oppo": 10, "Vivo": 8, "Xiaomi": 18, "Honor": 8, "Realme": 3, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E586': { n: "ERAFONE RUKO GRAHA RAYA", c: {"Apple": 5, "Samsung": 17, "Oppo": 11, "Vivo": 7, "Xiaomi": 12, "Honor": 4, "Xiaomi CE": 1, "Accesories C-Brand": 4} },
  'E589': { n: "ERAFONE RUKO PANIMBANG PANDEGLANG", c: {"Apple": 5, "Samsung": 7, "Oppo": 6, "Vivo": 8, "Xiaomi": 10, "Huawei": 2, "Xiaomi CE": 2, "Accesories C-Brand": 4} },
  'E593': { n: "ERAFONE MANGGA BESAR", c: {"Apple": 5, "Samsung": 25, "Oppo": 14, "Vivo": 9, "Xiaomi": 17, "Honor": 6, "Realme": 6, "IQOO": 2, "Huawei": 11, "Samsung CE": 1, "Xiaomi CE": 1, "Accesories C-Brand": 1} },
  'E612': { n: "ERAFONE RUKO JOMBANG TANGSEL", c: {"Apple": 5, "Samsung": 14, "Oppo": 10, "Vivo": 5, "Xiaomi": 13, "Infinix": 1, "Honor": 7, "Realme": 1, "Tecno": 1, "Huawei": 2, "Xiaomi CE": 1, "Accesories C-Brand": 3} },
  'E616': { n: "ERAFONE MERUYA ILIR", c: {"Apple": 5, "Samsung": 10, "Oppo": 8, "Vivo": 7, "Xiaomi": 7, "Honor": 4, "Realme": 1, "IQOO": 2, "Xiaomi CE": 2, "Toshiba CE": 1, "LG CE": 2, "TCL CE": 2, "Accesories C-Brand": 4} },
  'E620': { n: "ERAFONE 2.5 PAJAJARAN PAMULANG", c: {"Apple": 5, "Samsung": 13, "Oppo": 8, "Vivo": 6, "Xiaomi": 8, "Honor": 6, "Tecno": 7, "Sharp": 1, "Xiaomi CE": 3, "Toshiba CE": 1, "Polytron CE": 1, "TCL CE": 1, "Accesories C-Brand": 3} },
  'E627': { n: "ERAFONE RUKO CISOKA", c: {"Apple": 11, "Samsung": 16, "Oppo": 8, "Vivo": 6, "Xiaomi": 10, "Realme": 3, "IQOO": 2, "Xiaomi CE": 3, "Toshiba CE": 1, "Polytron CE": 1, "TCL CE": 1, "Accesories C-Brand": 4} },
  'E646': { n: "ERAFONE BATU CEPER", c: {"Apple": 10, "Samsung": 14, "Oppo": 10, "Vivo": 10, "Xiaomi": 21, "Infinix": 3, "Honor": 4, "Realme": 2, "Tecno": 1, "Huawei": 3, "Xiaomi CE": 2, "Toshiba CE": 2, "TCL CE": 1, "Accesories C-Brand": 4} },
  'E663': { n: "ERAFONE RUKO GARUDA KEMAYORAN", c: {"Apple": 5, "Samsung": 13, "Oppo": 6, "Vivo": 6, "Xiaomi": 9, "Honor": 6, "Realme": 6, "Xiaomi CE": 1, "Accesories C-Brand": 3} },
  'E678': { n: "ERAFONE MULTIBRAND BENDUNGAN HILIR", c: {"Apple": 5, "Samsung": 17, "Oppo": 8, "Vivo": 8, "Xiaomi": 13, "Honor": 6, "Realme": 4, "Tecno": 7, "IQOO": 2, "Xiaomi CE": 1, "Accesories C-Brand": 3} },
  'E679': { n: "ERAFONE MULTIBRAND JOGLO RAYA", c: {"Apple": 11, "Samsung": 16, "Oppo": 7, "Vivo": 8, "Xiaomi": 10, "Infinix": 4, "Honor": 4, "IQOO": 2, "Huawei": 8, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E684': { n: "ERAFONE RUKO SANGIANG TANGERANG", c: {"Apple": 6, "Samsung": 20, "Oppo": 11, "Vivo": 8, "Xiaomi": 19, "Infinix": 7, "Honor": 8, "Realme": 3, "Tecno": 3, "Huawei": 2, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E685': { n: "ERAFONE MB PONDOK BETUNG", c: {"Apple": 5, "Samsung": 16, "Oppo": 11, "Vivo": 8, "Xiaomi": 18, "Honor": 6, "Tecno": 5, "Xiaomi CE": 3, "Toshiba CE": 1, "Accesories C-Brand": 3} },
  'E696': { n: "ERAFONE MB RASUNA SAID", c: {"Apple": 5, "Samsung": 14, "Oppo": 10, "Vivo": 7, "Xiaomi": 16, "Honor": 2, "Realme": 2, "Tecno": 3, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E704': { n: "ERAFONE RUKO DEWANTARA CIPUTAT", c: {"Apple": 5, "Samsung": 15, "Oppo": 11, "Vivo": 8, "Xiaomi": 6, "Infinix": 7, "Honor": 4, "Realme": 3, "IQOO": 2, "Xiaomi CE": 2, "Accesories C-Brand": 1} },
  'E732': { n: "ERAFONE RUKO SABANG", c: {"Apple": 5, "Samsung": 20, "Oppo": 10, "Vivo": 6, "Xiaomi": 14, "Honor": 7, "Realme": 3, "Tecno": 3, "Huawei": 8, "Xiaomi CE": 2, "Polytron CE": 1, "TCL CE": 1, "Accesories C-Brand": 6} },
  'E744': { n: "ERAFONE RUKO RAJEG TANGERANG", c: {"Apple": 5, "Samsung": 11, "Oppo": 10, "Vivo": 6, "Xiaomi": 8, "Tecno": 4, "Xiaomi CE": 1, "Accesories C-Brand": 3} },
  'E777': { n: "ERAFONE MB CIHUNI PAGEDANGAN (ERAFONE CIHUNI GADING SERPONG)", c: {"Apple": 5, "Samsung": 22, "Oppo": 6, "Vivo": 5, "Xiaomi": 7, "Accesories C-Brand": 1} },
  'E787': { n: "ERAFONE MB TIGARAKSA", c: {"Apple": 5, "Samsung": 13, "Oppo": 11, "Vivo": 7, "Xiaomi": 12, "Honor": 5, "Realme": 3, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E812': { n: "ERAFONE RUKO KUTABUMI", c: {"Apple": 4, "Samsung": 15, "Oppo": 10, "Vivo": 5, "Xiaomi": 9, "Realme": 3, "Xiaomi CE": 1, "Accesories C-Brand": 1} },
  'E813': { n: "ERAFONE MULTIBRAND SERPONG GARDEN CISAUK", c: {"Apple": 4, "Samsung": 13, "Oppo": 10, "Vivo": 4, "Xiaomi": 12, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E821': { n: "ERAFONE MB ANYER", c: {"Apple": 5, "Samsung": 19, "Oppo": 12, "Vivo": 7, "Xiaomi": 21, "Honor": 6, "Realme": 4, "Tecno": 5, "Xiaomi CE": 2, "Accesories C-Brand": 4} },
  'E822': { n: "ERAFONE MB KRAGILAN", c: {"Apple": 11, "Samsung": 14, "Oppo": 10, "Vivo": 9, "Xiaomi": 15, "Honor": 5, "Realme": 4, "Tecno": 2, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E833': { n: "ERAFONE RANGKASBITUNG 2", c: {"Apple": 5, "Samsung": 22, "Oppo": 9, "Vivo": 9, "Xiaomi": 11, "Realme": 4, "IQOO": 2, "Xiaomi CE": 1} },
  'E834': { n: "ERAFONE KEDAUNG TANGSEL", c: {"Apple": 5, "Samsung": 17, "Oppo": 11, "Vivo": 8, "Xiaomi": 9, "Honor": 8, "Realme": 3, "IQOO": 2, "Xiaomi CE": 2, "Accesories C-Brand": 3} },
  'E848': { n: "ERAFONE PASAR KEMIS", c: {"Apple": 5, "Samsung": 12, "Oppo": 6, "Vivo": 5, "Xiaomi": 9, "Realme": 1, "Xiaomi CE": 1, "Accesories C-Brand": 3} },
  'E873': { n: "ERAFONE MB LEGOK", c: {"Apple": 4, "Samsung": 14, "Oppo": 10, "Vivo": 6, "Xiaomi": 14, "Infinix": 4, "Honor": 1, "Realme": 1, "Tecno": 1, "IQOO": 2, "Xiaomi CE": 1, "Accesories C-Brand": 3} },
  'E874': { n: "ERAFONE MULTIBRAND DASANA INDAH", c: {"Apple": 5, "Samsung": 12, "Oppo": 6, "Vivo": 4, "Xiaomi": 12, "Realme": 1, "Accesories C-Brand": 3} },
  'E875': { n: "ERAFONE MB POS PENGUMBEN", c: {"Apple": 11, "Samsung": 21, "Oppo": 11, "Vivo": 8, "Xiaomi": 20, "Honor": 7, "Realme": 3, "IQOO": 2, "Huawei": 2, "Xiaomi CE": 1, "Accesories C-Brand": 4} },
  'E879': { n: "ERAFONE MB CIPARE", c: {"Apple": 11, "Samsung": 22, "Oppo": 10, "Vivo": 7, "Xiaomi": 21, "Honor": 6, "Realme": 4, "Samsung CE": 1, "Xiaomi CE": 3, "Accesories C-Brand": 5} },
  'E898': { n: "ERAFONE MB SAMANHUDI", c: {"Apple": 5, "Samsung": 14, "Oppo": 12, "Vivo": 7, "Xiaomi": 10, "Infinix": 5, "Honor": 4, "Realme": 8, "IQOO": 2, "Xiaomi CE": 2, "Toshiba CE": 1, "LG CE": 1, "Changhong CE": 1, "Accesories C-Brand": 5} },
  'E923': { n: "ERAFONE MB JALAN PANJANG", c: {"Apple": 5, "Samsung": 14, "Oppo": 6, "Vivo": 6, "Xiaomi": 12, "Realme": 2, "Xiaomi CE": 2, "Accesories C-Brand": 5} },
  'E941': { n: "ERAFONE MB RAYA SERPONG", c: {"Apple": 5, "Samsung": 12, "Oppo": 8, "Vivo": 6, "Xiaomi": 7, "Honor": 4, "Realme": 3, "Xiaomi CE": 3, "Accesories C-Brand": 4} },
  'E942': { n: "ERAFONE KEMBANGAN UTARA", c: {"Apple": 5, "Samsung": 12, "Oppo": 10, "Vivo": 7, "Xiaomi": 12, "Honor": 5, "Realme": 3, "Tecno": 2, "IQOO": 2, "Xiaomi CE": 3, "Toshiba CE": 1, "TCL CE": 2, "Changhong CE": 1, "Accesories C-Brand": 4} },
  'E943': { n: "ERAFONE MB TAMAN RATU", c: {"Apple": 6, "Samsung": 20, "Oppo": 9, "Vivo": 5, "Xiaomi": 10, "Honor": 6, "Realme": 3, "Huawei": 2, "Toshiba CE": 2, "TCL CE": 1, "Accesories C-Brand": 4} },
  'E960': { n: "ERAFONE MB MENCENG RAYA", c: {"Apple": 4, "Samsung": 11, "Oppo": 6, "Vivo": 8, "Xiaomi": 10, "Honor": 5, "Realme": 4, "Tecno": 5, "Samsung CE": 1, "Xiaomi CE": 5, "LG CE": 1, "Accesories C-Brand": 3} },
  'E986': { n: "ERAFONE MB JEMBATAN BESI", c: {"Apple": 6, "Samsung": 11, "Oppo": 6, "Vivo": 7, "Xiaomi": 12, "Realme": 3, "Tecno": 4, "Sharp": 1, "Xiaomi CE": 3, "Toshiba CE": 1, "TCL CE": 1, "Accesories C-Brand": 5} },
  'E991': { n: "ERAFONE 2.5 KEMANGGISAN UTAMA RAYA", c: {"Apple": 5, "Samsung": 13, "Oppo": 10, "Vivo": 5, "Xiaomi": 5, "Honor": 6, "Realme": 2, "Tecno": 2, "Xiaomi CE": 2, "Polytron CE": 3, "TCL CE": 1, "Accesories C-Brand": 4} },
  'E992': { n: "ERAFONE 2.5 KAPUK CENGKARENG", c: {"Apple": 5, "Samsung": 22, "Oppo": 10, "Vivo": 12, "Xiaomi": 14, "Honor": 7, "Realme": 3, "IQOO": 3, "Xiaomi CE": 3, "Accesories C-Brand": 4} },
  'F003': { n: "ERAFONE CILEDUG 2.5 RAYA", c: {"Apple": 8, "Samsung": 17, "Oppo": 7, "Vivo": 4, "Xiaomi": 9, "Infinix": 3, "Honor": 6, "Realme": 4, "Tecno": 1, "IQOO": 2, "Xiaomi CE": 2, "Toshiba CE": 1, "TCL CE": 1, "Accesories C-Brand": 1} },
  'F022': { n: "ERAFONE 2.5 PAMULANG", c: {"Apple": 11, "Samsung": 21, "Oppo": 10, "Vivo": 11, "Xiaomi": 14, "Honor": 6, "Realme": 5, "Tecno": 4, "IQOO": 2, "Toshiba CE": 1, "LG CE": 1, "Polytron CE": 3, "Sharp CE": 1, "TCL CE": 3, "Accesories C-Brand": 4} },
  'F058': { n: "ERAFONE 2.5 TELAGA BESTARI", c: {"Apple": 5, "Samsung": 17, "Oppo": 6, "Vivo": 6, "Xiaomi": 10, "Realme": 3, "Tecno": 2, "Sharp": 1, "Xiaomi CE": 1, "Toshiba CE": 1, "Sharp CE": 2, "TCL CE": 1, "Accesories C-Brand": 3} },
  'F066': { n: "ERAFONE 2.5 SEPATAN", c: {"Apple": 5, "Samsung": 12, "Oppo": 9, "Vivo": 6, "Xiaomi": 6, "Infinix": 3, "Honor": 5, "Realme": 5, "Tecno": 3, "Xiaomi CE": 2, "Infinix CE": 1, "Toshiba CE": 1, "TCL CE": 1, "Accesories C-Brand": 4} },
  'F073': { n: "ERAFONE 2.5 AGORA MALL", c: {"Apple": 11, "Samsung": 20, "Oppo": 11, "Vivo": 8, "Xiaomi": 14, "Infinix": 3, "Honor": 6, "Realme": 3, "Tecno": 3, "Huawei": 4, "Xiaomi CE": 2, "Toshiba CE": 3, "Polytron CE": 2, "Accesories C-Brand": 8} },
  'F077': { n: "ERAFONE BINTARO EXCHANGE II", c: {"Apple": 13, "Samsung": 34, "Oppo": 20, "Vivo": 9, "Xiaomi": 19, "Infinix": 7, "Honor": 12, "Realme": 7, "Tecno": 7, "IQOO": 4, "Huawei": 41, "Motorola": 4, "Advan": 2, "Samsung CE": 1, "Toshiba CE": 2, "Polytron CE": 3, "Sharp CE": 1, "TCL CE": 2, "Accesories C-Brand": 16} },
  'F079': { n: "ERAFONE 2.5 GRAND BATAVIA", c: {"Apple": 5, "Samsung": 10, "Oppo": 8, "Vivo": 7, "Xiaomi": 16, "Infinix": 4, "Realme": 3, "Tecno": 4, "IQOO": 1, "Xiaomi CE": 2, "Infinix CE": 1, "Polytron CE": 2, "Accesories C-Brand": 4} },
  'F080': { n: "ERAFONE K-MALL MENARA JAKARTA", c: {"Apple": 3, "Samsung": 21, "Oppo": 8, "Vivo": 6, "Xiaomi": 6, "Infinix": 4, "Realme": 8, "Tecno": 4, "Huawei": 8, "Toshiba CE": 1, "LG CE": 1, "Polytron CE": 1, "TCL CE": 1, "Accesories C-Brand": 5} },
  'F134': { n: "ERAFONE 2.5 MAL CIPUTRA JAKARTA", c: {"Apple": 5, "Samsung": 21, "Oppo": 14, "Vivo": 8, "Xiaomi": 13, "Infinix": 6, "Honor": 6, "Realme": 5, "Tecno": 5, "Huawei": 12, "Motorola": 4, "Xiaomi CE": 1, "Toshiba CE": 1, "LG CE": 1, "TCL CE": 1, "Accesories C-Brand": 9} },
  'G258': { n: "LOTTEMART GREEN PRAMUKA CITY", c: {"Samsung": 3, "Oppo": 6, "Vivo": 6} },
  'M013': { n: "MEGASTORE SUPERMAL KARAWACI", c: {"Apple": 33, "Samsung": 45, "Oppo": 32, "Vivo": 8, "Xiaomi": 35, "Infinix": 6, "Honor": 13, "Realme": 4, "Tecno": 6, "Sharp": 3, "IQOO": 3, "Huawei": 35, "Motorola": 4, "Advan": 5, "Apple Macbook": 2, "Toshiba CE": 1, "Polytron CE": 1, "Sharp CE": 1, "TCL CE": 1, "Sony CE": 1, "Accesories C-Brand": 38} },
  'M014': { n: "MEGASTORE BINTARO X-CHANGE", c: {"Apple": 27, "Samsung": 37, "Oppo": 27, "Vivo": 9, "Xiaomi": 29, "Infinix": 6, "Honor": 10, "Realme": 8, "Tecno": 7, "IQOO": 4, "Huawei": 39, "Motorola": 4, "Advan": 2, "Apple Macbook": 6, "Samsung CE": 4, "Xiaomi CE": 5, "Toshiba CE": 1, "LG CE": 1, "Polytron CE": 1, "TCL CE": 3, "Accesories C-Brand": 45} },
  'M019': { n: "MEGASTORE SUMMARECON MAL SERPONG", c: {"Apple": 25, "Samsung": 45, "Oppo": 30, "Vivo": 16, "Xiaomi": 31, "Infinix": 6, "Honor": 15, "Realme": 9, "Tecno": 7, "Sharp": 4, "IQOO": 5, "Huawei": 38, "Motorola": 7, "Advan": 2, "Apple Macbook": 5, "Samsung CE": 1, "Xiaomi CE": 1, "Accesories C-Brand": 60} },
  'M021': { n: "MEGASTORE RUKO CILEDUG", c: {"Apple": 22, "Samsung": 47, "Oppo": 26, "Vivo": 11, "Xiaomi": 35, "Infinix": 6, "Honor": 9, "Realme": 8, "Tecno": 5, "IQOO": 3, "Huawei": 31, "Motorola": 1, "Advan": 4, "Apple Macbook": 2, "Samsung CE": 3, "Xiaomi CE": 5, "Toshiba CE": 3, "LG CE": 2, "Polytron CE": 2, "Sharp CE": 1, "TCL CE": 5, "Changhong CE": 1, "Accesories C-Brand": 23} },
  'M027': { n: "ERAFONE AND MORE CIPUTAT", c: {"Apple": 8, "Samsung": 23, "Oppo": 14, "Vivo": 8, "Xiaomi": 31, "Infinix": 4, "Honor": 7, "Realme": 5, "Tecno": 4, "Huawei": 10, "Samsung CE": 1, "Xiaomi CE": 7, "Toshiba CE": 2, "LG CE": 5, "Polytron CE": 1, "Sharp CE": 1, "TCL CE": 3, "Changhong CE": 1, "Accesories C-Brand": 20} },
  'M048': { n: "MEGASTORE RUKO CIKUPA", c: {"Apple": 10, "Samsung": 25, "Oppo": 14, "Vivo": 8, "Xiaomi": 16, "Infinix": 4, "Honor": 3, "Realme": 5, "Tecno": 2, "Huawei": 3, "Samsung CE": 1, "Xiaomi CE": 5, "Polytron CE": 2, "TCL CE": 1, "Accesories C-Brand": 4} },
  'M061': { n: "MEGASTORE RUKO JATIUWUNG", c: {"Apple": 8, "Samsung": 22, "Oppo": 18, "Vivo": 7, "Xiaomi": 31, "Infinix": 4, "Honor": 8, "Realme": 4, "IQOO": 2, "Huawei": 2, "Samsung CE": 1, "Xiaomi CE": 7, "Toshiba CE": 2, "Sharp CE": 1, "TCL CE": 3, "Changhong CE": 1, "Accesories C-Brand": 7} },
  'M068': { n: "ERAFONE AND MORE KAMAL RAYA", c: {"Apple": 15, "Samsung": 23, "Oppo": 14, "Vivo": 11, "Xiaomi": 33, "Infinix": 10, "Honor": 12, "Realme": 7, "Tecno": 9, "IQOO": 2, "Huawei": 11, "Samsung CE": 1, "Xiaomi CE": 7, "Infinix CE": 1, "Toshiba CE": 3, "Polytron CE": 1, "TCL CE": 5, "Changhong CE": 1, "Accesories C-Brand": 12} },
  'M091': { n: "MEGASTORE CENTRAL PARK 3.0", c: {"Apple": 27, "Samsung": 38, "Oppo": 35, "Vivo": 16, "Xiaomi": 32, "Infinix": 8, "Honor": 8, "Realme": 11, "Tecno": 5, "Sharp": 3, "IQOO": 3, "Huawei": 42, "Motorola": 5, "Advan": 2, "Apple Macbook": 7, "Xiaomi CE": 1, "Sony CE": 1, "Accesories C-Brand": 94} },
  'M093': { n: "MEGASTORE RUKO CIPONDOH TANGERANG", c: {"Apple": 7, "Samsung": 20, "Oppo": 11, "Vivo": 6, "Xiaomi": 16, "Infinix": 6, "Honor": 12, "Realme": 7, "IQOO": 1, "Huawei": 3, "Xiaomi CE": 1, "Accesories C-Brand": 5} },
  'M104': { n: "MEGASTORE RUKO REMPOA CIPUTAT", c: {"Apple": 4, "Samsung": 19, "Oppo": 8, "Vivo": 5, "Xiaomi": 17, "Infinix": 5, "Honor": 8, "Realme": 4, "Tecno": 3, "IQOO": 1, "Huawei": 4, "Motorola": 1, "Xiaomi CE": 5, "Toshiba CE": 1, "Accesories C-Brand": 3} },
  'M163': { n: "ERAFONE AND MORE SERPONG", c: {"Apple": 8, "Samsung": 27, "Oppo": 9, "Vivo": 5, "Xiaomi": 37, "Apple Macbook": 2, "Samsung CE": 1, "Xiaomi CE": 6, "Toshiba CE": 3, "LG CE": 10, "Polytron CE": 4, "Sharp CE": 2, "TCL CE": 6, "Sony CE": 3, "Changhong CE": 1, "Accesories C-Brand": 25} },
  'M167': { n: "ERAFONE AND MORE TELUK NAGA", c: {"Apple": 22, "Samsung": 17, "Oppo": 18, "Vivo": 9, "Xiaomi": 38, "Infinix": 7, "Honor": 10, "Realme": 6, "Tecno": 4, "IQOO": 2, "Huawei": 6, "Apple Macbook": 1, "Samsung CE": 1, "Xiaomi CE": 6, "Toshiba CE": 4, "LG CE": 2, "Polytron CE": 2, "Sharp CE": 1, "TCL CE": 5, "Changhong CE": 1, "Accesories C-Brand": 12} },
  'M176': { n: "ENM KISAMAUN", c: {"Apple": 8, "Samsung": 23, "Oppo": 22, "Vivo": 9, "Xiaomi": 30, "Infinix": 4, "Honor": 9, "Realme": 4, "Tecno": 4, "IQOO": 2, "Huawei": 4, "Samsung CE": 1, "Xiaomi CE": 8, "Toshiba CE": 2, "Polytron CE": 1, "TCL CE": 2, "Changhong CE": 1, "Accesories C-Brand": 10} },
  'M212': { n: "ERAFONE AND MORE RAWASARI", c: {"Apple": 18, "Samsung": 19, "Oppo": 35, "Vivo": 9, "Xiaomi": 31, "Infinix": 5, "Honor": 10, "Realme": 8, "Tecno": 4, "Huawei": 15, "Xiaomi CE": 8, "Toshiba CE": 3, "Polytron CE": 1, "TCL CE": 4, "Changhong CE": 1, "Accesories C-Brand": 9} },
  'M219': { n: "ERAFONE AND MORE PURI INDAH MALL", c: {"Apple": 6, "Samsung": 41, "Oppo": 21, "Vivo": 8, "Xiaomi": 37, "Infinix": 6, "Honor": 10, "Realme": 4, "Tecno": 4, "IQOO": 3, "Huawei": 12, "Advan": 2, "Samsung CE": 1, "Xiaomi CE": 5, "Toshiba CE": 3, "TCL CE": 4, "Sony CE": 1, "Changhong CE": 1, "Accesories C-Brand": 43} },
  'M222': { n: "ERAFONE AND MORE EASTVARA MALL", c: {"Apple": 14, "Samsung": 30, "Oppo": 12, "Vivo": 12, "Xiaomi": 22, "Infinix": 4, "Honor": 7, "Tecno": 5, "Huawei": 5, "Advan": 2, "Xiaomi CE": 9, "Toshiba CE": 4, "Polytron CE": 2, "TCL CE": 4, "Sony CE": 1, "Accesories C-Brand": 24} },
  'Q022': { n: "XLC MAL PURI INDAH", c: {"Apple": 4, "Samsung": 18, "Oppo": 9, "Vivo": 8} }
};

// ── SEED PERIODE AGUSTUS 2026 (jalankan SATU KALI dari editor) ───────────────
// Bikin baris Submit_Month = "2026-08" untuk 122 toko, diisi angka LDU hasil export SAP
// "LDU All Region 5 Week 32 Senin 03 Aug 26.xlsx" (18.161 unit / 247 toko; yang dipakai
// hanya 122 toko yang sudah ada di sheet).
//
// Yang TIDAK diisi: Status & Last Submit — sengaja dikosongkan supaya toko tetap tampil
// "Belum Submit" di dashboard dan compliance Agustus tetap terukur. Saat toko submit
// checklist, updateMasterSheet() akan menemukan baris Agustus ini dan mengisinya.
//
// Aman dijalankan berulang (idempotent):
//   - toko yang barisnya belum ada       → baris baru di-append
//   - toko yang barisnya ada & Status kosong → angka LDU-nya di-refresh
//   - toko yang SUDAH submit Agustus     → dilewati, datanya tidak ditimpa
function seedAgustus2026() {
  var MONTH = '2026-08';

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tidak ditemukan: ' + SHEET_NAME);

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var hIdx = {};   // nama kolom -> index 0-based
  headers.forEach(function(h, i) { if (h) hIdx[h.toString().trim()] = i; });

  ['Plant Code', 'Store Name', 'Submit_Month'].forEach(function(c) {
    if (hIdx[c] === undefined) throw new Error('Kolom wajib tidak ada di sheet: ' + c);
  });

  function readMonth(v) {
    if (!v) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM');
    return v.toString().trim();
  }

  var all = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];

  // Petakan baris existing: baris bulan target, dan baris manapun (buat ambil Store Name/Region)
  var rowOfMonth = {};   // plantCode -> nomor baris sheet
  var anyRow     = {};   // plantCode -> array isi baris
  all.forEach(function(row, i) {
    var pc = (row[hIdx['Plant Code']] || '').toString().trim().toUpperCase();
    if (!pc) return;
    if (!anyRow[pc]) anyRow[pc] = row;
    if (readMonth(row[hIdx['Submit_Month']]) === MONTH) rowOfMonth[pc] = i + 2;
  });

  var appended = 0, refreshed = 0, skipped = 0;
  var newRows = [];

  Object.keys(AGU2026_SEED).forEach(function(pc) {
    var seed   = AGU2026_SEED[pc];
    var counts = seed.c || {};

    // ── Baris Agustus sudah ada ──
    if (rowOfMonth[pc]) {
      var rowNum = rowOfMonth[pc];
      var cur    = all[rowNum - 2];
      var status = (hIdx['Status'] !== undefined ? cur[hIdx['Status']] : '').toString().trim();
      if (status) { skipped++; return; }          // toko sudah submit — jangan ditimpa
      BRAND_LDU_COLUMNS_GS.forEach(function(c) {
        if (hIdx[c] !== undefined) cur[hIdx[c]] = counts[c] || 0;
      });
      cur[hIdx['Submit_Month']] = MONTH;
      sheet.getRange(rowNum, 1, 1, lastCol).setValues([cur]);
      refreshed++;
      return;
    }

    // ── Baris baru ──
    var arr = [];
    for (var i = 0; i < lastCol; i++) arr.push('');
    var src = anyRow[pc];
    arr[hIdx['Plant Code']] = pc;
    arr[hIdx['Store Name']] = src ? src[hIdx['Store Name']] : (seed.n || pc);
    if (hIdx['Region'] !== undefined && src) arr[hIdx['Region']] = src[hIdx['Region']];
    BRAND_LDU_COLUMNS_GS.forEach(function(c) {
      if (hIdx[c] !== undefined) arr[hIdx[c]] = counts[c] || 0;
    });
    arr[hIdx['Submit_Month']] = MONTH;
    newRows.push(arr);
    appended++;
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, lastCol).setValues(newRows);
  }

  var msg = 'Seed ' + MONTH + ' selesai — ' + appended + ' baris baru, ' +
            refreshed + ' baris di-refresh, ' + skipped + ' dilewati (sudah submit).';
  Logger.log(msg);
  return msg;
}
