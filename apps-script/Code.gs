// ============================================================
// ERA-PLANOGRAM — Google Apps Script
// ============================================================

const SHEET_NAME       = 'ERA-PLANOGRAM';
const INV_SHEET        = 'DEVICE_INVENTORY';
const LOG_SHEET        = 'DEVICE_LOG';
const FOTO_ROOT_FOLDER_ID = '1LG9I2fhm3YY6rNUpRUBOHjP6dCQ0FeXc';

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
function updateMasterSheet(sheet, formData, plantCode) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerMap = {};
  headers.forEach(function(h, i) {
    if (h) headerMap[h.toString().toLowerCase().trim()] = i + 1;
  });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, reason: 'Sheet kosong' };

  const allRows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  let targetRow = -1, storeName = '';
  for (let i = 0; i < allRows.length; i++) {
    if (allRows[i][0].toString().trim().toUpperCase() === plantCode) {
      targetRow = i + 2; storeName = allRows[i][1].toString(); break;
    }
  }
  if (targetRow === -1) return { success: false, reason: 'Plant Code "' + plantCode + '" tidak ditemukan.' };

  const skipFields = ['plant code', 'store name', 'timestamp'];
  let currentLastCol = sheet.getLastColumn();
  Object.keys(formData).forEach(function(fieldName) {
    if (skipFields.indexOf(fieldName.toLowerCase().trim()) !== -1) return;
    let colIdx = headerMap[fieldName.toLowerCase().trim()];
    if (!colIdx) {
      currentLastCol++;
      sheet.getRange(1, currentLastCol).setValue(fieldName);
      headerMap[fieldName.toLowerCase().trim()] = currentLastCol;
      colIdx = currentLastCol;
    }
    const rawVal = (formData[fieldName][0] || '').toString().trim();
    if (fieldName.toLowerCase().trim().endsWith('_devicestatus')) {
      sheet.getRange(targetRow, colIdx).setValue(rawVal);
    } else {
      const numVal = parseInt(rawVal, 10);
      sheet.getRange(targetRow, colIdx).setValue(isNaN(numVal) ? 0 : numVal);
    }
  });

  const lastSubmitCol = headerMap['last submit'];
  const statusCol     = headerMap['status'];
  if (lastSubmitCol) sheet.getRange(targetRow, lastSubmitCol).setValue(Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm'));
  if (statusCol)     sheet.getRange(targetRow, statusCol).setValue('Submitted');

  return { success: true, storeName: storeName };
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

  var allRows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var targetRow = -1;
  for (var i = 0; i < allRows.length; i++) {
    if (allRows[i][0].toString().trim().toUpperCase() === plantCode) { targetRow = i + 2; break; }
  }
  if (targetRow === -1) throw new Error('Plant Code tidak ditemukan: ' + plantCode);

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
      const skipKeys = ['action', 'store'];
      const formData = {};
      Object.keys(params).forEach(function(k) {
        if (skipKeys.indexOf(k) === -1) formData[k] = [params[k] !== undefined ? params[k].toString() : '0'];
      });
      const result = updateMasterSheet(sheet, formData, plantCode);
      if (!result.success) return jsonOut({ status: 'error', message: result.reason || 'Gagal menyimpan data' });
      return jsonOut({ status: 'success', message: 'Data berhasil disimpan untuk ' + plantCode, storeName: result.storeName });
    }

    if (params.action === 'getInventory') return jsonOut(getInventory(params));
    if (params.action === 'getLog')       return jsonOut(getLog(params));

    // Default: baca ERA-PLANOGRAM sheet
    const sheet   = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tidak ditemukan: ' + SHEET_NAME);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0].map(function(h) { return h.toString().trim(); });
    const filterStore  = (params.store  || '').toUpperCase().trim();
    const filterStatus = (params.status || '').toLowerCase().trim();
    const result = [];
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      if (!row[0]) continue;
      const obj = {};
      headers.forEach(function(h, idx) { obj[h] = row[idx]; });
      if (filterStore  && obj['Plant Code'].toString().toUpperCase() !== filterStore)  continue;
      if (filterStatus && (obj['Status'] || '').toLowerCase() !== filterStatus) continue;
      result.push(obj);
    }
    return jsonOut({ status: 'success', count: result.length, lastUpdated: new Date().toISOString(), data: result });

  } catch (err) {
    return jsonOut({ status: 'error', message: err.toString() });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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
