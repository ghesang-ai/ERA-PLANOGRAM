// ============================================================
// ERA-PLANOGRAM — Google Apps Script
// ============================================================

const SHEET_NAME       = 'ERA-PLANOGRAM';
const INV_SHEET        = 'DEVICE_INVENTORY';
const LOG_SHEET        = 'DEVICE_LOG';
const FOTO_ROOT_FOLDER_ID = '1LG9I2fhm3YY6rNUpRUBOHjP6dCQ0FeXc';

// Tanggal mulai periode submit yang valid — data sebelum ini dianggap lama
// Ganti setiap awal periode kampanye baru (format: 'YYYY-MM-DD')
const SUBMIT_WINDOW_START = '2026-06-27';

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

// ── Upload foto ke Drive ──
function uploadFotoToDrive(payload) {
  var plantCode = (payload.plantCode || '').toUpperCase().trim();
  var storeName = (payload.storeName || plantCode).trim();
  var brand     = (payload.brand || '').trim();
  var type      = (payload.type  || '').trim();
  var fileData  = payload.fileData || '';
  var fileName  = payload.fileName || (brand + '_' + type + '.jpg');

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
  return { status: 'success', url: 'https://drive.google.com/file/d/' + file.getId() + '/view', fileId: file.getId() };
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
